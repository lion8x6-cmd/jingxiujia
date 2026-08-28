const app = getApp();
const storage = require('../../utils/storage');
const { getTemplateById } = require('../../utils/templates');
const { TaskStatus } = require('../../utils/task-status');
const { chooseImage } = require('../../utils/picker');

const DEFAULT_TEMPLATE_ID = 't2';

Page({
  data: {},

  onLoad() {},

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (app.globalData && !app.globalData.isOnline) {
      wx.showToast({ title: '网络已断开', icon: 'none' });
    }
  },

  onStartTap() {
    chooseImage({ count: 9 })
      .then((res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        this.submitImages(paths);
      })
      .catch((err) => {
        if (err && err.message === '已取消') return;
        console.warn('[index] chooseImage:', err);
      });
  },

  // 个性化修图：进入编辑页（空状态，先在页内上传图片再手动编辑）
  onCustomTap() {
    wx.navigateTo({ url: '/pages/compare/compare?blank=1' });
  },

  async submitImages(paths) {
    if (!app.globalData.isOnline) {
      wx.showModal({
        title: '网络已断开',
        content: '当前无网络连接，请检查网络后重试。',
        showCancel: false
      });
      return;
    }

    if (app.globalData.networkType !== 'wifi') {
      const confirmed = await new Promise(resolve => {
        wx.showModal({
          title: '移动数据提醒',
          content: '当前使用移动网络，上传图片可能消耗较多流量，是否继续？',
          success: (r) => resolve(r.confirm)
        });
      });
      if (!confirmed) return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      await app.ensureLogin().catch(() => {});

      const isBatch = paths.length > 1;
      const tpl = getTemplateById(DEFAULT_TEMPLATE_ID);
      const finalPrompt = tpl ? tpl.prompt : '';
      const tplNegative = tpl ? tpl.negativePrompt : '';

      const batchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      let firstTaskId = '';

      paths.forEach((imgPath, i) => {
        const rec = storage.addRecord({
          taskId: '',
          batchId,
          isBatch,
          type: 'retouch',
          originalUrl: imgPath,
          resultUrl: '',
          status: TaskStatus.QUEUED,
          progress: 0,
          templateId: DEFAULT_TEMPLATE_ID,
          prompt: finalPrompt,
          negativePrompt: tplNegative,
          strength: 50,
          batchIndex: isBatch ? i + 1 : 0,
          batchTotal: isBatch ? paths.length : 0
        });
        storage.updateRecord(rec.id, { taskId: rec.id });
        rec.taskId = rec.id;
        if (i === 0) firstTaskId = rec.id;
      });

      wx.hideLoading();

      wx.navigateTo({
        url: `/pages/progress/progress?taskId=${firstTaskId}&isBatch=${isBatch ? 1 : 0}&total=${paths.length}&batchId=${batchId}`
      });
    } catch (err) {
      wx.hideLoading();
      console.error('[index] submitImages:', err);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  },

  onShareAppMessage() {
    return {
      title: '精修家 - AI一键精修废片',
      path: '/pages/index/index'
    };
  }
});
