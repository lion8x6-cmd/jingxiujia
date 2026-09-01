/**
 * 本地实时图片调节（纯 Canvas 像素处理，不调用 AI、不耗额度）
 *
 * 支持项（slider 范围除锐化/暗角为 0~100，其余 -100~+100）：
 *   brightness 亮度 / contrast 对比度 / saturate 饱和度
 *   temperature 色温（冷-暖）/ highlights 高光 / shadows 阴影
 *   sharpen 锐化（0~100）/ vignette 暗角（0~100）
 *
 * 预览：小尺寸 Canvas 实时渲染（renderPreview 返回 dataURL），拖动即所见即所得；
 * 应用：全尺寸 Canvas 逐像素处理导出高清 PNG（applyFilters 返回文件路径）。
 */

const platform = require('./platform.js');

const FILTER_KEYS = ['brightness', 'contrast', 'saturate', 'temperature', 'highlights', 'shadows', 'sharpen', 'vignette'];

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 是否有任何有效调节
function hasEffect(f) {
  f = f || {};
  return FILTER_KEYS.some(k => Math.abs(f[k] || 0) > 0.5);
}

// 逐像素处理（亮度/对比度/饱和度/色温/高光/阴影）
function applyColor(data, f, w, h) {
  const b = 1 + (f.brightness || 0) / 100;
  const c = 1 + (f.contrast || 0) / 100;
  const s = 1 + (f.saturate || 0) / 100;
  const temp = (f.temperature || 0) / 100;       // 正=暖 负=冷
  const high = (f.highlights || 0) / 100;       // 正=提亮高光 负=压高光
  const shad = (f.shadows || 0) / 100;         // 正=提亮阴影 负=压阴影

  const hasB = Math.abs(f.brightness || 0) > 0.5;
  const hasC = Math.abs(f.contrast || 0) > 0.5;
  const hasS = Math.abs(f.saturate || 0) > 0.5;
  const hasT = Math.abs(f.temperature || 0) > 0.5;
  const hasH = Math.abs(f.highlights || 0) > 0.5;
  const hasSh = Math.abs(f.shadows || 0) > 0.5;

  const px = data.data || data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], bl = px[i + 2];

    if (hasB) { r *= b; g *= b; bl *= b; }
    if (hasC) {
      r = (r - 128) * c + 128;
      g = (g - 128) * c + 128;
      bl = (bl - 128) * c + 128;
    }
    if (hasT) {
      // 暖：加红减蓝；冷：减红加蓝
      r += temp * 28;
      bl -= temp * 28;
    }

    // 高光/阴影：按亮度分区平滑调整
    if (hasH || hasSh) {
      const L = lum(r, g, bl);
      if (hasH) {
        // 高光区（亮部）权重
        const wHigh = clamp01((L - 150) / 90);
        const delta = high * 45 * wHigh;
        r += delta; g += delta; bl += delta;
      }
      if (hasSh) {
        // 阴影区（暗部）权重
        const wShad = clamp01((90 - L) / 90);
        const delta = shad * 45 * wShad;
        r += delta; g += delta; bl += delta;
      }
    }

    if (hasS) {
      const gray = lum(r, g, bl);
      r = gray + (r - gray) * s;
      g = gray + (g - gray) * s;
      bl = gray + (bl - gray) * s;
    }

    px[i] = clamp(Math.round(r));
    px[i + 1] = clamp(Math.round(g));
    px[i + 2] = clamp(Math.round(bl));
  }
}

// 锐化：3x3 反掩膜卷积
function applySharpen(data, w, h, amount) {
  if (amount <= 0.5) return;
  const strength = Math.min(1, amount / 100) * 0.9;
  const px = data.data || data;
  const src = new Uint8ClampedArray(px);
  // 卷积核（中心权重随强度增大）
  const center = 1 + 4 * strength;
  const side = -strength;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v =
          src[i + ch] * center +
          (src[i - 4 + ch] + src[i + 4 + ch] + src[i - w * 4 + ch] + src[i + w * 4 + ch]) * side;
        px[i + ch] = clamp(Math.round(v));
      }
    }
  }
}

// 暗角：距中心越远越暗
function applyVignette(data, w, h, amount) {
  if (amount <= 0.5) return;
  const strength = Math.min(1, amount / 100);
  const px = data.data || data;
  const cx = w / 2, cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxDist; // 0 中心 ~ 1 角
      // 平滑衰减，中圈开始压暗
      const mask = Math.max(0, d - 0.45) / 0.55;
      const factor = 1 - strength * 0.55 * mask * mask;
      const i = (y * w + x) * 4;
      px[i] = clamp(Math.round(px[i] * factor));
      px[i + 1] = clamp(Math.round(px[i + 1] * factor));
      px[i + 2] = clamp(Math.round(px[i + 2] * factor));
    }
  }
}

function processImageData(imageData, w, h, f) {
  applyColor(imageData, f, w, h);
  applySharpen(imageData, w, h, f.sharpen || 0);
  applyVignette(imageData, w, h, f.vignette || 0);
}

