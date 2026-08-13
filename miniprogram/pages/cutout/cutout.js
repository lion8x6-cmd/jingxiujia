const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');

Page({
  data: {
    imageSrc: '',
    autoCutDone: false,
    toolMode: 'erase',
    selectedBg: 'transparent',
    processing: false
  },

  onLoad(options) {
    if (options.src) {
      this.setData({ imageSrc: decodeURIComponent(options.src) });
      setTimeout(() => {
        this.setData({ autoCutDone: true });
      }, 1500);
    } else {
      wx.navigateBack();
    }
  },

  onImageReady() {},

  setTool(e) {
    this.setData({ toolMode: e.currentTarget.dataset.mode });
  },

  selectBg(e) {
    this.setData({ selectedBg: e.currentTarget.dataset.bg });
  },

  resetCut() {
    this.setData({ autoCutDone: false, selectedBg: 'transparent' });
    setTimeout(() => this.setData({ autoCutDone: true }), 1500);
  },

  async confirmCut() {
    this.setData({ processing: true });
    try {
      const result = await aiService.submitToolTask('cutout', {
        imageSrc: this.data.imageSrc,
        background: this.data.selectedBg
      });
      storage.addRecord({
        taskId: result.taskId,
        type: 'cutout',
        originalUrl: this.data.imageSrc,
        resultUrl: '',
        status: TaskStatus.PROCESSING
      });
      setTimeout(() => {
        this.setData({ processing: false });
        wx.showToast({ title: '抠图完成', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      }, 2000);
    } catch (err) {
      this.setData({ processing: false });
      wx.showToast({ title: '处理失败', icon: 'none' });
    }
  }
});
