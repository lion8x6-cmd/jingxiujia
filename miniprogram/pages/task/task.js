const app = getApp();

Page({
  data: {
    stitchedPath: '',
    copyText: '',
    steps: [
      { title: '生成对比素材', desc: '用拼接图 + 种草文案备好你的作品素材' },
      { title: '拍一条短视频', desc: '展示修图前后对比，10 秒以上、画面清晰' },
      { title: '挂载小程序组件', desc: '发布时在任务页挂载「P图精修必拍」小程序' },
      { title: '发布并赚佣金', desc: '观众点挂载进入使用，按有效转化结算' }
    ]
  },

  onLoad() {
    const m = (app.globalData && app.globalData.taskMaterial) || {};
    this.setData({
      stitchedPath: m.stitchedPath || '',
      copyText: m.copyText || ''
    });
  },

  // 引导：微信小程序内无法直接跳抖音/自动挂载。
  // 素材（拼接图+文案）已备好，需用户自行打开抖音，到创作者任务台/小程序推广计划接单发布。
  onPostTap() {
    wx.setClipboardData({
      data: 'P图精修必拍',
      success() {
        wx.showModal({
          title: '去抖音接任务赚佣金',
          content: '素材已为你备好（对比图已存相册、文案已复制）。\n\n1. 打开抖音 →「我」→ 右上角菜单 → 创作者服务中心 → 任务台（或直接搜索“小程序推广计划”）\n2. 粘贴搜索“P图精修必拍”，找到推广任务并接单\n3. 用相册里的对比素材发视频，发布后视频会带上本小程序锚点\n\n注意：需小程序正式上线、并在抖音开放平台开通「短视频达人推广挂载」能力后，任务才会出现在任务台。',
          showCancel: false,
          confirmText: '我知道了'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: 'P图精修必拍 - 修图前后对比也太绝了',
      desc: this.data.copyText || ''
    };
  }
});
