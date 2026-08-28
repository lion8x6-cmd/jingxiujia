// AI服务 - 豆包 Doubao-Seedream-5.0-pro
const app = getApp();
const { TaskStatus, RETRY_CONFIG } = require('./task-status');
const { ARK_CONFIG, PART_PROMPT_MAP, BASE_RETOUCH_PROMPT } = require('./ark-config');

// 自有后端相关流程（上传/提交任务/轮询）默认走 mock，待后端就绪后切换为 false
const USE_MOCK = true;
// 豆包 ARK 直连开关：联调阶段直接调用 ARK 图片生成接口
const USE_REAL_ARK = true;

function mockDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uploadImage(filePath, onProgress) {
  return new Promise((resolve, reject) => {
    if (USE_MOCK) {
      let progress = 0;
      const timer = setInterval(() => {
        progress += 20;
        if (onProgress) onProgress(progress);
        if (progress >= 100) {
          clearInterval(timer);
          resolve({ url: 'mock://uploaded/' + Date.now(), taskId: 'mock_' + Date.now() });
        }
      }, 200);
      return;
    }
    const uploadTask = wx.uploadFile({
      url: app.globalData.baseUrl + '/api/upload',
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      },
      fail: reject
    });
    if (onProgress) {
      uploadTask.onProgressUpdate((res) => onProgress(res.progress));
    }
  });
}

