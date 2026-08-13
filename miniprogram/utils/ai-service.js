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
            resolve({ url: 'data:image/png;base64,' + item.b64_json, raw: res.data });
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
  const userInstruction = (customPrompt || '').trim();
  const hasAdjust = Object.values(adjustments || {}).some(v => v !== 0);

  if (userInstruction) {
    // AI 调节模式：用户自然语言指令为主，模板提示词作为风格基底
    prompt = tplPrompt
      ? tplPrompt + '；在此基础上按以下要求调整：' + userInstruction
      : userInstruction;
  } else if (hasAdjust) {
    prompt = buildAdjustPrompt(adjustments, tplPrompt);
  } else {
    prompt = tplPrompt || BASE_RETOUCH_PROMPT;
  }

  const body = {
    model: ARK_CONFIG.model,
    prompt,
    response_format: 'url',
    size: ARK_CONFIG.size,
    stream: false,
    watermark: ARK_CONFIG.watermark
  };
  if (imageRef) body.image = imageRef;
  if (tplNegative) body.negative_prompt = tplNegative;

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
