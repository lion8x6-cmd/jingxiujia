/**
 * 平台适配层 - 抖音小程序
 * 在抖音小程序内，全局 API 挂载在 tt 上；
 * 微信开发者工具里可能存在 wx 占位，这里优先 tt，兜底 wx 方便联调。
 *
 * 使用方式：
 *   const platform = require('../../utils/platform');
 *   platform.login({ ... });
 *   platform.getStorageSync('token');
 */
let g;
let source = 'none';
if (typeof tt !== 'undefined' && typeof tt.chooseImage === 'function') {
  g = tt;
  source = 'tt';
} else if (typeof wx !== 'undefined' && typeof wx.chooseImage === 'function') {
  g = wx;
  source = 'wx';
} else if (typeof tt !== 'undefined') {
  g = tt;
  source = 'tt(partial)';
} else if (typeof wx !== 'undefined') {
  g = wx;
  source = 'wx(partial)';
} else {
  g = {};
  source = 'none';
}

// 调试用：在控制台能看到当前命中的平台
console.log('[platform] using:', source, 'chooseImage=', typeof g.chooseImage, 'chooseMedia=', typeof g.chooseMedia);

module.exports = g;
