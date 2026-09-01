// 云相册页 - 永久保存、预览、批量管理、保存到手机
const platform = require('../../utils/platform.js');
const storage = require('../../utils/storage.js');
const { saveImageToAlbum, isAuthDenied, showAuthGuide } = require('../../utils/save-image.js');

const TYPE_NAME_MAP = {
  retouch: '智能精修',
  'text-edit': '无痕改字',
  cutout: '智能抠图',
  erase: '智能消除',
  'body-adjust': '部位调节'
};

Page({
  data: {
    album: [],
    selectMode: false,
    selectedMap: {},
    selectedCount: 0,
    allSelected: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.loadAlbum();
  },

  loadAlbum() {
    const raw = storage.getAlbum();
    const album = raw.map(item => ({
      ...item,
      typeName: TYPE_NAME_MAP[item.type] || ''
    }));
    this.setData({ album });
    if (this.data.selectMode) this.recalcSelection();
  },

  onPullDownRefresh() {
    this.loadAlbum();
    platform.stopPullDownRefresh();
  },

  // 点击图片：非选择模式预览，选择模式切换选中
  onTapItem(e) {
    const { id, src } = e.currentTarget.dataset;
    if (this.data.selectMode) {
      this.toggleSelectOne(id);
    } else {
      const urls = this.data.album.map(a => a.src);
      platform.previewImage({ current: src, urls });
    }
  },

  toggleSelect() {
    const selectMode = !this.data.selectMode;
    this.setData({
      selectMode,
      selectedMap: {},
      selectedCount: 0,
      allSelected: false
    });
  },

  toggleSelectOne(id) {
    const selectedMap = { ...this.data.selectedMap };
    if (selectedMap[id]) {
      delete selectedMap[id];
    } else {
      selectedMap[id] = true;
    }
    this.setData({ selectedMap });
    this.recalcSelection();
  },

  selectAll() {
    if (this.data.allSelected) {
      this.setData({ selectedMap: {} });
    } else {
      const selectedMap = {};
      this.data.album.forEach(a => { selectedMap[a.id] = true; });
      this.setData({ selectedMap });
    }
    this.recalcSelection();
  },

  recalcSelection() {
    const total = this.data.album.length;
    const count = Object.keys(this.data.selectedMap).length;
    this.setData({
      selectedCount: count,
      allSelected: total > 0 && count === total
    });
  },

  getSelectedItems() {
    return this.data.album.filter(a => this.data.selectedMap[a.id]);
  },

  // 保存选中的图片到手机相册（网络图先下载，base64先写临时文件）
  async saveSelectedToPhone() {
    const items = this.getSelectedItems();
    if (!items.length) return;

    // 先检查相册权限
    try {
      const setting = await new Promise((resolve) => {
        platform.getSetting({
          success: (res) => resolve(res.authSetting['scope.writePhotosAlbum']),
          fail: () => resolve(undefined)
        });
      });
      if (setting === false) {
        // 用户之前拒绝过，引导去设置
        const granted = await showAuthGuide();
        if (!granted) return;
      }
    } catch (e) {}

    platform.showLoading({ title: '保存中...', mask: true });
    let done = 0;
    let fail = 0;
    let authFailed = false;

    // 串行保存，避免并发下载压力
    for (let i = 0; i < items.length; i++) {
      platform.showLoading({ title: `保存中 ${i + 1}/${items.length}`, mask: true });
      try {
        await saveImageToAlbum(items[i].src);
        done++;
      } catch (err) {
        console.error('[album] save item', i, 'failed:', err);
        if (isAuthDenied(err)) authFailed = true;
        fail++;
      }
    }

    platform.hideLoading();
    if (authFailed && fail > 0) {
      const granted = await showAuthGuide();
      if (granted) {
        this.saveSelectedToPhone();
        return;
      }
    }
    platform.showToast({
      title: fail === 0 ? `已保存${done}张` : `成功${done}张,失败${fail}张`,
      icon: 'none'
    });
    this.toggleSelect();
  },

  deleteSelected() {
    const items = this.getSelectedItems();
    if (!items.length) return;

    platform.showModal({
      title: '删除图片',
      content: `确定从云相册删除${items.length}张图片？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#E24B4A',
      success: (res) => {
        if (!res.confirm) return;
        items.forEach(i => storage.removeFromAlbum(i.id));
        platform.showToast({ title: '已删除', icon: 'none' });
        this.toggleSelect();
        this.loadAlbum();
      }
    });
  },

  goHome() {
    platform.switchTab({ url: '/pages/index/index' });
  },

  // 分享单个图片（右上角菜单）
  onShareAppMessage() {
    return {
      title: '我用P图精修必拍修的图，来看看吧',
      path: '/pages/index/index'
    };
  }
});
