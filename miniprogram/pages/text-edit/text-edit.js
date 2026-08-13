const storage = require('../../utils/storage');
const aiService = require('../../utils/ai-service');
const { TaskStatus } = require('../../utils/task-status');

Page({
  data: {
    imageSrc: '',
    selection: null,
    newText: '',
    processing: false,
    progress: 0,
    _dirty: false
  },

  onLoad(options) {
    if (options.src) {
      this.setData({ imageSrc: decodeURIComponent(options.src) });
    } else {
      wx.navigateBack();
    }
  },

  onImageReady() {
    const query = wx.createSelectorQuery();
    query.select('#editImage').boundingClientRect((rect) => {
      if (rect) {
        this._imgRect = rect;
      }
    }).exec();
  },

  onCanvasTouchStart(e) {
    if (this.data.selection || this.data.processing) return;
    const touch = e.touches[0];
    this._startX = touch.clientX;
    this._startY = touch.clientY;
    this.setData({
      selection: { x: touch.clientX, y: touch.clientY, width: 0, height: 0 }
    });
  },

  onCanvasTouchMove(e) {
    if (!this._startX || this.data.processing) return;
    const touch = e.touches[0];
    const rect = this._imgRect;
    if (!rect) return;

    let x = Math.min(this._startX, touch.clientX);
    let y = Math.min(this._startY, touch.clientY);
    let width = Math.abs(touch.clientX - this._startX);
    let height = Math.abs(touch.clientY - this._startY);

    x = Math.max(rect.left, x);
    y = Math.max(rect.top, y);
    width = Math.min(width, rect.right - x);
    height = Math.min(height, rect.bottom - y);

    this.setData({
      selection: {
        x: x - rect.left,
        y: y - rect.top,
        width,
        height
      },
      _dirty: true
    });
  },

  onSelectionMove(e) {
    this._moving = true;
    const touch = e.touches[0];
    this._moveStartX = touch.clientX;
    this._moveStartY = touch.clientY;
    this._origSelection = { ...this.data.selection };
  },

  onSelectionDrag(e) {
    if (!this._moving) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._moveStartX;
    const dy = touch.clientY - this._moveStartY;
    const sel = this._origSelection;
    this.setData({
      'selection.x': sel.x + dx,
      'selection.y': sel.y + dy
    });
  },

  onResizeStart() {
    this._resizing = true;
  },

  onResizeMove() {
    if (!this._resizing) return;
  },

  cancelSelection() {
    this.setData({ selection: null, newText: '', _dirty: false });
  },

  onTextInput(e) {
    this.setData({ newText: e.detail.value, _dirty: true });
  },

  async submitEdit() {
    if (!this.data.newText.trim()) {
      wx.showToast({ title: '请输入替换文字', icon: 'none' });
      return;
    }

    const hasUnsavedChanges = this.data._dirty;
    if (hasUnsavedChanges) {
      this.setData({ processing: true, progress: 0 });
      this.simulateProgress();

      try {
        const result = await aiService.submitToolTask('text-edit', {
          imageSrc: this.data.imageSrc,
          selection: this.data.selection,
          newText: this.data.newText
        });

        storage.addRecord({
          taskId: result.taskId,
          type: 'text-edit',
          originalUrl: this.data.imageSrc,
          resultUrl: '',
          status: TaskStatus.PROCESSING,
          progress: 0
        });

        setTimeout(() => {
          this.setData({ processing: false, progress: 100 });
          wx.showToast({ title: '处理完成', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        }, 2000);
      } catch (err) {
        this.setData({ processing: false });
        wx.showToast({ title: '处理失败', icon: 'none' });
      }
    }
  },

  simulateProgress() {
    let p = 0;
    this._progressTimer = setInterval(() => {
      p = Math.min(95, p + Math.random() * 15);
      if (this.data.processing) {
        this.setData({ progress: Math.round(p) });
      } else {
        clearInterval(this._progressTimer);
      }
    }, 300);
  },

  onUnload() {
    if (this._progressTimer) clearInterval(this._progressTimer);
  }
});
