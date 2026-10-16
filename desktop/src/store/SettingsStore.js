const { EventEmitter } = require('node:events');

// Observable settings facade over an injected backend (DI for testability).
// backend contract: get(key) -> value|undefined, set(key, value) -> void
class SettingsStore extends EventEmitter {
  constructor(backend, defaults) {
    super();
    this._backend = backend;
    this._defaults = defaults;
  }

  get(key) {
    const v = this._backend.get(key);
    return v === undefined ? this._defaults[key] : v;
  }

  set(key, value) {
    this.setMany({ [key]: value });
  }

  setMany(values) {
    // No-op if unchanged: avoids redundant writes and a storm of 'change'
    // broadcasts when the settings UI re-saves every key on each interaction.
    const changes = Object.entries(values).filter(([key, value]) => this.get(key) !== value);
    // Apply the whole selection before notifying either window. A species change
    // must not render with the previous pet's variant/action for an IPC roundtrip.
    for (const [key, value] of changes) this._backend.set(key, value);
    for (const [key, value] of changes) this.emit('change', { key, value });
  }

  getAll() {
    const out = { ...this._defaults };
    for (const key of Object.keys(this._defaults)) {
      const v = this._backend.get(key);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
}

module.exports = { SettingsStore };
