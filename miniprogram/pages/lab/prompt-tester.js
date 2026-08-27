const aiService = require('../../utils/ai-service');
const promptLib = require('../../utils/prompt-library');
const testerHistory = require('../../utils/prompt-tester-history');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');

Page({
  data: {
    imagePath: '',
    promptText: '',
    negativeText: '',
    showNegative: false,

    // 提示词库
    categories: [],
    activeCategory: '全部',
    allPrompts: [],
    filteredPrompts: [],
    selectedPromptId: '',
    isManaging: false,

    // 生成
    generating: false,
    genProgress: 0,
    genProgressText: '0.00',
    resultUrl: '',
    showOriginal: false,

    // 新建/编辑弹窗
    showEditor: false,
    editingId: '',
    editName: '',
    editCategory: '',
    editPrompt: '',
    editNegative: '',

    showEmptyTip: false,

    // 预计算按钮可用状态（WXML 不支持直接调 .trim()）
    canGenerate: false,
    canSaveEditor: false
  },

  onLoad(options) {
    this.loadPrompts();
    if (options && options.prompt) {
      this.setData({
        promptText: decodeURIComponent(options.prompt),
        canGenerate: false
      });
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  goHistory() {
    wx.navigateTo({ url: '/pages/lab/prompt-history' });
  },

  // ============ 提示词库 ============

  loadPrompts() {
    const all = promptLib.getAll();
    const categories = [{ name: '全部' }, ...promptLib.getCategories()];
    this.setData({
      allPrompts: all,
      categories,
      activeCategory: '全部'
    }, () => this.filterPrompts());
  },

  filterPrompts() {
    const { allPrompts, activeCategory } = this.data;
    const list = activeCategory === '全部'
      ? allPrompts
      : allPrompts.filter(p => p.category === activeCategory);
    this.setData({ filteredPrompts: list });
  },

  selectCategory(e) {
    const cat = e.currentTarget.dataset.cat;
    this.setData({ activeCategory: cat }, () => this.filterPrompts());
  },

  selectPrompt(e) {
    const id = e.currentTarget.dataset.id;
    const item = promptLib.getById(id);
    if (!item) return;
    this.setData({
      selectedPromptId: id,
      promptText: item.prompt,
      negativeText: item.negativePrompt || '',
      showNegative: !!(item.negativePrompt),
      canGenerate: !!this.data.imagePath && !!item.prompt.trim()
    });
  },

  toggleManage() {
    this.setData({ isManaging: !this.data.isManaging });
  },

  // ============ 新建/编辑提示词 ============

  openAddPrompt() {
    this.setData({
      showEditor: true,
      editingId: '',
      editName: '',
      editCategory: '',
      editPrompt: this.data.promptText, // 默认带入当前输入框内容
      editNegative: this.data.negativeText,
      canSaveEditor: !!(this.data.promptText.trim())
    });
  },

  onEditPromptTpl(e) {
    const id = e.currentTarget.dataset.id;
    const item = promptLib.getById(id);
    if (!item || item.builtin) return;
    this.setData({
      showEditor: true,
      editingId: id,
      editName: item.name,
      editCategory: item.category,
      editPrompt: item.prompt,
      editNegative: item.negativePrompt || '',
      canSaveEditor: true
    });
  },

  deletePrompt(e) {
    const id = e.currentTarget.dataset.id;
    const item = promptLib.getById(id);
    if (!item || item.builtin) return;
    wx.showModal({
      title: '删除提示词',
      content: `确定删除"${item.name}"？`,
      confirmColor: '#e24b4a',
      success: (res) => {
        if (!res.confirm) return;
        promptLib.removePrompt(id);
        this.loadPrompts();
        if (this.data.selectedPromptId === id) {
          this.setData({ selectedPromptId: '' });
        }
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  closeEditor() {
    this.setData({ showEditor: false });
  },

  savePrompt() {
    const { editingId, editName, editCategory, editPrompt, editNegative } = this.data;
    if (!editName.trim() || !editPrompt.trim()) {
      wx.showToast({ title: '名称和提示词不能为空', icon: 'none' });
      return;
    }
    if (editingId) {
      promptLib.updatePrompt(editingId, {
        name: editName,
        category: editCategory,
        prompt: editPrompt,
        negativePrompt: editNegative
      });
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      promptLib.addPrompt({
        name: editName,
        category: editCategory,
        prompt: editPrompt,
        negativePrompt: editNegative
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    }
    this.setData({ showEditor: false });
    this.loadPrompts();
  },

  // ============ 图片选择 ============

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          imagePath: file.tempFilePath,
          canGenerate: !!this.data.promptText.trim()
        });
      }
    });
  },

  removeImage() {
    this.setData({ imagePath: '', resultUrl: '', canGenerate: false });
  },

  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({ urls: [this.data.imagePath] });
    }
  },

  previewResult() {
    if (this.data.resultUrl) {
      wx.previewImage({ urls: [this.data.resultUrl] });
    }
  },

  // ============ 结果图长按看原图 ============

  onResultTouchStart() {
    if (this.data.generating || !this.data.resultUrl) return;
    this._resultPressTimer = setTimeout(() => {
      this._resultPressTimer = null;
      this.setData({ showOriginal: true });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 350);
  },

  onResultTouchEnd() {
    if (this._resultPressTimer) {
      clearTimeout(this._resultPressTimer);
      this._resultPressTimer = null;
    }
    if (this.data.showOriginal) {
      this.setData({ showOriginal: false });
    }
  },

  // ============ 提示词输入 ============

  onPromptInput(e) {
    const val = e.detail.value;
    this.setData({
      promptText: val,
      selectedPromptId: '',
      canGenerate: !!(this.data.imagePath && val.trim())
    });
  },

  onNegativeInput(e) {
    this.setData({ negativeText: e.detail.value });
  },

  toggleNegative() {
    this.setData({ showNegative: !this.data.showNegative });
  },

  // ============ 弹窗输入 ============

  onEditName(e) {
    const v = e.detail.value;
    this.setData({
      editName: v,
      canSaveEditor: !!(v.trim() && this.data.editPrompt.trim())
    });
  },
  onEditCategory(e) { this.setData({ editCategory: e.detail.value }); },
  onEditPrompt(e) {
    const v = e.detail.value;
    this.setData({
      editPrompt: v,
      canSaveEditor: !!(this.data.editName.trim() && v.trim())
    });
  },
  onEditNegative(e) { this.setData({ editNegative: e.detail.value }); },

  // ============ 生成 ============

  // 进度动画（与 compare 页一致）
  _progressTimer: null,
  _progressStart: 0,
  _SEG_DURATION: 12000,
  _CREEP_TAU: 4000,

  startProgressAnim() {
    this.stopProgressAnim();
    this._progressStart = Date.now();
    this._progressTimer = setInterval(() => {
      if (this._genProgress >= 100) return;
      const elapsed = Date.now() - this._progressStart;
      let target;
      if (elapsed < this._SEG_DURATION) {
        target = 90 * (elapsed / this._SEG_DURATION);
      } else {
        const over = elapsed - this._SEG_DURATION;
        target = 90 + 9 * (1 - Math.exp(-over / this._CREEP_TAU));
      }
      const val = Math.min(99, Math.round(target * 100) / 100);
      if (val > this._genProgress) {
        this._genProgress = val;
        this.setData({ genProgress: val, genProgressText: val.toFixed(2) });
      }
    }, 50);
  },

  stopProgressAnim() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  },

  async generate() {
    const { imagePath, promptText, negativeText, generating } = this.data;
    if (generating) return;

    if (!imagePath) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      return;
    }
    if (!promptText.trim()) {
      this.setData({ showEmptyTip: true });
      setTimeout(() => this.setData({ showEmptyTip: false }), 1500);
      return;
    }

    this.setData({
      generating: true,
      genProgress: 0,
      genProgressText: '0.00',
      resultUrl: ''
    });
    this._genProgress = 0;
    this.startProgressAnim();

    try {
      const result = await aiService.generateEdit({
        imagePath: imagePath,
        imageUrl: '',
        adjustments: {},
        customPrompt: promptText.trim(),
        basePrompt: '',
        negativePrompt: negativeText.trim(),
        templateId: null
      });

      this.stopProgressAnim();
      this._genProgress = 100;
      this.setData({ genProgress: 100, genProgressText: '100.00' });
      await new Promise(r => setTimeout(r, 300));

      // 保存到测试历史
      let promptName = '';
      if (this.data.selectedPromptId) {
        const tpl = promptLib.getById(this.data.selectedPromptId);
        if (tpl) promptName = tpl.name;
      }
      try {
        testerHistory.addRecord({
          originalPath: this.data.imagePath,
          resultPath: result.url,
          prompt: this.data.promptText,
          negativePrompt: this.data.negativeText,
          promptName
        });
      } catch (e) {
        console.warn('[prompt-tester] 保存历史失败:', e);
      }

      this.setData({
        generating: false,
        resultUrl: result.url
      });
      wx.pageScrollTo({ selector: '.result-section', duration: 300 });
    } catch (err) {
      this.stopProgressAnim();
      console.error('[prompt-tester] 生成失败:', err);
      this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    }
  },

  // ============ 结果操作 ============

  saveResult() {
    const url = this.data.resultUrl;
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

  useAsInput() {
    const url = this.data.resultUrl;
    if (!url) return;
    // 结果是本地临时文件路径，直接作为新参考图
    this.setData({
      imagePath: url,
      resultUrl: '',
      promptText: '',
      negativeText: '',
      selectedPromptId: ''
    });
    wx.showToast({ title: '已作为新参考图', icon: 'none' });
  },

  onUnload() {
    this.stopProgressAnim();
  }
});
