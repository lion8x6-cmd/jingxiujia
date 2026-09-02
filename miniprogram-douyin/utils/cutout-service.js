/**
 * 智能抠图服务（抖音端）——火山 AI MediaKit 图像背景移除
 *
 * 输出：透明底 PNG（除主体外 alpha=0），支持抠人物、物品、文字、贴图、Logo 等任意主体。
 *
 * 四步链路（已在服务端用同一 Key 实测跑通）：
 *   1) POST /tools-sync/request-media-upload-url   body {}  → 拿 file_id(mediakit://)、upload_url(预签名 PUT)
 *   2) PUT  upload_url 上传图片二进制（ArrayBuffer，octet-stream，无额外 header）
 *   3) POST /tools-sync/remove-image-background     body {image_url: file_id, scene, output_format:'png'}
 *      → 返回 result.image_url（24h 有效）
 *   4) downloadFile 下载结果图到本地临时文件，返回路径
 *
 * scene：'general' 通用（默认，物品/文字/贴图/Logo/人像均可）｜'human' 人像｜'product' 商品
 *
 * 小程序适配点：
 *   - uploadFile 是 multipart POST，不能用于预签名 PUT；PUT 二进制用 platform.request({method:'PUT', data:ArrayBuffer})。
 *   - 读文件为 ArrayBuffer 用 fs.readFile({encoding: 不填}) 或 readFileSync（默认返回 ArrayBuffer）。
 */
const platform = require('./platform.js');
const MEDIAKIT_CONFIG = require('./mediakit-config.js');

// 统一提取微信/抖音 fail 回调里的错误信息（fail 给的是 {errMsg:"request:fail ..."}，没有 .message）
function errText(err, fallback) {
  if (!err) return fallback || '未知错误';
  if (typeof err === 'string') return err;
  return err.errMsg || err.message || err.errmsg || fallback || '未知错误';
}

function request(options, stage) {
  return new Promise((resolve, reject) => {
    platform.request({
      ...options,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else {
          const body = res.data;
          const msg = (body && (body.message || (body.Response && body.Response.Error && body.Response.Error.Message))) || '';
          reject(new Error('[' + stage + '] HTTP ' + res.statusCode + (msg ? ' ' + msg : '')));
        }
      },
      fail: (err) => reject(new Error('[' + stage + '] 网络请求失败：' + errText(err, '') + '（请检查小程序后台是否已配置该域名的合法域名）'))
    });
  });
}

function downloadFile(url, stage) {
  return new Promise((resolve, reject) => {
    platform.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('[' + stage + '] 下载失败 HTTP ' + res.statusCode));
      },
      fail: (err) => reject(new Error('[' + stage + '] 下载失败：' + errText(err, '') + '（请检查 downloadFile 合法域名）'))
    });
  });
}

// 读本地图片为 ArrayBuffer
function readFileBuffer(filePath) {
  return new Promise((resolve, reject) => {
    const fs = platform.getFileSystemManager();
    fs.readFile({
      filePath,
      success: (res) => resolve(res.data),   // 不指定 encoding，返回 ArrayBuffer
      fail: (err) => reject(new Error('读取图片失败：' + errText(err, '')))
    });
  });
}

/**
 * 背景移除（抠图）
 * @param {string} filePath 本地图片路径（临时/持久均可）
 * @param {object} opts { scene?: 'general'|'human'|'product' }
 * @returns {Promise<string>} 透明底 PNG 的本地临时文件路径
 */
function removeBackground(filePath, opts) {
  opts = opts || {};
  const scene = opts.scene || 'general';
  const base = MEDIAKIT_CONFIG.baseUrl;
  if (!MEDIAKIT_CONFIG.apiKey) {
    return Promise.reject(new Error('抠图服务未配置 MediaKit Key，请在 utils/mediakit-config.js 填入 apiKey'));
  }
  const authHeader = { Authorization: 'Bearer ' + MEDIAKIT_CONFIG.apiKey };

  // 第 1 步：申请上传地址
  const step1 = request({
    url: base + '/tools-sync/request-media-upload-url',
    method: 'POST',
    header: { 'Content-Type': 'application/json', ...authHeader },
    data: {}
  }, '申请上传').then((body) => {
    const result = body && body.result ? body.result : body;
    if (!result || !result.file_id || !result.upload_url) {
      throw new Error('[申请上传] 未返回上传地址：' + JSON.stringify(body).slice(0, 200));
    }
    return result;
  });

  return step1.then((up) => {
    // 第 2 步：PUT 上传二进制到预签名地址
    return readFileBuffer(filePath).then((buf) => {
      return request({
        url: up.upload_url,
        method: 'PUT',
        header: { 'Content-Type': 'application/octet-stream' },
        data: buf
      }, '上传图片').then(() => up.file_id);
    });
  }).then((fileId) => {
    // 第 3 步：调用背景移除
    return request({
      url: base + '/tools-sync/remove-image-background',
      method: 'POST',
      header: { 'Content-Type': 'application/json', ...authHeader },
      data: {
        image_url: fileId,
        scene: scene,
        output_format: 'png'
      }
    }, '抠图处理').then((body) => {
      const result = body && body.result ? body.result : body;
      if (!result || !result.image_url) {
        const msg = body && (body.message || (body.Response && body.Response.Error && body.Response.Error.Message));
        throw new Error('[抠图处理] ' + (msg || ('未返回结果图：' + JSON.stringify(body).slice(0, 200))));
      }
      return result.image_url;
    });
  }).then((imageUrl) => {
    // 第 4 步：下载结果图
    return downloadFile(imageUrl, '下载结果');
  }).then((tempPath) => {
    // 复制到持久用户目录（透明 PNG），避免 downloadFile 临时文件重启后被清理
    try {
      const fs = platform.getFileSystemManager();
      cleanOldCutoutFiles(fs);
      const dest = platform.env.USER_DATA_PATH + '/cutout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
      fs.copyFileSync(tempPath, dest);
      return dest;
    } catch (e) {
      console.warn('[cutout] 持久化失败，使用临时路径:', e);
      return tempPath;
    }
  });
}

