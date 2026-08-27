# 精修家 - 双端小程序项目

本仓库同时维护两个小程序版本，目录相互独立、不共享代码：

| 目录 | 平台 | 开发者工具 | AppID |
|---|---|---|---|
| `miniprogram/` | 微信小程序 | [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) | `wx86f259b92c921ac9` |
| `miniprogram-douyin/` | 抖音小程序 | [抖音开发者工具](https://developer.open-douyin.com/) | `ttYOUR_DOUYIN_APPID_HERE`（待替换） |

## 快速开始

### 微信版
用微信开发者工具打开 `miniprogram/` 目录即可。

### 抖音版
1. 把 `miniprogram-douyin/project.config.json` 里的 `appid` 换成真实抖音 AppID
2. 后端 `/api/auth/login` 增加抖音 `jscode2session` 分支
3. 抖音开发者工具打开 `miniprogram-douyin/` 目录
4. 真机回归（清单见 `miniprogram-douyin/README.md`）

## 两端差异概览

| 维度 | 微信 | 抖音 |
|---|---|---|
| API 命名空间 | `wx.*` | `tt.*`（经 `utils/platform.js` 适配为 `platform.*`） |
| 主题色 | `#07C160` | `#FE2C55` |
| 头像昵称 | `chooseAvatar` / `type=nickname` | 手动选图 + 普通 input |
| 客服 | `open-type="contact"` | 已移除（待接抖音 IM） |
| 聊天选文件 | `wx.chooseMessageFile` | 不支持 |
| 登录 | 微信 code2session | 抖音 code2session（带 `platform:'douyin'`） |
| 朋友圈分享 | 支持 | 不支持 |

## 代码同步策略

两端业务逻辑一致，差异仅在平台层。改代码时：

1. **纯业务 bug / 新功能**：两端都要改，建议用 diff 工具对照（`diff -ru miniprogram miniprogram-douyin` 排除 `utils/platform.js`、`README.md`、`project.config.json`）
2. **平台特有差异**：只改对应端（例如微信端的客服按钮、抖音端的登录分支）
3. **未来多端**：如再接入支付宝/百度/快手，继续沿用 `utils/platform.js` 适配层思路；若端数达到 4 个以上，可评估迁移到 Taro/uni-app

## 其他文档

- `PROJECT_NOTES.md` - 项目踩坑记录、API 配置、数据模型（微信版为主，大部分同样适用于抖音版）
- `miniprogram/README.md` - 微信版详细说明
- `miniprogram-douyin/README.md` - 抖音版详细说明、真机回归清单
- `VERSION` - 当前版本号
