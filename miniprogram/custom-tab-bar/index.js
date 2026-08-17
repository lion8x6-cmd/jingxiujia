var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64encode(str) {
  var i, b1, b2, b3, b, out = '';
  for (i = 0; i < str.length; i += 3) {
    b1 = str.charCodeAt(i) & 0xFF;
    b2 = i + 1 < str.length ? str.charCodeAt(i + 1) & 0xFF : NaN;
    b3 = i + 2 < str.length ? str.charCodeAt(i + 2) & 0xFF : NaN;
    b = (b1 << 16) | ((b2 || 0) << 8) | (b3 || 0);
    out += B64[(b >> 18) & 63] + B64[(b >> 12) & 63];
    out += isNaN(b2) ? '=' : B64[(b >> 6) & 63];
    out += isNaN(b3) ? '=' : B64[b & 63];
  }
  return out;
}

function icon(path, color) {
  var svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="' + color + '">' + path + '</svg>';
  return 'data:image/svg+xml;base64,' + b64encode(svg);
}

var G = '#999999';
var V = '#07C160';

var ICONS = {
  home: '<path d="M12 2.1L2 11.1V12h2v8.5c0 .83.67 1.5 1.5 1.5H10v-5.5c0-.28.22-.5.5-.5h3c.28 0 .5.22.5.5V22h4.5c.83 0 1.5-.67 1.5-1.5V12h2v-.9L12 2.1z"/>',
  records: '<path d="M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8.2L14.3 2H6zm7.5 2.1L17.9 8.5H13.5V4.1zM8 11.5h8v1.8H8v-1.8zm0 4h8v1.8H8v-1.8z"/>',
  album: '<path d="M4 3.5A1.5 1.5 0 002.5 5v14A1.5 1.5 0 004 20.5h16a1.5 1.5 0 001.5-1.5V5A1.5 1.5 0 0020 3.5H4zm4.5 4a1.75 1.75 0 110 3.5 1.75 1.75 0 010-3.5zM6.5 17.5l3.2-4 2.4 2.5 2.6-3.2 3.8 4.7H6.5z"/>',
  lab: '<path d="M9 2h6v2H9V2zM8 4h8l-1 8H9L8 4zM7 14h10v2H7v-2zM9 16h6v2H9v-2zM10 18h4v2h-4v-2z"/>',
  mine: '<path d="M12 3.5a4.25 4.25 0 100 8.5 4.25 4.25 0 000-8.5zM4 20c0-3.6 3.36-6.25 8-6.25S20 16.4 20 20v.5H4V20z"/>'
};

Component({
  data: {
    selected: 0,
    color: G,
    selectedColor: V,
    list: [
      { pagePath: '/pages/index/index', text: '首页', iconPath: icon(ICONS.home, G), selectedIconPath: icon(ICONS.home, V) },
      { pagePath: '/pages/records/records', text: '生成记录', iconPath: icon(ICONS.records, G), selectedIconPath: icon(ICONS.records, V) },
      { pagePath: '/pages/album/album', text: '云相册', iconPath: icon(ICONS.album, G), selectedIconPath: icon(ICONS.album, V) },
      { pagePath: '/pages/lab/index', text: '调试', iconPath: icon(ICONS.lab, G), selectedIconPath: icon(ICONS.lab, V) },
      { pagePath: '/pages/mine/mine', text: '我的', iconPath: icon(ICONS.mine, G), selectedIconPath: icon(ICONS.mine, V) }
    ]
  },
  methods: {
    switchTab: function (e) {
      var path = e.currentTarget.dataset.path;
      if (!path) return;
      wx.switchTab({
        url: path,
        fail: function (err) {
          console.error('[tab-bar] switchTab failed:', path, err);
        }
      });
    }
  }
});