// ============ 本地框选裁剪（V2 页面 canvas 节点）============
// 抖音离屏 canvas 无 createImage，裁剪也必须用页面 <canvas type="2d"> 节点。
function loadCanvasImage(canvasNode, src) {
  return new Promise((resolve, reject) => {
    const img = canvasNode.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e || new Error('image load fail'));
    img.src = src;
  });
}

function cleanOldCutoutFiles(fs) {
  try {
    const dir = platform.env.USER_DATA_PATH;
    fs.readdirSync(dir).forEach((n) => {
      if (n.indexOf('crop_') === 0 || n.indexOf('cutout_') === 0) {
        try { fs.unlinkSync(dir + '/' + n); } catch (e) {}
      }
    });
  } catch (e) {}
}

// 用 getImageInfo 把任意临时路径(http://tmp、ttfile:// 等)规范化为 canvas 可靠加载的本地路径，并取准确像素宽高
function normalizeImage(srcPath) {
  return new Promise((resolve, reject) => {
    platform.getImageInfo({
      src: srcPath,
      success: (info) => resolve({ path: info.path || srcPath, width: info.width, height: info.height }),
      fail: (err) => reject(new Error('读取图片信息失败：' + ((err && err.errMsg) || err || '') + '（src=' + srcPath + '）'))
    });
  });
}

/**
 * 按归一化框选区域裁剪图片，导出 PNG 本地文件（作为抠图输入，限定"框什么抠什么"）。
 * 先用 getImageInfo 规范化源图路径并取像素宽高（兼容模拟器 http://tmp 临时路径）。
 * @param {string} srcPath 源图本地路径
 * @param {object} region {x1,y1,x2,y2} 归一化 0-999
 * @param {object} canvasNode 页面 <canvas type="2d"> 节点
 * @returns {Promise<string>} 裁剪后 PNG 本地路径
 */
function cropRegionToFile(srcPath, region, canvasNode) {
  return normalizeImage(srcPath).then((info) => {
    return new Promise((resolve, reject) => {
      if (!canvasNode || typeof canvasNode.createImage !== 'function') {
        reject(new Error('[裁剪] 裁剪画布不可用')); return;
      }
      loadCanvasImage(canvasNode, info.path).then((img) => {
        try {
          // 优先用 getImageInfo 的准确像素宽高
          const iw = info.width || img.naturalWidth || img.width;
          const ih = info.height || img.naturalHeight || img.height;
          if (!iw || !ih) { reject(new Error('[裁剪] 读取图片尺寸失败')); return; }
          let sx = Math.min(region.x1, region.x2) / 999 * iw;
          let sy = Math.min(region.y1, region.y2) / 999 * ih;
          let sw = Math.abs(region.x2 - region.x1) / 999 * iw;
          let sh = Math.abs(region.y2 - region.y1) / 999 * ih;
          sx = Math.max(0, sx); sy = Math.max(0, sy);
          sw = Math.min(sw, iw - sx); sh = Math.min(sh, ih - sy);
          if (sw < 4 || sh < 4) { reject(new Error('框选区域太小')); return; }

          // 长边限制 2048，避免超大图 canvas 内存超限
          const MAX = 2048;
          let cw = Math.round(sw), ch = Math.round(sh);
          const longSide = Math.max(cw, ch);
          if (longSide > MAX) {
            const k = MAX / longSide;
            cw = Math.max(1, Math.round(cw * k));
            ch = Math.max(1, Math.round(ch * k));
          }

          canvasNode.width = cw; canvasNode.height = ch;
          const ctx = canvasNode.getContext('2d');
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
          img.src = '';

          const fs = platform.getFileSystemManager();
          cleanOldCutoutFiles(fs);
          const filePath = platform.env.USER_DATA_PATH + '/crop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
          const dataURL = canvasNode.toDataURL('image/png');
          const base64 = dataURL.split(',')[1];
          const ab = platform.base64ToArrayBuffer(base64);
          fs.writeFileSync(filePath, ab);
          resolve(filePath);
        } catch (e) {
          reject(new Error('[裁剪] ' + ((e && (e.errMsg || e.message)) || e)));
        }
      }).catch((e) => {
        reject(new Error('[裁剪] 加载图片失败：' + ((e && (e.errMsg || e.message)) || e || '') + '（可能是临时图片路径已失效，请重新选图）'));
      });
    });
  });
}

module.exports = {
  removeBackground,
  cropRegionToFile
};
