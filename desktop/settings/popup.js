// Local settings facade; both renderers share the original PNG animation player.
document.addEventListener('DOMContentLoaded', async () => {
    const api = window.petBuddy;
    const byId = id => document.getElementById(id);
    const getURL = path => new URL(`../assets/${path}`, location.href).href;
    const toggle = byId('my-pet-toggle'), motivation = byId('my-pet-motivation-toggle');
    const panel = byId('observer-panel'), select = byId('select-observer');
    const size = byId('observer-size'), paused = byId('observer-paused'), error = byId('observer-error');
    const media = matchMedia('(prefers-color-scheme: dark)');
    let settings = await api.settings.getAll(), previewAction = null;
    const preview = PetBuddyObserver.createPlayer(byId('observer-preview'), () => {}, getURL);

    function showError(cause) { error.textContent = cause.message; error.hidden = false; }
    async function save(changes) {
        settings = { ...settings, ...changes };
        render();
        try { await api.settings.setMany(changes); }
        catch (cause) { showError(cause); }
    }
    function syncPause() {
        preview.setPaused(document.hidden || settings.species !== 'observer' || Boolean(settings.observerPaused));
    }
    function render() {
        const isObserver = settings.species === 'observer';
        const action = PetBuddyObserver.isAction(settings.observerAction) ? settings.observerAction : 'auto';
        const next = action === 'auto' ? 'idle' : action;
        toggle.classList.toggle('active', Boolean(settings.enabled));
        toggle.setAttribute('aria-checked', String(Boolean(settings.enabled)));
        motivation.classList.toggle('active', Boolean(settings.motivationEnabled));
        motivation.setAttribute('aria-checked', String(Boolean(settings.motivationEnabled)));
        panel.classList.toggle('selected', isObserver);
        select.setAttribute('aria-pressed', String(isObserver));
        byId('observer-badge').textContent = isObserver ? '已选择' : '选择它';
        document.querySelectorAll('.legacy-controls').forEach(element => { element.hidden = isObserver; });
        document.querySelectorAll('button[data-action]').forEach(button => {
            const active = button.dataset.action === action;
            button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
        });
        size.value = PetBuddyObserver.validSize(settings.observerSize);
        byId('observer-size-value').value = size.value;
        paused.checked = Boolean(settings.observerPaused);
        document.querySelectorAll('[data-pos]').forEach(button => button.classList.toggle('active', button.dataset.pos === settings.position));
        document.querySelectorAll('[data-motion]').forEach(button => button.classList.toggle('active', button.dataset.motion === settings.motionMode));
        document.querySelectorAll('.my-pet-cat-item').forEach(button => {
            const active = button.dataset.cat === `${settings.species}-${settings.variant}`;
            button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
        });
        const logo = document.querySelector('.my-pet-title img');
        const image = isObserver ? 'pets/observer/roll/frame-04.png' : `pets/${settings.species}-${settings.variant}.png`;
        if (logo.src !== getURL(image)) logo.src = getURL(image);
        const theme = ['light', 'dark'].includes(settings.theme) ? settings.theme : (media.matches ? 'dark' : 'light');
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

    select.addEventListener('click', () => save({ species: 'observer' }));
    document.querySelectorAll('button[data-action]').forEach(button => button.addEventListener('click', () => {
        save({ species: 'observer', observerAction: button.dataset.action });
    }));
    size.addEventListener('input', () => { byId('observer-size-value').value = size.value; });
    size.addEventListener('change', () => save({ observerSize: Number(size.value) }));
    paused.addEventListener('change', () => save({ observerPaused: paused.checked }));
    byId('observer-reset').addEventListener('click', () => save({ observerPosition: null }));
    toggle.addEventListener('click', () => save({ enabled: !settings.enabled }));
    motivation.addEventListener('click', () => save({ motivationEnabled: !settings.motivationEnabled }));
    document.querySelectorAll('[data-pos]').forEach(button => button.addEventListener('click', () => save({ position: button.dataset.pos })));
    document.querySelectorAll('[data-motion]').forEach(button => button.addEventListener('click', () => save({ motionMode: button.dataset.motion })));
    byId('theme-toggle').addEventListener('click', () => save({ theme: document.body.classList.contains('theme-dark') ? 'light' : 'dark' }));
    byId('website-link').href = 'https://github.com/jiachenhe2001/my-pet-buddy';
    document.addEventListener('visibilitychange', syncPause);
    media.addEventListener('change', render);
    const unsubscribe = api.settings.onChange(({ key, value, settings: snapshot }) => {
        settings = snapshot || { ...settings, [key]: value }; render();
    });
    window.addEventListener('beforeunload', () => { unsubscribe(); preview.destroy(); });
    render();

    // Preserve the existing gallery, including additional local numbered pets.
    const grid = byId('my-pet-cat-grid');
    for (const species of ['cat', 'dog', 'bird', 'rabbit', 'hamster']) {
        const candidates = await Promise.all(Array.from({ length: 10 }, (_, i) => {
            const variant = i + 1, url = getURL(`pets/${species}-${variant}.png`);
            return new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve({ variant, url }); image.onerror = () => resolve(null); image.src = url;
            });
        }));
        const pets = candidates.filter(Boolean);
        if (!pets.length) continue;
        const title = document.createElement('div');
        title.className = 'my-pet-group-header'; title.textContent = `${species[0].toUpperCase()}${species.slice(1)}s`;
        const group = document.createElement('div'); group.className = 'my-pet-group';
        for (const { variant, url } of pets) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'my-pet-cat-item'; button.dataset.cat = `${species}-${variant}`;
            const image = document.createElement('img'); image.src = url; image.alt = `${species} ${variant}`; image.className = 'my-pet-cat-image';
            const name = document.createElement('div'); name.className = 'my-pet-cat-name'; name.textContent = image.alt;
            button.append(image, name); group.append(button);
            button.addEventListener('click', () => save({ species, variant }));
        }
        grid.append(title, group);
    }
    render();
});
