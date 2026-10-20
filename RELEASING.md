# 构建与发布

本次 Chrome 与 Desktop 统一版本号，版本写入 `manifest.json`、两端 `package.json` 及对应锁文件。

## 发布新版本

1. 更新上述五个文件的版本号和锁文件中根包版本。
2. 更新 `RELEASE_NOTES.md`、`desktop/CHANGELOG.md`。
3. 将版本提交合入 `main`。`Publish version` 工作流自动运行，也可手动触发。

流程验证真实 Chrome 扩展、Electron 交互与单元测试，构建 Chrome ZIP、Windows x64 安装器和 macOS universal DMG。
全部成功后，使用当前提交创建版本标签和 GitHub Release，上传三个附件及 SHA256 校验文件。
已经公开发布的版本不会重复发布；上传中断留下的草稿可通过重跑流程继续上传。

## 本地构建

Chrome：在根目录运行 `python3 scripts/package-extension.py`，ZIP 位于 `release/`，保留 MIT 许可证。

Desktop：在 `desktop/` 执行 `npm ci`、`npm test`，再运行 `npm run dist:win` 或 `npm run dist:mac`。
共享脚本、样式与素材会自动复制到 `desktop/assets/`，安装包生成到 `desktop/release/`。
这些本地打包命令不自动上传；应用本身也不自动检查更新。

原有 Desktop checks / Desktop installers 工作流仍可独立构建 Actions artifacts。
