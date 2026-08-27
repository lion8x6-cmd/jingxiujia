const history = require('../../utils/prompt-tester-history');

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return Math.floor(diff / minute) + '分钟前';
  if (diff < day) return Math.floor(diff / hour) + '小时前';
  if (diff < 7 * day) return Math.floor(diff / day) + '天前';

  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    records: []
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    const list = history.getAll().map(r => ({
      ...r,
      timeText: formatTime(r.createdAt)
    }));
    this.setData({ records: list });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/lab/prompt-history-detail?id=' + id
    });
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条测试记录？',
      confirmColor: '#e24b4a',
      success: (res) => {
        if (!res.confirm) return;
        history.removeRecord(id);
        this.loadRecords();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  confirmClear() {
    wx.showModal({
      title: '清空历史',
      content: '确定清空所有测试记录？此操作不可恢复。',
      confirmColor: '#e24b4a',
      success: (res) => {
        if (!res.confirm) return;
        history.clearAll();
        this.loadRecords();
        wx.showToast({ title: '已清空', icon: 'success' });
      }
    });
  }
});