async function submitRetouch(options) {
  const { imageUrl, prompt, templateId, strength = 50, isBatch = false, adjustments = {} } = options;
  if (USE_MOCK) {
    await mockDelay(500);
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    return { taskId, status: TaskStatus.QUEUED };
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + '/api/ai/retouch',
      method: 'POST',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      data: { imageUrl, prompt, templateId, strength, isBatch, adjustments },
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

async function submitToolTask(toolType, options) {
  if (USE_MOCK) {
    await mockDelay(500);
    return { taskId: 'task_' + Date.now(), status: TaskStatus.QUEUED, toolType };
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + '/api/ai/' + toolType,
      method: 'POST',
      header: { Authorization: 'Bearer ' + app.globalData.token },
      data: options,
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

function pollTaskStatus(taskId, onUpdate) {
  let stopped = false;
  let retryCount = 0;

  async function poll() {
    if (stopped) return;
    try {
      let status, progress;
      if (USE_MOCK) {
        await mockDelay(800);
        progress = Math.min(100, (retryCount + 1) * 20);
        if (retryCount === 0) { status = TaskStatus.QUEUED; progress = 0; }
        else if (retryCount < 4) { status = TaskStatus.PROCESSING; }
        else { status = TaskStatus.COMPLETED; progress = 100; }
        retryCount++;
      } else {
        const res = await new Promise((resolve, reject) => {
          wx.request({
            url: app.globalData.baseUrl + '/api/task/' + taskId,
            header: { Authorization: 'Bearer ' + app.globalData.token },
            success: (r) => resolve(r.data),
            fail: reject
          });
        });
        status = res.status;
        progress = res.progress;
      }

      if (onUpdate) onUpdate({ status, progress });

      if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED ||
          status === TaskStatus.CANCELLED || status === TaskStatus.REVIEW_REJECTED) {
        stopped = true;
        return;
      }
      setTimeout(poll, USE_MOCK ? 0 : 2000);
    } catch (e) {
      retryCount++;
      if (retryCount <= RETRY_CONFIG.PROCESS_MAX_RETRY) {
        setTimeout(poll, 3000);
      } else {
        if (onUpdate) onUpdate({ status: TaskStatus.FAILED, progress: 0, error: e.message });
        stopped = true;
      }
    }
  }
  poll();

  return {
    stop() { stopped = true; }
  };
}

function connectTaskWebSocket(taskId, onUpdate) {
  if (USE_MOCK) {
    return pollTaskStatus(taskId, onUpdate);
  }
  const socketTask = wx.connectSocket({
    url: app.globalData.baseUrl.replace('http', 'ws') + '/ws/task/' + taskId,
    header: { Authorization: 'Bearer ' + app.globalData.token }
  });
  socketTask.onMessage((res) => {
    try {
      const data = JSON.parse(res.data);
      onUpdate(data);
    } catch (e) {}
  });
  let pollFallback = null;
  socketTask.onClose(() => {
    pollFallback = pollTaskStatus(taskId, onUpdate);
  });
  return {
    stop() {
      if (pollFallback) pollFallback.stop();
      socketTask.close({});
    }
  };
}

function buildAdjustPrompt(adjustments, basePrompt) {
  const parts = [BASE_RETOUCH_PROMPT];
  if (basePrompt && basePrompt !== 'body_adjust') parts.push(basePrompt);

  Object.entries(adjustments || {}).forEach(([key, value]) => {
    const map = PART_PROMPT_MAP[key];
    if (!map || value === 0) return;
    // 强度 >0 用 positive 描述，<0 用 negative；数值作为幅度参考
    const intensity = Math.min(100, Math.abs(value));
    const degree = intensity > 66 ? '明显' : intensity > 33 ? '适度' : '轻微';
    const desc = value > 0 ? map.positive : map.negative;
    parts.push(`${map.name}：${degree}${desc}`);
  });

  parts.push('整体自然协调，避免过度修饰，保持照片真实感');
  return parts.join('；');
}

// AI 一句话（无框）提示词包装器：只执行用户指令，强约束锁定未提及内容。
// 二次编辑绝不能带 t2 全图精修词，否则模型会重绘姿势/服装/光影/背景。
// 原则：正向词只描述"做什么、保留什么"；所有"禁止/不得"项统一放负面词，
// 避免正向词里出现负面概念被模型反向锚定。
function buildAiGlobalPrompt(instruction) {
  return '请严格按以下要求编辑图片：【' + instruction + '】。\n'
    + '必须遵守：\n'
    + '1. 只修改上述要求明确涉及的内容，做到要求即可，修改幅度自然克制，不做额外美化、不顺手美颜或瘦身；要求中未提及的一切必须与原图完全保持一致；\n'
    + '2. 人物的长相、五官、表情、姿势、手势、站位、在画面中的位置、身材比例、肢体和手指数量保持与原图一致；\n'
    + '3. 服装的款式、颜色、穿着方式与遮挡关系保持与原图一致；\n'
    + '4. 若要求针对背景（如更换天空），只替换该背景区域，人物和前景保持不变，边缘自然融合；\n'
    + '5. 构图、视角、画面尺寸、整体曝光、色调和光影方向保持与原图一致，不裁切、不扩图、不移位，画面整体明暗和色彩与原图协调统一。';
}

// AI 带框（bbox 锚点）提示词构建器：框出目标区域，同一句话只作用于框内，框外锁定。
function buildAiRegionPrompt(instruction, regions) {
  const regionLines = (regions || []).map(r =>
    `<bbox>${r.x1} ${r.y1} ${r.x2} ${r.y2}</bbox>区域：${instruction}`
  ).join('；\n');
  return '请对图片以下指定区域进行修改：\n' + regionLines + '。\n'
    + '必须遵守：\n'
    + '1. 仅修改上述 bbox 标注区域内的内容，做到要求即可、修改幅度自然克制，不做额外美化；bbox 以外所有像素（包括人物其余部分、背景、服装、前景）必须与原图完全保持一致；\n'
    + '2. 区域内人物的长相、五官、表情保持与原图一致，姿势、手势、站位、位置和肢体手指数量不变；\n'
    + '3. 服装款式、颜色、穿着方式与遮挡关系保持与原图一致；\n'
    + '4. 若修改的是背景区域（如天空），人物和前景保持不变，交界边缘自然融合；\n'
    + '5. 构图、视角、尺寸、曝光、色调、光影方向以及画面整体明暗与原图保持一致，不裁切、不扩图，框外不做任何亮度或色彩调整。';
}

// 压缩图片到合理大小，避免 base64 体积过大导致请求失败
// 策略：先查文件大小，超过 2MB 则压缩到 quality=80，仍超过则降到 quality=60
function compressImageIfNeeded(filePath) {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager();
    let fileSize = 0;
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size || 0;
    } catch (e) {
      // stat 失败也不阻塞，直接用原路径
      resolve(filePath);
      return;
    }

    // <= 2MB 不需要压缩
    if (fileSize <= 2 * 1024 * 1024) {
      resolve(filePath);
      return;
    }

    // 第一轮压缩 quality=80
    wx.compressImage({
      src: filePath,
      quality: 80,
      success: (res) => {
        let compressedSize = 0;
        try {
          compressedSize = fs.statSync(res.tempFilePath).size || 0;
        } catch (e) {}
        // 压缩后仍 > 2MB，再压一次 quality=60
        if (compressedSize > 2 * 1024 * 1024) {
          wx.compressImage({
            src: res.tempFilePath,
            quality: 60,
            success: (r2) => resolve(r2.tempFilePath),
            fail: () => resolve(res.tempFilePath)
          });
        } else {
          resolve(res.tempFilePath);
        }
      },
      fail: () => resolve(filePath)  // 压缩失败不阻塞，用原图
    });
  });
}

