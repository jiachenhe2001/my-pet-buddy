const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ACTIONS, frameAt, framePath, placement, isAction, validSize } = require('../observer');

test('蹦跶原路返回，转折处不重复端点；待机使用指定两帧', () => {
    assert.deepEqual(ACTIONS.bounce.frames, [1, 2, 3, 4, 5, 4, 3, 2]);
    assert.deepEqual(ACTIONS.idle.frames, [4, 5]);
    assert.deepEqual([...new Set(ACTIONS.roll.frames)], [9, 10, 11, 12, 13, 14, 15, 16]);
    assert.deepEqual(ACTIONS.rain.frames, [1, 2, 3, 4, 5, 6]);
});

test('播放按经过的时间计算，能越过延迟的回调并完整循环', () => {
    assert.equal(frameAt('bounce', 0), 1);
    assert.equal(frameAt('bounce', 500), 5);
    assert.equal(frameAt('bounce', 875), 2);
    assert.equal(frameAt('bounce', 1000), 1);
    assert.equal(frameAt('bounce', 2750), 3);
    assert.equal(frameAt('invalid', -100), 4);
});

test('每个动作引用的原始 PNG 均存在并由扩展公开', () => {
    const manifest = require('../manifest.json');
    assert.ok(manifest.content_scripts[0].js.indexOf('observer.js') < manifest.content_scripts[0].js.indexOf('content.js'));
    assert.ok(manifest.web_accessible_resources.some(group => group.resources.includes('pets/*/*/*.png')));
    for (const [action, definition] of Object.entries(ACTIONS)) {
        for (const frame of definition.frames) {
            const data = fs.readFileSync(path.join(__dirname, '..', framePath(action, frame)));
            assert.equal(data.subarray(1, 4).toString(), 'PNG');
        }
    }
});

test('拖动越界和缩小窗口后，所有动作仍完整处于可见视口', () => {
    for (const action of Object.keys(ACTIONS)) {
        for (const [width, height] of [[1280, 720], [320, 220], [80, 60]]) {
            for (const point of [{ x: -100, y: -100 }, { x: 100, y: 100 }, null]) {
                const rect = placement(action, 180, point, width, height);
                assert.ok(rect.left >= 0 && rect.top >= 0);
                assert.ok(rect.left + rect.width <= width + 0.001);
                assert.ok(rect.top + rect.height <= height + 0.001);
                assert.ok(Number.isFinite(rect.x) && Number.isFinite(rect.y));
            }
        }
    }
});

test('动作切换保持同一像素缩放，静止脚部锚点不会跳动', () => {
    const point = { x: 0.5, y: 0.75 };
    for (const action of Object.keys(ACTIONS)) {
        const rect = placement(action, 120, point, 1600, 1000);
        assert.equal(rect.x, point.x);
        assert.equal(rect.y, point.y);
        assert.equal(rect.width / ACTIONS[action].view[2], 0.4);
    }
});

test('无效设置有默认值，显示大小限定在可控制的范围', () => {
    assert.equal(isAction('auto'), true);
    assert.equal(isAction('rain'), true);
    assert.equal(isAction('__proto__'), false);
    assert.equal(validSize(undefined), 120);
    assert.equal(validSize(NaN), 120);
    assert.equal(validSize(-1), 80);
    assert.equal(validSize(5000), 180);
});

