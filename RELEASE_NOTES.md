# 小黑桌宠 v1.5.0

本次桌面版加入本机 Codex 助手，Chrome 扩展同步版本号，保留原有小黑动作与设置。

## 新增本机 Codex 能力

- 点击小黑或托盘「小黑助手…」，展开暖白 / 淡紫气泡。
- 查看会话、真实计划步骤、当前操作与回复，收到任务完成提醒。
- 从气泡继续发送要求、追加运行中任务，或停止当前轮。
- 授权卡显示具体命令或文件范围，可逐次允许、拒绝或回答提问；过期请求失效。
- 沿用本机 Codex 的 ChatGPT 登录，支持已有 Plus 套餐用量，不需要 OpenAI API Key。
- 已有 Codex 会话可通过 hooks 接入；需在 Codex 的 /hooks 或 Settings > Hooks 审阅信任，并重启尚未加载配置的旧会话。
- MiniMax 简单问答保留独立入口，当前尚未接入 API，不会将问答误发成 Codex 任务。

保留自动活动、待机、蹦跶、滚动、暗中观察、淋雨、拖动和右键动作菜单。

## 下载与更新

先从系统托盘 / 菜单栏退出旧版桌宠，再安装新版本。使用原安装位置更新，本地设置继续保留。

- **Windows 10 / 11 x64**：下载并运行 `MyPetBuddy-Setup-1.5.0.exe`。
- **macOS Intel / Apple Silicon**：下载 `MyPetBuddy-1.5.0-universal.dmg`，打开并将应用拖入 Applications，替换旧版。
- **Chrome**：下载 `my-pet-buddy-chrome-1.5.0.zip`，解压后通过 `chrome://extensions/` 的开发者模式加载；更新后刷新普通网页。Codex 气泡属于桌面版。

安装后，在气泡的连接设置里连接本机 Codex CLI；找不到程序时可手动选择其路径。只有 Codex 桌面应用而未安装 CLI 时，还需要安装 CLI。

桌面安装包未签名，首次打开可能需要系统确认。应用不自动下载更新。`SHA256SUMS.txt` 提供三个下载文件的校验值。