// 读取本地图片为 base64 data URI（ARK 支持传入 base64 图片作为参考）
// 先压缩再读取，根据文件扩展名推断 MIME
async function fileToBase64(filePath) {
  // 先压缩，避免大图导致请求体过大
  const compressedPath = await compressImageIfNeeded(filePath);
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: compressedPath,
      encoding: 'base64',
      success: (res) => {
        const mime = guessImageMime(compressedPath);
        resolve('data:' + mime + ';base64,' + res.data);
      },
      fail: (err) => {
        console.error('[ai-service] 读取图片失败:', filePath, err);
        reject(new Error('读取图片失败: ' + (err.errMsg || '未知错误')));
      }
    });
  });
}

function guessImageMime(filePath) {
  if (!filePath) return 'image/jpeg';
  const clean = String(filePath).split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.bmp')) return 'image/bmp';
  if (clean.endsWith('.heic')) return 'image/heic';
  // 相册/拍照临时文件常无后缀，默认 jpeg
  return 'image/jpeg';
}

// 判断是否为真实公网 URL（可被豆包服务器下载）
function isRemoteUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (/^https?:\/\/(tmp|usr|storage|documents|savedfile)\//i.test(url)) return false;
  return true;
}

// 下载网络图片并转为 base64（避免直接传 URL 给豆包时因签名过期/防盗链导致黑图）
function downloadToBase64(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('下载参考图失败(' + res.statusCode + ')'));
          return;
        }
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: res.tempFilePath,
          encoding: 'base64',
          success: (r) => {
            // 根据响应头或扩展名推断 MIME
            const mime = guessImageMime(res.tempFilePath);
            resolve('data:' + mime + ';base64,' + r.data);
          },
          fail: (e) => reject(new Error('读取下载图片失败: ' + (e.errMsg || '')))
        });
      },
      fail: (e) => reject(new Error('下载参考图失败: ' + (e.errMsg || '')))
    });
  });
}

// ARK 请求重试配置
const ARK_MAX_RETRY = 3;
const ARK_RETRY_DELAYS = [1000, 2000, 4000]; // 第1次重试等1s，第2次2s，第3次4s
// 可重试的状态码：429 限流、500/502/503/504 服务端错误
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 简易取消令牌：调用 signal.abort() 即可中断正在进行的 ARK 请求
function createCancelToken() {
  const signal = {
    cancelled: false,
    _cbs: [],
    _onCancel(fn) {
      if (this.cancelled) { fn(); return; }
      this._cbs.push(fn);
    },
    abort() {
      if (this.cancelled) return;
      this.cancelled = true;
      this._cbs.forEach(fn => { try { fn(); } catch (e) {} });
      this._cbs = [];
    }
  };
  return signal;
}

function arkRequestOnce(body, signal) {
  return new Promise((resolve, reject) => {
    const task = wx.request({
      url: ARK_CONFIG.baseUrl + '/images/generations',
      method: 'POST',
      timeout: ARK_CONFIG.requestTimeout,
      responseType: 'text',
      dataType: 'json',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ARK_CONFIG.apiKey
      },
      data: body,
      success: (res) => {
        if (signal && signal.cancelled) return;
        if (res.statusCode === 200 && res.data && res.data.data && res.data.data[0]) {
          const item = res.data.data[0];
          if (item.url) {
            resolve({ url: item.url, raw: res.data });
          } else if (item.b64_json) {
            // 将 base64 写入本地临时文件，返回本地路径（避免 downloadFile 域名白名单问题）
            writeBase64ToFile(item.b64_json).then(localPath => {
              resolve({ url: localPath, raw: res.data });
            }).catch(err => {
              // 写入失败则降级为 data URI
              console.warn('[ark] writeBase64ToFile failed, using data URI:', err);
              resolve({ url: 'data:image/png;base64,' + item.b64_json, raw: res.data });
            });
          } else {
            reject(new Error('返回结果中没有图片地址'));
          }
        } else {
          const apiMsg = (res.data && res.data.error && res.data.error.message) || '';
          const code = (res.data && res.data.error && res.data.error.code) || '';
          const msg = apiMsg || ('请求失败(' + res.statusCode + ')');
          const err = new Error(msg);
          err.statusCode = res.statusCode;
          err.code = code;
          err.retryable = RETRYABLE_STATUS.indexOf(res.statusCode) !== -1;
          console.error('[ark] 请求失败:', res.statusCode, code, apiMsg);
          reject(err);
        }
      },
      fail: (err) => {
        if (signal && signal.cancelled) {
          const cancelErr = new Error('abort');
          cancelErr.cancelled = true;
          reject(cancelErr);
          return;
        }
        const error = new Error(err.errMsg || '网络请求失败');
        error.retryable = true;
        error.isNetworkError = true;
        console.error('[ark] 网络错误:', err.errMsg);
        reject(error);
      }
    });
    // 注册 abort 方法
    if (signal && task) {
      signal._onCancel(() => {
        try { task.abort(); } catch (e) {}
      });
    }
  });
}

