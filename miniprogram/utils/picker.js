/**
 * 统一图片选择工具
 *
 * 提供三种来源：
 *   1. 从相册选择（wx.chooseMedia, sourceType=album）
 *   2. 拍照（wx.chooseMedia, sourceType=camera）
 *   3. 从聊天记录选择（wx.chooseMessageFile, 仅 image 类型）
 *
 * 通过微信原生 ActionSheet 让用户选择来源，返回值结构与 wx.chooseMedia 对齐：
 *   { tempFiles: [{ tempFilePath, size }] }
 *
 * 使用方式：
 *   const { chooseImage } = require('../../utils/picker');
 *   chooseImage({ count: 9 }).then(res => { ... });
 */

/**
 * 弹出微信 ActionSheet 让用户选择来源，然后选图
 * @param {Object} options
 * @param {number} [options.count=1] 可选数量（仅相册/聊天记录支持多选，拍照固定1张）
 * @param {boolean} [options.allowCamera=true] 是否显示"拍照"入口
 * @param {string[]} [options.sources] 自定义来源顺序，可选值 'album'|'camera'|'message'
 * @returns {Promise<{tempFiles: Array<{tempFilePath:string,size:number}>, source:string}>}
 */
function chooseImage(options) {
  const opts = options || {};
  const count = Math.max(1, Math.min(20, opts.count || 1));
  const allowCamera = opts.allowCamera !== false;

  let sources = opts.sources;
  if (!sources || !sources.length) {
    sources = allowCamera
      ? ['album', 'camera', 'message']
      : ['album', 'message'];
  }

  const itemList = sources.map(s => SOURCE_LABEL[s]).filter(Boolean);

  return new Promise((resolve, reject) => {
    if (itemList.length === 1) {
      // 只有一个来源时不弹菜单，直接选
      pickFrom(sources[0], count).then(resolve, reject);
      return;
    }

    wx.showActionSheet({
      itemList,
      success: (sheetRes) => {
        const source = sources[sheetRes.tapIndex];
        if (!source) return reject(new Error('已取消'));
        pickFrom(source, count).then(resolve, reject);
      },
      fail: (err) => {
        // 用户取消不算错误，但 Promise 要结束
        reject(new Error(err && err.errMsg && err.errMsg.indexOf('cancel') >= 0 ? '已取消' : (err && err.errMsg) || '已取消'));
      }
    });
  });
}

const SOURCE_LABEL = {
  album: '从相册选择',
  camera: '拍照',
  message: '从聊天记录选择'
};

function pickFrom(source, count) {
  if (source === 'message') {
    return pickFromMessage(count);
  }
  if (source === 'camera') {
    return pickFromMedia(['camera'], 1);
  }
  return pickFromMedia(['album'], count);
}

// 相册 / 拍照
function pickFromMedia(sourceType, count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType,
      sizeType: ['original', 'compressed'],
      camera: 'back',
      success: (res) => {
        resolve({
          source: sourceType[0],
          tempFiles: (res.tempFiles || []).map(f => ({
            tempFilePath: f.tempFilePath,
            size: f.size || 0
          }))
        });
      },
      fail: (err) => reject(new Error(err.errMsg || '选择图片失败'))
    });
  });
}

// 从聊天记录选择（wx.chooseMessageFile）
// 注意：该 API 只在基础库 2.5.0+ 支持，需要"从所有会话中选取文件"权限
function pickFromMessage(count) {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseMessageFile !== 'function') {
      wx.showToast({
        title: '当前微信版本不支持从聊天记录选择',
        icon: 'none'
      });
      reject(new Error('API_NOT_SUPPORTED'));
      return;
    }

    wx.chooseMessageFile({
      count,
      type: 'image',
      success: (res) => {
        const files = (res.tempFiles || [])
          .filter(f => isImageFile(f))
          .map(f => ({
            tempFilePath: f.path,
            size: f.size || 0,
            name: f.name || ''
          }));

        if (!files.length) {
          wx.showToast({ title: '请选择图片文件', icon: 'none' });
          reject(new Error('NOT_IMAGE'));
          return;
        }

        resolve({ source: 'message', tempFiles: files });
      },
      fail: (err) => reject(new Error(err.errMsg || '从聊天记录选择失败'))
    });
  });
}

function isImageFile(f) {
  if (!f) return false;
  // wx.chooseMessageFile 在 type:'image' 时已经过滤，这里双保险
  if (f.type && f.type.toLowerCase().indexOf('image/') === 0) return true;
  const name = (f.name || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/.test(name);
}

module.exports = {
  chooseImage,
  pickFromMedia,
  pickFromMessage
};
