# 精修家项目交接文档

> 最后更新：2026-08-13

## 一、项目概述

- **项目名称**：P图修图-精修家
- **项目类型**：微信小程序（原生开发，不做 App）
- **核心功能**：AI 图片精修、废片修复、批量修图、部位调节
- **核心 AI**：豆包 Doubao-Seedream-5.0-pro（火山方舟 ARK 平台）
- **主题色**：微信绿 #07C160
- **产品文档**：`output/20260810_155447/stage3/output.docx`

## 二、技术架构

```
miniprogram/
├── app.js / app.json / app.wxss     # 全局入口、4Tab配置、全局样式
├── components/                       # 自定义组件
│   ├── dual-slider/                  # 双向零点滑块（部位调节）
│   ├── ring-progress/                # 圆环进度
│   └── compare-slider/               # 前后对比滑块
├── pages/                            # 11个页面
│   ├── index/                        # 首页（选图入口+4个工具）
│   ├── ai-retouch/                   # AI精修选图/模板/提示词
│   ├── progress/                     # 生成进度页（3列网格+动画）
│   ├── compare/                      # 结果对比页（核心页面，最复杂）
│   ├── records/                      # 生成记录（7天销毁+多选管理）
│   ├── album/                        # 云相册
│   ├── mine/                         # 我的
│   ├── body-adjust/                  # 部位调节
│   ├── text-edit/                    # 无痕改字
│   ├── cutout/                       # 智能抠图
│   └── erase/                        # 智能消除
└── utils/
    ├── ark-config.js                 # 豆包ARK配置（apiKey/model/提示词）
    ├── ai-service.js                 # AI调用层（压缩+重试+base64+取消）
    ├── task-runner.js                # 全局后台任务运行器（单例+发布订阅）
    ├── task-status.js                # 任务状态常量+工具函数
    ├── storage.js                    # 本地存储（记录/相册/7天销毁）
    ├── templates.js                  # 8个精修模板提示词
    └── picker.js                     # 统一选图（相册/拍照/聊天记录）
```

### 关键架构决策

1. **全局任务运行器**（`task-runner.js`）：图片生成任务从 progress 页抽离为全局单例，页面退出/切后台后任务继续运行。使用发布订阅模式（Set<listener>）推送进度。
2. **数据存储**：全部走微信本地 Storage（`wx.setStorageSync`），无后端。记录 7 天自动销毁，云相册永久保存。
3. **AI 调用直连**：前端直连豆包 ARK API（联调阶段），正式上线需后端中转。所有图片转 base64 传输。

## 三、核心流程

```
首页选图 → ai-retouch（选模板+写提示词）→ progress（全局runner逐张调ARK）
→ compare（查看结果/再次调节/保存）→ records（记录管理）
```

- 每张图生成成功后，旧 `resultUrl` 推入 `history` 数组，新 URL 成为当前 `resultUrl`
- 版本历史：`[原图, 精修1, 精修2, ...]`，支持前后导航和提示词查看
- 批量任务用唯一 `batchId` 关联所有记录项

---

## 四、踩坑记录与 Bug 解决方案

### 1. 模式切换图片闪烁（反复修了3次才根治）

**现象**：从"快捷调节"切到"AI 调节"时，图片闪一下，有放大缩小的感觉。

**排查过程**：
- 第一次：以为是面板高度变化导致舞台重排，加了 `min-height: 300rpx` → 没完全解决
- 第二次：发现 AI 面板实际高度约 326rpx > 300rpx，容器仍会撑高 26rpx
- 第三次（根因）：两个问题叠加：
  1. 面板用 `wx:if` 切换，销毁/重建原生 `<textarea>` 组件触发重绘
  2. 面板高度不同导致舞台 flex:1 收缩，image aspectFit 重算

**最终方案**：
- 容器 `.adjust-wrap` 设固定 `height: 360rpx; position: relative`
- 两个面板都 `position: absolute` 叠放
- 用 `hidden` 属性切换显隐（不销毁 DOM/textarea）
- 切换时舞台高度 0 变化，图片 0 重排

**教训**：微信小程序中 `wx:if` vs `hidden` 对原生组件（textarea/input/map/video）的渲染影响很大；flex 布局中图片区高度变化会触发 aspectFit 重算。

