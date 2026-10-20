# My Pet Buddy 🐾

## 小黑桌宠：Chrome 与本地桌面双版本

Chrome 扩展与 macOS / Windows 桌面版均内置上传的三组透明 PNG，共 33 帧，保留原始图片。两端可以同时使用，各自保存设置。

| 动作 | 素材 |
| --- | --- |
| 暗中观察 | 1-1 ～ 1-11，探头后收回 |
| 原地蹦跶 | 2-1 ～ 2-5，往返播放 |
| 滚动 | 2-9 ～ 2-16，往返播放 |
| 待机 | 2-4、2-5，缓慢交替 |
| 淋雨 | 3-1 ～ 3-6，顺序循环 |

**在 Chrome 中安装当前项目：**

1. 下载此仓库代码并解压，或运行 `git clone https://github.com/jiachenhe2001/my-pet-buddy.git`。
2. 打开 `chrome://extensions/`，开启右上角的「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的项目根目录。
4. 打开或刷新一个普通 HTTP/HTTPS 网页，新安装时默认显示小黑。旧版宠物选择会自动回到小黑，动作、大小、暂停和拖动位置继续保留。

**使用：**单击小猫会蹦跶；拖动小猫可调整位置；右键或聚焦后按 `M` 打开动作菜单。扩展面板可选择动作、调整大小、暂停、重置位置或关闭显示。方向键可移动聚焦的小猫，`Esc` 关闭菜单。动作和位置会保存，其他已打开的网页会同步更新。自动模式在待机间隙随机播放其他动作；页面隐藏时暂停播放。形象下拉框目前只包含小黑；后续注册新形象后可直接切换。

素材按需预加载，切换动作后才显示新帧，避免闪烁；DOM 和样式放在 Shadow DOM 内，透明留白让网页继续接收点击。所有动画在本地播放，只使用原有的 `storage` 权限。Chrome 内部页面（如 `chrome://extensions/`）不能显示网页桌宠，安装或更新后请刷新普通网页。

**开发检查（Node.js 20+）：**

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

浏览器冒烟默认加载真实的未打包扩展。只有在仅支持 headless-shell 的测试环境中才使用 `PET_BUDDY_EMULATE_EXTENSION=1`，该模式仅模拟 `chrome.storage` 和 `chrome.runtime.getURL`，用于渲染、交互及同步检查，不替代真实扩展加载验证。CI 使用默认的真实扩展模式。

**在桌面中使用：**启动后默认在其他应用上方显示小黑，点击菜单栏／系统托盘图标打开设置。隐藏后，可从托盘右键菜单的 **Show Pet** 或面板顶部开关恢复。素材和设置全部本地保存，安装后可断网运行，不自动检查更新。安装包可从 [最新版本下载页](https://github.com/jiachenhe2001/my-pet-buddy/releases/latest) 获取，本地运行见 [`desktop/README.md`](desktop/README.md)。

两端复用 [`observer.js`](observer.js) 的动作、播放和拖动逻辑，桌面启动／打包时自动复制共享模块与素材。素材说明见 [`pets/observer/README.md`](pets/observer/README.md)。

## 新增形象

Chrome 与 Desktop 共用 [`pets.js`](pets.js) 形象注册表和 [`popup-controller.js`](popup-controller.js) 控制面板。
在 `pets/<形象ID>/` 放入动作素材，再注册名字、素材路径与动作配置，两版的形象下拉框、预览、右键菜单和托盘图标会一起接入。具体格式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

原版静态宠物、巡游引擎、位置／运动模式设置和旧宣传资源已移除。

## 许可证

保留 [MIT LICENSE](LICENSE) 及桌面安装器许可证，源文件中的版权归属继续有效。
