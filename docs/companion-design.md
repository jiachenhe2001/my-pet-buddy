# 小黑助手

## 本次范围

一个头顶气泡，两种独立模式。本次实现本机 Codex 的状态、步骤、完成提醒、继续输入、中断和逐次授权。沿用 Codex 的 ChatGPT 登录，不配置 OpenAI API Key。MiniMax 简单问答只保留入口和未接入提示，下一阶段再接 API。

## 界面

- 暖白气泡、淡紫强调色，约 400px 宽。点击小黑或托盘的「小黑助手…」展开，拖动与右键菜单继续使用原交互。
- 顶部切换 Codex / 问答，下面是会话、状态、真实计划步骤、消息和输入框。不推算任务百分比。
- 需要授权时显示所属会话、目录、原因、命令或文件详情，以及「拒绝 / 允许此次」。缺失操作详情时不能允许。
- 权限请求明确标注「本轮」，只授予这轮请求的权限；普通命令不提供全局自动授权或永久允许。
- 会话和模式分别保留草稿。新授权自动切到对应任务，避免把另一任务的输入带过来。
- 收起气泡继续运行任务。普通进度不抢焦点，需要输入或完成时显示气泡及系统提醒。连接设置展开后替换对话区，适应小窗口。

## 本机接入

| 来源 | 状态与授权 | 后续输入 |
| --- | --- | --- |
| 小黑新建的会话 | 本地 `codex app-server --listen stdio://`，订阅 JSON-RPC 事件并回应服务器请求 | 空闲时开始新轮，运行中 steer，或中断选中任务 |
| 已安装并信任 hooks 的 Codex 会话 | 生命周期事件上报到回环地址，PermissionRequest 同步等待用户决定 | `codex queue --thread=… --message=… --resume`，明确区分已排队与未确认恢复 |
| 历史会话 | 分页读取历史，不推断实时运行状态 | 使用上述队列，不另起进程争抢同一会话 |

独立启动 app-server 不会自动控制其他运行中的 Codex 进程。旧会话需先接入 hooks；CLI 用 `/hooks`，支持 hooks 的 Codex 桌面端可在 Settings > Hooks 审阅。重启未加载新配置的旧会话。较旧的 CLI 缺少 queue/hooks 时显示错误和返回原会话的提示。

## 进程与授权

- Electron 主进程负责子进程、桥接和系统通知；独立的可聚焦气泡窗口通过白名单 IPC 调用。原桌宠覆盖层继续不抢焦点、支持透明区域穿透。
- Codex 使用自己的认证存储。界面只接收是否已登录与套餐类型，不接收 token 或原始日志；任务发送要求 ChatGPT 认证。
- hooks 仅监听 `127.0.0.1`，随机令牌认证，拒绝浏览器 Origin。配置描述文件限制为当前用户读取。安装合并已有 hooks 并备份，移除只删除自己的条目。
- 每次授权绑定来源、连接代次、会话、轮次与请求 ID；完成、断线或换轮后失效，重复按钮无效。缺失、超时或进程退出不自动允许，回到 Codex 原确认流程。
- 退出整个桌宠前提示仍在运行的受控任务。退出不会结束其他独立 Codex 进程；其未决 hook 回退到原流程。

## 验证入口

- `npm test`：共享桌宠引擎回归。
- `npm test --prefix desktop`：真实 JSON-RPC 子进程 fixture、授权/拒绝、计划、失败/断线、输入、队列、hook HTTP 往返、配置合并及定位。
- `npm run test:assistant`：真实 Chromium 渲染与输入，只替代 Electron IPC；后端仍运行真实 stdio 子进程和回环 HTTP。
- `npm run test:desktop`：原生 Electron 覆盖层及气泡窗口，真实 preload/IPC、授权按钮、独立 hook 可执行程序和收起后任务存活。Linux 需要 Xvfb。

测试使用独立临时配置和协议 fixture，不读取真实账号，也不调用模型。macOS/Windows 安装包由 Desktop checks 构建，包含 assistant 页面。

协议参考：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Hooks](https://learn.chatgpt.com/docs/hooks)、[Queue](https://learn.chatgpt.com/docs/developer-commands)。