// ============ 抖音兼容：必须用页面内 <canvas type="2d"> 节点 ============
// 抖音离屏 canvas（createOffscreenCanvas）没有 createImage()，无法加载图片；
// 且 V2 canvas 不能用 canvasToTempFilePath。因此 renderPreview/applyFilters
// 都接收页面传入的 canvas 节点，用 node.createImage() 加载、node.toDataURL() 导出，
// 再经 base64ToArrayBuffer + writeFileSync 落盘（JPEG，避开用户目录 10MB 单文件限制）。
let filterQueue = Promise.resolve();
function enqueue(task) {
  const run = filterQueue.then(() => task());
  filterQueue = run.catch(() => {});
  return run;
}

// 加载图片（用页面 canvas 节点的 createImage）
function loadImage(canvasNode, src) {
  return new Promise((resolve, reject) => {
    const img = canvasNode.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e || new Error('image load fail'));
    img.src = src;
  });
}

// 清理旧的 filter_ 临时文件，避免撑爆用户目录配额
function cleanOldFilterFiles(fs) {
  try {
    const dir = platform.env.USER_DATA_PATH;
    const names = fs.readdirSync(dir);
    names.forEach((n) => {
      if (n.indexOf('filter_') === 0) {
        try { fs.unlinkSync(dir + '/' + n); } catch (e) {}
      }
    });
  } catch (e) {}
}

// V2 canvas 导出：toDataURL → base64ToArrayBuffer → writeFileSync（JPEG）
function exportCanvasToFile(canvasNode) {
  return new Promise((resolve, reject) => {
    try {
      const fs = platform.getFileSystemManager();
      cleanOldFilterFiles(fs);
      const filePath = platform.env.USER_DATA_PATH + '/filter_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
      const dataURL = canvasNode.toDataURL('image/jpeg', 0.92);
      const base64 = dataURL.split(',')[1];
      if (platform.base64ToArrayBuffer) {
        const ab = platform.base64ToArrayBuffer(base64);
        fs.writeFileSync(filePath, ab);
        resolve(filePath);
      } else {
        fs.writeFile({ filePath, data: base64, encoding: 'base64', success: () => resolve(filePath), fail: reject });
      }
    } catch (e) { reject(e); }
  });
}

// 预览：渲染小图 dataURL（maxW 控制尺寸，保证拖动流畅）。canvasNode 必传。
function renderPreview(srcPath, filters, canvasNode, maxW) {
  const maxWidth = maxW || 260;
  if (!hasEffect(filters)) return Promise.resolve('');
  if (!canvasNode || typeof canvasNode.createImage !== 'function') return Promise.resolve('');
  return enqueue(() => new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(''), 6000);
    loadImage(canvasNode, srcPath).then(img => {
      try {
        const ctx = canvasNode.getContext('2d');
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(1, maxWidth / iw);
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));
        canvasNode.width = w; canvasNode.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        processImageData(imageData, w, h, filters);
        ctx.putImageData(imageData, 0, 0);
        img.src = '';
        clearTimeout(timer);
        finish(canvasNode.toDataURL('image/png'));
      } catch (e) {
        console.warn('[filters] 预览渲染失败:', e);
        clearTimeout(timer);
        finish('');
      }
    }).catch(() => { clearTimeout(timer); finish(''); });
  }));
}

// 应用：全尺寸处理并导出文件。canvasNode 必传。
function applyFilters(srcPath, filters, canvasNode) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (p) => { if (!settled) { settled = true; resolve(p); } };
    if (!hasEffect(filters)) { done(srcPath); return; }
    if (!canvasNode || typeof canvasNode.createImage !== 'function') { done(srcPath); return; }
    enqueue(() => new Promise((res) => {
      const finish = (p) => { res(); done(p); };
      const timer = setTimeout(() => finish(srcPath), 20000);
      loadImage(canvasNode, srcPath).then(img => {
        try {
          const ctx = canvasNode.getContext('2d');
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          // 长边限制 1600，避免超大图 canvas/getImageData 内存超限（1600 仍足够高清）
          const MAX = 1600;
          const longSide = Math.max(w, h);
          if (longSide > MAX) {
            const k = MAX / longSide;
            w = Math.max(1, Math.round(w * k));
            h = Math.max(1, Math.round(h * k));
          }
          canvasNode.width = w; canvasNode.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          processImageData(imageData, w, h, filters);
          ctx.putImageData(imageData, 0, 0);
          img.src = '';
          exportCanvasToFile(canvasNode)
            .then((p) => { clearTimeout(timer); finish(p || srcPath); })
            .catch(() => { clearTimeout(timer); finish(srcPath); });
        } catch (e) {
          console.warn('[filters] 处理失败:', e);
          clearTimeout(timer);
          finish(srcPath);
        }
      }).catch(() => { clearTimeout(timer); finish(srcPath); });
    }));
  });
}

module.exports = {
  FILTER_KEYS,
  hasEffect,
  renderPreview,
  applyFilters
};