---

### 2. 进度条卡在 90% 不动（公式不连续）

**现象**：再次调节的生成进度到 90% 就卡住，没有小数位。

**根因**：进度公式有断裂点——
- 线性段：0~12s 匀速走到 90%
- 慢爬段：`81 + 9*(1-exp(-over/τ))`，从 **81** 开始
- 12s 瞬间值从 90 跌回 81，被 `if(val > progress)` 拦截后永远卡在 90

**修复**：
- 慢爬段改为 `90 + 9*(1-exp(-over/τ))`，从 90 连续上升到 99
- 上限从 95 改为 99
- 新增 `genProgressText` 字段用 `toFixed(2)` 显示两位小数

**教训**：分段动画公式必须保证段间连续，否则"只增不减"的守卫会导致永久卡住。

---

### 3. 新任务进度瞬间跳到 99%

**现象**：点击生成后，进度条一秒内就到了 99%，AI 还没返回。

**根因**：两个 bug 叠加：
1. `task-runner.js` 在每张图**开始处理时**（AI 还没返回）就发了 `notify('item-update', {status: PROCESSING})`，而 `progress.js` 对所有 item-update 都调 `advanceSegment()`，单图直接把进度抬到 90%
2. `_segTotal` 初始值为 1，守卫条件 `!this._segTotal` 永远为 false，批量任务段数不更新

**修复**：
- item-update 只在终态（COMPLETED/FAILED/CANCELLED/TIMEOUT）时才调 `advanceSegment()`
- `_segTotal` 初始值改为 0，让初始化守卫正确工作
- PROCESSING 状态只刷新网格显示，不推进进度条

**教训**：发布订阅模式中，事件语义必须精确——"开始处理"和"处理完成"是不同的事件，不能共用同一个回调逻辑。

---

### 4. 任务失败后新任务永远卡 99%

**现象**：一个任务失败后，再上传新图片，进度页永远显示 99%。

**根因**：`runLoop()` 中部分代码（`storage.updateRecord`、`notify`）在 try/catch 外面，如果抛异常，async 函数 reject，`running` 永远为 `true`。后续所有 `startBatch()` 调用都命中 `if(running) return` 幂等返回。

**修复**：整个 for 循环包在 `try/finally` 中，`finally` 块保证：
- `running = false`
- `notify('done')` 必定执行
- `currentBatch = null`

**教训**：异步循环必须用 try/finally 保证状态重置，不能依赖"正常情况下不会抛错"。

---

### 5. 二次捏合缩放时图片跳位

**现象**：放大图片后松手，再次双指捏合，图片瞬间移位。

**根因**：缩放公式 `imgTx = ox * (1 - scale)` 忽略了已有的平移量，每次新捏合都以原始锚点重新计算，导致图片跳到新的焦点位置。

**修复**（ratio-based 公式）：
```js
const ratio = scale / this._pinchStartScale;
const tx = ox * (1 - ratio) + this._pinchStartTx * ratio;
const ty = oy * (1 - ratio) + this._pinchStartTy * ratio;
```
已有平移量按缩放比例等比缩放，保持视觉连续性。

**教训**：手势变换中，新的手势必须基于手势开始时的状态（startScale/startTx/startTy），不能基于初始状态。

---

### 6. 批量记录混入旧数据（选2张显示6张）

**现象**：选 2 张图，进度页显示 6 张。

**根因**：`loadBatchItems()` 仅按 `batchTotal` 过滤，混入了之前同张数批次的记录。

**修复**：
- `ai-retouch.js` 每次提交生成唯一 `batchId`（`batch_${Date.now()}_${random}`）
- 写入每条记录
- progress/compare 页 URL 透传 batchId，优先按 batchId 过滤
- 旧数据回退按 batchTotal 过滤

**教训**：批量数据必须有唯一关联 ID，不能仅靠数量等非唯一字段匹配。

---

### 7. 大图上传失败（间歇性"所有图片处理失败"）

**根因**：
1. 手机照片 3-12MB，base64 后膨胀 33%，请求体过大
2. API 零重试，网络抖动/429/5xx 立即失败
3. 错误信息被吞，只显示"处理失败"看不到原因

