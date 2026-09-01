/**
 * 分销素材 - 图片左右拼接（原图 | 精修图）【抖音端】
 *
 * 纯本地 Canvas 处理，不耗 AI：
 *  - 两张图等比缩放到统一高度，左右拼合（中间白色间隔）
 *  - 每张图左上角画胶囊角标：[必拍 logo /images/logo.png] + 原图 / 精修图（logo 加载失败回退「必」字圆底）
 *  - 导出 PNG 临时文件，供保存相册 / 发布
 *
 * 抖音兼容性：离屏 canvas（createOffscreenCanvas）没有 createImage()，
 * 但页面内 <canvas type="2d"> 节点的 Canvas.createImage() 从基础库 1.87.0 起支持，
 * 因此这里要求调用方（promo 页）传入页面里的 canvas 节点，而不是内部建离屏 canvas。
 *
 * logo 目前用「必」字圆形占位，后续拿到正式 logo 图片可替换 drawBadge 内的 logo 绘制为 drawImage。
 */

const platform = require('./platform.js');

// 抖音端主题色（微信端为 #07C160）
const RESULT_GREEN = '#FE2C55';

function loadImage(canvas, src, retries) {
  retries = retries || 0;
  return new Promise((resolve, reject) => {
    let img;
    try {
      img = canvas.createImage();
    } catch (e) {
      reject(new Error('图片加载失败'));
      return;
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      // 偶发解码失败（多为内存/并发抖动），重试一次
      if (retries < 1) {
        setTimeout(() => loadImage(canvas, src, retries + 1).then(resolve, reject), 200);
      } else {
        reject(new Error('图片加载失败'));
      }
    };
    img.src = src;
  });
}

// 网络图片 canvas 无法直接加载，先 downloadFile 到本地临时路径
function ensureLocal(path) {
  return new Promise((resolve, reject) => {
    if (!path) { reject(new Error('图片为空')); return; }
    if (!/^https?:\/\//i.test(path)) { resolve(path); return; }
    platform.downloadFile({
      url: path,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('图片下载失败'));
      },
      fail: () => reject(new Error('图片下载失败，请检查网络'))
    });
  });
}

// 导出 V2（type="2d"）canvas 为本地图片文件。
// 关键1：抖音 V2 canvas 不支持 tt.canvasToTempFilePath（那是 V1 canvas-id 接口，V2 上不回调，会一直挂起超时），
//        官方推荐 canvas.toDataURL() → base64ToArrayBuffer → getFileSystemManager().writeFileSync。
// 关键2：抖音用户目录单文件上限 10MB，1500 高双图 PNG 无压缩易超限（writeFileSync:fail user dir saved file size...）；
//        拼接图为白底不透明，改用 JPEG（0.92）体积仅 1~2MB。
// 清理历史拼接临时文件，避免反复拼接撑爆用户目录配额
function cleanOldStitchFiles(fs) {
  try {
    const dir = platform.env.USER_DATA_PATH;
    const files = fs.readdirSync(dir);
    (files || []).forEach((name) => {
      if (name.indexOf('stitch_') === 0) {
        try { fs.unlinkSync(dir + '/' + name); } catch (e) {}
      }
    });
  } catch (e) {}
}

function exportCanvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    try {
      const fs = platform.getFileSystemManager();
      cleanOldStitchFiles(fs);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const filePath = platform.env.USER_DATA_PATH + '/stitch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
      if (typeof platform.base64ToArrayBuffer === 'function') {
        const ab = platform.base64ToArrayBuffer(base64);
        fs.writeFileSync(filePath, ab);
        resolve(filePath);
      } else {
        fs.writeFile({ filePath, data: base64, encoding: 'base64', success: () => resolve(filePath), fail: reject });
      }
    } catch (e) { reject(e); }
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 画左上角胶囊角标。ox/oy = 该图在画布上的左上角坐标；H = 画布高；logoImg = 必拍 logo 图片（可选）
function drawBadge(ctx, ox, oy, H, label, isResult, logoImg) {
  const pad = H * 0.018;
  const badgeH = H * 0.066;
  const x = ox + pad;
  const y = oy + pad;
  const innerPad = badgeH * 0.24;
  const logoSize = badgeH * 0.66;        // logo 正方形边长
  const logoY = y + (badgeH - logoSize) / 2;
  const logoX = x + innerPad;
  const fontSize = badgeH * 0.38;
  const gap = badgeH * 0.20;

  ctx.font = '600 ' + fontSize + 'px sans-serif';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(label).width;

  const badgeW = innerPad + logoSize + gap + textW + innerPad;

  // 胶囊底
  roundRectPath(ctx, x, y, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = isResult ? RESULT_GREEN : 'rgba(0,0,0,0.55)';
  ctx.fill();

  if (logoImg) {
    // 正式 logo（自带白底圆角）：圆角裁剪后 drawImage
    const r = logoSize * 0.22;
    ctx.save();
    roundRectPath(ctx, logoX, logoY, logoSize, logoSize, r);
    ctx.clip();
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    // 兜底：白圆底 + 「必」字
    const logoR = logoSize * 0.5;
    const logoCx = logoX + logoR;
    const logoCy = logoY + logoR;
    ctx.beginPath();
    ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = isResult ? RESULT_GREEN : '#333333';
    ctx.font = '700 ' + (badgeH * 0.42) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('必', logoCx, logoCy + badgeH * 0.02);
  }

  // 文字
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 ' + fontSize + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, logoX + logoSize + gap, y + badgeH / 2 + fontSize * 0.04);
}

/**
 * 左右拼接（抖音端，使用页面 canvas 节点）
 * @param {object} opt
 * @param {string} opt.leftPath   左图（原图）路径（本地或网络）
 * @param {string} opt.rightPath  右图（精修图）路径（本地或网络）
 * @param {object} opt.canvas     页面内 <canvas type="2d"> 节点（必传）
 * @param {string} [opt.leftLabel='原图']
 * @param {string} [opt.rightLabel='精修图']
 * @param {number} [opt.targetHeight=1500] 输出统一高度（px）
 * @returns {Promise<string>} 拼接图临时文件路径
 */
// 全局拼接队列：页面只有一个隐藏 canvas，快速切换图片时必须串行，
// 否则并发重设 canvas.width 会清空正在绘制的画布、大图解码也会互相挤爆内存。
let stitchQueue = Promise.resolve();

function stitchLeftRight(opt) {
  // 串行化：上一次拼接（无论成败）结束后才开始下一次
  const run = stitchQueue.then(() => doStitch(opt));
  // 队列本身不因单次失败而中断
  stitchQueue = run.catch(() => {});
  return run;
}

function doStitch(opt) {
  const canvas = opt.canvas;
  if (!canvas || !canvas.getContext) {
    return Promise.reject(new Error('拼接画布未就绪，请重试'));
  }
  const leftPath = opt.leftPath;
  const rightPath = opt.rightPath;
  const leftLabel = opt.leftLabel || '原图';
  const rightLabel = opt.rightLabel || '精修图';
  const H = opt.targetHeight || 1280;

  // 输出版式按屏幕预览的「半区宽高比」渲染，保证保存出来 = 屏幕上看到的双图对比画面
  // halfW/halfH 为屏幕上半区的逻辑像素尺寸（由 promo 测量传入）
  const halfAsp = (opt.halfW && opt.halfH) ? (opt.halfW / opt.halfH) : 0.62;
  const halfW = Math.round(H * halfAsp);
  const GAP = Math.round(H * 0.008);
  const W = halfW * 2 + GAP;

  // 手势变换：屏幕逻辑像素 → 画布像素（按半区高度等比换算）
  const gestureScale = opt.scale && opt.scale > 0 ? opt.scale : 1;
  const pxRatio = (opt.halfH && opt.halfH > 0) ? (H / opt.halfH) : 1;
  const gtx = (opt.tx || 0) * pxRatio;
  const gty = (opt.ty || 0) * pxRatio;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };
    const finish = (p) => { if (!settled) { settled = true; resolve(p); } };

    const ctx = canvas.getContext('2d');

    // 角标 logo（小程序包内资源）；加载失败不阻断拼接，drawBadge 内部回退为「必」字占位
    const logoReady = loadImage(canvas, '/images/logo.png').then(im => im).catch(() => null);

    Promise.all([ensureLocal(leftPath), ensureLocal(rightPath)])
      .then(([lp, rp]) => Promise.all([loadImage(canvas, lp), loadImage(canvas, rp), logoReady]))
      .then(([imL, imR, logoImg]) => {
        try {
          canvas.width = W;
          canvas.height = H;

          // 白底
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);

          // 画一个半区（含手势变换），ox = 该半区左边界，isRight 决定角标颜色
          const drawHalf = (img, ox, isRight) => {
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            // aspectFit 进半区
            const f = Math.min(halfW / iw, H / ih);
            const dw = iw * f;
            const dh = ih * f;
            const dx = ox + (halfW - dw) / 2;
            const dy = (H - dh) / 2;

            ctx.save();
            // 裁剪到半区：缩放/平移超出部分不溢出到另一半
            ctx.beginPath();
            ctx.rect(ox, 0, halfW, H);
            ctx.clip();
            // 以半区中心为原点应用手势：translate(中心+位移) → scale → translate(-中心)
            const cx = ox + halfW / 2;
            const cy = H / 2;
            ctx.translate(cx + gtx, cy + gty);
            ctx.scale(gestureScale, gestureScale);
            ctx.translate(-cx, -cy);
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();

            // 角标画在手势变换之外，始终固定清晰
            drawBadge(ctx, ox, 0, H, isRight ? rightLabel : leftLabel, isRight, logoImg);
          };

          drawHalf(imL, 0, false);
          drawHalf(imR, halfW + GAP, true);

          // 中间分隔线
          ctx.fillStyle = '#eceef1';
          ctx.fillRect(halfW, 0, GAP, H);

          // 绘制已完成，立即释放图片解码内存（大图解码占内存高，防多次拼接累积导致后续加载失败）
          try { imL.src = ''; } catch (e) {}
          try { imR.src = ''; } catch (e) {}
          try { if (logoImg) logoImg.src = ''; } catch (e) {}

          // V2（type="2d"）canvas：toDataURL → writeFileSync 导出（抖音 canvasToTempFilePath 仅支持 V1）
          exportCanvasToFile(canvas).then(finish).catch(fail);
        } catch (e) {
          fail(e);
        }
      })
      .catch(fail);

    setTimeout(() => fail(new Error('拼接超时')), 20000);
  });
}

module.exports = {
  stitchLeftRight
};
