const app = getApp();
const storage = require('../../utils/storage');
const { TaskStatus } = require('../../utils/task-status');
const { chooseImage } = require('../../utils/picker');
const { stitchLeftRight } = require('../../utils/stitch');
const { generateCopy, optimizeCopy } = require('../../utils/promo-service');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image');
const { isImageAvailable } = require('../../utils/persist-image');

Page({
  data: {
    tab: 'stitch',
    // 拼接
    pairs: [],
    selectedId: '',
    stitchedPath: '',
    source: 'record',
    albumLeft: '',
    albumRight: '',
    previewLeft: '',
    previewRight: '',
    stitching: false,
    saving: false,
    // 预览手势
    pvScale: 1,
    pvTx: 0,
    pvTy: 0,
    // 文案
    copyText: '',
    copyLoading: false,
    optimizeInput: '',
    optimizing: false
  },

  onLoad() {
    this._stitchCanvas = null;
    this._copyAutoDone = false;
    this.buildPairs();
  },

  onReady() {
    this.ensureStitchCanvas();
  },

  ensureStitchCanvas(times) {
    times = times || 0;
    return new Promise((resolve) => {
      if (this._stitchCanvas) { resolve(this._stitchCanvas); return; }
      wx.createSelectorQuery().in(this)
        .select('#stitchCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            this._stitchCanvas = res[0].node;
            resolve(this._stitchCanvas);
          } else if (times < 20) {
            setTimeout(() => this.ensureStitchCanvas(times + 1).then(resolve), 100);
          } else {
            resolve(null);
          }
        });
    });
  },

  measureHalf() {
    return new Promise((resolve) => {
      wx.createSelectorQuery().in(this)
        .selectAll('.compare-half')
        .boundingClientRect((rects) => {
          if (rects && rects[0] && rects[0].width) {
            resolve({ halfW: rects[0].width, halfH: rects[0].height });
          } else {
            resolve(null);
          }
        })
        .exec();
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    if (tab === 'copy' && !this._copyAutoDone) {
      this._copyAutoDone = true;
      this.genCopies();
    }
  },

  // ============ 图片拼接 ============
  buildPairs() {
    const records = storage.getRecords();
    const pairs = records
      .filter(r => r.resultUrl && r.status === TaskStatus.COMPLETED && r.originalUrl
        && isImageAvailable(r.originalUrl) && isImageAvailable(r.resultUrl))
      .map(r => ({ id: r.id, originalUrl: r.originalUrl, resultUrl: r.resultUrl }));
    this.setData({ pairs });
    if (pairs.length) {
      this.selectPairById(pairs[0].id);
    }
  },

  selectPair(e) {
    this.selectPairById(e.currentTarget.dataset.id);
  },

  selectPairById(id) {
    const pair = this.data.pairs.find(p => p.id === id);
    if (!pair) return;
    this.setData({
      selectedId: id,
      source: 'record',
      albumLeft: '',
      albumRight: '',
      previewLeft: pair.originalUrl,
      previewRight: pair.resultUrl,
      pvScale: 1, pvTx: 0, pvTy: 0
    });
    this.runStitch(pair.originalUrl, pair.resultUrl);
  },

  pickAlbum() {
    chooseImage({ count: 2 })
      .then((res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (paths.length < 2) {
          wx.showToast({ title: '请选 2 张图（先原图后精修）', icon: 'none' });
          return;
        }
        this.setData({
          source: 'album',
          selectedId: '',
          albumLeft: paths[0],
          albumRight: paths[1],
          previewLeft: paths[0],
          previewRight: paths[1],
          pvScale: 1, pvTx: 0, pvTy: 0
        });
        this.runStitch(paths[0], paths[1]);
      })
      .catch((err) => {
        if (err && err.message === '已取消') return;
        console.warn('[promo] pickAlbum:', err);
      });
  },

  swapImages() {
    if (this.data.source !== 'album') return;
    const l = this.data.albumLeft;
    const r = this.data.albumRight;
    this.setData({
      albumLeft: r, albumRight: l,
      previewLeft: r, previewRight: l,
      pvScale: 1, pvTx: 0, pvTy: 0
    });
    this.runStitch(r, l);
  },

  runStitch(leftPath, rightPath) {
    if (!leftPath || !rightPath) return;
    const seq = (this._stitchSeq || 0) + 1;
    this._stitchSeq = seq;
    this.setData({ stitching: true, stitchedPath: '' });
    this.ensureStitchCanvas().then((canvas) => {
      if (!canvas) {
        if (seq === this._stitchSeq) this.setData({ stitching: false });
        wx.showToast({ title: '画布未就绪，请重试', icon: 'none' });
        return;
      }
      stitchLeftRight({ leftPath, rightPath, canvas })
        .then((outPath) => {
          if (seq !== this._stitchSeq) return;
          this.setData({ stitching: false, stitchedPath: outPath });
        })
        .catch((err) => {
          if (seq !== this._stitchSeq) return;
          console.error('[promo] stitch failed:', err);
          this.setData({ stitching: false });
        });
    });
  },

  currentPair() {
    return { leftPath: this.data.previewLeft, rightPath: this.data.previewRight };
  },

  renderStitchWithView() {
    const { leftPath, rightPath } = this.currentPair();
    if (!leftPath || !rightPath) return Promise.reject(new Error('请先选择图片'));
    return Promise.all([this.ensureStitchCanvas(), this.measureHalf()])
      .then(([canvas, half]) => {
        if (!canvas) throw new Error('画布未就绪，请重试');
        const opt = { leftPath, rightPath, canvas, scale: this.data.pvScale, tx: this.data.pvTx, ty: this.data.pvTy };
        if (half) { opt.halfW = half.halfW; opt.halfH = half.halfH; }
        return stitchLeftRight(opt);
      });
  },

  saveStitch() {
    if (!this.data.previewLeft) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    this.renderStitchWithView()
      .then((outPath) => saveImageToAlbum(outPath).then(() => outPath))
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: '已按当前效果保存', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ saving: false });
        console.error('[promo] save:', err);
        if (isAuthDenied(err)) { showAuthGuide(); }
        else { wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' }); }
      });
  },

  // ============ 预览手势：双指缩放 + 单指拖动，双图镜像联动 ============
  onPreviewTouchStart(e) {
    const t = e.touches;
    if (t.length === 2) {
      this._pvPinchDist = this._touchDist(t[0], t[1]);
      this._pvPinchScale = this.data.pvScale;
      this._pvDragging = false;
    } else if (t.length === 1) {
      this._pvStartX = t[0].clientX;
      this._pvStartY = t[0].clientY;
      this._pvBaseTx = this.data.pvTx;
      this._pvBaseTy = this.data.pvTy;
      this._pvDragging = true;
    }
  },
  onPreviewTouchMove(e) {
    const t = e.touches;
    if (t.length === 2 && this._pvPinchDist) {
      const dist = this._touchDist(t[0], t[1]);
      let scale = this._pvPinchScale * (dist / this._pvPinchDist);
      scale = Math.min(4, Math.max(1, scale));
      const tx = scale <= 1 ? 0 : this.data.pvTx;
      const ty = scale <= 1 ? 0 : this.data.pvTy;
      this.setData({ pvScale: scale, pvTx: tx, pvTy: ty });
    } else if (t.length === 1 && this._pvDragging && this.data.pvScale > 1) {
      const dx = t[0].clientX - this._pvStartX;
      const dy = t[0].clientY - this._pvStartY;
      this.setData({ pvTx: this._pvBaseTx + dx, pvTy: this._pvBaseTy + dy });
    }
  },
  onPreviewTouchEnd() {
    this._pvDragging = false;
    this._pvPinchDist = 0;
    if (this.data.pvScale <= 1) this.setData({ pvScale: 1, pvTx: 0, pvTy: 0 });
  },
  _touchDist(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },
  resetPreviewView() {
    this.setData({ pvScale: 1, pvTx: 0, pvTy: 0 });
  },

  // ============ 种草文案 ============
  genCopies() {
    if (this.data.copyLoading) return;
    this.setData({ copyLoading: true });
    const hints = ['照片精修前后对比，废片变大片', '老照片/模糊照片修复焕新', '随手拍一键精修，自然不假'];
    const styleHint = hints[Math.floor(Math.random() * hints.length)];
    generateCopy({ styleHint })
      .then((text) => {
        if (!text || !text.trim()) throw new Error('文案生成失败，请重试');
        this.setData({ copyLoading: false, copyText: text.trim() });
      })
      .catch((err) => {
        console.error('[promo] copy failed:', err);
        this.setData({ copyLoading: false });
        wx.showToast({ title: (err && err.message) || '文案生成失败', icon: 'none' });
      });
  },

  onOptimizeInput(e) {
    this.setData({ optimizeInput: e.detail.value });
  },

  doOptimize() {
    const raw = (this.data.optimizeInput || '').trim();
    if (!raw) {
      wx.showToast({ title: '先写几个字，如"老照片修清楚了"', icon: 'none' });
      return;
    }
    if (this.data.optimizing) return;
    this.setData({ optimizing: true });
    optimizeCopy(raw)
      .then((text) => {
        this.setData({ optimizing: false, copyText: text, optimizeInput: text });
        wx.showToast({ title: '已润色，可直接复制', icon: 'none' });
      })
      .catch((err) => {
        console.error('[promo] optimize failed:', err);
        this.setData({ optimizing: false });
        wx.showToast({ title: (err && err.message) || '润色失败，请重试', icon: 'none' });
      });
  },

  onCopyText() {
    const text = this.data.copyText;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success() { wx.showToast({ title: '文案已复制', icon: 'success' }); }
    });
  },

  // ============ 去做任务赚钱 ============
  // 微信端无跳抖音能力：按当前效果渲染素材 → 存相册 + 复制文案 → 进任务说明页（引导去抖音接单）
  goTaskEarn() {
    const text = this.data.copyText;
    if (text) wx.setClipboardData({ data: text });
    const goTask = (stitched) => {
      app.globalData.taskMaterial = { stitchedPath: stitched || '', copyText: text || '' };
      if (stitched) {
        saveImageToAlbum(stitched).catch((err) => { if (isAuthDenied(err)) { showAuthGuide(); } });
      }
      wx.navigateTo({ url: '/pages/task/task' });
    };
    if (!this.data.previewLeft) { goTask(''); return; }
    this.setData({ saving: true });
    this.renderStitchWithView()
      .then((outPath) => { this.setData({ saving: false }); goTask(outPath); })
      .catch((err) => {
        this.setData({ saving: false });
        console.error('[promo] task material:', err);
        goTask(this.data.stitchedPath || '');
      });
  },

  onShareAppMessage() {
    return {
      title: 'P图精修必拍 - 修图前后对比也太绝了',
      desc: this.data.copyText || ''
    };
  }
});
