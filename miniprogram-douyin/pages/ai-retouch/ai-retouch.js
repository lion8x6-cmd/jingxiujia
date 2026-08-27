const platform = require('../../utils/platform.js');
const app = getApp();
const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { getTemplateById } = require('../../utils/templates');
const { TaskStatus } = require('../../utils/task-status');
const { chooseImage } = require('../../utils/picker');

Page({
  data: {
    selectedImages: [],
    isBatch: false,
    templates: [],
    selectedTemplate: 't1',
    customPrompt: '',
    strength: 50,
    submitting: false,
    templateId: ''
  },

  onLoad(options) {
    const templates = storage.getTemplates();
    const firstId = templates.length ? templates[0].id : 't2';
    this.setData({
      templates,
      selectedTemplate: options.templateId || firstId,
      templateId: options.templateId || ''
    });
    if (options.templateId) {
      this.setData({ selectedTemplate: options.templateId });
    }
  },

  chooseImage() {
    const remain = 9 - this.data.selectedImages.length;
    if (remain <= 0) {
      platform.showToast({ title: '最多9张', icon: 'none' });
      return;
    }
    // 首次选择或追加都允许多选，选多张后自动进入批量模式
    chooseImage({ count: remain })
      .then((res) => {
        const paths = res.tempFiles.map(f => f.tempFilePath);
        if (!paths.length) return;
        const newImages = [...this.data.selectedImages, ...paths].slice(0, 9);
        const isBatch = newImages.length > 1 || this.data.isBatch;
        this.setData({
          selectedImages: newImages,
          isBatch
        });
      })
      .catch((err) => {
        if (err && err.message === '已取消') return;
        console.warn('[chooseImage]', err);
      });
  },

  removeImage(e) {
    const idx = e.currentTarget.dataset.idx;
    const images = [...this.data.selectedImages];
    images.splice(idx, 1);
    this.setData({ selectedImages: images });
  },

  toggleBatch() {
    this.setData({ isBatch: !this.data.isBatch });
  },

  selectTemplate(e) {
    this.setData({ selectedTemplate: e.currentTarget.dataset.id });
  },

  onPromptInput(e) {
    this.setData({ customPrompt: e.detail.value });
  },

  onStrengthChange(e) {
    this.setData({ strength: e.detail.value });
  },

  async startRetouch() {
    if (!this.data.selectedImages.length) return;

    if (!app.globalData.isOnline) {
      platform.showModal({
        title: '网络已断开',
        content: '当前无网络连接，任务将在网络恢复后自动提交。',
        showCancel: true,
        confirmText: '稍后重试',
        cancelText: '取消'
      });
      return;
    }

    if (app.globalData.networkType !== 'wifi') {
      const confirmed = await new Promise(resolve => {
        platform.showModal({
          title: '移动数据提醒',
          content: '当前使用移动网络，上传图片可能消耗较多流量，是否继续？',
          success: (r) => resolve(r.confirm)
        });
      });
      if (!confirmed) return;
    }

    this.setData({ submitting: true });
    platform.showLoading({ title: '提交中...' });

    try {
      await app.ensureLogin().catch(() => {});

      const images = this.data.selectedImages;
      const isBatch = this.data.isBatch || images.length > 1;

      const tpl = getTemplateById(this.data.selectedTemplate);
      const tplPrompt = tpl ? tpl.prompt : '';
      const tplNegative = tpl ? tpl.negativePrompt : '';
      const finalPrompt = this.data.customPrompt
        ? tplPrompt + '\n' + this.data.customPrompt
        : tplPrompt;

      // 直接为每张图创建本地记录，真正的 AI 处理在 progress 页调用豆包接口完成
      const batchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      let firstTaskId = '';
      images.forEach((imgPath, i) => {
        const rec = storage.addRecord({
          taskId: '',
          batchId,
          isBatch,
          type: 'retouch',
          originalUrl: imgPath,
          resultUrl: '',
          status: TaskStatus.QUEUED,
          progress: 0,
          templateId: this.data.selectedTemplate,
          prompt: finalPrompt,
          negativePrompt: tplNegative,
          strength: this.data.strength,
          batchId,
          batchIndex: isBatch ? i + 1 : 0,
          batchTotal: isBatch ? images.length : 0
        });
        // 用记录 id 作为任务定位标识
        storage.updateRecord(rec.id, { taskId: rec.id });
        rec.taskId = rec.id;
        if (i === 0) firstTaskId = rec.id;
      });

      platform.hideLoading();
      this.setData({ submitting: false });

      platform.redirectTo({
        url: `/pages/progress/progress?taskId=${firstTaskId}&isBatch=${isBatch ? 1 : 0}&total=${images.length}&batchId=${batchId}`
      });
    } catch (err) {
      platform.hideLoading();
      this.setData({ submitting: false });
      platform.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  }
});