// 将 base64 图片数据写入本地文件，返回本地路径
function writeBase64ToFile(b64Data) {
  return new Promise((resolve, reject) => {
    try {
      const fs = wx.getFileSystemManager();
      const filePath = wx.env.USER_DATA_PATH + '/result_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
      fs.writeFile({
        filePath,
        data: b64Data,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: (e) => reject(e)
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function arkRequest(body, signal) {
  let lastError;
  for (let attempt = 0; attempt <= ARK_MAX_RETRY; attempt++) {
    if (signal && signal.cancelled) {
      const err = new Error('abort'); err.cancelled = true; throw err;
    }
    try {
      return await arkRequestOnce(body, signal);
    } catch (err) {
      if (err.cancelled) throw err;
      lastError = err;
      if (!err.retryable || attempt === ARK_MAX_RETRY) throw err;
      if (signal && signal.cancelled) {
        const cancelErr = new Error('abort'); cancelErr.cancelled = true; throw cancelErr;
      }
      const waitMs = ARK_RETRY_DELAYS[attempt] || 4000;
      console.warn(`[ark] 第 ${attempt + 1} 次重试，等待 ${waitMs}ms...`);
      await delay(waitMs);
    }
  }
  throw lastError;
}

// 基于原图 + 部位调节，调用豆包 Seedream 重新生成精修图
// options:
//   imagePath/imageUrl  参考图（本地路径或网络URL）
//   adjustments         快捷调节的部位参数 {face:30, eyes:-20 ...}
//   customPrompt        AI 调节模式下用户输入的自然语言指令
//   basePrompt          模板正向提示词
//   negativePrompt      模板负面提示词
//   templateId          模板ID（传入则用模板自带提示词）
async function generateEdit(options) {
  const {
    imagePath, imageUrl,
    adjustments = {},
    customPrompt = '',
    basePrompt = '',
    negativePrompt = '',
    templateId,
    aiRegions = null,   // AI 模式下用户框选的区域 [{x1,y1,x2,y2}]（0-999），有值时指令只作用于框内
    signal   // 取消令牌
  } = options;

  // Mock 模式兜底（未启用真实 ARK 时）
  if (!USE_REAL_ARK) {
    await mockDelay(2500);
    return { url: imageUrl || imagePath, taskId: 'mock_edit_' + Date.now() };
  }

  // 准备参考图：所有图片统一转 base64，避免远程签名 URL 过期/防盗链导致黑图
  let imageRef = '';
  try {
    if (imagePath && !isRemoteUrl(imagePath)) {
      imageRef = await fileToBase64(imagePath);
    } else if (imageUrl && isRemoteUrl(imageUrl)) {
      // 远程图（如豆包返回的结果 CDN URL）先下载再转 base64
      imageRef = await downloadToBase64(imageUrl);
    } else if (imagePath) {
      imageRef = await fileToBase64(imagePath);
    } else if (imageUrl) {
      imageRef = await fileToBase64(imageUrl);
    }
  } catch (e) {
    console.error('[ai-service] 准备参考图失败:', e.message);
    throw new Error('准备图片失败: ' + e.message);
  }

  // 图片准备完后检查是否已取消
  if (signal && signal.cancelled) {
    const err = new Error('abort'); err.cancelled = true; throw err;
  }

  // 若传入了模板ID，优先使用模板自带提示词
  let tplPrompt = basePrompt;
  let tplNegative = negativePrompt;
  if (templateId) {
    try {
      const tpl = require('./templates').getTemplateById(templateId);
      if (tpl) {
        tplPrompt = tpl.prompt;
        tplNegative = tpl.negativePrompt;
      }
    } catch (e) {}
  }

  // 构建提示词：AI 自然语言指令优先，其次部位调节，最后模板基础提示词
  let prompt;
  let userInstruction = (customPrompt || '').trim();
  const hasAdjust = Object.values(adjustments || {}).some(v => v !== 0);

  // AI 模式下用户框选了区域：把一句话指令包成 bbox 锚点形式（只作用于框内，框外锁定）
  const aiRegionList = Array.isArray(aiRegions)
    ? aiRegions.filter(r => r && r.x2 > r.x1 && r.y2 > r.y1)
    : [];
  if (userInstruction && aiRegionList.length) {
    userInstruction = buildAiRegionPrompt(userInstruction, aiRegionList);
  }

  // 局部编辑模式：prompt 中已包含 <bbox> 坐标和严格的"区域外保持不变"约束。
  // 不能拼接全图精修模板词，也不能发送模板的 negative_prompt——
  // 模板负面词里含"脸部过亮/光影割裂/背景过曝"等全局光影约束，会引导模型重新调整整张图曝光，
  // 导致局部修改后画面整体亮度漂移。局部模式改用专用的极简负面词，只禁止结构性破坏。
  const isLocalEdit = userInstruction.indexOf('<bbox>') !== -1;

  if (userInstruction) {
    if (isLocalEdit) {
      // 局部编辑 / AI带框：compare 侧已拼好 bbox 坐标 + 区域外锁定约束，直接使用
      prompt = userInstruction;
    } else {
      // AI 一句话（无框）：不再拼接 t2 全图精修词（会导致模型重绘姿势/服装/位置），
      // 改用强约束包装器，只执行用户指令、锁定未提及内容。
      prompt = buildAiGlobalPrompt(userInstruction);
    }
  } else if (hasAdjust) {
    prompt = buildAdjustPrompt(adjustments, tplPrompt);
  } else {
    prompt = tplPrompt || BASE_RETOUCH_PROMPT;
  }

  // 局部/AI带框 专用负面词：禁止全局曝光漂移 + 结构性破坏 + 姿势服装改变
  const LOCAL_EDIT_NEGATIVE = '全局提亮，整体变亮，曝光增加，补光，闪光灯效果，'
    + '改变亮度，改变对比度，改变白平衡，改变色温，改变饱和度，色偏，过曝，发白，'
    + '人物移位，姿势改变，手势变化，肢体增加或减少，多腿多手臂，手指畸形，'
    + '换脸，五官改变，服装款式改变，长裙变开叉，新增裸露，'
    + '画面变形，裁切，扩图，物体凭空出现或消失，水印，文字，畸形结构，模糊，噪点';

  // AI 一句话（无框）专用负面词：重点防止乱改人物姿势/服装/位置/背景 + 全局亮度色偏漂移
  const AI_GLOBAL_NEGATIVE = '人物移位，姿势改变，手势变化，站姿改变，肢体增加或减少，'
    + '多腿多手臂，手指畸形，腿部变形，换脸，五官重塑，陌生脸部，'
    + '服装款式改变，裙子变开叉，长裙变开叉，新增裸露，穿着方式改变，'
    + '背景物体凭空出现或消失，建筑变形，文字错乱，水印，'
    + '全局提亮，整体变亮，曝光增加，补光，闪光灯效果，改变亮度，改变对比度，'
    + '改变白平衡，改变色温，改变饱和度，色偏，过曝，发白，脸部过亮，光影割裂，'
    + '构图变化，视角变化，裁切，扩图，画面变形，重影，畸形结构';

  const body = {
    model: ARK_CONFIG.model,
    prompt,
    response_format: 'b64_json',
    size: ARK_CONFIG.size,
    stream: false,
    watermark: ARK_CONFIG.watermark
  };
  if (imageRef) body.image = imageRef;
  // 负面词选择：局部/AI带框 → LOCAL_EDIT_NEGATIVE；AI无框 → AI_GLOBAL_NEGATIVE；其他（快捷调节/首次精修）→ 模板负面词
  let effectiveNegative = tplNegative;
  if (isLocalEdit) effectiveNegative = LOCAL_EDIT_NEGATIVE;
  else if (userInstruction) effectiveNegative = AI_GLOBAL_NEGATIVE;
  if (effectiveNegative) body.negative_prompt = effectiveNegative;

  console.log('[ai-service] 调用 ARK，size:', ARK_CONFIG.size, 'prompt长度:', prompt.length,
    '图片:', imageRef ? (imageRef.startsWith('data:') ? 'base64(' + Math.round(imageRef.length / 1024) + 'KB)' : imageRef.substring(0, 80)) : '无');

  try {
    const result = await arkRequest(body, signal);
    return result;
  } catch (err) {
    if (err.cancelled) {
      console.log('[ai-service] 请求已被用户取消');
      throw err;
    }
    console.error('[ai-service] ARK 处理失败:', err.message, err.statusCode || '', err.code || '');
    throw err;
  }
}

module.exports = {
  uploadImage,
  submitRetouch,
  submitToolTask,
  pollTaskStatus,
  connectTaskWebSocket,
  generateEdit,
  createCancelToken
};
