// One settings panel for both hosts; persistence is supplied by a small adapter.
(function(root) {
    'use strict';
    root.PetBuddyPopup = { start(adapter) {
        document.addEventListener('DOMContentLoaded', async () => {
            const byId = id => document.getElementById(id);
            const media = matchMedia('(prefers-color-scheme: dark)');
            const select = byId('pet-selection'), actions = byId('pet-actions');
            const canvas = byId('observer-preview'), error = byId('observer-error');
            let settings = {}, preview = null, previewId = null, previewAction = null;
            const showError = cause => { error.textContent = cause.message; error.hidden = false; };
            for (const pet of PetBuddyPets.list()) {
                const option = document.createElement('option');
                option.value = pet.id; option.textContent = pet.name; select.append(option);
            }
            async function save(changes) {
                settings = { ...settings, ...changes }; render();
                try { await adapter.save(changes); } catch (cause) { showError(cause); }
            }
            function syncPause() { preview?.setPaused(document.hidden || Boolean(settings.paused)); }
            function render() {
                const pet = PetBuddyPets.get(settings.character);
                const action = PetBuddyObserver.isAction(settings.action, pet) ? settings.action : 'auto';
                const next = action === 'auto' ? 'idle' : action;
                select.value = pet.id;
                byId('pet-name').textContent = pet.name;
                canvas.setAttribute('aria-label', `${pet.name}动作预览`);
                if (previewId !== pet.id) {
                    preview?.destroy(); previewId = pet.id; previewAction = null;
                    preview = PetBuddyObserver.createPlayer(canvas, () => {}, adapter.getURL, pet);
                    actions.replaceChildren();
                    for (const [id, name] of [['auto', '自动活动'], ...Object.entries(pet.actions).map(([id, value]) => [id, value.name])]) {
                        const button = document.createElement('button'); button.type = 'button';
                        button.dataset.action = id; button.textContent = name;
                        button.addEventListener('click', () => save({ action: id })); actions.append(button);
                    }
                }
                byId('my-pet-toggle').classList.toggle('active', settings.enabled !== false);
                byId('my-pet-toggle').setAttribute('aria-checked', String(settings.enabled !== false));
                actions.querySelectorAll('button').forEach(button => {
                    const active = button.dataset.action === action;
                    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
                });
                byId('observer-size').value = PetBuddyObserver.validSize(settings.size);
                byId('observer-size-value').value = byId('observer-size').value;
                byId('observer-paused').checked = Boolean(settings.paused);
                const theme = ['dark', 'light'].includes(settings.theme) ? settings.theme : (media.matches ? 'dark' : 'light');
                document.body.classList.toggle('theme-dark', theme === 'dark');
                document.body.classList.toggle('theme-light', theme === 'light');
                byId('theme-toggle-icon').textContent = theme === 'dark' ? '☀' : '☾';
                byId('theme-toggle').title = theme === 'dark' ? '切换浅色模式' : '切换深色模式';
                syncPause();
                if (previewAction !== next) {
                    previewAction = next;
                    preview.setAction(next).then(applied => { if (applied) error.hidden = true; }).catch(showError);
                }
            }
            select.addEventListener('change', () => save({ character: select.value }));
            byId('my-pet-toggle').addEventListener('click', () => save({ enabled: settings.enabled === false }));
            byId('observer-size').addEventListener('input', event => { byId('observer-size-value').value = event.target.value; });
            byId('observer-size').addEventListener('change', event => save({ size: Number(event.target.value) }));
            byId('observer-paused').addEventListener('change', event => save({ paused: event.target.checked }));
            byId('observer-reset').addEventListener('click', () => save({ position: null }));
            byId('theme-toggle').addEventListener('click', () => save({ theme: document.body.classList.contains('theme-dark') ? 'light' : 'dark' }));
            document.addEventListener('visibilitychange', syncPause);
            media.addEventListener('change', render);
            let unsubscribe = () => {};
            try {
                settings = await adapter.load(); render();
                unsubscribe = adapter.subscribe(next => { settings = next; render(); });
                if (settings.character !== PetBuddyPets.resolveId(settings.character)) {
                    await save({ character: PetBuddyPets.resolveId(settings.character) });
                }
            } catch (cause) { showError(cause); }
            window.addEventListener('pagehide', () => { unsubscribe(); preview?.destroy(); });
        }, { once: true });
    } };
})(globalThis);
