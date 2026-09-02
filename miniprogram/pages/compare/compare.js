const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');
const { matchBrightness } = require('../../utils/brightness-match');
const { renderPreview, applyFilters, hasEffect } = require('../../utils/filters');
const { chooseImage } = require('../../utils/picker');
const cutoutService = require('../../utils/cutout-service');

// 首页工具入口（?tool=xxx）的页面标题 + 各面板专属文案
// 一句话修图(ai)/局部修改(local) 的提示语、placeholder、快捷词都按工具区分，不复用人像精修文案
const TOOL_UI = {
  text: {
    navTitle: '无痕改字',
    aiTip: '描述想改的文字，例如：“把海报上的价格改成 99 元”',
    aiPlaceholder: '想把哪里的文字改成什么？告诉我…',
    aiChips: [
      { text: '把画面中的文字改成：新品上市', label: '改标题' },
      { text: '把价格数字改成 99 元', label: '改价格' },
      { text: '修正画面里的错别字', label: '改错别字' }
    ],
    localExample: '框住要改的文字，输入“改成：全场 5 折”',
    regionPlaceholder: '输入要改成的文字，如：改成 5 折优惠'
  },
  cutout: {
    navTitle: '智能抠图',
    // 抠图只走「局部修改」：框选要抠的主体（人物/物品/文字/贴图/Logo 等），输出透明底 PNG
    localOnly: true,
    localExample: '框住要抠的主体，一键抠出（透明底 PNG）',
    regionPlaceholder: '无需输入指令，框好后直接点下方按钮',
    toolHint: '智能抠图：在图片上拖动手指，框住要抠出的主体（人物、物品、文字、贴图、Logo 等都可以），抠出后是透明底 PNG，可保存或换背景',
    submitText: '一键抠出透明图'
  },
  erase: {
    navTitle: '智能消除',
    aiTip: '描述想去掉的东西，例如：“去掉画面里的路人和垃圾桶”',
    aiPlaceholder: '想消除什么？路人、杂物、水印…',
    aiChips: [
      { text: '去掉画面里的路人', label: '消除路人' },
      { text: '去掉垃圾桶和多余杂物', label: '消除杂物' },
      { text: '去掉水印和多余文字', label: '消除水印' }
    ],
    localExample: '框住要消除的东西，输入“消除此处，用周围背景自然补全”',
    regionPlaceholder: '输入“消除”，如：消除这个路人'
  },
  restore: {
    navTitle: '老照片修复'
    // restore 用独立修复面板；修复完转一句话修图做后续精修，面板文案沿用通用人像版
  }
};

