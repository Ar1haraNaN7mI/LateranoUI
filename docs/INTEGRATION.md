# 接入 LateranoUI

LateranoUI 是启动展示层。会话、模型、技能加载、插件运行和密码验证由宿主实现；静态页面不能代替这些后端功能。即用的官方适配器位于 [`integrations/native-startup`](../integrations/native-startup)，安装步骤见 [README](../README.md)。

## 资源与页面入口

将 `docs/startup-*` 的 HTML、JS、CSS，以及依赖的 `docs/assets` 字体、徽章、语音和许可文件一起部署。保持相对路径，语音的 `/assets/voice/...` 路径也应可访问。推荐与宿主同源提供 `/startup-preview.html`；若挂在路径前缀下，需要像原生适配器的 `bridge.mjs` 一样明确映射接口和语音地址。

支持页面参数：

| 参数 | 含义 |
| --- | --- |
| `theme=light` / `theme=dark` | 本次播放的实际明暗配色 |
| `motion=reduce` | 显示静态完成构图；同样遵守系统减少动态效果偏好 |
| `embed=1` | 启用宿主完成通知，需要下面两个参数 |
| `parentOrigin` | 宿主的完整 HTTP(S) origin，不带路径 |
| `channel` | 每次播放生成的独立通道，16–128 位字母、数字、下划线或连字符 |

本仓库固定为拉特兰风。宿主可以保留 `style=laterano` 以兼容旧接口，但不应提供切换到莱茵风的入口。明暗在创建本次 iframe 时决定；不要为了更新主题反复重建 iframe，否则会丢失当前输入、重启演出及验证流程。

## 真正的数据接口

[`startup-local.js`](startup-local.js) 默认使用同源请求，包含 `credentials: 'same-origin'`。读取访问状态与资料使用 `cache: 'no-store'`，写入和加载带 `X-DSH-Token`。下列 JSON 是字段示例，不是演示清单或可使用的令牌。

### 访问状态

`GET /api/access`：

```json
{
  "enabled": true,
  "unlocked": false,
  "token": "<由宿主签发的本地请求令牌>",
  "profile": { "username": "OPERATOR", "badge_id": "DSH-0001", "visual_style": "laterano" },
  "sound": true
}
```

`enabled` 表示宿主是否设置访问密码；`unlocked` 表示当前 Cookie 对应的真实会话。宿主应在资料写入、清单读取及实际工作台接口上执行同一验证，不能仅隐藏前端内容。

启用密码时，`POST /api/access/unlock` 接收 `{"password":"<用户本次输入>"}`，成功后设置宿主会话 Cookie，并返回上述访问结构。前端随后重新读取实际 Cookie 状态；验证成功后再次读取完整资料。每次新开屏、重播或从页面缓存恢复均重新要求本次证明，历史 Cookie 不替代本次输入；重播会撤销尚未完成的旧验证。密码、模型 Key 和会话 Cookie 不应放入页面 URL、静态配置、日志或仓库。

如果宿主没有独立的启动密码接口，可以让 `/api/access` 返回 **404**，再由受宿主自身登录保护的 `/api/profile` 返回真实资料。官方插件就是此兼容模式：先通过官方 `connection.requestRejection`，不伪造一套额外密码。

### 个人资料

`GET /api/profile` 返回：

```json
{
  "mode": "local",
  "token": "<由宿主签发的本地请求令牌>",
  "username": "OPERATOR",
  "badge_id": "DSH-0001",
  "visual_style": "laterano",
  "workspace": "<当前工作区>",
  "sound": true,
  "runtime": "native",
  "inventory_mode": "mounted"
}
```

`inventory_mode: "mounted"` 表示读取运行时已挂载的能力；`"discover"` 表示宿主正在执行真实发现／加载。`runtime: "native"` 用于官方原生适配器。不要把配置文件里声明但未启用、未成功挂载的插件当成已加载能力。

