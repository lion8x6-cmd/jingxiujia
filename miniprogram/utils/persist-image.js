/**
 * 本地图片持久化（微信端）
 *
 * 背景：chooseImage/拍照得到的是临时文件（wxfile://tmp），
 * 小程序重启/重新编译后临时文件会被系统清理，导致历史记录里的 originalUrl 失效
 * （拼接时 canvas 加载报"图片加载失败"）。
 *
 * 方案：生成记录时把原图复制到持久用户目录 USER_DATA_PATH（重启不丢），记录改存持久路径。
 */

function isRemoteOrData(p) {
  return typeof p === 'string' && (/^https?:\/\//i.test(p) || p.indexOf('data:') === 0);
}

// 已在持久用户目录内（微信 wxfile://usr 等）
function isInUserDir(p) {
  try {
    const ud = wx.env.USER_DATA_PATH || '';
    if (ud && p.indexOf(ud) === 0) return true;
    return /\/usr\//.test(p) || p.indexOf('savedfile') > -1 || /^saved-file:\/\//.test(p);
  } catch (e) { return false; }
}

/**
 * 把本地临时图片复制到持久用户目录，返回持久路径。
 * 远程 URL / data URI / 已在持久目录的路径原样返回。失败时原样返回（不阻断主流程）。
 */
function persistLocalImage(srcPath) {
  try {
    if (!srcPath || typeof srcPath !== 'string') return srcPath;
    if (isRemoteOrData(srcPath)) return srcPath;
    if (isInUserDir(srcPath)) return srcPath;

    const fs = wx.getFileSystemManager();
    const ud = wx.env.USER_DATA_PATH;
    const m = srcPath.match(/\.(jpe?g|png|webp|heic|bmp)$/i);
    const ext = m ? m[0].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
    const dest = ud + '/orig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + ext;
    fs.copyFileSync(srcPath, dest);
    return dest;
  } catch (e) {
    console.warn('[persist-image] copy failed, use original:', e);
    return srcPath;
  }
}

/**
 * 校验一个图片路径当前是否可读（用于过滤重启后已失效的旧记录）。
 * 远程/data 路径视为可用；本地路径用 accessSync 判断文件是否还在。
 */
function isImageAvailable(p) {
  try {
    if (!p || typeof p !== 'string') return false;
    if (isRemoteOrData(p)) return true;
    const fs = wx.getFileSystemManager();
    fs.accessSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  persistLocalImage,
  isImageAvailable,
  isRemoteOrData
};
