// 生成记录页 - 7天自动销毁、倒计时、一键转存、多选删除
const storage = require('../../utils/storage.js');
const { getTextForStatus, isTerminal, isFailed } = require('../../utils/task-status.js');
const taskRunner = require('../../utils/task-runner.js');

const TYPE_NAME_MAP = {
  retouch: '智能精修',
  batch: '批量精修',
  'text-edit': '无痕改字',
  cutout: '智能抠图',
  erase: '智能消除',
  'body-adjust': '部位调节',
  lab: 'Skill调试'
};

Page({
  data: {
    records: [],
    completedRecords: [],
    groupedRecords: [],  // [{ title: '今天', items: [...] }, ...]

    // 多选模式
    selectMode: false,
    selectedIds: [],
    selectedIdsMap: {},
    isAllSelected: false
  },

  onLoad() {
    this._timer = null;
    // 订阅全局任务运行器，后台生成完成时自动刷新列表
    this._unsub = taskRunner.subscribe((event) => {
      if (event === 'item-update' || event === 'done') {
        this.loadRecords();
      }
    });
  },

  onUnload() {
    this.clearTimer();
    if (this._unsub) { this._unsub(); this._unsub = null; }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadRecords();
    // 每30秒刷新倒计时
    this._timer = setInterval(() => this.refreshCountdown(), 30000);
  },

  onHide() {
    this.clearTimer();
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  loadRecords() {
    storage.cleanupExpiredRecords();
    const rawRecords = storage.getRecords();
    const records = rawRecords.map(r => this.formatRecord(r));
    const completedRecords = records.filter(r => r.status === 'completed' && r.resultUrl);
    const groupedRecords = this.groupByDate(records);
    this.setData({
      records,
      completedRecords,
      groupedRecords
    }, () => this.syncSelectState());
  },

  groupByDate(records) {
    const groups = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    for (const r of records) {
      const ts = r.createdAt || 0;
      let title;
      if (ts >= todayStart) {
        title = '今天';
      } else if (ts >= yesterdayStart) {
        title = '昨天';
      } else {
        const d = new Date(ts);
        if (d.getFullYear() === now.getFullYear()) {
          title = `${d.getMonth() + 1}月${d.getDate()}日`;
        } else {
          title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        }
      }

      let group = groups.find(g => g.title === title);
      if (!group) {
        group = { title, items: [] };
        groups.push(group);
      }
      group.items.push(r);
    }
    return groups;
  },

  formatRecord(r) {
    const remaining = storage.getRemainingTime(r.expireAt);
    const typeName = TYPE_NAME_MAP[r.type] || '精修';
    let statusText = '';
    let statusClass = '';
    let showSpinner = false;

    if (r.status === 'completed') {
      statusText = '已完成';
      statusClass = 'completed';
    } else if (isFailed(r.status) || r.status === 'review_rejected' || r.status === 'cancelled' || r.status === 'timeout') {
      statusText = getTextForStatus(r.status);
      statusClass = 'failed';
    } else {
      statusText = getTextForStatus(r.status) || '处理中';
      statusClass = 'processing';
      showSpinner = true;
    }

    let batchText = '';
    if (r.isBatch && r.batchTotal) {
      if (r.status === 'completed') {
        batchText = `${r.batchSuccess || r.batchTotal || 0}/${r.batchTotal}张成功`;
      } else {
        batchText = `批量 ${r.batchTotal}张`;
      }
    }

    // 调试记录显示 Skill 名称
    if (r.type === 'lab' && r.labName) {
      batchText = r.labName;
    }

    const createdAtText = this.formatTime(r.createdAt);

    return {
      ...r,
      typeName,
      statusText,
      statusClass,
      showSpinner,
      batchText,
      createdAtText,
      isExpiring: remaining.isExpiring && r.status === 'completed',
      remainingText: r.status === 'completed' ? remaining.text : ''
    };
  },

  formatTime(ts) {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;

    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + '分钟前';
    if (diff < day) return Math.floor(diff / hour) + '小时前';
    if (diff < 7 * day) return Math.floor(diff / day) + '天前';

    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  refreshCountdown() {
    const records = this.data.records.map(r => {
      if (r.status !== 'completed') return r;
      const remaining = storage.getRemainingTime(r.expireAt);
      return {
        ...r,
        remainingText: remaining.text,
        isExpiring: remaining.isExpiring
      };
    });
    const groupedRecords = this.groupByDate(records);
    this.setData({ records, groupedRecords });
  },

  onPullDownRefresh() {
    this.loadRecords();
    wx.stopPullDownRefresh();
    wx.showToast({ title: '已刷新', icon: 'none' });
  },

  // ====== 多选模式 ======
  toggleSelectMode() {
    const next = !this.data.selectMode;
    this.setData({
      selectMode: next,
      selectedIds: [],
      selectedIdsMap: {},
      isAllSelected: false
    });
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.selectMode) {
      this.toggleSelect(id);
    } else {
      this.openRecord(e);
    }
  },

  // 长按卡片：进入管理模式并选中该项
  onCardLongPress(e) {
    const id = e.currentTarget.dataset.id;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    if (!this.data.selectMode) {
      this.setData({
        selectMode: true,
        selectedIds: [id],
        selectedIdsMap: { [id]: true },
        isAllSelected: false
      });
    } else {
      this.toggleSelect(id);
    }
  },

  toggleSelect(id) {
    const map = { ...this.data.selectedIdsMap };
    let ids;
    if (map[id]) {
      delete map[id];
      ids = this.data.selectedIds.filter(x => x !== id);
    } else {
      map[id] = true;
      ids = [...this.data.selectedIds, id];
    }
    this.setData({
      selectedIds: ids,
      selectedIdsMap: map
    }, () => this.syncSelectState());
  },

  selectAll() {
    if (this.data.isAllSelected) {
      this.setData({
        selectedIds: [],
        selectedIdsMap: {},
        isAllSelected: false
      });
    } else {
      const ids = this.data.records.map(r => r.id);
      const map = {};
      ids.forEach(id => { map[id] = true; });
      this.setData({
        selectedIds: ids,
        selectedIdsMap: map,
        isAllSelected: true
      });
    }
  },

  syncSelectState() {
    const total = this.data.records.length;
    const selected = this.data.selectedIds.length;
    this.setData({
      isAllSelected: total > 0 && selected === total
    });
  },

  deleteSelected() {
    const ids = this.data.selectedIds;
    if (!ids.length) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除记录',
      content: `确定删除选中的 ${ids.length} 条记录？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: (res) => {
        if (!res.confirm) return;
        const removed = storage.removeRecords(ids);
        wx.showToast({ title: `已删除 ${removed} 条`, icon: 'none' });
        this.setData({
          selectMode: false,
          selectedIds: [],
          selectedIdsMap: {},
          isAllSelected: false
        });
        this.loadRecords();
      }
    });
  },

  // ====== 业务操作 ======
  saveAllToAlbum() {
    const { completedRecords } = this.data;
    if (!completedRecords.length) {
      wx.showToast({ title: '暂无可转存的图片', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '转存到云相册',
      content: `将${completedRecords.length}张精修图片永久保存到云相册？`,
      confirmText: '转存',
      confirmColor: '#07C160',
      success: (res) => {
        if (!res.confirm) return;
        const rawRecords = storage.getRecords();
        const count = storage.saveAllToAlbum(rawRecords);
        wx.showToast({
          title: count > 0 ? `已转存${count}张` : '已全部转存过',
          icon: 'none'
        });
        this.loadRecords();
      }
    });
  },

  openRecord(e) {
    const id = e.currentTarget.dataset.id;
    const record = this.data.records.find(r => r.id === id);
    if (!record) return;

    // 调试实验室记录：跳转到 compare 页查看结果和提示词
    if (record.type === 'lab') {
      wx.navigateTo({
        url: `/pages/compare/compare?taskId=${encodeURIComponent(record.taskId || record.id)}`
      });
      return;
    }

    const batchParam = record.batchId ? `&batchId=${record.batchId}` : '';

    if (record.status === 'completed' && record.resultUrl) {
      const tid = record.taskId || id;
      wx.navigateTo({
        url: `/pages/compare/compare?taskId=${encodeURIComponent(tid)}&isBatch=${record.isBatch ? 1 : 0}&total=${record.batchTotal || 1}${batchParam}`
      });
    } else if (!isTerminal(record.status)) {
      wx.navigateTo({
        url: `/pages/progress/progress?taskId=${encodeURIComponent(record.taskId || id)}&isBatch=${record.isBatch ? 1 : 0}&total=${record.batchTotal || 1}${batchParam}`
      });
    } else {
      wx.showModal({
        title: '记录提示',
        content: '该任务未成功完成，是否重新精修？',
        confirmText: '重新精修',
        confirmColor: '#07C160',
        success: (res) => {
          if (res.confirm) {
            // 原地重试：重置失败记录并跳转进度页（不回到上传页）
            const retryBatchId = record.batchId || '';
            const result = taskRunner.retryBatch(retryBatchId);
            if (result.ok) {
              wx.navigateTo({
                url: `/pages/progress/progress?taskId=${encodeURIComponent(result.taskId)}&isBatch=${result.isBatch ? 1 : 0}&total=${result.total}&batchId=${encodeURIComponent(result.batchId || '')}`
              });
            } else {
              wx.showToast({ title: '暂无可重试的任务', icon: 'none' });
            }
          }
        }
      });
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
