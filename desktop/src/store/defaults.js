// Persisted character ID remains "species" for compatibility with local settings.
const DEFAULTS = Object.freeze({
  enabled: true,
  species: 'observer',
  theme: 'system',
  launchOnLogin: false,
  observerAction: 'auto',
  observerSize: 120,
  observerPaused: false,
  observerPosition: null,
  codexBinary: '',
  codexAutoConnect: false
});
module.exports = { DEFAULTS };
