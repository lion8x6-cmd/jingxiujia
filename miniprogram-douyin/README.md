# 精修家 · 抖音小程序

本目录是**抖音小程序版本**，由微信版 `miniprogram/` 移植而来。两版业务代码一致，通过平台适配层屏蔽 API 差异。

## 运行

1. 下载并安装[抖音开发者工具](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/developer-instrument/developer-instrument-update-and-download)
2. 用抖音开发者工具打开本目录（`miniprogram-douyin/`）
3. 首次打开需替换 `project.config.json` 中的 AppID：
   ```json
   "appid": "ttYOUR_DOUYIN_APPID_HERE"
   ```
   去[抖音开放平台](https://developer.open-douyin.com/)创建小程序后获取真实 AppID。
4. 服务器域名白名单需在抖音开发者后台「开发 - 开发设置 - 服务器域名」配置：
   - `request`：`https://api.jingxiujia.com`、`https://ark.cn-beijing.volces.com`
   - `uploadFile` / `downloadFile`：同上
   - `socket`：按后端 WebSocket 地址配置

## 与微信版的主要差异

| 项 | 微信版 | 抖音版 |
|---|---|---|
| 全局 API | `wx.*` | `tt.*`（经 `utils/platform.js` 适配，业务代码统一写 `platform.*`） |
| 主题色 | `#07C160`（微信绿） | `#FE2C55`（抖音红） |
| 头像昵称 | `open-type="chooseAvatar"` + `type="nickname"` | 手动 `tt.chooseImage` + 普通文本 input |
| 客服 | `<button open-type="contact">` | 已移除按钮，待接抖音企业号 IM（`open-type="im"`）或自建 H5 |
| 聊天会话选文件 | `wx.chooseMessageFile` | 不支持，入口已隐藏 |
| 返回拦截 | `wx.enableAlertBeforeUnload` | 加了 `typeof` 特性检测，不支持时自动降级 |
| 登录 | 微信 `jscode2session` | 抖音 `jscode2session`，客户端多传 `platform:'douyin'` 与 `anonymousCode` |
| 分享 | `onShareAppMessage` + 朋友圈 | 仅好友/群分享，不支持朋友圈 |
| 工程配置 | `sitemap.json` + `style:"v2"` | 已剔除，无需 `sitemap.json` |

## 平台适配层

`utils/platform.js` 内容：

```js
let g;
if (typeof tt !== 'undefined') g = tt;
else if (typeof wx !== 'undefined') g = wx;
else g = {};
module.exports = g;
```

所有业务文件均通过 `const platform = require('<相对路径>/utils/platform.js')` 引用，然后用 `platform.xxx` 调 API。

## 后端配套

`POST /api/auth/login` 已按客户端传入的 `platform` 字段区分：

- `platform === 'wechat'`（或不传）：调用微信 `jscode2session`
- `platform === 'douyin'`：调用抖音
  - Endpoint: `https://developer.toutiao.com/api/apps/v2/jscode2session`
  - 需在后端配置抖音 AppID/Secret（与微信独立）
  - 抖音返回的 `openid` / `anonymous_openid` 按业务需求选做主键

后端尚未实现抖音分支，发布前需补齐。

## 真机回归清单（重点）

抖音 WebView 内核和微信不一样，以下场景必须真机测：

- [ ] 抖音一键登录（`tt.login` → 后端换 token）
- [ ] 头像选择（相册 + 权限申请）
- [ ] 选图（相册多选、拍照）、图片压缩
- [ ] AI 精修全流程：上传 → WebSocket 进度 → 结果回显
- [ ] 保存到相册（`tt.saveImageToPhotosAlbum` 授权流程）
- [ ] Canvas 2D（`compare-slider` 对比组件、`ring-progress` 环形进度）
- [ ] 分享给抖音好友
- [ ] 自定义 TabBar 切换与高亮
- [ ] 批量修图最多 20 张的内存占用
- [ ] 低端机 / 老版抖音的 flex 布局（尤其 `gap` / `calc` 已经按固定宽度规避，再验一遍）

## 代码同步

微信版在 `../miniprogram/`。修业务 bug 时两端都要同步；平台/配置差异保留各端版本。建议用 git 分支或 diff 工具对比。
