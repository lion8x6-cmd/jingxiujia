const platform = require('../../utils/platform.js');
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

  // 引导：抖音「短视频达人推广挂载」任务无法从小程序内直接跳转/自动挂载，
  // 需用户到抖音 App 的创作者任务台/小程序推广计划里接单发布。这里复制小程序名并给出步骤。
  onPostTap() {
    platform.setClipboardData({
      data: 'P图精修必拍',
      success() {
        platform.showModal({
          title: '去抖音接任务赚佣金',
          content: '1. 打开抖音 →「我」→ 右上角菜单 → 创作者服务中心 → 任务台（或直接搜索“小程序推广计划”）\n2. 粘贴搜索“P图精修必拍”，找到推广任务并接单\n3. 用已保存到相册的对比素材发视频，发布后视频会带上本小程序锚点\n\n注意：需小程序正式上线、并在抖音开放平台开通「短视频达人推广挂载」能力后，任务才会出现在任务台。',
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
