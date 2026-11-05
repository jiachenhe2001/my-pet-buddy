# My Pet Buddy — Desktop Edition 🐾

macOS / Windows 本地桌宠。与 Chrome 版共用项目根目录的 `observer.js` 和
`pets/observer/` 原始素材，`pets.js` 形象注册表；默认只内置小黑，新增形象后可在下拉框切换。

## 使用

- 启动即显示小黑；点击菜单栏（macOS）或系统托盘（Windows）的宠物图标打开面板。
- 支持自动活动、待机、原地蹦跶、滚动、暗中观察、淋雨；滚动使用 **2-9～2-16**。
- 单击小黑蹦跶，拖动调整位置，右键选择动作、暂停或隐藏。
- 隐藏后，右键托盘图标选择 **Show Pet**，或打开面板顶部开关即可找回。
- 面板可调整大小、暂停动画、重置位置、切换宠物和主题。
- 安装后可断网运行；素材全部随应用打包，设置保存在本机，不自动检查或下载更新。
- Chrome 与桌面版使用同一套素材和动作，各自保存设置，可以同时运行。

## 安装包

请使用本仓库构建的安装包。

优先从 [最新版本下载页](https://github.com/jiachenhe2001/my-pet-buddy/releases/latest) 获取 `.exe` / `.dmg` 安装包。

开发构建也可在本仓库的 [Actions → Desktop checks](https://github.com/jiachenhe2001/my-pet-buddy/actions/workflows/desktop-checks.yml)
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

## 小黑助手：本机 Codex

点击小黑或托盘右键菜单的「小黑助手…」打开暖白气泡。可以查看任务状态、真实步骤计划和回复，收到完成提醒，继续发消息、停止当前轮，或逐次点击「允许此次 / 拒绝」。拖动、右键动作菜单和原有动画继续可用。

1. 本机需有 **Codex CLI**，并已用 ChatGPT 账号登录。小黑沿用这个登录与配置，适用于你的 Plus 用量，不需要 OpenAI API Key。只有 Codex 桌面应用而未安装 CLI 时，还需要安装 CLI。
2. 启动桌宠，在气泡连接设置里点击「连接 Codex」。找不到程序时点击「选择程序」指定 `codex` / `codex.exe` / npm 的 `codex.cmd`。
3. 点击「＋」选择本机项目目录，新建小黑控制的 Codex 任务。运行中可追加要求；需要确认时，气泡展示具体操作与按钮。收起气泡不会结束任务。
4. 要接入已有 Codex 会话，点击「接入已有会话」。这会合并并备份用户级 `~/.codex/hooks.json`。在 CLI 的 `/hooks`（桌面端 Settings > Hooks）审阅并信任新增 hooks，重启尚未载入配置的旧会话。移除接入只删除小黑添加的条目。

历史会话不代表实时运行状态。已有会话的后续消息使用 Codex 的 queue；若没有可恢复的本机 daemon，界面会提示消息已排队但未确认恢复，需要回原 Codex 会话继续。不会另起一个进程接管正在运行的会话。较旧 CLI 缺少这些能力时请更新 CLI。

问答标签先保留 MiniMax 入口，当前明确禁用发送，下一阶段再接你的 MiniMax API。问答不会被误发成 Codex 任务。

验证：根目录运行 `npm test`、`npm run test:assistant`、`npm run test:desktop`，以及 `npm test --prefix desktop`。原生 Electron 测试在 Linux 上需要 `xvfb-run --auto-servernum npm run test:desktop`。测试使用独立临时配置和模拟协议服务，不消耗模型额度。完整交互与接入设计见 [companion-design.md](../docs/companion-design.md)。