**修复**（`ai-service.js`）：
- `compressImageIfNeeded()`：>2MB 先压 quality=80，仍 >2MB 再压 60
- `arkRequest()` 包装：对 429/500/502/503/504 和网络错误自动重试 3 次，退避 1s/2s/4s
- 400/401 等参数/鉴权错误不重试
- 错误对象附带 statusCode/code/retryable，console.error 打印完整信息
- 分辨率从 1K 改为 1.5K（同价，效果更好）

---

### 8. CDN 签名 URL 导致黑图

**现象**：第二次精修（用 resultUrl 作参考图）出黑图。

**根因**：ARK 返回的 CDN 签名 URL 有过期时间/防盗链，直接传给 API 作参考图时下载失败。

**修复**（`ai-service.js`）：
- `isRemoteUrl()` 正确识别真实公网 URL（排除 wxfile://、http://tmp/ 等本地路径）
- `downloadToBase64()` 下载远程图转 base64
- `generateEdit()` 所有图片一律转 base64 再传 ARK，不直接传 CDN URL

---

### 9. 保存弹窗中点缩略图选图，弹窗消失

**现象**：批量保存时，点缩略图勾选其他图片，弹窗直接关闭。

**根因**：`.sheet-mask`（z-index:100）覆盖了 `.batch-nav`（无 z-index），缩略图的点击事件落到了 mask 上，触发了 `closeSaveSheet`。

**修复**：保存弹窗打开时给 `.batch-nav` 加 `.above-mask` 类（z-index:102），让缩略图在遮罩之上可点击。

**教训**：z-index 层级必须在开发时统一规划，弹窗/mask/浮层的层级关系要明确。

---

### 10. 放大后拖动图片，页面跟着滚动

**根因**：stage 用 `bindtouchmove` 不阻止事件冒泡，单指拖动时 touchmove 冒泡到页面。

**修复**：stage 改为 `catchtouchmove`（不是 bind），捕获移动事件不冒泡。

**教训**：微信小程序中 `bind` 冒泡、`catch` 拦截；全屏手势区域必须用 catch 防止滚动穿透。

---

### 11. 删除按钮删了整条记录而非单个版本

**现象**：一张图有多个精修版本，点删除把整张图（含原图）都删了。

**修复**（`compare.js` doDeleteVersion）：
- 原图版本（isOriginal）不显示删除按钮
- 删历史版本：从 `item.history` 数组移除对应项
- 删最新 resultUrl：将最后一个 history 项提升为新 resultUrl
- 所有精修版本删光后才从存储移除记录

---

### 12. 初始精修走的是 mock 数据

**现象**：初始版本提交后秒出结果，但不是真实 AI 生成。

**根因**：`ai-service.js` 有 `USE_MOCK=true`，progress 页轮询 mock 状态，resultUrl 写死为 `mock_result_${taskId}`。

**修复**：
- `ai-retouch.js` 提交时直接为每张图创建本地记录，跳转 progress
- `progress.js` 逐张调 `aiService.generateEdit()` 真实调用 ARK
- 移除 mock 上传/轮询逻辑

---

### 13. 从聊天记录选图格式兼容问题

**现象**：从微信聊天记录选的 png 图片处理失败。

**根因**：`fileToBase64()` 硬编码 MIME 为 `image/jpeg`。

**修复**：根据文件后缀推断 MIME（png/webp/gif/bmp/heic）；`wx.chooseMessageFile` 需基础库 2.5.0+，type:'image' 时不传 extension 参数。

---

### 14. 首页整页可左右滑动

**根因**：某些元素宽度超出视口。

**修复**：`.page` 和全局 `page` 加 `width:100%; box-sizing:border-box; overflow-x:hidden`。

---

### 15. progress 页停止按钮无法真正取消

**修复**：`ai-service.js` 新增 `createCancelToken()`，`arkRequest` 将 `wx.request` 的 RequestTask 注册到 signal，`abort()` 时调 `task.abort()`；重试循环每轮检查 `signal.cancelled`。

---

### 16. 进入正在处理的任务进度清零

**现象**：从生成记录点进处理中的任务，进度从 0 开始。

