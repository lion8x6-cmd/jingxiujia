const platform = require('../../utils/platform.js');
const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');

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

    // 调节模式：'local' 局部编辑 / 'quick' 快捷部位 / 'ai' 一句话改图
    adjustMode: 'local',

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
    const query = platform.createSelectorQuery().in(this);
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
    if (platform.vibrateShort) platform.vibrateShort({ type: 'light' });
  },

  onBtnLongPress() {
    if (this.data.generating) return;
    this._longPressActive = true;
    this.setData({ showOriginal: true });
    if (platform.vibrateShort) platform.vibrateShort({ type: 'light' });
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
      platform.showToast({ title: '原图不可删除', icon: 'none' });
      return;
    }
    platform.showModal({
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
        platform.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => platform.navigateBack(), 600);
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
    platform.showToast({ title: '已删除', icon: 'success' });
  },

  // ============ 图片区手势 ============
  // 规则：
  // - 局部编辑模式：单指=框选/移动选区；双指=拖动图片+捏合缩放
  // - 其他模式：单指拖动放大图、左右滑动切换；双指捏合缩放
  isLocalEditActive() {
    return this.data.editExpanded && this.data.adjustMode === 'local'
      && !this.data.showOriginal && !this.data.generating;
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
      adjustments: {},
      hasAdjustments: false,
      aiPrompt: '',
      localRegions: [],
      activeRegionId: null,
      isDrawing: false,
      drawRect: null,
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

  // ============ 面板收起/展开 ============
  expandPanel() {
    this.setData({ editExpanded: true, adjustMode: 'local' }, () => {
      setTimeout(() => this.measureStage(), 320);
    });
  },
  collapsePanel() {
    this.setData({ editExpanded: false, isDrawing: false, drawRect: null });
    setTimeout(() => this.measureStage(), 320);
  },

  // ============ 模式切换 ============
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.adjustMode || this.data.generating) return;
    this.setData({ adjustMode: mode, isDrawing: false, drawRect: null }, () => {
      this.recomputeCanSubmit();
      this.measureStage();
    });
  },

  // ============ 局部编辑：坐标换算 ============
  // 获取图片在 stage 中的实际显示矩形（考虑 aspectFit 黑边）
  getImageDisplayRect() {
    const stage = this._stageRect;
    if (!stage || !this.data.currentItem) return null;
    // 用 image 组件的实际尺寸来算
    return new Promise(resolve => {
      platform.createSelectorQuery().in(this)
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
      platform.showToast({ title: '最多添加5个区域', icon: 'none' });
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
      platform.showToast({ title: '最多添加5个区域', icon: 'none' });
      return;
    }
    this.setData({ activeRegionId: null });
    platform.showToast({ title: '请在图片上拖动框选', icon: 'none' });
  },

  onRegionPromptInput(e) {
    const id = e.currentTarget.dataset.id;
    const value = e.detail.value;
    const regions = this.data.localRegions.map(r =>
      r.id === id ? { ...r, prompt: value } : r
    );
    this.setData({ localRegions: regions }, () => this.recomputeCanSubmit());
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
    let can = false;
    if (this.data.adjustMode === 'ai') {
      can = !!(this.data.aiPrompt || '').trim();
    } else if (this.data.adjustMode === 'local') {
      can = this.data.localRegions.length > 0
        && this.data.localRegions.some(r => (r.prompt || '').trim());
    } else {
      can = this.data.hasAdjustments;
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
    if (!item) return;

    const aiText = (this.data.aiPrompt || '').trim();
    let localPrompt = '';
    if (mode === 'local') {
      const valid = this.data.localRegions.filter(r => (r.prompt || '').trim());
      if (!valid.length) {
        platform.showToast({ title: '请为选区输入修改指令', icon: 'none' }); return;
      }
      localPrompt = valid.map(r =>
        `<bbox>${r.x1} ${r.y1} ${r.x2} ${r.y2}</bbox> ${r.prompt.trim()}`
      ).join('\n');
    }
    if (mode === 'quick' && !this.data.hasAdjustments) {
      platform.showToast({ title: '请先调节部位', icon: 'none' }); return;
    }
    if (mode === 'ai' && !aiText) {
      platform.showToast({ title: '请告诉 AI 怎么调节', icon: 'none' }); return;
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
      const result = await aiService.generateEdit({
        imagePath: refPath,
        imageUrl: refUrl,
        adjustments: mode === 'quick' ? this.data.adjustments : {},
        customPrompt: mode === 'ai' ? aiText : (mode === 'local' ? localPrompt : ''),
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
      } else if (mode === 'local' && localPrompt) {
        lastPrompt = localPrompt;
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
        adjustments: {}, hasAdjustments: false, aiPrompt: '',
        localRegions: [], activeRegionId: null, isDrawing: false, drawRect: null
      }, () => {
        this.updateVersionState();
        this.recomputeCanSubmit();
      });
      platform.showToast({ title: '生成完成', icon: 'success' });
    } catch (err) {
      this.stopProgressAnim();
      console.error('[compare] 再次调节失败:', err);
      this.setData({ generating: false, genProgress: 0, genProgressText: '0.00' });
      platform.showToast({ title: err.message || '生成失败，请重试', icon: 'none' });
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
    var url = this.data.displayUrl;
    if (!url) {
      platform.showToast({ title: '图片尚未就绪', icon: 'none' });
      return;
    }
    platform.showLoading({ title: '保存中...', mask: true });
    saveImageToAlbum(url)
      .then(() => {
        platform.hideLoading();
        platform.showToast({ title: '已保存到相册', icon: 'success' });
      })
      .catch(async (err) => {
        platform.hideLoading();
        console.error('[compare] saveToLocal failed:', err);
        if (isAuthDenied(err)) {
          var granted = await showAuthGuide();
          if (granted) this.saveToLocal();
        } else {
          var msg = (err && err.message) || '保存失败';
          platform.showToast({ title: msg, icon: 'none', duration: 2500 });
        }
      });
  },

  batchSaveToLocal() {
    const items = this.getSelectedCompletedItems();
    if (!items.length) { platform.showToast({ title: '未选择可保存的图片', icon: 'none' }); return; }
    this.closeSaveSheet();
    platform.showLoading({ title: `0/${items.length}`, mask: true });
    let ok = 0, fail = 0;
    const runNext = (idx) => {
      if (idx >= items.length) {
        platform.hideLoading();
        if (fail === 0) platform.showToast({ title: `已保存${ok}张`, icon: 'success' });
        else platform.showModal({ title: '保存完成', content: `成功${ok}张，失败${fail}张`, showCancel: false });
        return;
      }
      platform.showLoading({ title: `${idx + 1}/${items.length}`, mask: true });
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
    if (!items.length) { platform.showToast({ title: '未选择可保存的图片', icon: 'none' }); return; }
    this.closeSaveSheet();
    items.forEach(i => {
      storage.addToAlbum({
        src: i.resultUrl, originalSrc: i.originalUrl,
        type: i.type || 'retouch', fromRecordId: i.id
      });
      storage.updateRecord(i.id, { savedToAlbum: true });
    });
    platform.showToast({ title: `已转存${items.length}张到云相册`, icon: 'success' });
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
    platform.showToast({ title: '已保存到云相册', icon: 'success' });
  },

  onShareAppMessage() {
    return {
      title: '我用P图精修必拍修的图，来看看吧',
      path: '/pages/index/index',
      imageUrl: this.data.displayUrl
    };
  }
});