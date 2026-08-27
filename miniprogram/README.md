# 精修家 · 微信小程序

本目录是**微信小程序版本**，保持原有代码，直接用微信开发者工具打开即可。

## 运行

1. 用微信开发者工具打开本目录（`miniprogram/`）
2. AppID：`wx86f259b92c921ac9`（正式发布前请替换为自己的 AppID）
3. 基础库版本：≥ 3.4.0
4. 服务器域名白名单需在微信公众平台配置：
   - `request`：`https://api.jingxiujia.com`、`https://ark.cn-beijing.volces.com`
   - `uploadFile` / `downloadFile`：同上
   - `socket`：按后端 WebSocket 地址配置

## 与抖音版的区别

- 直接使用 `wx.*` 全局 API
- 主题色：微信绿 `#07C160`
- 头像昵称走 `open-type="chooseAvatar"` + `<input type="nickname">`
- 客服入口使用 `<button open-type="contact">`
- 支持从聊天会话选文件（`wx.chooseMessageFile`）
- 支持 `enableAlertBeforeUnload` 返回拦截
- 登录走微信 `jscode2session`

## 代码同步

抖音版在 `../miniprogram-douyin/`。两目录文件结构一致，业务逻辑共享，差异仅在：
- `utils/platform.js`（抖音版独有）
- `app.js` 登录接口 `platform` 字段
- `pages/mine/mine.*`（头像/客服差异）
- `utils/picker.js`（抖音无聊天选文件）
- `project.config.json` / `app.json`（工程配置）

修 bug 时建议先在一端改，再把业务逻辑同步到另一端；配置/平台差异保留两端各自版本。
