# 开发与新增形象

Chrome 与 Electron 共用 `pets.js`（形象注册）、`observer.js`（动画与交互）、
`popup-controller.js`（设置逻辑）和 `popup.css`（设置样式）。两端仅保留各自的存储适配器。

## 新增一个形象

1. 将透明 PNG 放进 `pets/<id>/<source>/frame-01.png` 等路径。ID 使用小写字母、数字、短横线。
2. 在 `pets.js` 的默认 `register(...)` 后添加同格式的注册项。例：

```js
register({
    id: 'new-buddy',
    name: '新伙伴',
    assetRoot: 'pets/new-buddy',
    thumbnail: 'pets/new-buddy/idle/frame-01.png',
    actions: {
        idle: { name: '待机', source: 'idle', frames: [1, 2], fps: 2,
            view: [0, 0, 300, 300], anchor: [150, 280], hit: [30, 30, 270, 290] },
        bounce: { name: '蹦跶', source: 'bounce', frames: [1, 2, 3, 2], fps: 8,
            view: [0, 0, 300, 300], anchor: [150, 280], hit: [30, 0, 270, 290] }
    }
});
```

- `idle`（默认）和 `bounce`（单击互动）必需，其他动作可按素材添加。设置面板、自动活动和右键菜单由动作配置生成。
- `source` 是该形象目录下的动作文件夹；`frames` 是两位编号 PNG 的播放顺序，`fps` 是每秒帧数。
- `view` 是原图裁剪 `[x, y, width, height]`；`anchor` 是原图中的脚部锚点 `[x, y]`，保持切换动作时位置稳定。
- `hit` 是原图可交互范围 `[left, top, right, bottom]`，实际点击区域还会结合 PNG 透明像素。
- 可选 `iconCrop: { x, y, width, height }` 决定桌面托盘图标裁剪。
- 注册 ID 是持久化标识，不应随意改名。不存在的旧 ID 自动回落到小黑。

无需复制旧宠物引擎、修改两版 HTML 或按文件名探测图库；新形象的素材路径也已被 Chrome manifest 的通用规则覆盖。
桌面启动／打包执行 `desktop/scripts/copy-assets.js`，先清空生成目录再复制共享资源，避免旧宠物残留在安装包里。

## 验证

```bash
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm ci --prefix desktop
npm test --prefix desktop
npm run test:desktop
```

Linux 上真实 Electron 冒烟需使用 `xvfb-run --auto-servernum npm run test:desktop`。
两版冒烟会在临时副本中注册测试形象，验证切换、重新打开后的持久化、旧配置回落和原有互动，不会把测试形象加入发布包。

提交 PR 到本仓库 `main`。请保留 `LICENSE` 与安装器许可证的版权声明。
