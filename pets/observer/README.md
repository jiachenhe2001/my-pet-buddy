# 桌宠动作素材

原始 PNG 序列保留透明通道、画布尺寸和帧内位置；编号按数值排序。

| 动作 | 原始素材 | 项目路径 | 播放安排 |
| --- | --- | --- | --- |
| 暗中观察 | 1-1 ～ 1-11 | `peek/frame-01.png` ～ `peek/frame-11.png` | 顺序探头，再倒序收回 |
| 待机 | 2-4、2-5 | `roll/frame-04.png`、`roll/frame-05.png` | 两帧缓慢交替 |
| 原地蹦跶 | 2-1 ～ 2-5 | `roll/frame-01.png` ～ `roll/frame-05.png` | 往返播放，端点不重复 |
| 滚动 | 2-9 ～ 2-16 | `roll/frame-09.png` ～ `roll/frame-16.png` | 往返滚动，保留原始画面内位移 |
| 淋雨 | 3-1 ～ 3-6 | `rain/frame-01.png` ～ `rain/frame-06.png` | 顺序循环 |

`roll/frame-06.png` ～ `roll/frame-08.png` 同时保留，供完整翻滚动作或衔接使用。

帧序、帧率、显示区域和脚部锚点集中配置在根目录 `observer.js` 的 `ACTIONS` 中。显示区域只在播放器中取景，不改动原始 PNG。点击碰撞区域单独计算，透明留白不遮挡网页。
