// Shared character catalog for Chrome, Electron renderers and the native tray.
(function(root) {
    'use strict';
    const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
    const pingPong = frames => frames.concat(frames.slice(1, -1).reverse());
    const ACTIONS = {
        idle: { name: '待机', source: 'roll', frames: [4, 5], fps: 1.2,
            view: [70, 285, 360, 380], anchor: [250, 625], hit: [70, 285, 430, 665] },
        bounce: { name: '原地蹦跶', source: 'roll', frames: pingPong(range(1, 5)), fps: 8,
            view: [70, 0, 550, 677], anchor: [250, 625], hit: [70, 0, 620, 677] },
        roll: { name: '滚动', source: 'roll', frames: pingPong(range(9, 16)), fps: 10,
            view: [70, 150, 762, 527], anchor: [250, 625], hit: [70, 150, 832, 677] },
        peek: { name: '暗中观察', source: 'peek', frames: pingPong(range(1, 11)), fps: 7,
            view: [0, 0, 754, 670], anchor: [440, 625], hit: [230, 270, 487, 640] },
        rain: { name: '淋雨', source: 'rain', frames: range(1, 6), fps: 5,
            view: [0, 0, 670, 670], anchor: [320, 575], hit: [160, 250, 495, 605] }
    };

    const DEFAULT_ID = 'observer';
    const entries = new Map();
    function register(definition) {
        const { id, name, assetRoot, thumbnail, actions } = definition;
        if (!/^[a-z][a-z0-9-]*$/.test(id) || !name || !/^pets\/[a-z][a-z0-9-]*$/.test(assetRoot) ||
            !thumbnail?.startsWith(assetRoot + '/') || !actions?.idle || !actions?.bounce) {
            throw new Error('Character needs an id, name, local asset paths, and idle/bounce actions');
        }
        for (const [actionId, action] of Object.entries(actions)) {
            if (!/^[a-z][a-z0-9-]*$/.test(actionId) || actionId === 'auto' || !action.name || !/^[a-z][a-z0-9-]*$/.test(action.source) || !Array.isArray(action.frames) || !action.frames.length ||
                !action.frames.every(frame => Number.isInteger(frame) && frame > 0) || !(action.fps > 0) ||
                ![action.view, action.anchor, action.hit].every(value => Array.isArray(value) && value.every(Number.isFinite)) ||
                action.view.length !== 4 || action.anchor.length !== 2 || action.hit.length !== 4 ||
                action.view[2] <= 0 || action.view[3] <= 0) throw new Error(`Invalid animation in ${id}`);
        }
        if (entries.has(id)) throw new Error(`Character already registered: ${id}`);
        entries.set(id, definition);
    }
    register({ id: DEFAULT_ID, name: '小黑', assetRoot: 'pets/observer',
        thumbnail: 'pets/observer/roll/frame-04.png', iconCrop: { x: 70, y: 285, width: 360, height: 380 }, actions: ACTIONS });
    // Add another local character with register({ id, name, assetRoot, thumbnail, actions }).
    // Animation geometry belongs to each character; the shared player handles interaction.
    const resolveId = id => entries.has(id) ? id : DEFAULT_ID;
    const api = { DEFAULT_ID, register, resolveId, get: id => entries.get(resolveId(id)), list: () => [...entries.values()] };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PetBuddyPets = api;
})(globalThis);
