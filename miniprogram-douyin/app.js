const platform = require('./utils/platform.js');
App({
  globalData: {
    userInfo: null,
    token: '',
    isLogin: false,
    baseUrl: 'https://api.jingxiujia.com',
    networkType: 'wifi',
    isOnline: true,
    pendingTasks: []
  },

  onLaunch() {
    this.checkNetwork();
    this.restoreSession();
  },

  onShow() {
    this.checkNetwork();
  },

  checkNetwork() {
    platform.getNetworkType({
      success: (res) => {
        this.globalData.networkType = res.networkType;
        this.globalData.isOnline = res.networkType !== 'none';
      }
    });
    platform.onNetworkStatusChange((res) => {
      this.globalData.isOnline = res.isConnected;
      this.globalData.networkType = res.networkType;
      if (res.isConnected) {
        this.flushPendingTasks();
      }
    });
  },

  restoreSession() {
    const token = platform.getStorageSync('token');
    const userInfo = platform.getStorageSync('userInfo');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
      this.globalData.isLogin = true;
    }
    const pending = platform.getStorageSync('pendingTasks') || [];
    this.globalData.pendingTasks = pending;
  },

  login() {
    return new Promise((resolve, reject) => {
      platform.login({
        success: (res) => {
          if (res.code) {
            platform.request({
              url: this.globalData.baseUrl + '/api/auth/login',
              method: 'POST',
              data: { code: res.code, platform: 'douyin', anonymousCode: res.anonymousCode || '' },
              success: (resp) => {
                if (resp.data && resp.data.token) {
                  this.globalData.token = resp.data.token;
                  this.globalData.userInfo = resp.data.userInfo;
                  this.globalData.isLogin = true;
                  platform.setStorageSync('token', resp.data.token);
                  platform.setStorageSync('userInfo', resp.data.userInfo);
                  resolve(resp.data);
                } else {
                  reject(new Error('login failed'));
                }
              },
              fail: reject
            });
          } else {
            reject(new Error(res.errMsg));
          }
        },
        fail: reject
      });
    });
  },

  ensureLogin() {
    if (this.globalData.isLogin) return Promise.resolve();
    return this.login();
  },

  addPendingTask(task) {
    this.globalData.pendingTasks.push(task);
    platform.setStorageSync('pendingTasks', this.globalData.pendingTasks);
  },

  flushPendingTasks() {
    const tasks = this.globalData.pendingTasks;
    if (!tasks.length) return;
    this.globalData.pendingTasks = [];
    platform.setStorageSync('pendingTasks', []);
  }
});
