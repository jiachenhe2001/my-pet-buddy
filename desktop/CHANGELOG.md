# Changelog — My Pet Buddy (Desktop)

All notable changes to the **desktop app** are documented here.
This is separate from the browser extension (see the repo root) — the two ship
independently and have their own version numbers.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Note: versions 1.0.0–1.0.3 were internal test builds during development.
> **1.0.4 is the first public desktop release.**

## [Unreleased]

暂无。

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

[Unreleased]: https://github.com/jiachenhe2001/my-pet-buddy/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/jiachenhe2001/my-pet-buddy/releases/tag/v1.0.4

