const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../pets');
const player = require('../observer');

test('only 小黑 ships; retired and malformed saved IDs have a safe fallback', () => {
    assert.deepEqual(catalog.list().map(pet => pet.id), ['observer']);
    for (const id of [undefined, null, 'cat-1', 'dog', 'missing', '__proto__']) assert.equal(catalog.get(id).id, 'observer');
    assert.deepEqual(fs.readdirSync(path.join(__dirname, '../pets')).filter(file => file.endsWith('.png')), []);
});
test('a registered character supplies its own paths, timings, actions and geometry', () => {
    const original = catalog.get();
    const actions = { idle: { ...original.actions.idle, frames: [2, 3], fps: 2, view: [0, 0, 200, 200], anchor: [100, 180] }, bounce: original.actions.bounce };
    catalog.register({ id: 'test-character', name: '测试形象', assetRoot: 'pets/test-character', thumbnail: 'pets/test-character/idle/frame-02.png', actions });
    const pet = catalog.get('test-character');
    assert.equal(catalog.resolveId(pet.id), 'test-character');
    assert.equal(player.framePath('idle', 2, pet), 'pets/test-character/roll/frame-02.png');
    assert.equal(player.frameAt('idle', 500, pet), 3);
    assert.equal(player.isAction('rain', pet), false);
    assert.equal(player.placement('idle', 120, { x: .5, y: .75 }, 1280, 800, pet).width, 80);
    assert.throws(() => catalog.register(pet), /already registered/);
});
