/**
 * 统一图片选择工具（抖音小程序版）
 *
 * 提供两种来源：
 *   1. 从相册选择（tt.chooseImage, sourceType=album）
 *   2. 拍照（tt.chooseImage, sourceType=camera）
 *
 * 抖音端使用 chooseImage 而非 chooseMedia：参数和返回值更稳定，
 * 与微信 wx.chooseImage 完全兼容。
 * 抖音不支持 wx.chooseMessageFile，故默认来源不包含 'message'；
 * pickFromMessage 保留为占位，调用即提示并 reject。
 *
 * 返回值结构：
 *   { tempFiles: [{ tempFilePath, size }] }
 *
 * 使用方式：
 *   const { chooseImage } = require('../../utils/picker');
 *   chooseImage({ count: 9 }).then(res => { ... });
 */

const platform = require('./platform.js');

/**
 * 弹出 ActionSheet 让用户选择来源，然后选图
 * @param {Object} options
 * @param {number} [options.count=1] 可选数量（仅相册支持多选，拍照固定1张）
 * @param {boolean} [options.allowCamera=true] 是否显示"拍照"入口
 * @param {string[]} [options.sources] 自定义来源顺序，可选值 'album'|'camera'
 * @returns {Promise<{tempFiles: Array<{tempFilePath:string,size:number}>, source:string}>}
 */
function chooseImage(options) {
  const opts = options || {};
  const count = Math.max(1, Math.min(20, opts.count || 1));
  const allowCamera = opts.allowCamera !== false;

  let sources = opts.sources;
  if (!sources || !sources.length) {
    sources = allowCamera ? ['album', 'camera'] : ['album'];
  }
  // 抖音端强制剔除不支持的 'message'
  sources = sources.filter(s => s !== 'message');

  const itemList = sources.map(s => SOURCE_LABEL[s]).filter(Boolean);

  return new Promise((resolve, reject) => {
    if (itemList.length === 1) {
      // 只有一个来源时不弹菜单，直接选
      pickFrom(sources[0], count).then(resolve, reject);
      return;
    }

    platform.showActionSheet({
      itemList,
      success: (sheetRes) => {
        const source = sources[sheetRes.tapIndex];
        if (!source) return reject(new Error('已取消'));
        pickFrom(source, count).then(resolve, reject);
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) ? '已取消' : ((err && err.errMsg) || '已取消')));
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
  if (source === 'message') return pickFromMessage(count);
  if (source === 'camera') return pickFromMedia(['camera'], 1);
  return pickFromMedia(['album'], count);
}

// 统一判断错误文案是否为"用户取消"
function isCancel(msg) {
  if (!msg) return false;
  return /cancel|取消/i.test(msg) && !/deny|auth|permission|权限/i.test(msg);
}

// 统一判断错误文案是否为"权限被拒"
function isAuthError(msg) {
  if (!msg) return false;
  return /deny|auth|permission|权限|not\s*allow/i.test(msg);
}

// 引导用户到设置页开启权限，返回是否开启成功
function guideToSettings(scope) {
  return new Promise((resolve) => {
    platform.showModal({
      title: '需要权限',
      content: scope === 'scope.camera'
        ? '需要相机权限才能拍照，是否前往设置开启？'
        : '需要相册权限才能选择照片，是否前往设置开启？',
      confirmText: '去设置',
      cancelText: '取消',
      success: (r) => {
        if (!r.confirm) return resolve(false);
        if (typeof platform.openSetting !== 'function') return resolve(false);
        platform.openSetting({
          success: (s) => {
            const setting = (s && s.authSetting) || {};
            // 任一相关权限开启即允许重试
            const granted = scope
              ? !!setting[scope]
              : Object.keys(setting).some(k => /camera|album/i.test(k) && setting[k]);
            resolve(!!granted);
          },
          fail: () => resolve(false)
        });
      },
      fail: () => resolve(false)
    });
  });
}

// 相册 / 拍照
// 抖音端使用 tt.chooseImage（比 tt.chooseMedia 更稳定，参数与微信 wx.chooseImage 一致）
function pickFromMedia(sourceType, count) {
  const scope = sourceType[0] === 'camera' ? 'scope.camera' : 'scope.album';

  const attempt = () => new Promise((resolve, reject) => {
    console.log('[picker] call chooseImage, sourceType=', sourceType, 'count=', count, 'api=', typeof platform.chooseImage);
    platform.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType,
      success: (res) => {
        console.log('[picker] chooseImage success, tempFilePaths=', res.tempFilePaths, 'tempFiles.length=', (res.tempFiles || []).length);
        const paths = res.tempFilePaths || [];
        const files = (res.tempFiles || []).map((f, i) => ({
          tempFilePath: f.tempFilePath || f.path || paths[i],
          size: f.size || 0
        }));
        if (!files.length && paths.length) {
          paths.forEach(p => files.push({ tempFilePath: p, size: 0 }));
        }
        resolve({ source: sourceType[0], tempFiles: files });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '选择图片失败';
        console.warn('[picker] chooseImage fail:', err);
        reject(new Error(msg));
      }
    });
  });

  return attempt().catch((err) => {
    const msg = err.message || '';
    // 用户主动取消：安静结束
    if (isCancel(msg)) throw new Error('已取消');
    // 权限被拒：弹设置引导，开启后重试一次
    if (isAuthError(msg)) {
      return guideToSettings(scope).then((granted) => {
        if (!granted) throw new Error('已取消');
        return attempt();
      });
    }
    // 其他真实错误
    platform.showToast({ title: '选图失败，请重试', icon: 'none' });
    throw err;
  });
}

// 从聊天记录选择（抖音小程序不支持，保留函数以保证 API 兼容）
function pickFromMessage() {
  platform.showToast({
    title: '抖音小程序暂不支持从聊天记录选择',
    icon: 'none'
  });
  return Promise.reject(new Error('API_NOT_SUPPORTED_ON_DOUYIN'));
}

module.exports = {
  chooseImage,
  pickFromMedia,
  pickFromMessage
};