Page({
  data: {
    taskId: '',
    batchId: '',
    isBatch: false,
    total: 1,
    currentIndex: 0,
    currentItem: null,
    batchItems: [],

    // 个性化修图空状态（blank=1 进入，先在页内上传图片再编辑）
    isBlank: false,

    // 当前展示的图片（可能是历史版本而非最新）
    displayUrl: '',
    showOriginal: false,

    // 版本导航
    versions: [],          // [{url, label, prompt, isOriginal}]
    versionIdx: 0,         // 当前查看的版本索引
    canGoBack: false,
    canGoForward: false,
    versionLabel: '原图',
    canDeleteCurrent: false, // 当前版本是否可删除（原图不可删）
    versionIdxOfResult: -1,  // 最新精修图(resultUrl)在 versions 中的索引

    // 提示词弹窗
    showPromptModal: false,
    promptContent: '',

    // 调节模式：'ai' 一句话修图 / 'style' 参考图 / 'local' 局部修改 / 'filter' 实时调节
    adjustMode: 'ai',

    // 编辑面板展开状态
    editExpanded: false,

    // 局部编辑
    localRegions: [],      // [{id, x1,y1,x2,y2, prompt}] 归一化坐标 0-999
    activeRegionId: null,  // 当前选中的区域 id
    nextRegionId: 1,
    isDrawing: false,
    drawStart: null,
    drawRect: null,
    dragMode: null,        // 'draw' | 'move' | 'resize'
    dragHandle: null,      // 手柄标识
    dragStartData: null,   // 拖拽开始时的状态快照

    // 参考图风格迁移
    refImagePath: '',      // 风格参考图本地路径
    styleFeatureChips: [], // 特征勾选渲染数据 [{key,label,on}]

    // 首页工具入口（?tool=xxx）：text/cutout/restore/erase
    toolHint: '',          // 局部模式下的专属引导文案（改字/消除）
    toolLocked: false,     // 改字/抠图/消除工具：只保留「一句话修图」「局部修改」，隐藏参考图/实时调节
    restoreColorize: true, // 老照片修复：黑白照片自动上色（默认开）
    activeTool: '',        // 当前工具 key（text/cutout/erase），空=通用人像精修

    // 一句话修图 / 局部修改面板文案（按工具切换，默认是通用人像精修版）
    aiTip: '用一句话描述整体效果，例如：“皮肤再白皙一点，背景虚化一些”',
    aiPlaceholder: '想整体怎么改？告诉我...',
    aiChips: [
      { text: '皮肤更白皙通透', label: '皮肤更白皙' },
      { text: '背景虚化，突出人物', label: '背景虚化' },
      { text: '增强光影质感，更有电影感', label: '电影感' },
      { text: '牙齿更白，笑容更自然', label: '美白牙齿' }
    ],
    localExample: '输入修改指令，例如：磨皮美颜、换成卷发',
    regionPlaceholder: '输入修改指令，如：磨皮美颜',
    submitText: '',        // 提交按钮文案（抠图工具="一键抠出透明图"，空=默认"提交修改并生成"）

    // AI 调节
    aiPrompt: '',

    // 实时本地调节（纯本地 Canvas 处理）
    filterDefs: [
      { key: 'brightness', label: '亮度', min: -100, max: 100 },
      { key: 'contrast', label: '对比度', min: -100, max: 100 },
      { key: 'saturate', label: '饱和度', min: -100, max: 100 },
      { key: 'temperature', label: '色温', sub: '冷↔暖', min: -100, max: 100 },
      { key: 'highlights', label: '高光', min: -100, max: 100 },
      { key: 'shadows', label: '阴影', min: -100, max: 100 },
      { key: 'sharpen', label: '锐化', min: 0, max: 100 },
      { key: 'vignette', label: '暗角', min: 0, max: 100 }
    ],
    activeFilter: 'brightness',  // 当前 chip 选中的调节项
    activeFilterLabel: '亮度',
    activeFilterSub: '',
    activeFilterMin: -100,
    activeFilterMax: 100,
    activeFilterVal: 0,
    filterChips: [],            // chip 渲染数据（JS 预算好选中/已调状态）
    filterVals: {
      brightness: 0, contrast: 0, saturate: 0,
      temperature: 0, highlights: 0, shadows: 0,
      sharpen: 0, vignette: 0
    },
    filterPreviewUrl: '',   // Canvas 实时预览小图 dataURL
    hasFilter: false,       // 是否有非零调节

    generating: false,
    genProgress: 0,
    genProgressText: '0.00',
    canSubmit: false,

    // 图片缩放/平移
    imgScale: 1,
    imgTx: 0,
    imgTy: 0,
    imgAnim: false,

    // 保存弹窗 & 批量选择
    showSaveSheet: false,
    selectedSaveIds: [],
    selectedSaveMap: {},
    isAllSaveSelected: false
  },

  onLoad(options) {
    const taskId = options.taskId ? decodeURIComponent(options.taskId) : '';
    const batchId = options.batchId || '';
    const isBatch = options.isBatch === '1';
    const total = parseInt(options.total) || 1;

    const records = storage.getRecords();
    const styleFeatureChips = this.buildStyleFeatureChips([]);

    // 个性化修图空状态：不带图进入，先在页内上传图片再编辑
    if (options.blank === '1') {
      this._blankDraftId = '';
      this._pendingTool = options.tool || '';   // 首页工具入口：text/cutout/restore/erase
      // 改字/抠图/消除：只保留「一句话修图」「局部修改」两个模式；老照片无 tab；普通入口全量
      const lockedTool = ['text', 'cutout', 'erase'].indexOf(this._pendingTool) !== -1;
      // 首页工具入口已选好图（globalData 传递），带图直接加载，跳过空白页
      const appInst = getApp();
      const presetImg = (appInst.globalData && appInst.globalData.toolEntryImg) || '';
      if (appInst.globalData) appInst.globalData.toolEntryImg = '';

      this.setData({
        isBlank: true,
        isBatch: false,
        editExpanded: false,
        styleFeatureChips,
        toolHint: '',
        toolLocked: lockedTool,
        currentItem: null,
        batchItems: [],
        versions: [],
        versionIdx: -1,
        displayUrl: '',
        versionLabel: '原图',
        selectedSaveIds: [],
        selectedSaveMap: {}
      });
      this.refreshFilterChips();
      setTimeout(() => this.measureStage(), 320);
      if (presetImg) {
        // 首页工具直接选图进入：自动建草稿并定位到工具模式（同步调用，不闪空白页）
        this.loadBlankImage(presetImg);
      }
      return;
    }

    let batchItems = [];
    let currentItem = null;

    if (isBatch) {
      batchItems = records
        .filter(r => {
          if (batchId) return r.batchId === batchId;
          return r.batchTotal === total && r.batchIndex > 0;
        })
        .sort((a, b) => a.batchIndex - b.batchIndex);
      currentItem = batchItems[0] || null;
    } else {
      currentItem = records.find(r => r.taskId === taskId) || records[0] || null;
      batchItems = currentItem ? [currentItem] : [];
    }

    const selectedSaveIds = currentItem ? [currentItem.id] : [];
    const selectedSaveMap = {};
    selectedSaveIds.forEach(id => { selectedSaveMap[id] = true; });

    const versions = this.buildVersions(currentItem);

    this.setData({
      taskId, batchId, isBatch, total,
      styleFeatureChips,
      batchItems, currentItem,
      displayUrl: versions.length ? versions[versions.length - 1].url : '',
      versionIdx: versions.length - 1,
      versions,
      selectedSaveIds, selectedSaveMap
    }, () => {
      this.syncSaveSelectAll();
      this.updateVersionState();
      this.refreshFilterChips();
    });
  },

  onReady() {
    // 测量舞台尺寸，用于缩放平移边界计算
    this.measureStage();
  },

  // ============ 个性化修图（空状态）：页内上传图片 ============
  onBlankPick() {
    chooseImage({ count: 1, allowCamera: true })
      .then((res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        this.loadBlankImage(paths[0]);
      })
      .catch((err) => {
        if (err && err.message === '已取消') return;
        console.warn('[compare] blank chooseImage:', err);
      });
  },

  loadBlankImage(imgPath) {
    // 建一条草稿记录（queued 状态、无 resultUrl），复用整套编辑/生成/版本逻辑；
    // records 列表只显示 completed，草稿不会出现；生成成功后自然转为 completed。
    const rec = storage.addRecord({
      taskId: '',
      isBatch: false,
      batchIndex: 0,
      batchTotal: 0,
      type: 'custom',
      originalUrl: imgPath,
      resultUrl: '',
      status: TaskStatus.QUEUED,
      progress: 0,
      templateId: 't2',
      prompt: '',
      negativePrompt: '',
      strength: 50
    });
    storage.updateRecord(rec.id, { taskId: rec.id });
    rec.taskId = rec.id;
    this._blankDraftId = rec.id;

    const versions = this.buildVersions(rec);
    const selectedSaveIds = [rec.id];
    const selectedSaveMap = {};
    selectedSaveMap[rec.id] = true;

    // 根据首页工具入口预设编辑模式 + 面板专属文案 + 导航标题
    const tool = this._pendingTool || '';
    this._pendingTool = '';
    let adjustMode = 'ai';
    let aiPrompt = '';
    let toolHint = '';
    // 面板文案：有工具配置用工具版，否则沿用默认（通用人像精修版）
    const tui = TOOL_UI[tool] || {};
    const panelData = {
      aiTip: tui.aiTip || this.data.aiTip,
      aiPlaceholder: tui.aiPlaceholder || this.data.aiPlaceholder,
      aiChips: tui.aiChips || this.data.aiChips,
      localExample: tui.localExample || this.data.localExample,
      regionPlaceholder: tui.regionPlaceholder || this.data.regionPlaceholder,
      submitText: tui.submitText || ''
    };
    if (tool === 'text') {
      adjustMode = 'local';
      toolHint = '无痕改字：框住要改的文字，在下方输入"改成 XXX"，会用匹配的字体和底色无痕替换';
    } else if (tool === 'erase') {
      adjustMode = 'local';
      toolHint = '智能消除：框住要去掉的路人、杂物、水印等，指令写"消除此处内容，用周围背景自然补全"';
    } else if (tool === 'cutout') {
      // 智能抠图：只用局部框选，框什么抠什么，输出透明底 PNG（无需提示词）
      adjustMode = 'local';
      toolHint = tui.toolHint || '';
    } else if (tool === 'restore') {
      adjustMode = 'restore';
    }
    // 导航栏标题显示各自功能名（无痕改字/智能抠图/智能消除/老照片修复），普通入口保持"效果对比"
    if (tui.navTitle && wx.setNavigationBarTitle) {
      wx.setNavigationBarTitle({ title: tui.navTitle });
    }

    this.setData({
      isBlank: false,
      editExpanded: true,
      adjustMode,
      toolHint,
      activeTool: tool,
      ...panelData,
      aiPrompt,
      taskId: rec.id,
      currentItem: rec,
      batchItems: [rec],
      versions,
      versionIdx: versions.length - 1,
      displayUrl: rec.originalUrl,
      versionLabel: '原图',
      selectedSaveIds,
      selectedSaveMap
    }, () => {
      this.syncSaveSelectAll();
      this.updateVersionState();
      this.refreshFilterChips();
      this.recomputeCanSubmit();
      setTimeout(() => this.measureStage(), 320);
    });
  },

  onUnload() {
    // 个性化修图中途放弃（草稿未生成结果）时清理草稿记录，避免存储堆积
    if (this._blankDraftId) {
      const item = this.data.currentItem;
      if (!item || !item.resultUrl) {
        storage.removeRecord(this._blankDraftId);
      }
      this._blankDraftId = '';
    }
    if (this._filterTimer) {
      clearTimeout(this._filterTimer);
      this._filterTimer = null;
    }
  },

  measureStage() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.stage').boundingClientRect(rect => {
      if (rect) {
        this._stageRect = rect;
        this._stageW = rect.width;
        this._stageH = rect.height;
        this.updateRegionScreenCoords();
      }
    }).exec();
  },

  onImgLoad(e) {
    // 捕获图片原始尺寸，用于 aspectFit 内容区计算
    if (e && e.detail) {
      this._imgNaturalW = e.detail.width;
      this._imgNaturalH = e.detail.height;
    }
    setTimeout(() => {
      this.measureStage();
      this.updateRegionScreenCoords();
    }, 50);
  },

  // ============ 长按查看原图 ============
  onStageLongPress() {
    if (this.data.generating) return;
    this._longPressActive = true;
    this.setData({ showOriginal: true });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  onBtnLongPress() {
    if (this.data.generating) return;
    this._longPressActive = true;
    this.setData({ showOriginal: true });
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  releaseOriginal() {
    if (this._longPressActive) {
      this._longPressActive = false;
      if (this.data.showOriginal) this.setData({ showOriginal: false });
    }
  },

  // ============ 版本历史 ============
  buildVersions(item) {
    if (!item) return [];
    const versions = [{
      url: item.originalUrl,
      label: '原图',
      prompt: '',
      isOriginal: true
    }];
    const history = Array.isArray(item.history) ? item.history : [];
    history.forEach((h, i) => {
      versions.push({
        url: h.url,
        label: '精修' + (i + 1),
        prompt: h.prompt || '',
        isOriginal: false
      });
    });
    if (item.resultUrl) {
      versions.push({
        url: item.resultUrl,
        label: '精修' + (history.length + 1),
        prompt: item.lastPrompt || item.prompt || '',
        isOriginal: false
      });
    }
    return versions;
  },

  updateVersionState() {
    const { versions, versionIdx } = this.data;
    if (!versions.length) return;
    const v = versions[versionIdx];
    // 计算 resultUrl 在 versions 中的位置（用于删除时判断是否删的是最新版）
    let resultIdx = -1;
    for (let i = versions.length - 1; i >= 0; i--) {
      if (!versions[i].isOriginal) { resultIdx = i; break; }
    }
    this.setData({
      displayUrl: v.url,
      versionLabel: v.label,
      canGoBack: versionIdx > 0,
      canGoForward: versionIdx < versions.length - 1,
      canDeleteCurrent: !v.isOriginal,
      versionIdxOfResult: resultIdx,
      imgScale: 1,
      imgTx: 0,
      imgTy: 0
    });
  },

  goVersionBack() {
    if (this.data.generating || !this.data.canGoBack) return;
    const idx = this.data.versionIdx - 1;
    this.setData({ versionIdx: idx, showOriginal: false });
    this.updateVersionState();
  },

  goVersionForward() {
    if (this.data.generating || !this.data.canGoForward) return;
    const idx = this.data.versionIdx + 1;
    this.setData({ versionIdx: idx, showOriginal: false });
    this.updateVersionState();
  },

  showPrompt() {
    const v = this.data.versions[this.data.versionIdx];
    if (!v || v.isOriginal) return;
    this.setData({
      showPromptModal: true,
      promptContent: v.prompt || '暂无提示词记录'
    });
  },

  closePrompt() {
    this.setData({ showPromptModal: false });
  },

  // ============ 查看原图切换 ============
  toggleOriginal() {
    if (this.data.generating) return;
    this.setData({ showOriginal: !this.data.showOriginal });
  },

  // ============ 删除当前版本 ============
  deleteCurrent() {
    if (this.data.generating) return;
    const v = this.data.versions[this.data.versionIdx];
    if (!v || v.isOriginal) {
      wx.showToast({ title: '原图不可删除', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除该版本',
      content: '确定要删除这一版精修图吗？其他版本不受影响。',
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: (res) => {
        if (!res.confirm) return;
        this.doDeleteVersion();
      }
    });
  },

  doDeleteVersion() {
    const { currentItem, versions, versionIdx } = this.data;
    if (!currentItem) return;
    const v = versions[versionIdx];
    if (!v || v.isOriginal) return;

    const history = Array.isArray(currentItem.history) ? currentItem.history.slice() : [];
    // versions[0] 是原图, versions[1..history.length] 来自 history, versions[history.length+1] 是 resultUrl
    const resultIdx = history.length + 1;

    let newResultUrl = currentItem.resultUrl;
    let newHistory = history;
    let newLastPrompt = currentItem.lastPrompt || currentItem.prompt || '';

    if (versionIdx < resultIdx) {
      // 删除的是历史版本（在 history 数组中）
      const histIdx = versionIdx - 1; // versions 索引减 1（减去原图）
      newHistory.splice(histIdx, 1);
    } else {
      // 删除的是最新精修图（resultUrl）：把最后一个历史版本提升为 resultUrl
      if (history.length > 0) {
        const last = history.pop();
        newResultUrl = last.url;
        newLastPrompt = last.prompt || '';
      } else {
        // 没有历史版本了，清空精修结果
        newResultUrl = '';
        newLastPrompt = currentItem.prompt || '';
      }
    }

    // 更新记录
    const updatedItem = {
      ...currentItem,
      resultUrl: newResultUrl,
      history: newHistory,
      lastPrompt: newLastPrompt,
      status: newResultUrl ? TaskStatus.COMPLETED : TaskStatus.QUEUED
    };
    storage.updateRecord(currentItem.id, updatedItem);

    const batchItems = this.data.batchItems.map(b => b.id === currentItem.id ? updatedItem : b);

    // 如果这张图已经没有任何精修版本了，从批次中移除
    const stillHasResult = newHistory.length > 0 || !!newResultUrl;
    let remainingBatchItems = batchItems;
    let nextItem = updatedItem;
    let nextIdx = this.data.currentIndex;

    if (!stillHasResult) {
      // 这张图已无任何精修版本，直接移除该记录项
      storage.removeRecords([currentItem.id]);
      remainingBatchItems = batchItems.filter(b => b.id !== currentItem.id);
      if (!remainingBatchItems.length) {
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      nextIdx = Math.min(this.data.currentIndex, remainingBatchItems.length - 1);
      nextItem = remainingBatchItems[nextIdx];
    }

    const newVersions = this.buildVersions(nextItem);
    const selectedSaveIds = [nextItem.id];
    const selectedSaveMap = { [nextItem.id]: true };

    this.setData({
      batchItems: remainingBatchItems,
      currentIndex: nextIdx,
      currentItem: nextItem,
      versions: newVersions,
      versionIdx: newVersions.length - 1,
      showOriginal: false,
      aiPrompt: '',
      refImagePath: '',
      styleFeatureChips: this.buildStyleFeatureChips([]),
      selectedSaveIds,
      selectedSaveMap
    }, () => {
      this.updateVersionState();
      this.recomputeCanSubmit();
      this.syncSaveSelectAll();
    });
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // ============ 图片区手势 ============
  // 规则：
  // - 局部编辑模式：单指=框选/移动选区；双指=拖动图片+捏合缩放
  // - 其他模式：单指拖动放大图、左右滑动切换；双指捏合缩放
  isLocalEditActive() {
    if (!this.data.editExpanded || this.data.showOriginal || this.data.generating) return false;
    // 局部编辑模式：单指=框选
    return this.data.adjustMode === 'local';
  },

  onStageTouchStart(e) {
    if (this.data.generating) return;
    const touches = e.touches;
    const local = this.isLocalEditActive();

    // 双指：缩放 + 拖动（所有模式通用）
    if (touches.length === 2) {
      // 如果正在局部编辑绘制中，先取消绘制
      if (this.data.isDrawing) {
        this.setData({ isDrawing: false, drawRect: null, drawStart: null });
      }
      this._pinching = true;
      this._twoFingerPan = true;
      this._swiping = false;
      this._panning = false;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      this._pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      this._pinchStartScale = this.data.imgScale;
      this._pinchStartTx = this.data.imgTx;
      this._pinchStartTy = this.data.imgTy;
      this._pinchCx = (touches[0].clientX + touches[1].clientX) / 2;
      this._pinchCy = (touches[0].clientY + touches[1].clientY) / 2;
      // 双指拖动起点
      this._twoFingerStartX = this._pinchCx;
      this._twoFingerStartY = this._pinchCy;
      this._twoFingerStartTx = this.data.imgTx;
      this._twoFingerStartTy = this.data.imgTy;
      return;
    }
    if (touches.length !== 1) return;
    const t = touches[0];

    // 局部编辑模式：单指始终用于框选/移动选区
    if (local) {
      const sx = this._stageRect ? t.clientX - this._stageRect.left : t.clientX;
      const sy = this._stageRect ? t.clientY - this._stageRect.top : t.clientY;
      this.onLocalTouchStart(sx, sy);
      return;
    }

    // 非局部编辑模式：原有逻辑
    this._touchStartX = t.clientX;
    this._touchStartY = t.clientY;
    this._touchMoved = false;
    this._touchSwiped = false;
    this._pinching = false;
    // 双击检测
    const now = Date.now();
    if (this._lastTapTime && now - this._lastTapTime < 300) {
      this._lastTapTime = 0;
      this.onDoubleTap(t);
      this._touchStartX = null;
      return;
    }
    this._lastTapTime = now;
    // 放大时单指拖动
    if (this.data.imgScale > 1) {
      this._panning = true;
      this._panStartTx = this.data.imgTx;
      this._panStartTy = this.data.imgTy;
    } else {
      this._panning = false;
    }
  },

  onDoubleTap(t) {
    if (this.data.imgScale > 1) {
      this.setData({ imgAnim: true });
      this.resetZoom();
      setTimeout(() => this.setData({ imgAnim: false }), 220);
    } else {
      this.setData({ imgAnim: true });
      this.zoomTo(2.5, t.clientX, t.clientY);
      setTimeout(() => this.setData({ imgAnim: false }), 220);
    }
  },

  zoomTo(scale, cx, cy) {
    const rect = this._stageRect;
    const ox = rect ? (cx - rect.left - rect.width / 2) : 0;
    const oy = rect ? (cy - rect.top - rect.height / 2) : 0;
    const s = Math.max(1, Math.min(4, scale));
    this.setData({
      imgScale: s,
      imgTx: ox * (1 - s),
      imgTy: oy * (1 - s)
    });
  },

  resetZoom() {
    this.setData({ imgScale: 1, imgTx: 0, imgTy: 0 });
  },

  onStageTouchMove(e) {
    const touches = e.touches;

    // 双指：缩放 + 拖动
    if (this._pinching && touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;

      // 缩放
      if (this._pinchStartDist > 0) {
        let scale = this._pinchStartScale * (dist / this._pinchStartDist);
        scale = Math.max(1, Math.min(4, scale));
        const rect = this._stageRect;
        const ox = rect ? (this._pinchCx - rect.left - rect.width / 2) : 0;
        const oy = rect ? (this._pinchCy - rect.top - rect.height / 2) : 0;
        const ratio = scale / this._pinchStartScale;
        let tx = ox * (1 - ratio) + this._pinchStartTx * ratio;
        let ty = oy * (1 - ratio) + this._pinchStartTy * ratio;

        // 双指拖动叠加
        if (this._twoFingerPan) {
          tx += cx - this._twoFingerStartX;
          ty += cy - this._twoFingerStartY;
        }

        this.setData({ imgScale: scale, imgTx: tx, imgTy: ty });
      }
      return;
    }

    // 局部编辑模式：单指绘制/移动选区
    const local = this.isLocalEditActive();
    if (local && touches.length === 1
        && (this.data.isDrawing || this.data.dragMode === 'move')) {
      const t = touches[0];
      const sx = this._stageRect ? t.clientX - this._stageRect.left : t.clientX;
      const sy = this._stageRect ? t.clientY - this._stageRect.top : t.clientY;
      this.onLocalTouchMove(sx, sy);
      return;
    }

    // 非局部编辑：单指拖动放大图
    if (this._panning && touches.length === 1) {
      const t = touches[0];
      const dx = t.clientX - this._touchStartX;
      const dy = t.clientY - this._touchStartY;
      this.clampPan(this._panStartTx + dx, this._panStartTy + dy);
      return;
    }

    // 非局部编辑：左右滑动检测
    if (!local && this._touchStartX !== null && this._touchStartX !== undefined) {
      const t = touches[0];
      const dx = t.clientX - this._touchStartX;
      const dy = t.clientY - this._touchStartY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        this._touchMoved = true;
      }
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && this.data.imgScale <= 1) {
        this._touchSwiped = true;
      }
    }
  },

  clampPan(tx, ty) {
    const s = this.data.imgScale;
    if (s <= 1) {
      this.setData({ imgTx: 0, imgTy: 0 });
      this.updateRegionScreenCoords();
      return;
    }
    const w = this._stageW || 375;
    const h = this._stageH || 600;
    const maxX = (s - 1) * w / 2;
    const maxY = (s - 1) * h / 2;
    const cx = Math.max(-maxX, Math.min(maxX, tx));
    const cy = Math.max(-maxY, Math.min(maxY, ty));
    this.setData({ imgTx: cx, imgTy: cy });
    this.updateRegionScreenCoords();
  },

  onStageTouchEnd(e) {
    this.releaseOriginal();
    const local = this.isLocalEditActive();

    // 双指结束
    if (this._pinching) {
      if (e.touches.length === 1) {
        // 还剩一根手指
        this._pinching = false;
        this._twoFingerPan = false;
        if (local) {
          // 局部编辑模式：剩余单指不做拖动，直接结束
          if (this.data.imgScale < 1.05) this.resetZoom();
        } else {
          // 非局部编辑模式：切到单指拖动
          this._panning = true;
          this._panStartTx = this.data.imgTx;
          this._panStartTy = this.data.imgTy;
          const t = e.touches[0];
          this._touchStartX = t.clientX;
          this._touchStartY = t.clientY;
        }
      } else {
        this._pinching = false;
        this._twoFingerPan = false;
        if (this.data.imgScale < 1.05) this.resetZoom();
      }
      return;
    }

    // 局部编辑模式：单指结束绘制/移动
    if (local && (this.data.isDrawing || this.data.dragMode === 'move')) {
      this.onLocalTouchEnd();
      return;
    }

    // 非局部编辑：单指拖动结束
    if (this._panning) {
      this._panning = false;
      if (this.data.imgScale < 1.05) this.resetZoom();
      this._touchStartX = null;
      return;
    }

    // 非局部编辑：左右滑动切换
    if (this._touchSwiped && !this.data.generating && this.data.imgScale <= 1 && !this.data.showOriginal) {
      const t = e.changedTouches[0];
      const dx = t.clientX - this._touchStartX;
      if (dx < -50) this.goNext();
      else if (dx > 50) this.goPrev();
    }
    this._touchStartX = null;
    this._touchMoved = false;
    this._touchSwiped = false;
  },

  onStageTouchCancel() {
    this._pinching = false;
    this._twoFingerPan = false;
    this._panning = false;
    this._touchStartX = null;
    this._touchSwiped = false;
    if (this.data.isDrawing || this.data.dragMode === 'move') {
      this.onLocalTouchEnd();
    }
    if (this.data.imgScale < 1.05) this.resetZoom();
  },

  goPrev() {
    if (this.data.currentIndex > 0) this.switchToIndex(this.data.currentIndex - 1);
  },
  goNext() {
    if (this.data.currentIndex < this.data.batchItems.length - 1) this.switchToIndex(this.data.currentIndex + 1);
  },

  switchToIndex(idx) {
    const item = this.data.batchItems[idx];
    if (!item || idx === this.data.currentIndex) return;
    const versions = this.buildVersions(item);
    this.setData({
      currentIndex: idx,
      currentItem: item,
      versions,
      versionIdx: versions.length - 1,
      showOriginal: false,
      aiPrompt: '',
      refImagePath: '',
      styleFeatureChips: this.buildStyleFeatureChips([]),
      localRegions: [],
      activeRegionId: null,
      isDrawing: false,
      drawRect: null
    }, () => {
      this.updateVersionState();
      this.recomputeCanSubmit();
    });
  },

  // ============ 批量缩略图 ============
  onThumbTap(e) {
    const idx = e.currentTarget.dataset.idx;
    if (this.data.showSaveSheet) {
      this.toggleSaveSelect(this.data.batchItems[idx].id);
    } else {
      this.switchToIndex(idx);
    }
  },

  // ============ 面板收起/展开 ============
  expandPanel() {
    this.setData({ editExpanded: true, adjustMode: 'ai' }, () => {
      setTimeout(() => this.measureStage(), 320);
    });
  },
  collapsePanel() {
    this.setData({
      editExpanded: false, isDrawing: false, drawRect: null,
      filterVals: this.defaultFilterVals(), activeFilterVal: 0,
      filterPreviewUrl: '', hasFilter: false
    });
    this.refreshFilterChips();
    setTimeout(() => this.measureStage(), 320);
  },

  defaultFilterVals() {
    return {
      brightness: 0, contrast: 0, saturate: 0,
      temperature: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0
    };
  },

  // 根据当前数值/选中项预算 chip 渲染数据（避免 WXML 里用动态下标表达式）
  refreshFilterChips() {
    const vals = this.data.filterVals || {};
    const active = this.data.activeFilter;
    const filterChips = this.data.filterDefs.map(d => ({
      key: d.key,
      label: d.label,
      on: d.key === active,
      adjusted: (vals[d.key] || 0) !== 0
    }));
    this.setData({ filterChips });
  },

  // ============ 模式切换 ============
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.applyMode(mode);
  },

  // 一句话面板里"去框选"按钮：直接切到局部修改 tab
  gotoLocalMode() {
    if (this.data.generating) return;
    this.applyMode('local');
  },

  applyMode(mode) {
    if (!mode || mode === this.data.adjustMode || this.data.generating) return;
    // 工具入口（改字/抠图/消除）只允许一句话修图 / 局部修改，禁止切到参考图/实时调节
    if (this.data.toolLocked) {
      if (this.data.activeTool === 'cutout') {
        // 智能抠图：只用局部框选，禁止切到一句话修图/参考图/实时调节
        if (mode !== 'local') return;
      } else if (mode !== 'ai' && mode !== 'local') {
        return;
      }
    }
    // 离开实时调节模式时清掉未应用的滤镜预览
    const leavingFilter = this.data.adjustMode === 'filter';
    this.setData({
      adjustMode: mode, isDrawing: false, drawRect: null,
      filterVals: leavingFilter ? this.defaultFilterVals() : this.data.filterVals,
      activeFilterVal: leavingFilter ? 0 : this.data.activeFilterVal,
      filterPreviewUrl: leavingFilter ? '' : this.data.filterPreviewUrl,
      hasFilter: leavingFilter ? false : this.data.hasFilter
    }, () => {
      this.recomputeCanSubmit();
      this.measureStage();
      if (leavingFilter) this.refreshFilterChips();
    });
  },

  // ============ 参考图风格迁移 ============
  buildStyleFeatureChips(selected) {
    const sel = selected || [];
    return Object.keys(aiService.STYLE_FEATURES).map(key => ({
      key,
      label: aiService.STYLE_FEATURES[key].label,
      on: sel.indexOf(key) !== -1
    }));
  },

  getSelectedStyleFeatures() {
    return this.data.styleFeatureChips.filter(c => c.on).map(c => c.key);
  },

  onPickRefImage() {
    if (this.data.generating) return;
    chooseImage({ count: 1, allowCamera: true })
      .then((res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (!paths.length) return;
        this.setData({ refImagePath: paths[0] }, () => this.recomputeCanSubmit());
      })
      .catch((err) => {
        if (err && err.message === '已取消') return;
        console.warn('[compare] pick ref image:', err);
      });
  },

  onRemoveRefImage() {
    this.setData({ refImagePath: '' }, () => this.recomputeCanSubmit());
  },

  onToggleStyleFeature(e) {
    if (this.data.generating) return;
    const key = e.currentTarget.dataset.key;
    const selected = this.getSelectedStyleFeatures();
    const idx = selected.indexOf(key);
    if (idx === -1) selected.push(key); else selected.splice(idx, 1);
    this.setData({ styleFeatureChips: this.buildStyleFeatureChips(selected) }, () => this.recomputeCanSubmit());
  },

  // ============ 老照片修复 ============
  buildRestorePrompt(colorize) {
    let p = '对这张老照片进行专业修复：修复划痕、折痕、霉点、破损和缺失区域；'
      + '提升清晰度和分辨率，还原模糊的人脸与细节；校正褪色、发黄和偏色，恢复自然真实的色彩；'
      + '适度降噪去颗粒，增强对比度和层次。严格保持人物的长相、五官、身份、年龄、姿势、服装和画面构图完全不变，'
      + '只做修复增强，不美化、不换脸、不改变画面内容，结果自然真实。';
    if (colorize) {
      p += ' 如果原图是黑白或严重褪色的照片，请为其上色，还原符合年代与场景的自然真实色彩；原本就是彩色的照片则只校正褪色。';
    }
    return p;
  },

  onToggleRestoreColorize() {
    if (this.data.generating) return;
    this.setData({ restoreColorize: !this.data.restoreColorize });
  },

  // switch 自身点击：用事件回传的新值，避免与文字区 toggle 冲突
  onRestoreColorizeChange(e) {
    if (this.data.generating) return;
    this.setData({ restoreColorize: !!e.detail.value });
  },

  // ============ 局部编辑：坐标换算 ============
  // 获取图片在 stage 中的实际显示矩形（考虑 aspectFit 黑边）
  getImageDisplayRect() {
    const stage = this._stageRect;
    if (!stage || !this.data.currentItem) return null;
    // 用 image 组件的实际尺寸来算
    return new Promise(resolve => {
      wx.createSelectorQuery().in(this)
        .select('.stage-img').boundingClientRect(rect => {
          if (!rect) { resolve(null); return; }
          // image mode=aspectFit 时，rect 是组件容器大小；需要知道图片实际内容区域
          // 这里 rect 就是 image 元素的 box，aspectFit 内容居中
          resolve({
            left: rect.left - stage.left,
            top: rect.top - stage.top,
            width: rect.width,
            height: rect.height
          });
        }).exec();
    });
  },

  // 同步计算图片内容区（aspectFit）
  getImageContentRect() {
    const stage = this._stageRect;
    if (!stage) return null;
    const iw = this._imgNaturalW;
    const ih = this._imgNaturalH;
    if (!iw || !ih) {
      return { left: 0, top: 0, width: stage.width, height: stage.height };
    }
    const sw = stage.width, sh = stage.height;
    const scale = Math.min(sw / iw, sh / ih);
    const w = iw * scale, h = ih * scale;
    return {
      left: (sw - w) / 2,
      top: (sh - h) / 2,
      width: w,
      height: h
    };
  },

  // 屏幕坐标 -> 归一化坐标 0-999（考虑缩放和平移）
  screenToNorm(sx, sy) {
    const stage = this._stageRect;
    if (!stage) return { x: 500, y: 500 };
    const s = this.data.imgScale || 1;
    const tx = this.data.imgTx || 0;
    const ty = this.data.imgTy || 0;

    // 反变换：屏幕坐标 -> image 元素内坐标
    const cx = stage.width / 2;
    const cy = stage.height / 2;
    const imgX = (sx - cx - tx) / s + cx;
    const imgY = (sy - cy - ty) / s + cy;

    // image 元素内坐标 -> 图片内容归一化坐标
    const r = this.getImageContentRect();
    if (!r) return { x: 500, y: 500 };
    let nx = Math.round((imgX - r.left) / r.width * 999);
    let ny = Math.round((imgY - r.top) / r.height * 999);
    nx = Math.max(0, Math.min(999, nx));
    ny = Math.max(0, Math.min(999, ny));
    return { x: nx, y: ny };
  },

  // 归一化坐标 -> 屏幕坐标（考虑缩放和平移）
  normToScreen(nx, ny) {
    const stage = this._stageRect;
    if (!stage) return { x: 0, y: 0 };
    const r = this.getImageContentRect();
    if (!r) return { x: 0, y: 0 };
    const s = this.data.imgScale || 1;
    const tx = this.data.imgTx || 0;
    const ty = this.data.imgTy || 0;

    // 归一化 -> image 元素内坐标
    const imgX = r.left + nx / 999 * r.width;
    const imgY = r.top + ny / 999 * r.height;

    // image 元素内坐标 -> 屏幕坐标（应用 transform）
    const cx = stage.width / 2;
    const cy = stage.height / 2;
    const screenX = (imgX - cx) * s + cx + tx;
    const screenY = (imgY - cy) * s + cy + ty;
    return { x: screenX, y: screenY };
  },

  // 更新所有选区的屏幕位置
  updateRegionScreenCoords() {
    const regions = this.data.localRegions.map(reg => {
      const p1 = this.normToScreen(reg.x1, reg.y1);
      const p2 = this.normToScreen(reg.x2, reg.y2);
      return { ...reg, sx1: p1.x, sy1: p1.y, sx2: p2.x, sy2: p2.y };
    });
    this.setData({ localRegions: regions });
  },

  // ============ 局部编辑：触摸交互 ============
  // 判断触摸点是否在某个选区或手柄上
  hitTestRegion(x, y) {
    const regions = this.data.localRegions;
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      const sx1 = r.sx1, sy1 = r.sy1, sx2 = r.sx2, sy2 = r.sy2;
      if (x >= sx1 && x <= sx2 && y >= sy1 && y <= sy2) {
        return { id: r.id, action: 'move' };
      }
    }
    return null;
  },

  onLocalTouchStart(x, y) {
    // 先检查是否点中已有选区（移动）
    const hit = this.hitTestRegion(x, y);
    if (hit) {
      this.setData({
        activeRegionId: hit.id,
        dragMode: 'move',
        dragStartData: { x, y, regions: JSON.parse(JSON.stringify(this.data.localRegions)) }
      });
      return;
    }
    // 空白处开始绘制新选区
    if (this.data.localRegions.length >= 5) {
      wx.showToast({ title: '最多添加5个区域', icon: 'none' });
      return;
    }
    // 智能抠图：一次只抠一个主体，框满 1 个后提示先删除再重框
    if (this.data.activeTool === 'cutout' && this.data.localRegions.length >= 1) {
      wx.showToast({ title: '抠图一次抠一个主体，删除后可重新框选', icon: 'none' });
      return;
    }
    this.setData({
      isDrawing: true,
      drawStart: { x, y },
      drawRect: { x1: x, y1: y, x2: x, y2: y }
    });
  },

  onLocalTouchMove(x, y) {
    if (this.data.dragMode === 'move') {
      const { x: sx, y: sy, regions } = this.data.dragStartData;
      const dx = x - sx, dy = y - sy;
      const activeId = this.data.activeRegionId;
      const scale = this.data.imgScale || 1;
      // 屏幕位移转归一化位移（除以缩放比例）
      const contentRect = this.getImageContentRect();
      let ndx = 0, ndy = 0;
      if (contentRect) {
        ndx = dx / scale / contentRect.width * 999;
        ndy = dy / scale / contentRect.height * 999;
      }
      const updated = regions.map(r => {
        if (r.id !== activeId) return r;
        let nx1 = r.x1 + ndx;
        let ny1 = r.y1 + ndy;
        let nx2 = r.x2 + ndx;
        let ny2 = r.y2 + ndy;
        // 限制在 0-999 范围内
        if (nx1 < 0) { nx2 -= nx1; nx1 = 0; }
        if (ny1 < 0) { ny2 -= ny1; ny1 = 0; }
        if (nx2 > 999) { nx1 -= (nx2 - 999); nx2 = 999; }
        if (ny2 > 999) { ny1 -= (ny2 - 999); ny2 = 999; }
        // 更新屏幕坐标
        const p1 = this.normToScreen(nx1, ny1);
        const p2 = this.normToScreen(nx2, ny2);
        return { ...r, x1: nx1, y1: ny1, x2: nx2, y2: ny2, sx1: p1.x, sy1: p1.y, sx2: p2.x, sy2: p2.y };
      });
      this.setData({ localRegions: updated });
      return;
    }
    if (this.data.isDrawing) {
      const s = this.data.drawStart;
      this.setData({
        drawRect: {
          x1: Math.min(s.x, x), y1: Math.min(s.y, y),
          x2: Math.max(s.x, x), y2: Math.max(s.y, y)
        }
      });
    }
  },

  onLocalTouchEnd() {
    if (this.data.isDrawing) {
      const r = this.data.drawRect;
      const w = Math.abs(r.x2 - r.x1), h = Math.abs(r.y2 - r.y1);
      if (w < 20 || h < 20) {
        // 选区太小，取消
        this.setData({ isDrawing: false, drawRect: null, drawStart: null });
        return;
      }
      // 转归一化坐标
      const n1 = this.screenToNorm(r.x1, r.y1);
      const n2 = this.screenToNorm(r.x2, r.y2);
      const id = 'r' + this.data.nextRegionId;
      const contentRect = this.getImageContentRect();
      const newRegion = {
        id,
        x1: Math.min(n1.x, n2.x), y1: Math.min(n1.y, n2.y),
        x2: Math.max(n1.x, n2.x), y2: Math.max(n1.y, n2.y),
        prompt: '',
        sx1: r.x1, sy1: r.y1, sx2: r.x2, sy2: r.y2
      };
      this.setData({
        isDrawing: false,
        drawRect: null,
        drawStart: null,
        activeRegionId: id,
        nextRegionId: this.data.nextRegionId + 1,
        localRegions: [...this.data.localRegions, newRegion]
      }, () => this.recomputeCanSubmit());
      void contentRect;
    }
    this.setData({ dragMode: null, dragStartData: null });
  },

  selectRegion(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ activeRegionId: id });
  },

  deleteRegion(e) {
    const id = e.currentTarget.dataset.id;
    const regions = this.data.localRegions.filter(r => r.id !== id);
    const activeId = this.data.activeRegionId === id
      ? (regions.length ? regions[regions.length - 1].id : null)
      : this.data.activeRegionId;
    this.setData({
      localRegions: regions,
      activeRegionId: activeId
    }, () => this.recomputeCanSubmit());
  },

  addNewRegion() {
    if (this.data.localRegions.length >= 5) {
      wx.showToast({ title: '最多添加5个区域', icon: 'none' });
      return;
    }
    this.setData({ activeRegionId: null });
    wx.showToast({ title: '请在图片上拖动框选', icon: 'none' });
  },

  onRegionPromptInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const regions = this.data.localRegions.map(r =>
      r.id === id ? { ...r, prompt: value } : r
    );
    this.setData({ localRegions: regions }, () => this.recomputeCanSubmit());
  },

  // ============ AI 调节 ============
  onAiPromptInput(e) {
    this.setData({ aiPrompt: e.detail.value }, () => this.recomputeCanSubmit());
  },
  appendQuickPrompt(e) {
    const text = e.currentTarget.dataset.text;
    const cur = (this.data.aiPrompt || '').trim();
    this.setData({ aiPrompt: cur ? `${cur}，${text}` : text }, () => this.recomputeCanSubmit());
  },

  // ============ 实时本地调节（亮度/对比度/饱和度/色温/高光/阴影/锐化/暗角）============
  onSelectFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    const def = this.data.filterDefs.find(d => d.key === key);
    if (!def) return;
    this.setData({
      activeFilter: key,
      activeFilterLabel: def.label,
      activeFilterSub: def.sub || '',
      activeFilterMin: def.min,
      activeFilterMax: def.max,
      activeFilterVal: this.data.filterVals[key] || 0
    });
    this.refreshFilterChips();
  },
  onFilterChanging(e) {
    const key = this.data.activeFilter;
    const val = e.detail.value;
    const vals = Object.assign({}, this.data.filterVals, { [key]: val });
    this.updateFilterPreview(vals);
  },
  onFilterChange(e) {
    const key = this.data.activeFilter;
    const val = e.detail.value;
    const vals = Object.assign({}, this.data.filterVals, { [key]: val });
    this.updateFilterPreview(vals, true);
  },
  updateFilterPreview(vals, immediate) {
    const has = hasEffect(vals);
    const active = this.data.activeFilter;
    const filterChips = this.data.filterDefs.map(d => ({
      key: d.key,
      label: d.label,
      on: d.key === active,
      adjusted: (vals[d.key] || 0) !== 0
    }));
    this.setData({
      filterVals: vals,
      hasFilter: has,
      activeFilterVal: vals[active] || 0,
      filterChips
    });
    this.recomputeCanSubmit();
    if (!has) {
      if (this.data.filterPreviewUrl) this.setData({ filterPreviewUrl: '' });
      return;
    }
    // 节流渲染（拖动时高频触发，取最后一次）
    this._filterValsPending = vals;
    if (this._filterTimer) return;
    const delay = immediate ? 0 : 90;
    this._filterTimer = setTimeout(() => {
      this._filterTimer = null;
      const pending = this._filterValsPending;
      const src = this.data.displayUrl || (this.data.currentItem && this.data.currentItem.originalUrl);
      if (!src || src.indexOf('http') === 0) return;
      renderPreview(src, pending, 280).then(url => {
        if (url && this.data.hasFilter) this.setData({ filterPreviewUrl: url });
      });
    }, delay);
  },
  resetFilter() {
    const vals = this.defaultFilterVals();
    this.setData({
      filterVals: vals,
      activeFilterVal: 0,
      filterPreviewUrl: '',
      hasFilter: false
    }, () => {
      this.recomputeCanSubmit();
      this.refreshFilterChips();
    });
    wx.showToast({ title: '已全部重置', icon: 'none' });
  },

  recomputeCanSubmit() {
    let can = false;
    if (this.data.adjustMode === 'restore') {
      can = true;   // 老照片修复：有图即可一键修复
    } else if (this.data.adjustMode === 'ai') {
      can = !!(this.data.aiPrompt || '').trim();
    } else if (this.data.adjustMode === 'style') {
      can = !!this.data.refImagePath && this.getSelectedStyleFeatures().length > 0;
    } else if (this.data.adjustMode === 'local') {
      if (this.data.activeTool === 'cutout') {
        // 抠图：框选了区域即可抠，无需提示词
        can = this.data.localRegions.length > 0;
      } else {
        can = this.data.localRegions.length > 0
          && this.data.localRegions.some(r => (r.prompt || '').trim());
      }
    } else if (this.data.adjustMode === 'filter') {
      can = this.data.hasFilter;
    }
    if (can !== this.data.canSubmit) this.setData({ canSubmit: can });
  },

  // ============ 进度动画（与 progress 页一致的时间驱动算法，单图版）============
  _progressTimer: null,
  _progressStart: 0,
  _SEG_DURATION: 12000,
  _CREEP_TAU: 4000,

  startProgressAnim() {
    this.stopProgressAnim();
    this._progressStart = Date.now();
    this._progressTimer = setInterval(() => {
      if (this.data.genProgress >= 100) return;
      const elapsed = Date.now() - this._progressStart;
      let target;
      if (elapsed < this._SEG_DURATION) {
        // 0~12s 匀速到 90%
        target = 90 * (elapsed / this._SEG_DURATION);
      } else {
        // 12s 后从 90% 指数慢爬逼近 99%（注意：从 90 开始，不是 81，避免回跳）
        const over = elapsed - this._SEG_DURATION;
        target = 90 + 9 * (1 - Math.exp(-over / this._CREEP_TAU));
      }
      const val = Math.min(99, Math.round(target * 100) / 100);
      if (val > this.data.genProgress) {
        this.setData({
          genProgress: val,
          genProgressText: val.toFixed(2)
        });
      }
    }, 50);
  },

  stopProgressAnim() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  },

  // ============ 提交生成 ============
  async submitAdjust() {
    if (this.data.generating) return;
    const mode = this.data.adjustMode;
    const item = this.data.currentItem;
    if (this.data.isBlank || !item) {
      wx.showToast({ title: '请先上传图片', icon: 'none' });
      this.onBlankPick();
      return;
    }

    // 实时调节模式：纯本地 Canvas 处理，不走 AI
    if (mode === 'filter') {
      return this.submitFilterAdjust(item);
    }

    // 智能抠图：框选区域 → 本地裁剪 → MediaKit 移除背景 → 透明底 PNG（不走豆包生图）
    if (mode === 'local' && this.data.activeTool === 'cutout') {
      return this.submitCutout(item);
    }

    const aiText = (this.data.aiPrompt || '').trim();
    const styleFeatures = mode === 'style' ? this.getSelectedStyleFeatures() : [];
    let localPrompt = '';
    if (mode === 'local') {
      const valid = this.data.localRegions.filter(r => (r.prompt || '').trim());
      if (!valid.length) {
        wx.showToast({ title: '请为选区输入修改指令', icon: 'none' }); return;
      }
      // Seedream 5.0 Pro 交互编辑要求使用完整句式标注 bbox，
      // 并显式声明"区域外保持不变"，否则模型会把 bbox 当普通文字、对整张图重新生成。
      const regionLines = valid.map(r =>
        `<bbox>${r.x1} ${r.y1} ${r.x2} ${r.y2}</bbox>区域：${r.prompt.trim()}`
      ).join('；');
      localPrompt = `请对图片进行以下局部修改：${regionLines}。`
        + `注意：仅修改上述 bbox 标注区域内的像素内容，bbox 以外区域必须逐像素保持与原图完全一致，不得做任何全局调整。`
        + `框内只按上述要求修改目标内容，修改幅度自然克制、做到要求即可，不做额外美化、不顺手美颜或瘦身；框内人物的长相、五官、表情、姿势，以及服装的款式和颜色，凡要求中未提及的一律保持原样。`
        + `严格禁止：改变画面整体亮度、曝光、对比度、白平衡、色阶、饱和度、伽马值、色温；禁止重新打光、补光、添加闪光灯效果；禁止改变背景色调和光影方向。`
        + `输出图片的曝光参数、色彩分布、明暗直方图必须与参考图一致，仅 bbox 内部允许变化。`;
    }
    if (mode === 'style') {
      if (!this.data.refImagePath) {
        wx.showToast({ title: '请上传风格参考图', icon: 'none' }); return;
      }
      if (!styleFeatures.length) {
        wx.showToast({ title: '请至少勾选一个借鉴特征', icon: 'none' }); return;
      }
    }
    if (mode === 'ai' && !aiText) {
      wx.showToast({ title: '请告诉我们你想怎么调', icon: 'none' }); return;
    }

    // 参考图始终用最新精修图（没有则用原图）
    let refPath = item.originalUrl;
    let refUrl = item.originalUrl;
    if (item.resultUrl) {
      refPath = '';
      refUrl = item.resultUrl;
    }

    this.setData({ generating: true, genProgress: 0, genProgressText: '0.00', showOriginal: false });
    this.startProgressAnim();

    try {
      let result;
      if (mode === 'restore') {
        // 老照片修复：固定专业修复提示词，一键生成
        result = await aiService.generateEdit({
          imagePath: refPath,
          imageUrl: refUrl,
          rawPrompt: this.buildRestorePrompt(this.data.restoreColorize),
          rawNegative: '换脸，五官改变，身份变化，陌生人脸，人物年龄明显变化，姿势改变，'
            + '构图变化，视角变化，新增人物或物体，画面内容篡改，过度美化，磨皮过度，塑料感，'
            + '色彩夸张不真实，变形，重影，裁切，扩图，水印，文字，畸形结构'
        });
      } else if (mode === 'style') {
        // 参考图风格迁移：原图 + 风格参考图 + 勾选特征，走多图生图
        result = await aiService.generateStyleTransfer({
          imagePath: refPath,
          imageUrl: refUrl,
          refPath: this.data.refImagePath,
          features: styleFeatures
        });
      } else {
        result = await aiService.generateEdit({
          imagePath: refPath,
          imageUrl: refUrl,
          customPrompt: mode === 'ai' ? aiText : (mode === 'local' ? localPrompt : ''),
          basePrompt: item.prompt || '',
          negativePrompt: item.negativePrompt || '',
          templateId: item.templateId
        });
      }

      this.stopProgressAnim();
      this.setData({ genProgress: 100, genProgressText: '100.00' });

      // 小延迟让用户看到 100%
      await new Promise(r => setTimeout(r, 300));

      let newUrl = result.url;

      // 局部编辑会让 bbox 外亮度漂移，用 Canvas 将结果图【框外区域】亮度对齐到参考图，消除全局变亮。
      if (mode === 'local') {
        const refForMatch = refPath || refUrl;
        // 本次提交的框选区域（归一化 0-999），校正时排除框内像素
        const editRegions = this.data.localRegions
          .filter(r => (r.prompt || '').trim())
          .map(r => ({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 }));
        if (refForMatch && newUrl && newUrl.indexOf('data:') !== 0 && newUrl.indexOf('http') !== 0) {
          try {
            wx.showLoading({ title: '校正亮度...', mask: true });
            newUrl = await matchBrightness(newUrl, refForMatch, {
              threshold: 2,
              regions: editRegions
            });
            wx.hideLoading();
          } catch (e) {
            wx.hideLoading();
            console.warn('[compare] 亮度校正失败，使用原图:', e);
          }
        }
      }
      const history = Array.isArray(item.history) ? item.history.slice() : [];
      if (item.resultUrl) {
        history.push({
          url: item.resultUrl,
          at: Date.now(),
          prompt: item.lastPrompt || item.prompt || ''
        });
      }

      // 记录本次使用的提示词
      let lastPrompt = item.prompt || '';
      if (mode === 'ai' && aiText) {
        lastPrompt = aiText;
      } else if (mode === 'local' && localPrompt) {
        lastPrompt = localPrompt;
      } else if (mode === 'style') {
        const labels = styleFeatures.map(k => aiService.STYLE_FEATURES[k].label).join('、');
        lastPrompt = '参考图风格迁移：' + labels;
      } else if (mode === 'restore') {
        lastPrompt = '老照片修复' + (this.data.restoreColorize ? '（含黑白上色）' : '');
      }

      const updatedItem = {
        ...item,
        resultUrl: newUrl,
        status: TaskStatus.COMPLETED,
        history,
        lastPrompt
      };
      storage.updateRecord(item.id, updatedItem);
      const batchItems = this.data.batchItems.map(b => b.id === item.id ? updatedItem : b);

      const versions = this.buildVersions(updatedItem);

      this.setData({
        generating: false,
        versions,
        versionIdx: versions.length - 1,
        currentItem: updatedItem,
        batchItems,
        aiPrompt: '',
        // 老照片修复完成后回到"一句话修图"，方便继续精修；工具引导只首次展示
        adjustMode: mode === 'restore' ? 'ai' : this.data.adjustMode,
        toolHint: '',
        refImagePath: '',
        styleFeatureChips: this.buildStyleFeatureChips([]),
        localRegions: [], activeRegionId: null, isDrawing: false, drawRect: null
      }, () => {
        this.updateVersionState();
        this.recomputeCanSubmit();
      });
      wx.showToast({ title: '生成完成', icon: 'success' });
    } catch (err) {
      this.stopProgressAnim();
      console.error('[compare] 再次调节失败:', err);
      this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
      wx.showToast({ title: err.message || '生成失败，请重试', icon: 'none' });
    }
  },

  // ============ 实时调节：本地 Canvas 处理并落版 ============
  async submitFilterAdjust(item) {
    if (!this.data.hasFilter) {
      wx.showToast({ title: '请先调节参数', icon: 'none' }); return;
    }
    // 基于当前展示的图（最新精修结果，无则原图）处理
    const srcPath = this.data.displayUrl || item.originalUrl;
    if (!srcPath || srcPath.indexOf('http') === 0) {
      wx.showToast({ title: '当前图片无法本地处理', icon: 'none' }); return;
    }

    const filterVals = this.data.filterVals;
    // 记录可读描述
    const filterNames = {
      brightness: '亮度', contrast: '对比度', saturate: '饱和度',
      temperature: '色温', highlights: '高光', shadows: '阴影',
      sharpen: '锐化', vignette: '暗角'
    };
    const labels = [];
    ['brightness', 'contrast', 'saturate', 'temperature', 'highlights', 'shadows', 'sharpen', 'vignette'].forEach(k => {
      const v = filterVals[k] || 0;
      if (Math.abs(v) > 0.5) labels.push(filterNames[k] + (v > 0 ? '+' : '') + v);
    });
    const filterDesc = '本地调节（' + labels.join('，') + '）';

    this.setData({ generating: true, genProgress: 50, genProgressText: '50.00' });
    wx.showLoading({ title: '处理中...', mask: true });

    try {
      let newUrl = await applyFilters(srcPath, filterVals);
      wx.hideLoading();
      if (!newUrl || newUrl === srcPath) {
        this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
        wx.showToast({ title: '处理失败，请重试', icon: 'none' });
        return;
      }

      this.setData({ genProgress: 100, genProgressText: '100.00' });
      await new Promise(r => setTimeout(r, 200));

      const history = Array.isArray(item.history) ? item.history.slice() : [];
      if (item.resultUrl) {
        history.push({ url: item.resultUrl, at: Date.now(), prompt: item.lastPrompt || item.prompt || '' });
      }

      const updatedItem = {
        ...item,
        resultUrl: newUrl,
        status: TaskStatus.COMPLETED,
        history,
        lastPrompt: filterDesc
      };
      storage.updateRecord(item.id, updatedItem);
      const batchItems = this.data.batchItems.map(b => b.id === item.id ? updatedItem : b);
      const versions = this.buildVersions(updatedItem);

      this.setData({
        generating: false,
        versions,
        versionIdx: versions.length - 1,
        currentItem: updatedItem,
        batchItems,
        // 落版后清空预览滤镜（效果已烘焙进结果图）
        filterVals: this.defaultFilterVals(),
        activeFilterVal: 0,
        filterPreviewUrl: '',
        hasFilter: false
      }, () => {
        this.updateVersionState();
        this.recomputeCanSubmit();
        this.refreshFilterChips();
      });
      wx.showToast({ title: '已应用', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[compare] 本地调节失败:', e);
      this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
      wx.showToast({ title: '处理失败，请重试', icon: 'none' });
    }
  },

  // ============ 智能抠图：框选裁剪 → MediaKit 背景移除 → 透明底 PNG ============
  async submitCutout(item) {
    const regions = this.data.localRegions;
    if (!regions.length) {
      wx.showToast({ title: '请先框选要抠出的主体', icon: 'none' }); return;
    }
    // 取第一个框选区域（抠图一次抠一个主体；框什么抠什么）
    const region = regions[0];
    // 基于当前展示图（最新精修结果，无则原图）裁剪
    const srcPath = this.data.displayUrl || item.originalUrl;
    if (!srcPath || /^https?:\/\//i.test(srcPath) || srcPath.indexOf('data:') === 0) {
      wx.showToast({ title: '当前图片无法处理', icon: 'none' }); return;
    }

    this.setData({ generating: true, genProgress: 0, genProgressText: '0.00', showOriginal: false });
    this.startProgressAnim();
    wx.showLoading({ title: '抠图中...', mask: true });

    try {
      // 1) 本地裁剪框选区域为 PNG（微信离屏 canvas，无需页面节点）
      const cropPath = await cutoutService.cropRegionToFile(srcPath, region);
      // 2) MediaKit 背景移除（general 通用：人物/物品/文字/贴图/Logo 均可），输出透明 PNG
      const cutoutPath = await cutoutService.removeBackground(cropPath, { scene: 'general' });

      this.stopProgressAnim();
      wx.hideLoading();
      this.setData({ genProgress: 100, genProgressText: '100.00' });
      await new Promise(r => setTimeout(r, 300));

      // 抠出的透明 PNG 作为新版本结果
      const history = Array.isArray(item.history) ? item.history.slice() : [];
      if (item.resultUrl) {
        history.push({ url: item.resultUrl, at: Date.now(), prompt: item.lastPrompt || item.prompt || '' });
      }
      const updatedItem = {
        ...item,
        resultUrl: cutoutPath,
        status: TaskStatus.COMPLETED,
        history,
        lastPrompt: '智能抠图（透明底 PNG）'
      };
      storage.updateRecord(item.id, updatedItem);
      const batchItems = this.data.batchItems.map(b => b.id === item.id ? updatedItem : b);
      const versions = this.buildVersions(updatedItem);

      this.setData({
        generating: false,
        versions,
        versionIdx: versions.length - 1,
        currentItem: updatedItem,
        batchItems,
        toolHint: '',
        localRegions: [], activeRegionId: null, isDrawing: false, drawRect: null
      }, () => {
        this.updateVersionState();
        this.recomputeCanSubmit();
      });
      wx.showToast({ title: '抠图完成', icon: 'success' });
    } catch (err) {
      this.stopProgressAnim();
      wx.hideLoading();
      console.error('[compare] 抠图失败:', err);
      this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
      const msg = (err && err.message) ? err.message : '抠图失败，请重试';
      // 用弹窗显示完整错误（toast 会截断），真机排查时能看到具体阶段 + errMsg
      wx.showModal({
        title: '抠图失败',
        content: msg,
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  // ============ 保存弹窗 ============
  onSaveBtnTap() {
    if (this.data.generating) return;
    const item = this.data.currentItem;
    const selectedSaveIds = item ? [item.id] : [];    const selectedSaveMap = {};
    selectedSaveIds.forEach(id => { selectedSaveMap[id] = true; });
    this.setData({ showSaveSheet: true, selectedSaveIds, selectedSaveMap },
      () => this.syncSaveSelectAll());
  },
  closeSaveSheet() { this.setData({ showSaveSheet: false }); },

  toggleSaveSelect(id) {
    const map = { ...this.data.selectedSaveMap };
    let ids;
    if (map[id]) { delete map[id]; ids = this.data.selectedSaveIds.filter(x => x !== id); }
    else { map[id] = true; ids = [...this.data.selectedSaveIds, id]; }
    this.setData({ selectedSaveIds: ids, selectedSaveMap: map }, () => this.syncSaveSelectAll());
  },
  toggleSelectAllSave() {
    if (this.data.isAllSaveSelected) {
      this.setData({ selectedSaveIds: [], selectedSaveMap: {} }, () => this.syncSaveSelectAll());
    } else {
      const ids = this.data.batchItems.map(i => i.id);
      const map = {}; ids.forEach(id => { map[id] = true; });
      this.setData({ selectedSaveIds: ids, selectedSaveMap: map }, () => this.syncSaveSelectAll());
    }
  },
  syncSaveSelectAll() {
    const total = this.data.batchItems.length;
    const sel = this.data.selectedSaveIds.length;
    this.setData({ isAllSaveSelected: total > 0 && sel === total });
  },
  getSelectedCompletedItems() {
    const idSet = new Set(this.data.selectedSaveIds);
    return this.data.batchItems.filter(i => idSet.has(i.id) && i.resultUrl && i.status !== 'failed');
  },

  saveToLocal() {
    this.closeSaveSheet();
    var url = this.data.displayUrl;
    if (!url) {
      wx.showToast({ title: '图片尚未就绪', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...', mask: true });
    saveImageToAlbum(url)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      })
      .catch(async (err) => {
        wx.hideLoading();
        console.error('[compare] saveToLocal failed:', err);
        if (isAuthDenied(err)) {
          var granted = await showAuthGuide();
          if (granted) this.saveToLocal();
        } else {
          var msg = (err && err.message) || '保存失败';
          wx.showToast({ title: msg, icon: 'none', duration: 2500 });
        }
      });
  },

  batchSaveToLocal() {
    const items = this.getSelectedCompletedItems();
    if (!items.length) { wx.showToast({ title: '未选择可保存的图片', icon: 'none' }); return; }
    this.closeSaveSheet();
    wx.showLoading({ title: `0/${items.length}`, mask: true });
    let ok = 0, fail = 0;
    const runNext = (idx) => {
      if (idx >= items.length) {
        wx.hideLoading();
        if (fail === 0) wx.showToast({ title: `已保存${ok}张`, icon: 'success' });
        else wx.showModal({ title: '保存完成', content: `成功${ok}张，失败${fail}张`, showCancel: false });
        return;
      }
      wx.showLoading({ title: `${idx + 1}/${items.length}`, mask: true });
      saveImageToAlbum(items[idx].resultUrl)
        .then(() => { ok++; runNext(idx + 1); })
        .catch((err) => {
          console.error('[compare] batchSave item', idx, 'failed:', err);
          fail++;
          runNext(idx + 1);
        });
    };
    runNext(0);
  },

  batchSaveToCloud() {
    const items = this.getSelectedCompletedItems();
    if (!items.length) { wx.showToast({ title: '未选择可保存的图片', icon: 'none' }); return; }
    this.closeSaveSheet();
    items.forEach(i => {
      storage.addToAlbum({
        src: i.resultUrl, originalSrc: i.originalUrl,
        type: i.type || 'retouch', fromRecordId: i.id
      });
      storage.updateRecord(i.id, { savedToAlbum: true });
    });
    wx.showToast({ title: `已转存${items.length}张到云相册`, icon: 'success' });
  },

  saveToAlbum() {
    this.closeSaveSheet();
    const item = this.data.currentItem;
    if (!item) return;
    storage.addToAlbum({
      src: this.data.displayUrl, originalSrc: item.originalUrl,
      type: item.type || 'retouch', fromRecordId: item.id
    });
    storage.updateRecord(item.id, { savedToAlbum: true });
    wx.showToast({ title: '已保存到云相册', icon: 'success' });
  },

  onShareAppMessage() {
    return {
      title: '我用精修家修的图，来看看吧',
      path: '/pages/index/index',
      imageUrl: this.data.displayUrl
    };
  }
});