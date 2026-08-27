const history = require('../../utils/prompt-tester-history');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');

function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    record: null,
    showOriginal: false
  },

  onLoad(options) {
    const id = options.id;
    if (id) this.loadRecord(id);
  },

  loadRecord(id) {
    const rec = history.getById(id);
    if (rec) {
      this.setData({
        record: { ...rec, timeText: formatTime(rec.createdAt) }
      });
    }
  },

  // ============ 长按看原图 ============

  onTouchStart() {
    if (!this.data.record || !this.data.record.resultPath) return;
    this._pressTimer = setTimeout(() => {
      this._pressTimer = null;
      this.setData({ showOriginal: true });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 350);
  },

  onTouchEnd() {
    if (this._pressTimer) {
      clearTimeout(this._pressTimer);
      this._pressTimer = null;
    }
    if (this.data.showOriginal) {
      this.setData({ showOriginal: false });
    }
  },

  onUnload() {
    if (this._pressTimer) clearTimeout(this._pressTimer);
  },

  // ============ 预览图片 ============

  previewImage() {
    const rec = this.data.record;
    if (!rec) return;
    const urls = [];
    if (rec.originalPath) urls.push(rec.originalPath);
    if (rec.resultPath) urls.push(rec.resultPath);
    if (urls.length) {
      wx.previewImage({
        urls,
        current: this.data.showOriginal ? rec.originalPath : rec.resultPath
      });
    }
  },

  // ============ 保存 ============

  saveResult() {
    const url = this.data.record && this.data.record.resultPath;
    if (!url) return;
    wx.showLoading({ title: '保存中...', mask: true });
    saveImageToAlbum(url)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      })
      .catch(async (err) => {
        wx.hideLoading();
        if (isAuthDenied(err)) {
          const granted = await showAuthGuide();
          if (granted) this.saveResult();
        } else {
          wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        }
      });
  },

  // ============ 复用提示词 ============

  reusePrompt() {
    const rec = this.data.record;
    if (!rec) return;
    // 页面栈：tester → history → detail，需返回 2 层
    const pages = getCurrentPages();
    let delta = 0;
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].route === 'pages/lab/prompt-tester') {
        pages[i].setData({
          promptText: rec.prompt,
          negativeText: rec.negativePrompt || '',
          selectedPromptId: '',
          canGenerate: true
        });
        wx.navigateBack({ delta });
        return;
      }
      delta++;
    }
    // 测试页不在栈中，重新跳转
    wx.redirectTo({
      url: '/pages/lab/prompt-tester?prompt=' + encodeURIComponent(rec.prompt)
    });
  },

  // ============ 删除 ============

  deleteRecord() {
    const rec = this.data.record;
    if (!rec) return;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条测试记录？',
      confirmColor: '#e24b4a',
      success: (res) => {
        if (!res.confirm) return;
        history.removeRecord(rec.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      }
    });
  }
});
