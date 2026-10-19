// Native settings adapter for the same panel used by Chrome.
(() => {
    const api = window.petBuddy;
    const keys = { character: 'species', enabled: 'enabled', action: 'observerAction',
        size: 'observerSize', paused: 'observerPaused', position: 'observerPosition', theme: 'theme' };
    const fromNative = saved => Object.fromEntries(Object.entries(keys).map(([key, stored]) => [key, saved[stored]]));
    PetBuddyPopup.start({
        getURL: path => new URL(`../assets/${path}`, location.href).href,
        load: async () => fromNative(await api.settings.getAll()),
        save: changes => api.settings.setMany(Object.fromEntries(Object.entries(changes).map(([key, value]) => [keys[key], value]))),
        subscribe: listener => api.settings.onChange(({ settings }) => listener(fromNative(settings)))
    });
})();