**修复**：新增 `syncFromRunner()`，从全局 task-runner 读取真实 `getProgress()`/`getCompletedCount()`，以真实值启动动画。

---

### 17. 失败任务"重新精修"跳到上传页

**修复**：新增 `taskRunner.retryBatch(batchId)`，将失败记录重置为 QUEUED 后原地重启，records 页确认后直接 navigateTo 到 progress 页。

---

## 五、进度动画算法（时间驱动分段）

progress 页和 compare 页共用一套进度算法，核心参数：

- `_TICK = 50ms`（每帧间隔）
- `_SEG_DURATION = 12000ms`（每段匀速时长）
- `_CREEP_TAU = 4000ms`（慢爬时间常数）
- `_SOFT_CAP = 99`（软上限，完成才跳100）

算法逻辑：
1. 0~90% 平均切成 N 段（N = 图片张数），每段 90/N%
2. 每段内：[0, 12s) 匀速从段首走到段内 90%；超时后按指数慢爬逼近段尾
3. 一张图真正完成（成功或失败）才调 `advanceSegment()` 跳到下个基准点
4. 全部完成：stopAnim + 直接跳 100%

**关键注意**：PROCESSING 状态不能触发 advanceSegment，否则会瞬间跳段（见踩坑 #3）。

---

## 六、API 配置

豆包 ARK 配置在 `utils/ark-config.js`：
- **API Key**：硬编码在文件中（联调阶段），正式上线必须后端中转
- **模型**：`doubao-seedream-5-0-pro-260628`
- **分辨率**：1.5K（与 1K 同价 ¥0.3/张，效果更好）
- **水印**：false
- **请求域名**：`ark.cn-beijing.volces.com`（需在微信后台配置 request 合法域名）

调用链路：
```
compare/progress → ai-service.generateEdit()
  → compressImageIfNeeded()（大图压缩）
  → fileToBase64()（本地图）或 downloadToBase64()（远程CDN图）
  → arkRequest()（带3次指数退避重试 + cancelToken）
  → POST /api/v3/images/generations
```

---

## 七、数据模型

### 记录（storage records）

每条精修记录的关键字段：

```js
{
  id,              // 记录唯一ID（= 单图时的 taskId）
  taskId,          // 任务ID（单图时等于 id）
  batchId,         // 批次ID（批量时关联同组图片）
  batchIndex,      // 批次内序号（从1开始）
  batchTotal,      // 批次总数
  isBatch,         // 是否批量
  type,            // 'retouch' | 'text-edit' | 'cutout' | 'erase' | 'body-adjust'
  status,          // queued/processing/completed/failed/cancelled/timeout
  originalUrl,     // 原图路径（wxfile://）
  resultUrl,       // 当前精修结果URL（CDN地址）
  history,         // [{url, prompt, at}] 历史精修版本
  prompt,          // 本次使用的提示词
  negativePrompt,  // 负面提示词
  lastPrompt,      // 最近一次AI调节的提示词
  templateId,      // 使用的模板ID
  errorMsg,        // 失败原因
  resultUrl,       // 结果图URL
  createdAt,       // 创建时间戳
  expireAt,        // 7天后过期时间戳
  savedToAlbum     // 是否已转存云相册
}
```

---

## 八、待办与注意事项

### 上线前必须处理
1. **API Key 安全**：当前硬编码在前端，必须改为后端中转
2. **配置合法域名**：微信后台添加 `ark.cn-beijing.volces.com`
3. **AppID**：当前用的 touristappid（游客模式），需替换为正式 AppID
4. **内容安全审核**：接入微信内容安全 API（imgSecCheck）

### 已知限制
1. 批量最多 9 张（chooseMedia count 上限）
2. 大图自动压缩到 2MB 以下
3. 记录仅本地保存 7 天，到期自动销毁
4. 页面栈深度限制：progress → compare 用 redirectTo 避免栈溢出

### 开发调试
- 用微信开发者工具打开 `miniprogram/` 目录
- 所有 JS 文件修改后用 `node -c` 校验语法
- 真机测试时注意 CDN 图片下载和 base64 性能
- 控制台搜索 `[task-runner]`、`[compare]`、`[ai-service]` 查看各模块日志
