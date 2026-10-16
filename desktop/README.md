# My Pet Buddy — Desktop Edition 🐾

macOS / Windows 本地桌宠。与 Chrome 版共用项目根目录的 `observer.js` 和
`pets/observer/` 原始素材，小黑与猫、狗、兔子等内置宠物都可在选择面板切换。

## 使用

- 点击菜单栏（macOS）或系统托盘（Windows）的宠物图标，选择「小黑 · 动态桌宠」。
- 支持自动活动、待机、原地蹦跶、滚动、暗中观察、淋雨；滚动使用 **2-9～2-16**。
- 单击小黑蹦跶，拖动调整位置，右键选择动作、暂停或隐藏。
- 隐藏后，右键托盘图标选择 **Show Pet**，或打开面板顶部开关即可找回。
- 面板可调整大小、暂停动画、重置位置、切换宠物和主题。
- 原有宠物仍支持位置、巡游、爱心和鼓励消息。
- 安装后可断网运行；素材全部随应用打包，设置保存在本机，不自动检查或下载更新。
- Chrome 与桌面版使用同一套素材和动作，各自保存设置，可以同时运行。

## 安装包

本 fork 的小黑版本需要使用本仓库构建的安装包；上游的商店 / Homebrew / Release
安装包不包含此修改。

在本仓库的 [Actions → Desktop checks](https://github.com/jiachenhe2001/my-pet-buddy/actions/workflows/desktop-checks.yml)
中打开成功的构建，从 Artifacts 下载 `desktop-mac` 或 `desktop-windows`，解压后安装其中的
`.dmg` 或 `.exe`。PR 检查和手动运行均可生成安装包；构建默认不发布 Release。

## 本地运行（Node.js 20+）

首次安装依赖需要联网；之后启动和动画播放不需要网络。

```bash
cd desktop
npm ci
npm start
```

`npm start` 自动从项目根目录复制素材与共享动画模块。更新素材后重新启动即可。

## 本地打包

```bash
npm run dist:mac   # 在 macOS 上生成 universal .dmg（Intel / Apple Silicon）
npm run dist:win   # 在 Windows 上生成 x64 .exe
```

文件位于 `desktop/release/`。这些命令只在本地生成安装包，不上传。
当前安装包未签名；首次安装可能需要在系统安全设置中允许打开。

## 检查

```bash
npm test                         # 在 desktop 目录运行单元检查
cd ..
npm ci
npm run test:desktop              # 真实 Electron 窗口、preload、IPC 与本地存储
```

Linux CI 使用 `xvfb-run --auto-servernum npm run test:desktop`。
无 Electron 运行环境时，`PET_BUDDY_EMULATE_DESKTOP=1` 仅替换 IPC，以浏览器检查同一套
本地 HTML、动画和交互；它不替代真实 Electron 验证。CI 同时验证 macOS / Windows 安装包构建。

MIT licensed — see [LICENSE](../LICENSE).
