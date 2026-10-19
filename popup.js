// Chrome storage adapter for the shared settings panel.
(() => {
    const keys = { character: 'my-pet-character', enabled: 'my-pet-enabled', action: 'my-pet-action',
        size: 'my-pet-size', paused: 'my-pet-paused', position: 'my-pet-observer-position', theme: 'my-pet-theme' };
    const load = async () => {
        const saved = await chrome.storage.sync.get(Object.values(keys));
        return Object.fromEntries(Object.entries(keys).map(([key, stored]) => [key, saved[stored]]));
    };
    PetBuddyPopup.start({ load, getURL: path => chrome.runtime.getURL(path),
        save: changes => chrome.storage.sync.set(Object.fromEntries(Object.entries(changes).map(([key, value]) => [keys[key], value]))),
        subscribe(listener) {
            const onChange = (changes, namespace) => {
                if (namespace === 'sync' && Object.values(keys).some(key => changes[key])) load().then(listener);
            };
            chrome.storage.onChanged.addListener(onChange);
            return () => chrome.storage.onChanged.removeListener(onChange);
        }
    });
})();
