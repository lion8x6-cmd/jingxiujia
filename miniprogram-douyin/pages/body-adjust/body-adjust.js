const platform = require('../../utils/platform.js');
const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');

Page({
  data: {
    imageSrc: '',
    bodyParts: [],
    selectedPart: 'face',
    currentPartName: '瘦脸',
    adjustments: {},
    activeList: [],
    hasAdjustments: false,
    adjustedCount: 0,
    submitting: false
  },

  onLoad(options) {
    const parts = storage.getBodyParts();
    this.setData({
      bodyParts: parts,
      imageSrc: options.src ? decodeURIComponent(options.src) : ''
    });
    if (!options.src) platform.navigateBack();
  },

  selectPart(e) {
    const id = e.currentTarget.dataset.id;
    const part = this.data.bodyParts.find(p => p.id === id);
    this.setData({
      selectedPart: id,
      currentPartName: part ? part.name : ''
    });
  },

  onSliderChange(e) {
    const value = e.detail.value;
    const part = this.data.selectedPart;
    const adjustments = { ...this.data.adjustments, [part]: value };
    this.updateAdjustments(adjustments);
  },

  onSliderAfter(e) {
    const value = e.detail.value;
    if (value === 0) {
      const adjustments = { ...this.data.adjustments };
      delete adjustments[this.data.selectedPart];
      this.updateAdjustments(adjustments);
    }
  },

  updateAdjustments(adjustments) {
    const activeList = Object.entries(adjustments)
      .filter(([_, v]) => v !== 0)
      .map(([id, value]) => {
        const part = this.data.bodyParts.find(p => p.id === id);
        return { id, name: part ? part.name : id, value };
      });
    const adjustedCount = activeList.length;
    this.setData({
      adjustments,
      activeList,
      hasAdjustments: adjustedCount > 0,
      adjustedCount
    });
  },

  removeAdjustment(e) {
    const id = e.currentTarget.dataset.id;
    const adjustments = { ...this.data.adjustments };
    delete adjustments[id];
    this.updateAdjustments(adjustments);
  },

  resetAll() {
    platform.showModal({
      title: '确认重置',
      content: '将清除所有部位调节，确定吗？',
      success: (res) => {
        if (res.confirm) {
          this.updateAdjustments({});
        }
      }
    });
  },

  async submitAdjust() {
    if (!this.data.hasAdjustments) return;
    this.setData({ submitting: true });

    try {
      const uploadResult = await aiService.uploadImage(this.data.imageSrc);
      const result = await aiService.submitRetouch({
        imageUrl: uploadResult.url,
        isBatch: false,
        adjustments: this.data.adjustments,
        prompt: 'body_adjust'
      });

      storage.addRecord({
        taskId: result.taskId,
        type: 'body-adjust',
        originalUrl: this.data.imageSrc,
        resultUrl: '',
        status: TaskStatus.QUEUED,
        adjustments: this.data.adjustments
      });

      this.setData({ submitting: false });
      platform.redirectTo({
        url: `/pages/progress/progress?taskId=${result.taskId}&isBatch=0&total=1`
      });
    } catch (err) {
      this.setData({ submitting: false });
      platform.showToast({ title: '提交失败', icon: 'none' });
    }
  }
});
