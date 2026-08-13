// 豆包 Doubao-Seedream API 配置
// 注意：正式上线时，ARK API Key 应放在自有后端中转，不要直接打包在小程序前端（会被反编译泄露）。
// 当前为联调阶段直连，需在微信公众平台「开发设置-服务器域名」将 ark.cn-beijing.volces.com 加入 request 合法域名。

const ARK_CONFIG = {
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: 'YOUR_ARK_API_KEY_HERE',
  model: 'doubao-seedream-5-0-pro-260628',
  size: '1.5K',  // 与 1K 同价（¥0.3/张），但生成效果更优
  watermark: false,
  requestTimeout: 120000
};

// 部位调节 -> 提示词片段映射
const PART_PROMPT_MAP = {
  face: { name: '脸部', positive: '脸部轮廓自然收窄，线条流畅', negative: '脸部轮廓适度饱满' },
  eyes: { name: '眼睛', positive: '眼睛自然放大，明亮有神', negative: '眼睛大小自然收敛' },
  nose: { name: '鼻子', positive: '鼻翼自然收窄，鼻梁挺拔', negative: '鼻型自然柔和' },
  lips: { name: '嘴唇', positive: '唇形饱满自然，色泽健康', negative: '唇形纤薄自然' },
  arm: { name: '手臂', positive: '手臂线条纤细紧致', negative: '手臂线条自然饱满' },
  belly: { name: '腰部', positive: '腰部自然收紧，线条流畅', negative: '腰腹线条自然' },
  leg: { name: '腿部', positive: '腿部修长纤细，比例自然', negative: '腿部线条自然匀称' },
  body: { name: '身形', positive: '整体身形自然显瘦，比例协调', negative: '整体身形自然匀称' }
};

// 通用精修大师提示词（用户已验证的通用提示词基础）
const BASE_RETOUCH_PROMPT = '专业人像精修，高清自然，光影细腻，皮肤质感真实，保留人物原本特征，不失真不变形，画质增强，细节丰富';

module.exports = {
  ARK_CONFIG,
  PART_PROMPT_MAP,
  BASE_RETOUCH_PROMPT
};