`POST /api/profile` 接收局部更新，例如 `{"username":"OPERATOR","badge_id":"DSH-0001"}`，并返回保存后的 `username`、`badge_id`、`visual_style`。宿主应保留未传字段，确认实际落盘后再返回成功。本仓库始终使用 `laterano`；资料保存不应创建一个只在显示上改变、下次启动即失效的假设置。

### 能力读取

`POST /api/load` 返回 `application/x-ndjson`，每行一个 JSON 事件。请求不含模拟清单。事件结构如下：

```json
{"type":"stage","stage":"skills","status":"loading"}
{"type":"item","kind":"skill","name":"<真实名称>","source":"<真实来源>","status":"loaded"}
{"type":"stage","stage":"skills","status":"complete"}
{"type":"stage","stage":"plugins","status":"loading"}
{"type":"stage","stage":"plugins","status":"complete"}
{"type":"complete","skills":[],"plugins":[],"issues":[],"elapsed_ms":0}
```

上例仅展示结构；真实响应的 `complete` 数组必须包含最终结果，不能在已返回项目后无条件清空。`kind` 为 `skill` / `plugin`；项目状态支持 `loaded`、`error`、`skipped`。插件最终项目可附 `id`、`tool_count`，问题项含 `kind`、`name`、`message`。空目录可以真实返回空数组；部分失败写入 `issues`。

前端以 `complete` 为最终权威结果，连接提前结束视为错误。加载阶段允许逐条出现真实项目，完成后保留同一本书，不通过虚构数量或时间百分比装饰进度。原生适配器使用当前默认预设的 `skills.snapshot`、活跃的 `loader.entries` 和 `agentPresets.compositionInventory`；借用的作用域在读取后释放。

## iframe 与宿主的协作

`startup-embed.js` 向约定的 `parentOrigin` 发送：

```js
{ source: 'dsh-startup', channel, type }
```

`type` 为 `ready`、`profile-changed`、`unlocked`、`complete` 或 `skip`。宿主必须同时核对事件的 `origin`、`source === iframe.contentWindow`、本次 `channel` 和消息格式。`unlocked` 只是重新检查后端的信号，不是授权凭证；收到 `complete` / `skip` 后也应由实际登录状态决定能否展示工作台。

宿主的跳过按钮发送：

```js
{ source: 'dsh-harness', channel, type: 'request-skip' }
```

子页会先经过自己的访问门禁。不要直接卸载 iframe 并把“跳过动画”当作“跳过验证”。重播使用新通道，卸载后丢弃旧通道的延迟消息；网络错误提供重试，不能用超时自动解锁。

## 离线、异常与原生插件边界

只有 `/api/access` 与 `/api/profile` 都明确返回 **404** 时，独立页面才被识别为纯静态预览。网络失败、畸形响应、401、403 或服务故障都不代表允许访问。纯静态预览可观看几何演出，但不能读取本机清单、持久保存身份或向嵌入宿主宣告解锁完成。

官方插件将路由放在 `/__laterano_ui` 前缀下，由 `bridge.mjs` 映射本页请求；要求回环地址、匹配的 Host / Origin，以及写入令牌，并继续使用官方登录。这个可选覆盖层没有额外密码门禁，因此父页面的「返回 Harness」按钮可独立卸载失去响应的动画；官方本身仍负责登录和私有接口鉴权，不能将此恢复方式照搬为 Rust 密码门禁的解锁方式。挂载前记录标签页播放状态，同文档只允许一个覆盖层；会话存储不可用时不挂载可选动画。

它只支持固定版本 `@deepseek-ai/dsh@0.2.0-rc.2` 的本机 Web 入口，升级官方版本需重新验证这些接口。本仓库不提供独立 Rust 后端；已有的网页、Windows 桌面、TUI 与密码设置位于 [Rust 原项目](https://github.com/Ar1haraNaN7mI/deepseek-harness-rust-optimize)。
