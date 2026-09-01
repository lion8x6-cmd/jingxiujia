const platform = require('../../utils/platform.js');
const storage = require('../../utils/storage');
const taskRunner = require('../../utils/task-runner');
const { TaskStatus } = require('../../utils/task-status');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Page({
  data: {
    taskId: '',
    batchId: '',
    isBatch: false,
    total: 1,
    progress: 0,
    statusText: '精修中...',
    statusTitle: '正在精修',
    progressHint: '预计 15-30 秒',
    completedCount: 0,
    estimatedTime: 15,
    batchItems: [],
    displayItems: [],
    cancelled: false
  },

  // ======== 动画相关状态 ========
  _animTimer: null,
  _done: false,
  _display: 0,
  _unsub: null,
  _destroyed: false,

  // 算法常量
  _TICK: 50,
  _SEG_DURATION: 12000,
  _CREEP_TAU: 4000,
  _SOFT_CAP: 99,

  _segIdx: 0,
  _segTotal: 0,
  _segStart: 0,
  _segLinearEnd: 0,
  _segEnd: 0,

  onLoad(options) {
    const taskId = options.taskId;
    const batchId = options.batchId || '';
    const isBatch = options.isBatch === '1';
    const total = parseInt(options.total) || 1;

    this.setData({ taskId, batchId, isBatch, total });
    this.loadBatchItems();

    // 订阅全局任务运行器（subscribe 会立即推送当前运行状态）
    this._unsub = taskRunner.subscribe((event, data) => {
      if (this._destroyed) return;
      this.onRunnerEvent(event, data);
    });

    if (!taskRunner.isRunning()) {
      // 没有任务在跑，启动新任务
      this.startAnim();
      taskRunner.startBatch({ taskId, batchId, isBatch, total });
    } else {
      // 已有任务在跑：立即同步真实进度，不从0开始
      this.syncFromRunner();
    }

    // 拦截系统返回：生成中离开时提醒（抖音基础库不一定支持，做特性检测）
    if (typeof platform.enableAlertBeforeUnload === 'function') {
      platform.enableAlertBeforeUnload({
        message: '当前图片正在生成，离开后可在「生成记录」查看进度',
        fail: () => {}
      });
    }
  },

  onUnload() {
    this._destroyed = true;
    this.stopAnim();
    if (this._unsub) { this._unsub(); this._unsub = null; }
    // 注意：不在此处停止任务！任务由 taskRunner 全局管理，继续后台运行
  },

  // ======== 任务运行器事件 ========
  onRunnerEvent(event, data) {
    if (this._destroyed) return;
    if (event === 'start') {
      // 初始化段总数（runner 告知实际待处理张数）
      const segTotal = (data && data.total) || this.data.batchItems.length || this.data.total || 1;
      if (!this._segTotal || this._segTotal < 1) {
        this._segTotal = segTotal;
        this.setupSegment(0);
      }
      this._done = false;
    } else if (event === 'progress') {
      if (data.statusText) {
        this.setData({
          statusText: data.statusText,
          completedCount: data.completedCount || 0
        });
      }
    } else if (event === 'item-update') {
      // 只在一张图真正处理完成（成功或失败）时才推进进度段
      // PROCESSING 状态只更新网格显示，不推进进度
      this.loadBatchItems();
      if (data && (data.status === TaskStatus.COMPLETED ||
                   data.status === TaskStatus.FAILED ||
                   data.status === TaskStatus.CANCELLED ||
                   data.status === TaskStatus.TIMEOUT)) {
        this.advanceSegment();
      }
    } else if (event === 'done') {
      this.onProcessDone(data);
    }
  },

  async onProcessDone(data) {
    this._done = true;
    this.stopAnim();
    // 任务结束，解除返回拦截
    if (typeof platform.disableAlertBeforeUnload === 'function') {
      platform.disableAlertBeforeUnload({ fail: () => {} });
    }
    this._display = 100;
    if (!this._destroyed) {
      this.setData({ progress: 100, statusTitle: '处理完成' });
    }

    const { successCount, failedCount, cancelledCount, cancelled } = data;

    await delay(400);

    // 如果页面已经销毁（用户已退出），不弹窗
    if (this._destroyed) return;

    if (cancelled) {
      if (successCount > 0) {
        platform.showModal({
          title: '已停止',
          content: `已完成 ${successCount} 张，${cancelledCount} 张已取消`,
          showCancel: false,
          confirmText: '查看结果',
          confirmColor: '#FE2C55',
          success: () => this.gotoCompare()
        });
      } else {
        platform.showModal({
          title: '已停止生成',
          content: '所有图片均未完成',
          showCancel: false,
          confirmText: '返回',
          success: () => platform.navigateBack()
        });
      }
      return;
    }

    if (successCount === 0) {
      platform.showModal({
        title: '处理失败',
        content: '所有图片处理失败，请重试',
        showCancel: false,
        success: () => platform.navigateBack()
      });
      return;
    }

    if (failedCount > 0) {
      platform.showModal({
        title: '部分完成',
        content: `${successCount}/${successCount + failedCount} 张处理成功，${failedCount} 张失败`,
        showCancel: false,
        confirmText: '查看结果',
        confirmColor: '#FE2C55',
        success: () => this.gotoCompare()
      });
    } else {
      this.gotoCompare();
    }
  },

  // 从全局运行器同步真实进度（重新进入页面时调用，不从0开始）
  syncFromRunner() {
    const total = taskRunner.getTotal() || this.data.batchItems.length || this.data.total || 1;
    const completed = taskRunner.getCompletedCount();
    const realProgress = taskRunner.getProgress();
    const realStatus = taskRunner.getStatusText();

    this._segTotal = total;
    this._done = false;
    // 直接以真实进度启动动画，避免从0闪一下
    this.startAnim(realProgress);

    // 把段位置推进到已完成的张数
    for (let i = 0; i < completed; i++) {
      this.advanceSegment();
    }
    this._display = realProgress;
    this.setData({
      progress: realProgress,
      completedCount: completed,
      statusText: realStatus || '精修中...'
    });
  },

  // ======== 进度动画（纯展示，与任务逻辑解耦）========
  startAnim(startProgress) {
    this.stopAnim();
    this._done = false;
    this._display = startProgress || 0;
    this._segIdx = 0;
    if (!this._segTotal || this._segTotal < 1) {
      this._segTotal = (this.data.batchItems && this.data.batchItems.length) || this.data.total || 1;
    }
    this.setupSegment(0);
    if (startProgress) {
      this.setData({ progress: startProgress });
    } else {
      this.setData({ progress: 0 });
    }
    this._animTimer = setInterval(() => this.tickAnim(), this._TICK);
  },

  setupSegment(idx) {
    const N = this._segTotal;
    const span = 90 / N;
    const segStartPos = idx * span;
    this._segIdx = idx;
    this._segStart = Date.now();
    this._segLinearEnd = segStartPos + span * 0.9;
    this._segEnd = segStartPos + span;
  },

  tickAnim() {
    if (this._done || this._destroyed) return;

    let target;
    if (this._segIdx < this._segTotal) {
      const N = this._segTotal;
      const span = 90 / N;
      const segStartPos = this._segIdx * span;
      const elapsed = Date.now() - this._segStart;
      if (elapsed < this._SEG_DURATION) {
        target = segStartPos + span * 0.9 * (elapsed / this._SEG_DURATION);
      } else {
        const over = elapsed - this._SEG_DURATION;
        const creepRatio = 1 - Math.exp(-over / this._CREEP_TAU);
        target = this._segLinearEnd + (this._segEnd - this._segLinearEnd) * creepRatio;
      }
    } else {
      target = 99;
    }
    target = Math.min(target, this._SOFT_CAP);
    if (target > this._display) {
      this._display = Math.round(target * 100) / 100;
      if (!this._destroyed) this.setData({ progress: this._display });
    }
  },

  advanceSegment() {
    const nextIdx = Math.min(this._segTotal, this._segIdx + 1);
    const floor = (nextIdx / this._segTotal) * 90;
    if (this._display < floor) {
      this._display = Math.round(floor * 100) / 100;
      if (!this._destroyed) this.setData({ progress: this._display });
    }
    if (nextIdx < this._segTotal) {
      this.setupSegment(nextIdx);
    } else {
      this._segIdx = this._segTotal;
    }
  },

  stopAnim() {
    if (this._animTimer) {
      clearInterval(this._animTimer);
      this._animTimer = null;
    }
  },

  loadBatchItems() {
    const records = storage.getRecords();
    let items = [];
    if (this.data.isBatch) {
      items = records
        .filter(r => {
          if (this.data.batchId) return r.batchId === this.data.batchId;
          return r.batchTotal === this.data.total && r.batchIndex > 0;
        })
        .sort((a, b) => a.batchIndex - b.batchIndex);
    } else {
      items = records.filter(r => r.taskId === this.data.taskId);
    }
    const total = items.length || this.data.total;
    const displayItems = items.slice(0, 9);
    if (!this._destroyed) {
      this.setData({ batchItems: items, displayItems, total });
    }
  },

  // ======== 用户操作 ========
  onStopTap() {
    platform.showModal({
      title: '停止生成',
      content: '确定要停止当前的图片生成吗？已完成的图片会保留。',
      confirmText: '停止',
      confirmColor: '#E24B4A',
      cancelText: '继续生成',
      success: (res) => {
        if (res.confirm) {
          this.setData({ cancelled: true, statusTitle: '正在停止...', statusText: '已取消' });
          taskRunner.stop();
        }
      }
    });
  },

  // 后台运行：提醒后跳到生成记录 tab
  runInBackground() {
    platform.showModal({
      title: '已转入后台',
      content: '图片将继续生成，可在「生成记录」中查看进度。',
      showCancel: false,
      confirmText: '去看进度',
      confirmColor: '#FE2C55',
      success: () => {
        platform.switchTab({ url: '/pages/records/records' });
      }
    });
  },

  gotoCompare() {
    const bid = this.data.batchId ? `&batchId=${this.data.batchId}` : '';
    platform.redirectTo({
      url: `/pages/compare/compare?taskId=${this.data.taskId}&isBatch=${this.data.isBatch ? 1 : 0}&total=${this.data.total}${bid}`
    });
  }
});
