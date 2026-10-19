// Chrome host for the shared animated character player.
(() => {
    'use strict';
    if (window.myPetBuddyLoaded) return;
    window.myPetBuddyLoaded = true;
    const KEYS = ['my-pet-character', 'my-pet-enabled', 'my-pet-action', 'my-pet-size',
        'my-pet-paused', 'my-pet-observer-position'];
    let pet = null, currentId = null;
    function render(settings) {
        const id = PetBuddyPets.resolveId(settings['my-pet-character']);
        if (!settings['my-pet-character'] || settings['my-pet-character'] !== id) {
            chrome.storage.sync.set({ 'my-pet-character': id });
        }
        if (settings['my-pet-enabled'] === false || currentId !== id) {
            pet?.destroy(); pet = null;
        }
        currentId = id;
        if (settings['my-pet-enabled'] === false) return;
        const options = { action: settings['my-pet-action'], size: settings['my-pet-size'],
            paused: settings['my-pet-paused'], position: settings['my-pet-observer-position'] ?? null };
        if (pet) pet.update(options);
        else pet = PetBuddyObserver.mount(options, { petId: id,
            onSettings: changes => chrome.storage.sync.set(changes),
            onPosition: position => chrome.storage.sync.set({ 'my-pet-observer-position': position }) });
    }
    chrome.storage.sync.get(KEYS, render);
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && KEYS.some(key => changes[key])) chrome.storage.sync.get(KEYS, render);
    });
})();
