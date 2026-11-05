# Changelog — My Pet Buddy (Desktop)

All notable changes to the **desktop app** are documented here.
Since 1.4.0, desktop and the browser extension share a release version.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Note: versions 1.0.0–1.0.3 were internal test builds during development.
> **1.0.4 is the first public desktop release.**

## [Unreleased]

暂无。

## [1.5.1] - 2026-11-06

### Fixed
- 定时同步已有 Codex 会话的最新回复和轮次状态；刷新、重复选择会话也会补读最终答案，保留进度／答复阶段。
- 去掉常驻 Codex 标签，完成／待确认气泡约 7 秒后收起；后台完成不再自动展开聊天窗。
- macOS 透明桌宠层覆盖整个屏幕，允许拖到 Dock 所在的底部区域。
- 动作播放一轮后待机约 10 秒，自动活动间隔延长到 15–25 秒。
- 点击或键盘互动保持原动作，只显示互动气泡。
- 历史同步失败保留已有回复并重试，避免旧读取覆盖新任务、重复回复或重复完成提醒。

## [1.5.0] - 2026-11-05

### Added
- 小黑头顶助手气泡：本机 Codex 会话、真实步骤、回复和完成提醒。
- 继续输入、运行中追加要求、中断当前轮，以及逐次授权、拒绝和回答提问。
- 已有 Codex 会话的 hooks 接入；沿用 ChatGPT 登录，不需要 OpenAI API Key。
- MiniMax 问答独立入口，API 待下一阶段接入。

### Changed
- 保留原动画、拖动、右键菜单与本地设置；收起气泡后任务继续运行。
- 授权绑定连接、会话与轮次，断线或超时回到 Codex 原确认流程。
- macOS universal / Windows x64 安装包包含新增助手界面和本机后端。

## [1.4.0] - 2026-10-20

### Changed
- 默认使用小黑，移除旧静态宠物、巡游引擎及其设置和素材。
- Chrome / Desktop 共用可扩展形象注册表与简洁控制面板。
- 新增形象可切换并持久化；旧选择自动回落到小黑，现有动作、大小、暂停和位置保留。
- 打包前清空生成的素材目录，移除旧宣传入口，保留 MIT 许可证。

以下条目为历史版本记录。

## [1.0.5] - 2026-07-23

### Fixed
- **macOS:** clicking the menu-bar icon while in a fullscreen app no longer switches you back to the desktop Space before opening the popover. The app now runs as a proper agent app (`LSUIElement` / accessory activation policy), so focusing the popover appears on your current Space — including over fullscreen apps.

## [1.0.4] - 2026-07-22

### Added
- Desktop pet that walks across your **whole screen**, floating over every app (macOS + Windows).
- Menu-bar (macOS) / system-tray (Windows) control; the tray icon is your selected pet.
- **Popover panel** anchored under the menu-bar icon (opens on click, dismisses on blur), shown over the current Space — including fullscreen apps.
- **Pet Position** (bottom / middle / top) and **Motion Mode** (parade / left / right), matching the browser extension.
- Pick pet species + variant; click-to-pet floating hearts; periodic motivational messages; light/dark theme.
- Persistent settings (`electron-store`), launch-at-login, single-instance lock.
- Auto-update from GitHub Releases (`electron-updater`, packaged builds only).
- **Battery saver**: animation pauses when the overlay isn't visible (display asleep, locked, or fully covered).
- Cross-platform installers: universal macOS `.dmg` + Windows NSIS wizard (install-scope choice, MIT license page, desktop + Start Menu shortcuts, run-after-install).

### Notes
- Builds are currently **unsigned** — first launch shows a one-time OS prompt (macOS: right-click → Open; Windows: More info → Run anyway). Code signing is planned.

[Unreleased]: https://github.com/jiachenhe2001/my-pet-buddy/compare/v1.5.1...HEAD
[1.5.1]: https://github.com/jiachenhe2001/my-pet-buddy/releases/tag/v1.5.1
[1.5.0]: https://github.com/jiachenhe2001/my-pet-buddy/releases/tag/v1.5.0
[1.4.0]: https://github.com/jiachenhe2001/my-pet-buddy/releases/tag/v1.4.0
[1.0.4]: https://github.com/jiachenhe2001/my-pet-buddy/releases/tag/v1.0.4

