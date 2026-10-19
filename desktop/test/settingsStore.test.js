const test = require('node:test');
const assert = require('node:assert/strict');
const { SettingsStore } = require('../src/store/SettingsStore');
const { DEFAULTS } = require('../src/store/defaults');
const catalog = require('../assets/pets');
catalog.register({ ...catalog.get(), id: 'test-character', name: '测试形象' });
function fakeBackend(initial = {}) {
  const data = { ...initial };
  return { get: key => data[key], set: (key, value) => { data[key] = value; }, data };
}
test('clean install and retired or invalid saved characters resolve to 小黑', () => {
  for (const species of [undefined, 'cat', 'dog', '__proto__', 'missing']) {
    const store = new SettingsStore(fakeBackend({ species, variant: 4, position: 'top', motionMode: 'parade' }), DEFAULTS);
    assert.equal(store.get('species'), 'observer');
    assert.equal(store.getAll().species, 'observer');
    assert.equal(store.get('enabled'), true);
    assert.equal('variant' in store.getAll(), false);
    assert.equal('motionMode' in store.getAll(), false);
  }
});
test('a new registered character persists across reopen and is shared with both windows atomically', () => {
  const backend = fakeBackend({ species: 'cat', observerAction: 'idle' });
  const store = new SettingsStore(backend, DEFAULTS);
  const selection = { species: 'test-character', observerAction: 'roll', observerSize: 150, observerPaused: true,
    observerPosition: { x: 0.3, y: 0.7 } };
  const snapshots = [];
  store.on('change', () => snapshots.push(store.getAll()));
  store.setMany(selection);
  assert.equal(snapshots.length, Object.keys(selection).length);
  for (const snapshot of snapshots) for (const [key, value] of Object.entries(selection)) assert.deepEqual(snapshot[key], value);
  assert.deepEqual(new SettingsStore(backend, DEFAULTS).getAll(), store.getAll());
  store.set('species', 'observer');
  assert.equal(store.get('observerAction'), 'roll');
  assert.equal(store.get('observerPaused'), true);
});
test('unchanged values and removed settings do not emit changes', () => {
  const store = new SettingsStore(fakeBackend(), DEFAULTS), events = [];
  store.on('change', event => events.push(event));
  store.setMany({ enabled: true, species: 'dog', variant: 3, motionMode: 'left' });
  assert.deepEqual(events, []);
  store.set('theme', 'dark');
  assert.deepEqual(events, [{ key: 'theme', value: 'dark' }]);
  assert.equal(store.getAll().theme, 'dark');
});
