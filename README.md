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
4. 打开或刷新一个普通 HTTP/HTTPS 网页，新安装时默认显示小黑。已有设置会保留，在扩展面板中选择「小黑 · 动态桌宠」即可切换。

**使用：**单击小猫会蹦跶；拖动小猫可调整位置；右键或聚焦后按 `M` 打开动作菜单。扩展面板可选择动作、调整大小、暂停、重置位置或关闭显示。方向键可移动聚焦的小猫，`Esc` 关闭菜单。动作和位置会保存，其他已打开的网页会同步更新。自动模式在待机间隙随机播放其他动作；页面隐藏时暂停播放。原有静态宠物仍可从下方图库选择。

素材按需预加载，切换动作后才显示新帧，避免闪烁；DOM 和样式放在 Shadow DOM 内，透明留白让网页继续接收点击。所有动画在本地播放，只使用原有的 `storage` 权限。Chrome 内部页面（如 `chrome://extensions/`）不能显示网页桌宠，安装或更新后请刷新普通网页。

**开发检查（Node.js 20+）：**

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

浏览器冒烟默认加载真实的未打包扩展。只有在仅支持 headless-shell 的测试环境中才使用 `PET_BUDDY_EMULATE_EXTENSION=1`，该模式仅模拟 `chrome.storage` 和 `chrome.runtime.getURL`，用于渲染、交互及同步检查，不替代真实扩展加载验证。CI 使用默认的真实扩展模式。

**在桌面中使用：**点击菜单栏／系统托盘图标，在面板中选择「小黑 · 动态桌宠」，即可在 Chrome 以外的应用上方显示。隐藏后，可从托盘右键菜单的 **Show Pet** 或面板顶部开关恢复。素材和设置全部本地保存，安装后可断网运行，不自动检查更新。安装包获取及本地运行见 [`desktop/README.md`](desktop/README.md)。

两端复用 [`observer.js`](observer.js) 的动作、播放和拖动逻辑，桌面启动／打包时自动复制共享模块与素材。素材说明见 [`pets/observer/README.md`](pets/observer/README.md)。

下方保留上游项目介绍。**上游商店、Homebrew 和旧 Release 安装包不包含本 fork 的小黑修改**；请按上方说明安装 Chrome 版，或按桌面文档获取本仓库构建的安装包。

---

**A tiny virtual pet that walks across your screen and keeps you company while you work — now on your browser AND your Mac & Windows desktop.** 🎉

