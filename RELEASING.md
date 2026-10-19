# 构建与分发

Chrome 与 Desktop 独立分发，各自的版本号在 `manifest.json` 与 `desktop/package.json`。

## Chrome

加载项目根目录的未打包扩展。需要 ZIP 时，只打包 `manifest.json`、`pets.js`、`observer.js`、`content.js`、
`popup.html`、`popup.js`、`popup-controller.js`、`popup.css`、`pets/` 和 `icons/`。

发布前运行根目录 `npm test` 和 `npm run test:browser`。

## Desktop

在 `desktop/` 执行 `npm ci`、`npm test`，再运行 `npm run dist:win` 或 `npm run dist:mac`。
共享脚本、样式与素材会自动复制到生成的 `desktop/assets/`。安装包生成到 `desktop/release/`，不自动上传。

PR 的 Desktop checks 会验证真实 Electron，并分别构建 Windows / macOS 安装包。
手动运行 Desktop installers 工作流，或推送与桌面版本号对应的 `vX.Y.Z` 标签，也会生成安装包。
这些工作流将安装包保存为 Actions artifacts，不创建 GitHub Release；应用不自动检查更新。

分发时保留项目 `LICENSE` 和桌面安装器 `build/license.txt`。
