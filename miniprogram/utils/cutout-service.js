/**
 * 智能抠图服务（微信端）——火山 AI MediaKit 图像背景移除
 *
 * 输出：透明底 PNG（除主体外 alpha=0），支持抠人物、物品、文字、贴图、Logo 等任意主体。
 *
 * 四步链路（已在服务端用同一 Key 实测跑通）：
 *   1) POST /tools-sync/request-media-upload-url   body {}  → 拿 file_id(mediakit://)、upload_url(预签名 PUT)
 *   2) PUT  upload_url 上传图片二进制（ArrayBuffer，octet-stream，无额外 header）
 *   3) POST /tools-sync/remove-image-background     body {image_url: file_id, scene, output_format:'png'}
 *      → 返回 result.image_url（24h 有效）
 *   4) downloadFile 下载结果图到本地，复制到持久目录，返回路径
 *
 * scene：'general' 通用（默认，物品/文字/贴图/Logo/人像均可）｜'human' 人像｜'product' 商品
 *
 * 微信端用 wx.createOffscreenCanvas（离屏 canvas 的 createImage 正常），裁剪无需页面 canvas 节点。
 */
const MEDIAKIT_CONFIG = require('./mediakit-config.js');

// 统一提取微信/抖音 fail 回调里的错误信息（fail 给的是 {errMsg:"request:fail ..."}，没有 .message）
function errText(err, fallback) {
  if (!err) return fallback || '未知错误';
  if (typeof err === 'string') return err;
  return err.errMsg || err.message || err.errmsg || fallback || '未知错误';
}

function request(options, stage) {
  return new Promise((resolve, reject) => {
    wx.request({
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
    wx.downloadFile({
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
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: (err) => reject(new Error('读取图片失败：' + errText(err, '')))
    });
  });
}

/**
 * 背景移除（抠图）
 * @param {string} filePath 本地图片路径
 * @param {object} opts { scene?: 'general'|'human'|'product' }
 * @returns {Promise<string>} 透明底 PNG 的持久本地路径
 */
function removeBackground(filePath, opts) {
  opts = opts || {};
  const scene = opts.scene || 'general';
  const base = MEDIAKIT_CONFIG.baseUrl;
  if (!MEDIAKIT_CONFIG.apiKey) {
    return Promise.reject(new Error('抠图服务未配置 MediaKit Key，请在 utils/mediakit-config.js 填入 apiKey'));
  }
  const authHeader = { Authorization: 'Bearer ' + MEDIAKIT_CONFIG.apiKey };

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
    return readFileBuffer(filePath).then((buf) => {
      return request({
        url: up.upload_url,
        method: 'PUT',
        header: { 'Content-Type': 'application/octet-stream' },
        data: buf
      }, '上传图片').then(() => up.file_id);
    });
  }).then((fileId) => {
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
    return downloadFile(imageUrl, '下载结果');
  }).then((tempPath) => {
    // 复制到持久用户目录（透明 PNG），避免临时文件重启后被清理
    try {
      const fs = wx.getFileSystemManager();
      cleanOldCutoutFiles(fs);
      const dest = wx.env.USER_DATA_PATH + '/cutout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
      fs.copyFileSync(tempPath, dest);
      return dest;
    } catch (e) {
      console.warn('[cutout] 持久化失败，使用临时路径:', e);
      return tempPath;
    }
  });
}

// ============ 本地框选裁剪（微信离屏 canvas）============
function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e || new Error('image load fail'));
    img.src = src;
  });
}

function cleanOldCutoutFiles(fs) {
  try {
    const dir = wx.env.USER_DATA_PATH;
    fs.readdirSync(dir).forEach((n) => {
      if (n.indexOf('crop_') === 0 || n.indexOf('cutout_') === 0) {
        try { fs.unlinkSync(dir + '/' + n); } catch (e) {}
      }
    });
  } catch (e) {}
}

/**
 * 按归一化框选区域裁剪图片，导出 PNG 本地文件（作为抠图输入，限定"框什么抠什么"）。
 * 优先用传入的页面 <canvas type="2d"> 节点（离屏 canvas 的 createImage 加载相册临时图偶发失败）；
 * 未传节点时回退 wx.createOffscreenCanvas。
 * @param {string} srcPath 源图本地路径
 * @param {object} region {x1,y1,x2,y2} 归一化 0-999
 * @param {object} [canvasNode] 页面 canvas 节点（推荐传入）
 * @returns {Promise<string>} 裁剪后 PNG 本地路径
 */
function cropRegionToFile(srcPath, region, canvasNode) {
  return new Promise((resolve, reject) => {
    let canvas;
    try {
      if (canvasNode && typeof canvasNode.createImage === 'function') {
        canvas = canvasNode;
      } else {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: 100, height: 100 });
      }
    } catch (e) {
      reject(new Error('[裁剪] 初始化画布失败：' + (e.errMsg || e.message || e)));
      return;
    }
    loadImage(canvas, srcPath).then((img) => {
      try {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) { reject(new Error('[裁剪] 读取图片尺寸失败')); return; }
        let sx = Math.min(region.x1, region.x2) / 999 * iw;
        let sy = Math.min(region.y1, region.y2) / 999 * ih;
        let sw = Math.abs(region.x2 - region.x1) / 999 * iw;
        let sh = Math.abs(region.y2 - region.y1) / 999 * ih;
        sx = Math.max(0, sx); sy = Math.max(0, sy);
        sw = Math.min(sw, iw - sx); sh = Math.min(sh, ih - sy);
        if (sw < 4 || sh < 4) { reject(new Error('框选区域太小')); return; }

        const MAX = 2048;
        let cw = Math.round(sw), ch = Math.round(sh);
        const longSide = Math.max(cw, ch);
        if (longSide > MAX) {
          const k = MAX / longSide;
          cw = Math.max(1, Math.round(cw * k));
          ch = Math.max(1, Math.round(ch * k));
        }

        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);

        const fs = wx.getFileSystemManager();
        cleanOldCutoutFiles(fs);
        const filePath = wx.env.USER_DATA_PATH + '/crop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
        let dataURL = '';
        try {
          dataURL = canvas.toDataURL('image/png');
        } catch (e) {
          reject(new Error('[裁剪] 导出失败：' + (e.errMsg || e.message || e)));
          return;
        }
        const base64 = dataURL.split(',')[1];
        fs.writeFile({
          filePath, data: base64, encoding: 'base64',
          success: () => resolve(filePath),
          fail: (e) => reject(new Error('[裁剪] 写文件失败：' + (e.errMsg || e.message || e)))
        });
      } catch (e) {
        reject(new Error('[裁剪] ' + (e.errMsg || e.message || e)));
      }
    }).catch((e) => {
      reject(new Error('[裁剪] 加载图片失败：' + ((e && (e.errMsg || e.message)) || e || '') + '（可能是临时图片路径已失效，请重新选图）'));
    });
  });
}

module.exports = {
  removeBackground,
  cropRegionToFile
};