Pick your buddy — cat, dog, bunny, hamster, or birdie — click 'em for a burst of hearts, catch a little motivational nudge when you need it, and let them parade around while you grind. No ads. No sign-up. 100% free and open source. Just vibes. 🐱🐶🐰

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-5.0%20⭐-green?style=for-the-badge&logo=google-chrome)](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne)
[![Microsoft Edge](https://img.shields.io/badge/Microsoft%20Edge-Add--ons-blue?style=for-the-badge&logo=microsoft-edge)](https://microsoftedge.microsoft.com/addons/detail/my-pet-buddy-virtual-pe/ffpmifppjfofiakekjaakgeiakkophad)
[![Version](https://img.shields.io/badge/Version-1.0-blue?style=for-the-badge)](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](https://github.com/nycanshu/my-pet-buddy/blob/main/LICENSE)

<img width="1920" height="960" alt="file cover - 1" src="https://github.com/user-attachments/assets/425ded76-d3e0-4555-bb9f-22830ec0ebd6" />

## 🖥️ NEW: it broke out of the browser — now on Desktop!

Your buddy doesn't need a browser tab anymore. The **desktop app** puts a pet on your **whole screen**, strolling over every app you've got open (yeah, even while you're buried in VS Code 😏). Same cute pets, now living in your **menu bar (Mac)** / **system tray (Windows)** — click the icon and a little popover pops right out.

| Get it | |
|---|---|
| 🍎 **macOS** | [Download the `.dmg`](https://github.com/nycanshu/my-pet-buddy/releases) |
| 🪟 **Windows** | [Download the installer](https://github.com/nycanshu/my-pet-buddy/releases) · [1-min install guide](INSTALL-WINDOWS.md) |
| 🍺 **Homebrew** | `brew tap nycanshu/tap && brew trust nycanshu/tap && brew install --cask my-pet-buddy` |

> **First launch (unsigned build).** The app isn't code-signed yet, so macOS/Windows warn you once — this is expected, not a problem. One time only:
> - **macOS:** open **System Settings → Privacy & Security → scroll down → "Open Anyway"**. (Or run `xattr -dr com.apple.quarantine "/Applications/My Pet Buddy.app"` in Terminal, then open it.) This applies to `.dmg` **and** Homebrew installs alike.
> - **Windows:** click **More info → Run anyway**.

Walks over any app · click for hearts 💕 · motivational nudges ✨ · dark mode 🌙 · picks up where it left off. Free forever.

## ✨ Features

- **🎨 Multiple Pet Types**: Choose from cats, dogs, birds, rabbits, and more
- **🖼️ PNG Image Support**: High-quality pet images with smooth animations
- **🎯 Interactive Pets**: Hover over pets to see them pop and play
- **📍 Position Control**: Place pets at bottom, middle, or top of your screen
- **⚡ Lightweight**: Optimized for performance with minimal resource usage
- **💾 Persistent Settings**: Your preferences are saved across browser sessions
- **🎨 Modern UI**: Clean, professional popup interface with consistent design
- **🔧 Easy Customization**: Add new pet types by simply adding images to the pets folder

## 🚀 Quick Start Guide

### 🛒 Install from Browser Stores (Recommended)

**Chrome Users:**
1. **Visit Chrome Web Store**:
   - Click the Chrome badge above or visit: [Chrome Web Store](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne)
   - Click "Add to Chrome" button

**Microsoft Edge Users:**
1. **Visit Microsoft Edge Add-ons**:
   - Click the Edge badge above or visit: [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/my-pet-buddy-virtual-pe/ffpmifppjfofiakekjaakgeiakkophad)
   - Click "Get" button

2. **Confirm Installation**:
   - Review permissions and click "Add extension"
   - The extension will be automatically installed and enabled

3. **Start Using**:
   - Click the "My Pet Buddy" icon in your browser toolbar
   - Toggle the extension ON/OFF using the switch at the top
   - Select your preferred pet position (Bottom/Middle/Top)
   - Choose your pet companion from the gallery
   - Navigate to any webpage to see your pets parading!

### 🔧 For Developers (Local Installation)

If you want to contribute or test locally:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/jiachenhe2001/my-pet-buddy.git
   cd my-pet-buddy
   ```

2. **Load in Browser**:
   - **Chrome**: Navigate to `chrome://extensions/`
   - **Edge**: Navigate to `edge://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked" and select the project folder

3. **Test the Extension**:
   - Follow the same usage steps as above

## 🎮 How to Use

1. **Install**: Get the extension from [Chrome Web Store](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne) or [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/my-pet-buddy-virtual-pe/ffpmifppjfofiakekjaakgeiakkophad)
2. **Enable**: Toggle the switch in the popup to activate pets
3. **Choose Position**: Select where you want pets to appear (Bottom/Middle/Top)
4. **Select Your Pet**: Click on any pet from the gallery to choose your companion
5. **Enjoy**: Navigate to any website and watch your pet parade along the screen!
6. **Interact**: Hover over your pet to see it pop and play

## 🐛 Troubleshooting

- **Pets Not Appearing**: Ensure the extension is enabled and a pet is selected
- **Images Not Loading**: Check that images are in the `pets/` folder with correct naming
- **Animation Issues**: Verify that the webpage allows content scripts
- **Storage Issues**: Clear extension data in Chrome settings if needed
- **Performance**: This extension is optimized for minimal resource usage

## 🌐 Browser Compatibility

- **Chrome**: 88+ (Manifest V3 support) - [Install from Chrome Web Store](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne)
- **Microsoft Edge**: 88+ (Manifest V3 support) - [Install from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/my-pet-buddy-virtual-pe/ffpmifppjfofiakekjaakgeiakkophad)
- **Other Chromium-based**: Brave, Opera, etc. (via Chrome Web Store)
- **Firefox**: Not supported (uses Chrome-specific APIs)

## 🖥️ Desktop App (macOS & Windows)

Want your pet to walk across your **whole screen**, over every app — not just web pages? My Pet Buddy also ships as a lightweight desktop app built with Electron.

- 🐾 A pet paces the bottom of your screen, floating over any app (VS Code, browsers, …)
- 💕 Click the pet for floating hearts, plus periodic motivational messages
- 🧭 Lives in the **menu bar** (macOS) / **system tray** (Windows) — no window clutter, no close button
- ⚙️ Pick your pet + theme, settings persist, optional launch-at-login, local settings

**Install:** grab the latest `.dmg` (macOS) or `.exe` (Windows) from [Releases](https://github.com/nycanshu/my-pet-buddy/releases). Windows users: see the step-by-step **[Windows install guide](INSTALL-WINDOWS.md)**.

**Develop / build:** see [`desktop/README.md`](desktop/README.md).

### 📋 Contribution Guidelines
see our [CONTRIBUTING.md](CONTRIBUTING.md) file.

## 📄 License

This project is open source and available under the MIT License.

---

## 🎉 Get Started Now!

[![Install from Chrome Web Store](https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/my-pet-buddy-virtual-pet/fpgcioopagdmanbgjikghomglhmjfnne)
[![Install from Microsoft Edge](https://img.shields.io/badge/Install%20from-Microsoft%20Edge-0078D4?style=for-the-badge&logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/my-pet-buddy-virtual-pe/ffpmifppjfofiakekjaakgeiakkophad)

**Made with ❤️ for pet lovers and animal enthusiasts!**

*Bring joy to your browsing experience with adorable virtual companions!* 🐾
