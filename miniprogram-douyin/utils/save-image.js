/**
 * 判断是否为远程网络 URL（非本地文件路径）
 * 微信小程序的本地文件路径可能以 http://tmp/、http://usr/、wxfile:// 等开头
 */
const platform = require('./platform.js');
function isRemoteUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('wxfile://')) return false;
  if (url.startsWith('file://')) return false;
  if (/^https?:\/\/(tmp|usr|store|storage|documents|savedfile|sandbox)\//i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

/**
 * 保存图片到系统相册（通用工具）
 * 支持：网络 URL(http/https)、base64 data URI、本地临时文件路径
 * @param {string} url - 图片地址
 * @returns {Promise<void>}
 */
function saveImageToAlbum(url) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      reject(new Error('图片地址为空'));
      return;
    }

    // 统一入口：拿到本地文件路径后执行保存
    var doSave = function (filePath) {
      platform.saveImageToPhotosAlbum({
        filePath: filePath,
        success: function () { resolve(); },
        fail: function (err) {
          var msg = (err && err.errMsg) || '';
          console.error('[save-image] saveImageToPhotosAlbum failed:', msg);
          reject(new Error(msg || '保存到相册失败'));
        }
      });
    };

    // 1. base64 data URI → 写入临时文件
    if (url.startsWith('data:')) {
      var commaIdx = url.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('base64 数据格式错误'));
        return;
      }
      var header = url.substring(5, commaIdx);
      var b64Data = url.substring(commaIdx + 1);
      var ext = 'png';
      if (header.indexOf('jpeg') > -1 || header.indexOf('jpg') > -1) ext = 'jpg';
      else if (header.indexOf('webp') > -1) ext = 'webp';
      else if (header.indexOf('gif') > -1) ext = 'gif';

      var fs = platform.getFileSystemManager();
      var tempPath = platform.env.USER_DATA_PATH + '/save_tmp_' + Date.now() + '.' + ext;

      try {
        fs.writeFile({
          filePath: tempPath,
          data: b64Data,
          encoding: 'base64',
          success: function () { doSave(tempPath); },
          fail: function (e) {
            console.error('[save-image] writeFile failed:', e);
            reject(new Error('写入临时文件失败: ' + ((e && e.errMsg) || '')));
          }
        });
      } catch (e) {
        console.error('[save-image] writeFile exception:', e);
        reject(new Error('写入临时文件异常'));
      }
      return;
    }

    // 2. 远程网络 URL → 先下载
    if (isRemoteUrl(url)) {
      platform.downloadFile({
        url: url,
        success: function (res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            doSave(res.tempFilePath);
          } else {
            console.error('[save-image] downloadFile failed, statusCode:', res.statusCode);
            reject(new Error('下载图片失败(' + res.statusCode + ')'));
          }
        },
        fail: function (e) {
          var errMsg = (e && e.errMsg) || '';
          console.error('[save-image] downloadFile error:', errMsg);
          if (errMsg.indexOf('domain list') > -1 || errMsg.indexOf('not in domain') > -1) {
            reject(new Error('图片域名未配置，请在微信公众平台添加downloadFile合法域名'));
          } else {
            reject(new Error('下载图片失败: ' + errMsg));
          }
        }
      });
      return;
    }

    // 3. 本地路径（wxfile://、http://tmp/、http://usr/、普通路径）直接保存
    doSave(url);
  });
}

/**
 * 判断保存失败是否为权限被拒绝
 */
function isAuthDenied(err) {
  var msg = typeof err === 'string' ? err : ((err && err.message) || '');
  return msg.indexOf('auth deny') > -1 ||
         msg.indexOf('auth denied') > -1 ||
         msg.indexOf('authorize no response') > -1 ||
         (msg.indexOf('saveImageToPhotosAlbum:fail') > -1 && msg.indexOf('auth') > -1);
}

/**
 * 弹出权限引导对话框，点击后跳转设置页
 */
function showAuthGuide() {
  return new Promise(function (resolve) {
    platform.showModal({
      title: '需要相册权限',
      content: '保存图片需要访问您的相册，请在设置中开启"保存到相册"权限',
      confirmText: '去设置',
      confirmColor: '#FE2C55',
      success: function (r) {
        if (r.confirm) {
          platform.openSetting({
            success: function (res) {
              var granted = res.authSetting && res.authSetting['scope.writePhotosAlbum'];
              resolve(!!granted);
            },
            fail: function () { resolve(false); }
          });
        } else {
          resolve(false);
        }
      }
    });
  });
}

module.exports = {
  saveImageToAlbum: saveImageToAlbum,
  isAuthDenied: isAuthDenied,
  showAuthGuide: showAuthGuide,
  isRemoteUrl: isRemoteUrl
};
