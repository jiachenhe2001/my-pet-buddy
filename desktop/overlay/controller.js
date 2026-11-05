// The native host supplies local URLs, persistence and OS click-through.
(async () => {
    const api = window.petBuddy;
    let settings = await api.settings.getAll();
    let pet = null, petId = null, cursor = { x: -1, y: -1 }, interactive = false;
    const badge = document.getElementById('assistant-status');
    let assistantState = null, previousAnchor = '', badgeTimer = null;
    function placeBadge() {
        const rect = document.querySelector('#my-pet-observer')?.shadowRoot.querySelector('canvas')?.getBoundingClientRect();
        if (!rect) return;
        const anchor = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        const value = JSON.stringify(anchor);
        if (value !== previousAnchor) { previousAnchor = value; api.overlay.reportAnchor?.(anchor); }
        badge.style.left = `${Math.max(70, Math.min(innerWidth - 70, rect.x + rect.width / 2))}px`;
        badge.style.top = `${Math.max(3, rect.y - 27)}px`;
    }
    function renderBadge() {
        clearTimeout(badgeTimer);
        const attention = assistantState?.attention;
        const session = assistantState?.sessions.find(item => item.id === attention?.sessionId);
        const remaining = attention ? attention.at + 7000 - Date.now() : 0;
        const waiting = ['waiting_approval', 'waiting_input'].includes(attention?.type);
        // No permanent idle/running label; reminders expire even as progress streams.
        badge.hidden = !settings.enabled || !session || remaining <= 0 || session.status !== attention.type || (waiting && !session.pending?.length);
        badge.textContent = attention?.message || '';
        badge.classList.toggle('attention', waiting);
        if (!badge.hidden) badgeTimer = setTimeout(renderBadge, remaining);
        placeBadge(); hitTest();
    }
    const getURL = path => new URL(`../assets/${path}`, location.href).href;
    function hitTest() {
        const rect = badge.getBoundingClientRect();
        const overBadge = !badge.hidden && cursor.x >= rect.left && cursor.x <= rect.right && cursor.y >= rect.top && cursor.y <= rect.bottom;
        const over = Boolean(settings.enabled && !document.hidden && (overBadge || pet?.isInteractiveAt(cursor.x, cursor.y)));
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
                onActivate: () => api.assistant?.toggle(),
                onHitAreaChange: () => { hitTest(); placeBadge(); } });
        }
        renderBadge(); hitTest();
    }
    const removeSettings = api.settings.onChange(({ settings: snapshot }) => { settings = snapshot; render(); });
    const removeCursor = api.overlay.onCursor(point => { cursor = point; hitTest(); });
    window.addEventListener('mousemove', event => { cursor = { x: event.clientX, y: event.clientY }; hitTest(); });
    document.addEventListener('visibilitychange', hitTest);
    badge.addEventListener('click', async () => {
        const id = assistantState?.attention?.sessionId;
        if (id) await api.assistant?.select(id);
        api.assistant?.toggle();
    });
    const removeAssistant = api.assistant?.onChange(snapshot => { assistantState = snapshot; renderBadge(); });
    api.assistant?.getState().then(snapshot => { assistantState = snapshot; renderBadge(); }).catch(() => {});
    window.addEventListener('beforeunload', () => { clearTimeout(badgeTimer); removeSettings(); removeCursor(); removeAssistant?.(); pet?.destroy(); api.overlay.setInteractive(false); });
    render();
})();
