# 精修家小程序前端 - 开发总览

## 完成情况

✅ **全部 11 个页面 + 3 个核心组件 + 工具层已完成**，所有 JS/JSON 语法校验通过，可直接用微信开发者工具导入运行。

## 项目结构

```
miniprogram/
├── app.js / app.json / app.wxss        # 全局入口、配置、样式
├── project.config.json                  # 微信开发者工具项目配置
├── sitemap.json
├── images/                              # 8 个 TabBar 图标（普通/选中态）
├── components/
│   ├── dual-slider/                     # 双向零点滑块（部位调节，-100~100，红绿双色）
│   ├── ring-progress/                   # 圆环进度（Canvas 2D + DPR 适配）
│   └── compare-slider/                  # 前后效果对比滑块（拖拽分隔线）
├── utils/
│   ├── ai-service.js                    # AI 服务层（USE_MOCK=true，含上传/轮询/WebSocket降级）
│   ├── storage.js                       # 记录/云相册/模板/部位/7天销毁管理
│   └── task-status.js                   # 任务/批量/记录状态常量与重试配置
└── pages/
    ├── index/        首页（AI精修入口 + 工具箱4宫格 + 热门模板 + 精选效果）
    ├── ai-retouch/   AI精修（单张/批量选图、模板、提示词、强度、提交）
    ├── progress/     处理进度（圆环进度、批量缩略图网格、WebSocket/轮询）
    ├── compare/      效果对比（左右滑动对比、保存、分享、调参重试、存云相册）
    ├── text-edit/    无痕改字（触摸框选文字区域 + 替换文字）
    ├── cutout/       智能抠图（自动识别 + 擦除/恢复 + 背景切换）
    ├── erase/        智能消除（Canvas 涂抹画笔/橡皮擦）
    ├── body-adjust/  部位调节（8部位 + 双向滑块 + 已调列表 + 重置）
    ├── records/      生成记录（7天销毁提醒、倒计时、一键转存、下拉刷新）
    ├── album/        云相册（3列网格、预览、多选管理、保存到手机、删除）
    └── mine/         我的（微信头像昵称、会员卡片、统计、菜单、退出）
```

## 关键设计

- **主题色**：微信绿 `#07C160`，统一卡片圆角 20rpx，扁平风格
- **Mock 模式**：`utils/ai-service.js` 中 `USE_MOCK = true`，无需后端即可跑通选图→处理→对比全流程
- **状态机落地**：10 个状态机的核心逻辑已落到 `task-status.js` + `storage.js`（7天销毁、失败24h清理、重试退避、WebSocket降级轮询）
- **响应式**：使用 rpx 单位 + flex/grid 布局，适配不同屏幕
- **7天销毁**：records 页黄色警告横幅 + 每张卡片剩余时间倒计时（≤24h变黄色提醒）
- **登录**：`app.login()` 通过 wx.login 获取 code 换 token；mine 页支持微信头像昵称快速填写

## 运行方式

1. 打开**微信开发者工具**
2. 导入项目，目录选择 `miniprogram/`
3. AppID 可先用"测试号"（project.config.json 中已设为 touristappid）
4. 编译即可预览，Mock 模式下所有 AI 功能均可模拟跑通

## 接入真实后端时需修改

1. `app.js` → `globalData.baseUrl` 改为真实后端地址
2. `utils/ai-service.js` → 将 `USE_MOCK` 改为 `false`，核对真实接口字段
3. `project.config.json` → `appid` 改为真实小程序 AppID
4. 后端需实现：登录、图片上传(COS/OSS)、精修任务提交、任务状态查询/WebSocket、模板列表、会员/支付

## 后续待开发（非本次范围）

- 模板市场页（首页"查看更多"入口已预留 toast）
- 会员支付流程（mine 页会员卡片目前为权益展示弹窗）
- 我的模板/收藏/历史/反馈等二级页（菜单已预留，点击提示"开发中"）
- 真实微信分享卡片配置（onShareAppMessage 已加基础实现）
