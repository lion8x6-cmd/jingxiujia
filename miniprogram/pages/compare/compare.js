const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');

Page({
  data: {
    taskId: '',
    batchId: '',
    isBatch: false,
    total: 1,
    currentIndex: 0,
    currentItem: null,
    batchItems: [],

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

    // 调节模式：'quick' 快捷部位 / 'ai' 对话式
    adjustMode: 'quick',

    // 快捷调节
    bodyParts: [],
    selectedPart: '',
    currentPartName: '',
    adjustments: {},
    hasAdjustments: false,

    // AI 调节
    aiPrompt: '',

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

    const parts = storage.getBodyParts();
    const records = storage.getRecords();

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
      bodyParts: parts,
      selectedPart: parts[0] ? parts[0].id : '',
      currentPartName: parts[0] ? parts[0].name : '',
      batchItems, currentItem,
      displayUrl: versions.length ? versions[versions.length - 1].url : '',
      versionIdx: versions.length - 1,
      versions,
      selectedSaveIds, selectedSaveMap
    }, () => {
      this.syncSaveSelectAll();
      this.updateVersionState();
    });
  },

  onReady() {
    // 测量舞台尺寸，用于缩放平移边界计算
    this.measureStage();
  },

  measureStage() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.stage').boundingClientRect(rect => {
      if (rect) {
        this._stageRect = rect;
        this._stageW = rect.width;
        this._stageH = rect.height;
      }
    }).exec();
  },

  onImgLoad() {
    // 图片加载后重新测量，确保尺寸准确
    setTimeout(() => this.measureStage(), 50);
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
      adjustments: {},
      hasAdjustments: false,
      aiPrompt: '',
      selectedPart: this.data.bodyParts[0] ? this.data.bodyParts[0].id : '',
      currentPartName: this.data.bodyParts[0] ? this.data.bodyParts[0].name : '',
      selectedSaveIds,
      selectedSaveMap
    }, () => {
      this.updateVersionState();
      this.recomputeCanSubmit();
      this.syncSaveSelectAll();
    });
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // ============ 图片区手势：双指缩放、单指拖动（放大时）、左右滑动切换批次（未放大时）============
  onStageTouchStart(e) {
    if (this.data.generating) return;
    const touches = e.touches;
    if (touches.length === 2) {
      // 双指：开始缩放
      this._pinching = true;
      this._swiping = false;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      this._pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      this._pinchStartScale = this.data.imgScale;
      this._pinchStartTx = this.data.imgTx;
      this._pinchStartTy = this.data.imgTy;
      // 双指中点
      this._pinchCx = (touches[0].clientX + touches[1].clientX) / 2;
      this._pinchCy = (touches[0].clientY + touches[1].clientY) / 2;
      return;
    }
    if (touches.length !== 1) return;
    const t = touches[0];
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
    if (this._pinching && touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (this._pinchStartDist > 0) {
        let scale = this._pinchStartScale * (dist / this._pinchStartDist);
        scale = Math.max(1, Math.min(4, scale));
        // 以双指初始中点(ox,oy)为缩放锚点，同时保留已有平移，避免第二次缩放时图片跳位
        const rect = this._stageRect;
        const ox = rect ? (this._pinchCx - rect.left - rect.width / 2) : 0;
        const oy = rect ? (this._pinchCy - rect.top - rect.height / 2) : 0;
        const ratio = scale / this._pinchStartScale;
        const tx = ox * (1 - ratio) + this._pinchStartTx * ratio;
        const ty = oy * (1 - ratio) + this._pinchStartTy * ratio;
        this.setData({
          imgScale: scale,
          imgTx: tx,
          imgTy: ty
        });
      }
      return;
    }

    if (this._panning && touches.length === 1) {
      const t = touches[0];
      const dx = t.clientX - this._touchStartX;
      const dy = t.clientY - this._touchStartY;
      this.clampPan(this._panStartTx + dx, this._panStartTy + dy);
      return;
    }

    if (!this._touchStartX && this._touchStartX !== 0) return;
    const t = touches[0];
    const dx = t.clientX - this._touchStartX;
    const dy = t.clientY - this._touchStartY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      this._touchMoved = true;
    }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && this.data.imgScale <= 1) {
      this._touchSwiped = true;
    }
  },

  clampPan(tx, ty) {
    const s = this.data.imgScale;
    if (s <= 1) { this.setData({ imgTx: 0, imgTy: 0 }); return; }
    // 允许的最大偏移 = (scale-1) * 舞台尺寸 / 2，保证图片边缘不被拖出视野太多
    const w = this._stageW || 375;
    const h = this._stageH || 600;
    const maxX = (s - 1) * w / 2;
    const maxY = (s - 1) * h / 2;
    const cx = Math.max(-maxX, Math.min(maxX, tx));
    const cy = Math.max(-maxY, Math.min(maxY, ty));
    this.setData({ imgTx: cx, imgTy: cy });
  },

  onStageTouchEnd(e) {
    // 长按预览原图后松手恢复
    this.releaseOriginal();
    // 双指结束
    if (this._pinching) {
      if (e.touches.length === 1) {
        // 切到单指拖动
        this._pinching = false;
        this._panning = true;
        this._panStartTx = this.data.imgTx;
        this._panStartTy = this.data.imgTy;
        const t = e.touches[0];
        this._touchStartX = t.clientX;
        this._touchStartY = t.clientY;
      } else {
        this._pinching = false;
        if (this.data.imgScale < 1.05) this.resetZoom();
      }
      return;
    }
    if (this._panning) {
      this._panning = false;
      if (this.data.imgScale < 1.05) this.resetZoom();
      this._touchStartX = null;
      return;
    }
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
    this._panning = false;
    this._touchStartX = null;
    this._touchSwiped = false;
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
      adjustments: {},
      hasAdjustments: false,
      aiPrompt: '',
      selectedPart: this.data.bodyParts[0] ? this.data.bodyParts[0].id : '',
      currentPartName: this.data.bodyParts[0] ? this.data.bodyParts[0].name : ''
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

  // ============ 模式切换 ============
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.adjustMode || this.data.generating) return;
    this.setData({ adjustMode: mode }, () => this.recomputeCanSubmit());
  },

  // ============ 快捷调节 ============
  selectPart(e) {
    const id = e.currentTarget.dataset.id;
    const part = this.data.bodyParts.find(p => p.id === id);
    this.setData({ selectedPart: id, currentPartName: part ? part.name : '' });
  },
  onSliderChange(e) {
    const value = e.detail.value;
    const part = this.data.selectedPart;
    this.updateAdjustments({ ...this.data.adjustments, [part]: value });
  },
  onSliderAfter(e) {
    const value = e.detail.value;
    if (value === 0) {
      const a = { ...this.data.adjustments };
      delete a[this.data.selectedPart];
      this.updateAdjustments(a);
    }
  },
  updateAdjustments(adjustments) {
    const has = Object.values(adjustments).some(v => v !== 0);
    this.setData({ adjustments, hasAdjustments: has }, () => this.recomputeCanSubmit());
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

  recomputeCanSubmit() {
    const can = this.data.adjustMode === 'ai'
      ? !!(this.data.aiPrompt || '').trim()
      : this.data.hasAdjustments;
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
    if (!item) return;

    const aiText = (this.data.aiPrompt || '').trim();
    if (mode === 'quick' && !this.data.hasAdjustments) {
      wx.showToast({ title: '请先调节部位', icon: 'none' }); return;
    }
    if (mode === 'ai' && !aiText) {
      wx.showToast({ title: '请告诉 AI 怎么调节', icon: 'none' }); return;
    }

    // 参考图始终用最新精修图（没有则用原图）
    let refPath = item.originalUrl;
    let refUrl = item.originalUrl;
    if (item.resultUrl) {
      refPath = '';
      refUrl = item.resultUrl;  // ai-service 会下载远程图转 base64
    }

    this.setData({ generating: true, genProgress: 0, genProgressText: '0.00', showOriginal: false });
    this.startProgressAnim();

    try {
      const result = await aiService.generateEdit({
        imagePath: refPath,
        imageUrl: refUrl,
        adjustments: mode === 'quick' ? this.data.adjustments : {},
        customPrompt: mode === 'ai' ? aiText : '',
        basePrompt: item.prompt || '',
        negativePrompt: item.negativePrompt || '',
        templateId: item.templateId
      });

      this.stopProgressAnim();
      this.setData({ genProgress: 100, genProgressText: '100.00' });

      // 小延迟让用户看到 100%
      await new Promise(r => setTimeout(r, 300));

      const newUrl = result.url;
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
      }

      const updatedItem = {
        ...item,
        resultUrl: newUrl,
        status: TaskStatus.COMPLETED,
        history,
        lastPrompt,
        adjustments: { ...(item.adjustments || {}), ...this.data.adjustments }
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
        adjustments: {}, hasAdjustments: false, aiPrompt: ''
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

  // ============ 保存弹窗 ============
  onSaveBtnTap() {
    if (this.data.generating) return;
    const item = this.data.currentItem;
    const selectedSaveIds = item ? [item.id] : [];
    const selectedSaveMap = {};
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
    this.saveOneImage(this.data.displayUrl);
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
      this.saveOneImage(items[idx].resultUrl, true)
        .then(() => { ok++; runNext(idx + 1); })
        .catch(() => { fail++; runNext(idx + 1); });
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

  saveOneImage(url, silent) {
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error('empty url')); return; }
      const doSave = (filePath) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: () => { if (!silent) wx.showToast({ title: '已保存到相册', icon: 'success' }); resolve(); },
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启保存到相册权限',
                confirmText: '去设置', confirmColor: '#07C160',
                success: (r) => { if (r.confirm) wx.openSetting(); }
              });
            } else if (!silent) {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
            reject(err);
          }
        });
      };
      if (url.startsWith('http://') || url.startsWith('https://')) {
        wx.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode === 200) doSave(res.tempFilePath);
            else { if (!silent) wx.showToast({ title: '下载失败', icon: 'none' }); reject(new Error('download fail')); }
          },
          fail: () => { if (!silent) wx.showToast({ title: '下载失败', icon: 'none' }); reject(new Error('download fail')); }
        });
      } else {
        doSave(url);
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '我用精修家修的图，来看看吧',
      path: '/pages/index/index',
      imageUrl: this.data.displayUrl
    };
  }
});