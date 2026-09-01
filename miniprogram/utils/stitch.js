/**
 * 分销素材 - 双图对比拼接（原图 | 精修图）【微信端】
 *
 * 纯本地 Canvas 处理，不耗额度：
 *  - 两张图按屏幕预览半区版式 aspectFit 并排（中间分隔线），支持手势缩放/平移（所见即所得保存）
 *  - 每张图左上角画胶囊角标：[必拍 logo /images/logo.png] + 原图 / 精修图（logo 加载失败回退「必」字）
 *  - 使用页面内 <canvas type="2d"> 节点（调用方传入），toDataURL 导出 JPEG
 */

// 微信端主题色
const RESULT_GREEN = '#07C160';

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
      if (retries < 1) {
        setTimeout(() => loadImage(canvas, src, retries + 1).then(resolve, reject), 200);
      } else {
        reject(new Error('图片加载失败'));
      }
    };
    img.src = src;
  });
}

// 网络图片先 downloadFile 到本地临时路径
function ensureLocal(path) {
  return new Promise((resolve, reject) => {
    if (!path) { reject(new Error('图片为空')); return; }
    if (!/^https?:\/\//i.test(path)) { resolve(path); return; }
    wx.downloadFile({
      url: path,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error('图片下载失败'));
      },
      fail: () => reject(new Error('图片下载失败，请检查网络'))
    });
  });
}

// 清理历史拼接临时文件
function cleanOldStitchFiles(fs) {
  try {
    const dir = wx.env.USER_DATA_PATH;
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
      const fs = wx.getFileSystemManager();
      cleanOldStitchFiles(fs);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const filePath = wx.env.USER_DATA_PATH + '/stitch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.jpg';
      if (typeof wx.base64ToArrayBuffer === 'function') {
        const ab = wx.base64ToArrayBuffer(base64);
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

// 画左上角胶囊角标。ox/oy = 该图在画布上的左上角坐标；H = 画布高；logoImg = 必拍 logo（可选）
function drawBadge(ctx, ox, oy, H, label, isResult, logoImg) {
  const pad = H * 0.018;
  const badgeH = H * 0.066;
  const x = ox + pad;
  const y = oy + pad;
  const innerPad = badgeH * 0.24;
  const logoSize = badgeH * 0.66;
  const logoY = y + (badgeH - logoSize) / 2;
  const logoX = x + innerPad;
  const fontSize = badgeH * 0.38;
  const gap = badgeH * 0.20;

  ctx.font = '600 ' + fontSize + 'px sans-serif';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(label).width;

  const badgeW = innerPad + logoSize + gap + textW + innerPad;

  roundRectPath(ctx, x, y, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = isResult ? RESULT_GREEN : 'rgba(0,0,0,0.55)';
  ctx.fill();

  if (logoImg) {
    const r = logoSize * 0.22;
    ctx.save();
    roundRectPath(ctx, logoX, logoY, logoSize, logoSize, r);
    ctx.clip();
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
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

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 ' + fontSize + 'px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, logoX + logoSize + gap, y + badgeH / 2 + fontSize * 0.04);
}

let stitchQueue = Promise.resolve();

function stitchLeftRight(opt) {
  const run = stitchQueue.then(() => doStitch(opt));
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

  // 输出版式按屏幕预览半区宽高比
  const halfAsp = (opt.halfW && opt.halfH) ? (opt.halfW / opt.halfH) : 0.62;
  const halfW = Math.round(H * halfAsp);
  const GAP = Math.round(H * 0.008);
  const W = halfW * 2 + GAP;

  // 手势变换（屏幕逻辑像素 → 画布像素）
  const gestureScale = opt.scale && opt.scale > 0 ? opt.scale : 1;
  const pxRatio = (opt.halfH && opt.halfH > 0) ? (H / opt.halfH) : 1;
  const gtx = (opt.tx || 0) * pxRatio;
  const gty = (opt.ty || 0) * pxRatio;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };
    const finish = (p) => { if (!settled) { settled = true; resolve(p); } };

    const ctx = canvas.getContext('2d');

    const logoReady = loadImage(canvas, '/images/logo.png').then(im => im).catch(() => null);

    Promise.all([ensureLocal(leftPath), ensureLocal(rightPath)])
      .then(([lp, rp]) => Promise.all([loadImage(canvas, lp), loadImage(canvas, rp), logoReady]))
      .then(([imL, imR, logoImg]) => {
        try {
          canvas.width = W;
          canvas.height = H;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);

          const drawHalf = (img, ox, isRight) => {
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            const f = Math.min(halfW / iw, H / ih);
            const dw = iw * f;
            const dh = ih * f;
            const dx = ox + (halfW - dw) / 2;
            const dy = (H - dh) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.rect(ox, 0, halfW, H);
            ctx.clip();
            const cx = ox + halfW / 2;
            const cy = H / 2;
            ctx.translate(cx + gtx, cy + gty);
            ctx.scale(gestureScale, gestureScale);
            ctx.translate(-cx, -cy);
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();

            drawBadge(ctx, ox, 0, H, isRight ? rightLabel : leftLabel, isRight, logoImg);
          };

          drawHalf(imL, 0, false);
          drawHalf(imR, halfW + GAP, true);

          ctx.fillStyle = '#eceef1';
          ctx.fillRect(halfW, 0, GAP, H);

          try { imL.src = ''; } catch (e) {}
          try { imR.src = ''; } catch (e) {}
          try { if (logoImg) logoImg.src = ''; } catch (e) {}

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
