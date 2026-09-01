const platform = require('../../utils/platform.js');
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
    tab: 'stitch',           // stitch | copy
    // 拼接
    pairs: [],               // 可拼接的历史配对 [{id, originalUrl, resultUrl}]
    selectedId: '',
    stitchSrc: '',           // 当前拼接结果（原图/精修路径）
    stitchedPath: '',        // 拼接产出图路径
    source: 'record',        // record | album
    albumLeft: '',           // 相册模式左图
    albumRight: '',          // 相册模式右图
    previewLeft: '',         // 对比预览左图（原图）
    previewRight: '',        // 对比预览右图（精修图）
    stitching: false,
    saving: false,
    // 拼接预览手势变换
    pvScale: 1,
    pvTx: 0,
    pvTy: 0,
    // 文案
    copyText: '',            // 当前一条种草文案
    copyLoading: false,      // 文案生成中
    optimizeInput: '',       // 优化文案输入框
    optimizing: false        // 优化中
  },

  onLoad() {
    this._stitchCanvas = null;   // 页面 canvas 节点缓存
    this._stitchReady = false;
    this._copyAutoDone = false;  // 进文案 tab 是否已自动生成过
    this.buildPairs();
  },

  onReady() {
    // 页面渲染完成后获取 2d canvas 节点（抖音离屏 canvas 无 createImage，必须用页面节点）
    this.ensureStitchCanvas();
  },

  // 获取/缓存拼接用的页面 canvas 节点；onLoad 阶段节点可能尚未渲染，带重试
  ensureStitchCanvas(times) {
    times = times || 0;
    return new Promise((resolve) => {
      if (this._stitchCanvas) { resolve(this._stitchCanvas); return; }
      platform.createSelectorQuery().in(this)
        .select('#stitchCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            this._stitchCanvas = res[0].node;
            this._stitchReady = true;
            resolve(this._stitchCanvas);
          } else if (times < 20) {
            setTimeout(() => this.ensureStitchCanvas(times + 1).then(resolve), 100);
          } else {
            resolve(null);
          }
        });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
    // 首次切到种草文案，自动生成 1 条
    if (tab === 'copy' && !this._copyAutoDone) {
      this._copyAutoDone = true;
      this.genCopies();
    }
  },

  // ============ 图片拼接 ============
  buildPairs() {
    const records = storage.getRecords();
    // 只保留原图、结果图当前都可读的记录：重启后临时文件被清理的旧记录会被过滤掉，避免选中后拼接报"图片加载失败"
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
    const id = e.currentTarget.dataset.id;
    this.selectPairById(id);
  },

  selectPairById(id) {
    const pair = this.data.pairs.find(p => p.id === id);
    if (!pair) return;
    this.setData({
      selectedId: id,
      source: 'record',
      stitchSrc: pair.resultUrl,
      albumLeft: '',
      albumRight: '',
      previewLeft: pair.originalUrl,
      previewRight: pair.resultUrl,
      pvScale: 1, pvTx: 0, pvTy: 0
    });
    this.runStitch(pair.originalUrl, pair.resultUrl);
  },

  // 从相册选 2 张：第 1 张原图、第 2 张精修图
  pickAlbum() {
    chooseImage({ count: 2 })
      .then((res) => {
        const paths = (res.tempFiles || []).map(f => f.tempFilePath).filter(Boolean);
        if (paths.length < 2) {
          platform.showToast({ title: '请选 2 张图（先原图后精修）', icon: 'none' });
          return;
        }
        this.setData({
          source: 'album',
          selectedId: '',
          albumLeft: paths[0],
          albumRight: paths[1],
          stitchSrc: paths[1],
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

  // 交换左右（相册模式）
  swapImages() {
    if (this.data.source !== 'album') return;
    const l = this.data.albumLeft;
    const r = this.data.albumRight;
    this.setData({
      albumLeft: r,
      albumRight: l,
      stitchSrc: l,
      previewLeft: r,
      previewRight: l,
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
        platform.showToast({ title: '拼接画布未就绪，请重试', icon: 'none' });
        return;
      }
      stitchLeftRight({ leftPath, rightPath, canvas })
        .then((outPath) => {
          // 快速切换图片时，只采纳最新一次拼接结果
          if (seq !== this._stitchSeq) return;
          this.setData({ stitching: false, stitchedPath: outPath });
        })
        .catch((err) => {
          if (seq !== this._stitchSeq) return;
          console.error('[promo] stitch failed:', err);
          this.setData({ stitching: false });
          platform.showToast({ title: (err && err.message) || '拼接失败，请重试', icon: 'none' });
        });
    });
  },

  // 测量预览半区尺寸（逻辑像素），用于导出时按屏幕版式等比渲染
  measureHalf() {
    return new Promise((resolve) => {
      platform.createSelectorQuery().in(this)
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

  // 当前左右图源（记录模式 / 相册模式统一取预览源）
  currentPair() {
    return { leftPath: this.data.previewLeft, rightPath: this.data.previewRight };
  },

  // 按用户当前的缩放/拖动，实时渲染一张「所见即所得」的合成图
  renderStitchWithView() {
    const { leftPath, rightPath } = this.currentPair();
    if (!leftPath || !rightPath) return Promise.reject(new Error('请先选择图片'));
    return Promise.all([this.ensureStitchCanvas(), this.measureHalf()])
      .then(([canvas, half]) => {
        if (!canvas) throw new Error('画布未就绪，请重试');
        const opt = {
          leftPath,
          rightPath,
          canvas,
          scale: this.data.pvScale,
          tx: this.data.pvTx,
          ty: this.data.pvTy
        };
        if (half) { opt.halfW = half.halfW; opt.halfH = half.halfH; }
        return stitchLeftRight(opt);
      });
  },

  saveStitch() {
    if (!this.data.previewLeft) {
      platform.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    this.renderStitchWithView()
      .then((outPath) => saveImageToAlbum(outPath).then(() => outPath))
      .then(() => {
        this.setData({ saving: false });
        platform.showToast({ title: '已按当前效果保存', icon: 'success' });
      })
      .catch((err) => {
        this.setData({ saving: false });
        console.error('[promo] save stitch:', err);
        if (isAuthDenied(err)) {
          showAuthGuide();
        } else {
          platform.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        }
      });
  },

  // ============ 拼接预览手势：双指缩放 + 单指拖动（合成图整体联动） ============
  onPreviewTouchStart(e) {
    const t = e.touches;
    if (t.length === 2) {
      // 记录双指初始距离
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
      // 缩回 1 时自动回正位移
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
    // 缩回最小则回正
    if (this.data.pvScale <= 1) {
      this.setData({ pvScale: 1, pvTx: 0, pvTy: 0 });
    }
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
  // 一次只生成 1 条（省 token），"换一条"再重新生成
  genCopies() {
    if (this.data.copyLoading) return;
    this.setData({ copyLoading: true });
    // 每次随机一个切入点，保证"换一条"不重复
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
        platform.showToast({ title: (err && err.message) || '文案生成失败', icon: 'none' });
      });
  },

  onOptimizeInput(e) {
    this.setData({ optimizeInput: e.detail.value });
  },

  // 文案润色：把用户随手写的几个字精炼成 50 字内短句，并填充为当前文案
  doOptimize() {
    const raw = (this.data.optimizeInput || '').trim();
    if (!raw) {
      platform.showToast({ title: '先写几个字，如"老照片修清楚了"', icon: 'none' });
      return;
    }
    if (this.data.optimizing) return;
    this.setData({ optimizing: true });
    optimizeCopy(raw)
      .then((text) => {
        this.setData({ optimizing: false, copyText: text, optimizeInput: text });
        platform.showToast({ title: '已润色，可直接复制', icon: 'none' });
      })
      .catch((err) => {
        console.error('[promo] optimize failed:', err);
        this.setData({ optimizing: false });
        platform.showToast({ title: (err && err.message) || '润色失败，请重试', icon: 'none' });
      });
  },

  onCopyText() {
    const text = this.data.copyText;
    if (!text) return;
    platform.setClipboardData({
      data: text,
      success() { platform.showToast({ title: '文案已复制', icon: 'success' }); }
    });
  },

  // ============ 去做任务赚钱 ============
  // 先把素材准备好（拼接图存相册 + 文案复制兜底），再进抖音推广任务详情页（当前为示意页，后续对接真实任务）
  goTaskEarn() {
    const text = this.data.copyText;
    if (text) platform.setClipboardData({ data: text });
    const goTask = (stitched) => {
      app.globalData.taskMaterial = { stitchedPath: stitched || '', copyText: text || '' };
      if (stitched) {
        saveImageToAlbum(stitched).catch((err) => { if (isAuthDenied(err)) { showAuthGuide(); } });
      }
      platform.navigateTo({ url: '/pages/task/task' });
    };
    // 没有图片也允许进任务页看说明
    if (!this.data.previewLeft) { goTask(''); return; }
    // 按用户当前的缩放/位置实时渲染素材
    this.setData({ saving: true });
    this.renderStitchWithView()
      .then((outPath) => { this.setData({ saving: false }); goTask(outPath); })
      .catch((err) => {
        this.setData({ saving: false });
        console.error('[promo] task material:', err);
        goTask(this.data.stitchedPath || '');
      });
  },

  // 右上角转发（中性文案）
  onShareAppMessage() {
    return {
      title: 'P图精修必拍 - 修图前后对比也太绝了',
      desc: this.data.copyText || ''
    };
  }
});
