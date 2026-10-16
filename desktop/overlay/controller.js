// The native overlay and Chrome content script share the same animation player.
// Only local asset URLs, persistence and OS click-through differ here.
(async () => {
  const api = window.petBuddy;
  const stage = document.getElementById('stage');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let settings = await api.settings.getAll();
  let observer = null, walker = null, cursor = { x: -1, y: -1 }, interactive = false;
  let previous = {};
  const getURL = path => new URL(`../assets/${path}`, location.href).href;
  const theme = () => settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;

  function hitTest() {
    let over = false;
    if (settings.enabled && !document.hidden) {
      if (observer) over = observer.isInteractiveAt(cursor.x, cursor.y);
      else if (walker) {
        const r = walker.petEl.getBoundingClientRect();
        over = cursor.x >= r.left && cursor.x <= r.right && cursor.y >= r.top && cursor.y <= r.bottom;
      }
    }
    if (interactive !== over) {
      interactive = over;
      api.overlay.setInteractive(over);
    }
  }

  function render() {
    const isObserver = settings.species === 'observer';
    stage.hidden = isObserver || !settings.enabled;
    if (isObserver || !settings.enabled) { walker?.destroy(); walker = null; }
    if (!isObserver || !settings.enabled) { observer?.destroy(); observer = null; }
    if (settings.enabled && isObserver) {
      const options = { action: settings.observerAction, size: settings.observerSize,
        paused: settings.observerPaused, position: settings.observerPosition };
      if (observer) observer.update(options);
      else observer = PetBuddyObserver.mount(options, {
        getURL,
        onSettings(changes) {
          const keys = { 'my-pet-action': 'observerAction', 'my-pet-paused': 'observerPaused', 'my-pet-enabled': 'enabled' };
          api.settings.setMany(Object.fromEntries(Object.entries(changes).map(([key, value]) => [keys[key], value])));
        },
        onPosition: position => api.settings.set('observerPosition', position),
        onHitAreaChange: hitTest,
      });
    } else if (settings.enabled) {
      if (!walker) {
        walker = new PetWalker(stage, { assetBase: '../assets/pets', theme: theme(),
          motivationEnabled: settings.motivationEnabled, position: settings.position, motionMode: settings.motionMode });
        walker.setPet(settings.species, settings.variant);
        walker.start();
      } else {
        if (settings.species !== previous.species || settings.variant !== previous.variant) walker.setPet(settings.species, settings.variant);
        if (settings.position !== previous.position) walker.setPosition(settings.position);
        if (settings.motionMode !== previous.motionMode) walker.setMotion(settings.motionMode);
        if (settings.motivationEnabled !== previous.motivationEnabled) walker.setMotivation(settings.motivationEnabled);
        walker.setTheme(theme());
      }
      if (document.hidden) walker.suspend();
    }
    previous = settings;
    hitTest();
  }
  const removeSettings = api.settings.onChange(({ key, value, settings: snapshot }) => {
    settings = snapshot || { ...settings, [key]: value };
    render();
  });
  const removeCursor = api.overlay.onCursor(point => { cursor = point; hitTest(); });
  window.addEventListener('mousemove', event => { cursor = { x: event.clientX, y: event.clientY }; hitTest(); });
  document.addEventListener('visibilitychange', () => {
    if (walker) document.hidden ? walker.suspend() : walker.resume();
    hitTest();
  });
  media.addEventListener('change', () => walker?.setTheme(theme()));
  window.addEventListener('beforeunload', () => {
    removeSettings(); removeCursor(); observer?.destroy(); walker?.destroy(); api.overlay.setInteractive(false);
  });
  render();
})();
