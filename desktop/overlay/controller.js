// The native host supplies local URLs, persistence and OS click-through.
(async () => {
    const api = window.petBuddy;
    let settings = await api.settings.getAll();
    let pet = null, petId = null, cursor = { x: -1, y: -1 }, interactive = false;
    const getURL = path => new URL(`../assets/${path}`, location.href).href;
    function hitTest() {
        const over = Boolean(settings.enabled && !document.hidden && pet?.isInteractiveAt(cursor.x, cursor.y));
        if (interactive !== over) { interactive = over; api.overlay.setInteractive(over); }
    }
    function render() {
        const id = PetBuddyPets.resolveId(settings.species);
        if (!settings.enabled || petId !== id) { pet?.destroy(); pet = null; }
        petId = id;
        if (settings.enabled) {
            const options = { action: settings.observerAction, size: settings.observerSize,
                paused: settings.observerPaused, position: settings.observerPosition };
            if (pet) pet.update(options);
            else pet = PetBuddyObserver.mount(options, { petId: id, getURL,
                onSettings(changes) {
                    const keys = { 'my-pet-action': 'observerAction', 'my-pet-paused': 'observerPaused', 'my-pet-enabled': 'enabled' };
                    api.settings.setMany(Object.fromEntries(Object.entries(changes).map(([key, value]) => [keys[key], value])));
                },
                onPosition: position => api.settings.set('observerPosition', position),
                onHitAreaChange: hitTest });
        }
        hitTest();
    }
    const removeSettings = api.settings.onChange(({ settings: snapshot }) => { settings = snapshot; render(); });
    const removeCursor = api.overlay.onCursor(point => { cursor = point; hitTest(); });
    window.addEventListener('mousemove', event => { cursor = { x: event.clientX, y: event.clientY }; hitTest(); });
    document.addEventListener('visibilitychange', hitTest);
    window.addEventListener('beforeunload', () => { removeSettings(); removeCursor(); pet?.destroy(); api.overlay.setInteractive(false); });
    render();
})();
