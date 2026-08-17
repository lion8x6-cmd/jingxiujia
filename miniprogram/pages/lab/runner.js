const { getSkill } = require('../../utils/lab-skills');
const aiService = require('../../utils/ai-service');
const storage = require('../../utils/storage');
const { TaskStatus } = require('../../utils/task-status');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');

Page({
  data: {
    skillId: '',
    skill: null,
    imagePath: '',
    params: {},
    visibleControls: [],
    finalPrompt: '',
    canGenerate: false,
    generating: false,
    progress: 0,
    showResult: false,
    resultUrl: '',
    promptExpanded: false
  },

  onLoad(options) {
    const skillId = options.skillId || '';
    const skill = getSkill(skillId);
    if (!skill) {
      wx.showToast({ title: '未知 Skill', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    // 设置导航标题
    wx.setNavigationBarTitle({ title: skill.name });

    // 初始化默认参数
    const params = {};
    skill.controls.forEach(c => {
      if (c.type === 'card-select') {
        const def = c.options.find(o => o.default);
        params[c.key] = def ? def.id : (c.options[0] ? c.options[0].id : '');
      } else if (c.type === 'chips') {
        const def = c.options.find(o => o.default);
        params[c.key] = def ? def.id : (c.options[0] ? c.options[0].id : '');
      } else if (c.type === 'tabs') {
        params[c.key] = c.options[0] ? c.options[0].id : '';
      } else if (c.type === 'slider') {
        params[c.key] = c.defaultValue || 0;
      } else if (c.type === 'switch') {
        params[c.key] = c.default !== undefined ? c.default : false;
      } else if (c.type === 'template-grid') {
        const def = c.options.find(o => o.default);
        params[c.key] = def ? def.id : (c.options[0] ? c.options[0].id : '');
      } else if (c.type === 'style-grid') {
        params[c.key] = c.options[0] ? c.options[0].id : '';
      } else {
        params[c.key] = '';
      }
    });

    // 给 style-grid 选项加 tagsText
    skill.controls.forEach(c => {
      if (c.type === 'style-grid' && c.options) {
        c.options.forEach(o => {
          o.tagsText = o.tags ? o.tags.join(' · ') : '';
        });
      }
    });

    this.setData({ skillId, skill, params }, () => {
      this.updateVisibleControls();
      this.rebuildPrompt();
    });
  },

  // 根据当前参数过滤可见控件
  updateVisibleControls() {
    const { skill, params } = this.data;
    if (!skill) return;
    const visible = skill.controls.filter(c => {
      if (typeof c.when === 'function') return c.when(params);
      return true;
    });
    this.setData({ visibleControls: visible });
  },

  // 重建提示词
  rebuildPrompt() {
    const { skill, params } = this.data;
    if (!skill || !skill.buildPrompt) return;
    const prompt = skill.buildPrompt(params);
    const canGenerate = !!(this.data.imagePath && prompt && prompt.trim());
    this.setData({ finalPrompt: prompt, canGenerate });
  },

  // 选择图片
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath;
        this.setData({ imagePath: tempPath }, () => this.rebuildPrompt());
      }
    });
  },

  // 卡片选择
  onCardSelect(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({ [`params.${key}`]: value }, () => {
      this.updateVisibleControls();
      this.rebuildPrompt();
    });
  },

  // Tab 选择
  onTabSelect(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({ [`params.${key}`]: value }, () => {
      this.updateVisibleControls();
      this.rebuildPrompt();
    });
  },

  // Chip 选择
  onChipSelect(e) {
    const { key, value } = e.currentTarget.dataset;
    this.setData({ [`params.${key}`]: value }, () => {
      this.rebuildPrompt();
    });
  },

  // 滑块点击
  onSliderTap(e) {
    const { key, count } = e.currentTarget.dataset;
    const touchX = e.detail.x || e.touches[0].clientX;
    const rect = e.currentTarget;
    // 简化：点击位置占比
    const step = Math.round((touchX / (wx.getSystemInfoSync().windowWidth - 128)) * (count - 1));
    const clamped = Math.max(0, Math.min(count - 1, step));
    this.setData({ [`params.${key}`]: clamped }, () => this.rebuildPrompt());
  },

  // 开关
  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`params.${key}`]: e.detail.value }, () => {
      this.updateVisibleControls();
      this.rebuildPrompt();
    });
  },

  // 文本输入
  onTextInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`params.${key}`]: e.detail.value }, () => this.rebuildPrompt());
  },

  // 手动编辑提示词
  onPromptEdit(e) {
    this.setData({ finalPrompt: e.detail.value });
  },

  // 展开/收起提示词
  togglePromptExpand() {
    this.setData({ promptExpanded: !this.data.promptExpanded });
  },

  // 复制提示词
  onCopyPrompt() {
    if (!this.data.finalPrompt) return;
    wx.setClipboardData({
      data: this.data.finalPrompt,
      success: () => wx.showToast({ title: '已复制提示词', icon: 'success' })
    });
  },

  // 生成
  async onGenerate() {
    if (this.data.generating || !this.data.canGenerate) return;
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      return;
    }
    const prompt = this.data.finalPrompt;
    if (!prompt || !prompt.trim()) {
      wx.showToast({ title: '提示词为空', icon: 'none' });
      return;
    }

    this.setData({ generating: true, progress: 0, showResult: true, resultUrl: '' });

    try {
      const result = await aiService.generateEdit({
        imagePath: '',
        imageUrl: this.data.imagePath,
        adjustments: {},
        customPrompt: prompt,
        basePrompt: '',
        negativePrompt: '',
        templateId: ''
      });

      // 保存记录到 storage
      const skillName = this.data.skill ? this.data.skill.name : '调试';
      const record = storage.addRecord({
        type: 'lab',
        labType: this.data.skillId,
        labName: skillName,
        originalUrl: this.data.imagePath,
        resultUrl: result.url,
        prompt: prompt,
        lastPrompt: prompt,
        status: TaskStatus.COMPLETED,
        taskId: 'lab_' + Date.now()
      });

      this.setData({
        generating: false,
        progress: 100,
        resultUrl: result.url,
        recordId: record.id
      });
      wx.showToast({ title: '生成完成', icon: 'success' });
    } catch (err) {
      console.error('[lab] generate failed:', err);
      this.setData({ generating: false, progress: 0 });
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    }
  },

  // 对比原图
  onCompareOriginal() {
    if (!this.data.imagePath) return;
    wx.previewImage({
      urls: [this.data.imagePath, this.data.resultUrl],
      current: this.data.resultUrl
    });
  },

  // 保存结果
  async onSaveResult() {
    if (!this.data.resultUrl) return;
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      await saveImageToAlbum(this.data.resultUrl);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      if (isAuthDenied(err)) {
        const granted = await showAuthGuide();
        if (granted) this.onSaveResult();
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    }
  },

  closeResult() {
    this.setData({ showResult: false });
  }
});
