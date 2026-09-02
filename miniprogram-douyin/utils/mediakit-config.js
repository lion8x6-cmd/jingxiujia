/**
 * 火山引擎 AI MediaKit 配置（抖音端）
 *
 * 用于「智能抠图」——专业图像分割/背景移除，输出透明底 PNG（带 alpha 通道）。
 * 注意：此 Key 是 MediaKit 专用 Key（AKLT 开头，账号级访问密钥），与方舟 ARK 的 Key 不是同一个。
 *
 * ⚠️ 安全约定：账号级密钥不能明文提交到公开仓库（GitHub 密钥扫描会拦截推送）。
 *   - 本文件入库时 apiKey 留空；
 *   - 本地开发时把真实 Key 填入下方 apiKey 字段即可（功能照常），
 *     并已对本文件执行 `git update-index --skip-worktree`，本地填入的 Key 不会被 git 提交；
 *   - 换机器/重新 clone 后需重新填入；正式上线应把 MediaKit 调用放到自有后端中转，避免前端打包泄露。
 *
 * 计费：图像背景移除 ≈ 1.38 元/千次（约 0.0014 元/张）。国内服务直连，无需代理。
 * 小程序后台需配置 request 合法域名：mediakit.cn-beijing.volces.com、tob-upload-x-d.volcvod.com；
 * downloadFile 合法域名：mediakit-image.cn-beijing.volces.com。
 */
const MEDIAKIT_CONFIG = {
  baseUrl: 'https://mediakit.cn-beijing.volces.com/api/v1',
  apiKey: ''   // 本地填入真实 MediaKit Key（AKLT 开头），不提交仓库
};

module.exports = MEDIAKIT_CONFIG;
