const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');

Page({
  data: {
    imageSrc: '',
    brushMode: 'erase',
    brushSize: 25,
    hasStroke: false,
    processing: false
  },

  _ctx: null,
  _canvas: null,
  _drawing: false,
  _lastX: 0,
  _lastY: 0,
  _strokes: [],

  onLoad(options) {
    if (options.src) {
      this.setData({ imageSrc: decodeURIComponent(options.src) });
    } else {
      wx.navigateBack();
    }
  },

  onImageReady() {
    this.initCanvas();
  },

  initCanvas() {
    const query = this.createSelectorQuery();
    query.select('#eraseCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        this._ctx = ctx;
        this._canvas = canvas;
        this._canvasWidth = res[0].width;
        this._canvasHeight = res[0].height;
      });
  },

  setMode(e) {
    this.setData({ brushMode: e.currentTarget.dataset.mode });
  },

  onSizeChange(e) {
    this.setData({ brushSize: e.detail.value });
  },

  onTouchStart(e) {
    this._drawing = true;
    const touch = e.touches[0];
    this._lastX = touch.x;
    this._lastY = touch.y;
    this.drawDot(touch.x, touch.y);
  },

  onTouchMove(e) {
    if (!this._drawing || !this._ctx) return;
    const touch = e.touches[0];
    this.drawLine(this._lastX, this._lastY, touch.x, touch.y);
    this._lastX = touch.x;
    this._lastY = touch.y;
    if (!this.data.hasStroke) this.setData({ hasStroke: true });
  },

  onTouchEnd() {
    this._drawing = false;
  },

  drawDot(x, y) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const size = this.data.brushSize;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = this.data.brushMode === 'erase' ? 'rgba(226,75,74,0.4)' : 'rgba(255,255,255,0.8)';
    ctx.fill();
  },

  drawLine(x1, y1, x2, y2) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const size = this.data.brushSize;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = this.data.brushMode === 'erase' ? 'rgba(226,75,74,0.4)' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  },

  clearStroke() {
    if (!this._ctx || !this._canvasWidth) return;
    this._ctx.clearRect(0, 0, this._canvasWidth, this._canvasHeight);
    this.setData({ hasStroke: false });
  },

  async submitErase() {
    if (!this.data.hasStroke) return;

    const hasUnsavedChanges = this.data.hasStroke;
    if (!hasUnsavedChanges) return;

    this.setData({ processing: true });
    wx.showLoading({ title: '消除中...' });

    try {
      const result = await aiService.submitToolTask('erase', {
        imageSrc: this.data.imageSrc
      });
      storage.addRecord({
        taskId: result.taskId,
        type: 'erase',
        originalUrl: this.data.imageSrc,
        resultUrl: '',
        status: TaskStatus.PROCESSING
      });
      wx.hideLoading();
      this.setData({ processing: false });
      wx.showToast({ title: '消除完成', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      this.setData({ processing: false });
      wx.showToast({ title: '处理失败', icon: 'none' });
    }
  }
});
