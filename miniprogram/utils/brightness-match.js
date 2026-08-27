/**
 * 亮度匹配后处理 v2
 *
 * 局部编辑后 Seedream 图生图会让整张图轻微变亮（黑位抬升、对比下降）。
 * 本模块用 Canvas 对结果图做仿射亮度重映射，把【框选区域以外】的像素
 * 亮度分布对齐到参考图——只统计 bbox 外像素，避免 AI 在框内的改动拉偏均值。
 *
 * 校正模型（仿射，比单纯乘系数更有效）：
 *   统计两图框外像素的平均亮度 mean 和 10% 分位暗部 p10
 *   out = clamp(p10_ref + (in - p10_res) * scale)
 *   scale = (mean_ref - p10_ref) / (mean_res - p10_res)
 * 同时恢复黑位（解决"发灰发白"）和整体亮度。
 *
 * 任何失败都降级返回原图路径，不阻塞流程。
 */

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 判断采样点 (fx, fy)（0~1）是否落在任一框选区域外
function isOutsideRegions(fx, fy, regions) {
  if (!regions || !regions.length) return true;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (fx >= r.x1 / 999 && fx <= r.x2 / 999 && fy >= r.y1 / 999 && fy <= r.y2 / 999) {
      return false;
    }
  }
  return true;
}

// 计算框外像素的亮度统计：均值 + 10% 分位（暗部）
function calcStats(canvas, ctx, img, sampleSize, regions) {
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  ctx.clearRect(0, 0, sampleSize, sampleSize);
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

  const lums = [];
  for (let y = 0; y < sampleSize; y++) {
    for (let x = 0; x < sampleSize; x++) {
      const i = (y * sampleSize + x) * 4;
      if (data[i + 3] < 10) continue;
      const fx = (x + 0.5) / sampleSize;
      const fy = (y + 0.5) / sampleSize;
      if (!isOutsideRegions(fx, fy, regions)) continue;
      lums.push(luminance(data[i], data[i + 1], data[i + 2]));
    }
  }

  if (!lums.length) return null;

  let sum = 0;
  for (let i = 0; i < lums.length; i++) sum += lums[i];
  const mean = sum / lums.length;

  // 10% 分位（暗部基准）
  const sorted = lums.slice().sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] || 0;

  return { mean, p10, count: lums.length };
}

// dataURL 写入本地文件
function dataURLToFile(dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const base64 = dataUrl.split(',')[1];
      const fs = wx.getFileSystemManager();
      const filePath = wx.env.USER_DATA_PATH + '/bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.png';
      fs.writeFile({
        filePath,
        data: base64,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: reject
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 将结果图框外亮度对齐到参考图
 * @param {string} resultPath  结果图本地路径
 * @param {string} refPath     参考图本地路径
 * @param {object} [options]
 * @param {Array}  [options.regions]   框选区域 [{x1,y1,x2,y2}] 归一化 0-999
 * @param {number} [options.threshold] 框外亮度差阈值（0-255），默认 2
 * @returns {Promise<string>} 校正后路径，失败返回 resultPath
 */
function matchBrightness(resultPath, refPath, options) {
  const opts = options || {};
  const regions = opts.regions || [];
  const threshold = opts.threshold != null ? opts.threshold : 2;
  const SAMPLE_SIZE = 256;

  return new Promise((resolve) => {
    let settled = false;
    function done(p) { if (!settled) { settled = true; resolve(p); } }

    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: SAMPLE_SIZE, height: SAMPLE_SIZE });
      const ctx = canvas.getContext('2d');

      const refImg = canvas.createImage();
      const resultImg = canvas.createImage();
      let refLoaded = false, resultLoaded = false;

      function tryProcess() {
        if (!refLoaded || !resultLoaded) return;

        try {
          const refStats = calcStats(canvas, ctx, refImg, SAMPLE_SIZE, regions);
          const resStats = calcStats(canvas, ctx, resultImg, SAMPLE_SIZE, regions);

          if (!refStats || !resStats) {
            console.warn('[brightness-match] 框外样本不足，跳过校正');
            done(resultPath);
            return;
          }

          const diff = Math.abs(refStats.mean - resStats.mean);
          console.log('[brightness-match] 框外统计 ref:',
            'mean=' + refStats.mean.toFixed(1), 'p10=' + refStats.p10.toFixed(1),
            '| result:', 'mean=' + resStats.mean.toFixed(1), 'p10=' + resStats.p10.toFixed(1),
            '| diff=' + diff.toFixed(1), '| 样本=' + resStats.count);

          if (diff < threshold) { done(resultPath); return; }

          // 仿射映射参数
          const denom = (resStats.mean - resStats.p10) || 1;
          let scale = (refStats.mean - refStats.p10) / denom;
          scale = Math.max(0.5, Math.min(2.0, scale));
          const offset = refStats.p10 - resStats.p10 * scale;

          const w = resultImg.naturalWidth || resultImg.width;
          const h = resultImg.naturalHeight || resultImg.height;

          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(resultImg, 0, 0, w, h);

          const imageData = ctx.getImageData(0, 0, w, h);
          const px = imageData.data;
          for (let i = 0; i < px.length; i += 4) {
            px[i]     = Math.max(0, Math.min(255, Math.round(px[i]     * scale + offset)));
            px[i + 1] = Math.max(0, Math.min(255, Math.round(px[i + 1] * scale + offset)));
            px[i + 2] = Math.max(0, Math.min(255, Math.round(px[i + 2] * scale + offset)));
          }
          ctx.putImageData(imageData, 0, 0);

          const finish = (p) => {
            console.log('[brightness-match] 校正完成 scale=' + scale.toFixed(3) + ' offset=' + offset.toFixed(1));
            done(p);
          };

          // 优先 toDataURL（离屏 canvas 支持），失败降级 canvasToTempFilePath
          try {
            const dataUrl = canvas.toDataURL('image/png');
            dataURLToFile(dataUrl)
              .then(finish)
              .catch(() => exportByCanvasApi(canvas, resultPath, finish));
          } catch (e) {
            exportByCanvasApi(canvas, resultPath, finish);
          }
        } catch (e) {
          console.warn('[brightness-match] 处理失败，使用原图:', e);
          done(resultPath);
        }
      }

      function exportByCanvasApi(cv, fallback, cb) {
        wx.canvasToTempFilePath({
          canvas: cv,
          fileType: 'png',
          quality: 1,
          success: (res) => cb(res.tempFilePath),
          fail: () => cb(fallback)
        });
      }

      refImg.onload = () => { refLoaded = true; tryProcess(); };
      refImg.onerror = () => done(resultPath);
      resultImg.onload = () => { resultLoaded = true; tryProcess(); };
      resultImg.onerror = () => done(resultPath);

      refImg.src = refPath;
      resultImg.src = resultPath;

      setTimeout(() => done(resultPath), 8000);
    } catch (e) {
      console.warn('[brightness-match] 初始化失败，使用原图:', e);
      done(resultPath);
    }
  });
}

module.exports = { matchBrightness };
