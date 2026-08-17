// 我的页 - 用户信息、会员、统计、菜单
const app = getApp();
const storage = require('../../utils/storage.js');

Page({
  data: {
    isLogin: false,
    userInfo: {},
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    member: {
      active: false,
      expireText: ''
    },
    stats: {
      completedCount: 0,
      albumCount: 0,
      savedTime: 0
    },
    createMenus: [
      { key: 'templates', icon: '📋', title: '我的模板', desc: '管理常用精修模板' },
      { key: 'favorites', icon: '⭐', title: '我的收藏', desc: '收藏的效果与模板' },
      { key: 'history', icon: '🕐', title: '浏览历史', desc: '查看最近浏览内容' }
    ],
    settingMenus: [
      { key: 'clear-cache', icon: '🧹', title: '清理缓存', desc: '' },
      { key: 'feedback', icon: '💬', title: '帮助与反馈', desc: '' },
      { key: 'contact', icon: '🎧', title: '联系客服', desc: '' },
      { key: 'about', icon: 'ℹ️', title: '关于精修家', desc: 'v1.0.0' },
      { key: 'privacy', icon: '🔒', title: '隐私政策', desc: '' }
    ],
    benefits: [
      { icon: '✨', title: '无限次AI精修', desc: '不限次数使用全部AI功能' },
      { icon: '📦', title: '批量处理', desc: '一次最多20张，效率翻倍' },
      { icon: '💎', title: '高清无水印', desc: '导出原图分辨率，无水印' },
      { icon: '⚡', title: '优先处理通道', desc: '会员专属队列，更快出图' },
      { icon: '☁️', title: '云相册扩容', desc: '永久保存更多精修作品' }
    ],
    showMember: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    this.loadUserInfo();
    this.loadStats();
  },

  loadUserInfo() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    this.setData({
      isLogin: app.globalData.isLogin,
      userInfo
    });
  },

  loadStats() {
    // 从本地存储统计
    const records = storage.getRecords();
    const completedCount = records.filter(r => r.status === 'completed').length;
    const album = storage.getAlbum();
    const albumCount = album.length;
    // 每张精修约省5分钟
    const savedTime = completedCount * 5;

    // 会员状态（mock：从 storage 读取，默认未开通）
    const memberInfo = wx.getStorageSync('member') || { active: false, expireAt: 0 };
    let member = { active: false, expireText: '' };
    if (memberInfo.active && memberInfo.expireAt > Date.now()) {
      const days = Math.ceil((memberInfo.expireAt - Date.now()) / (24 * 60 * 60 * 1000));
      member = { active: true, expireText: `有效期还剩${days}天` };
    }

    this.setData({
      stats: { completedCount, albumCount, savedTime },
      member
    });
  },

  // 微信头像选择
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    const userInfo = { ...this.data.userInfo, avatarUrl };
    this.setData({ userInfo });
    app.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },

  // 昵称输入
  onNicknameBlur(e) {
    const nickName = e.detail.value.trim();
    if (!nickName) return;
    const userInfo = { ...this.data.userInfo, nickName };
    this.setData({ userInfo });
    app.globalData.userInfo = userInfo;
    wx.setStorageSync('userInfo', userInfo);
  },

  openMember() {
    this.setData({ showMember: true });
  },

  closeMember() {
    this.setData({ showMember: false });
  },

  goRecords() {
    wx.switchTab({ url: '/pages/records/records' });
  },

  goAlbum() {
    wx.switchTab({ url: '/pages/album/album' });
  },

  onMenuTap(e) {
    const key = e.currentTarget.dataset.key;
    switch (key) {
      case 'templates':
        wx.showToast({ title: '模板管理开发中', icon: 'none' });
        break;
      case 'favorites':
        wx.showToast({ title: '收藏功能开发中', icon: 'none' });
        break;
      case 'history':
        wx.showToast({ title: '历史记录开发中', icon: 'none' });
        break;
      case 'clear-cache':
        this.clearCache();
        break;
      case 'feedback':
        wx.showToast({ title: '反馈功能开发中', icon: 'none' });
        break;
      case 'about':
        this.showAbout();
        break;
      case 'privacy':
        wx.showToast({ title: '隐私政策开发中', icon: 'none' });
        break;
      default:
        break;
    }
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '将清理本地临时缓存文件，不影响云相册和记录，确定继续？',
      confirmColor: '#07C160',
      success: (res) => {
        if (!res.confirm) return;
        // 清理小程序本地缓存（保留关键数据）
        const token = wx.getStorageSync('token');
        const userInfo = wx.getStorageSync('userInfo');
        const records = wx.getStorageSync('records');
        const album = wx.getStorageSync('album');
        const member = wx.getStorageSync('member');
        wx.clearStorageSync();
        if (token) wx.setStorageSync('token', token);
        if (userInfo) wx.setStorageSync('userInfo', userInfo);
        if (records) wx.setStorageSync('records', records);
        if (album) wx.setStorageSync('album', album);
        if (member) wx.setStorageSync('member', member);
        wx.showToast({ title: '缓存已清理', icon: 'success' });
      }
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于精修家',
      content: '精修家 v1.0.0\nAI一键精修，让废片变大片。\n所有图片7天后自动销毁，保护您的隐私。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#07C160'
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#E24B4A',
      success: (res) => {
        if (!res.confirm) return;
        app.globalData.token = '';
        app.globalData.userInfo = null;
        app.globalData.isLogin = false;
        wx.removeStorageSync('token');
        wx.removeStorageSync('userInfo');
        this.setData({
          isLogin: false,
          userInfo: {}
        });
        wx.showToast({ title: '已退出', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '精修家 - AI一键精修，废片变大片',
      path: '/pages/index/index'
    };
  }
});
