// Single source of truth for settings keys + defaults.
const DEFAULTS = Object.freeze({
  enabled: true,          // pet visible on launch
  species: 'cat',         // observer | cat | dog | rabbit | hamster | bird
  variant: 1,             // 1..6 -> assets/pets/<species>-<variant>.png
  theme: 'system',        // system | light | dark
  launchOnLogin: false,   // default OFF
  motivationEnabled: true,// speech bubbles on/off
  position: 'bottom',     // bottom | middle | top  (vertical placement on screen)
  motionMode: 'parade',   // legacy pets: parade | left | right
  observerAction: 'auto',
  observerSize: 120,
  observerPaused: false,
  observerPosition: null // normalized screen-work-area anchor, independent of legacy placement
});

module.exports = { DEFAULTS };
