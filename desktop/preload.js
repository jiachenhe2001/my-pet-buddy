const { contextBridge, ipcRenderer } = require('electron');

// Minimal, allow-listed API surface (Facade). No raw ipcRenderer in renderers.
contextBridge.exposeInMainWorld('petBuddy', {
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    setMany: (values) => ipcRenderer.invoke('settings:setMany', values),
    onChange: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('settings:changed', listener);
      return () => ipcRenderer.removeListener('settings:changed', listener);
    },
  },
  overlay: {
    setInteractive: (bool) => ipcRenderer.send('overlay:setInteractive', bool),
    onCursor: (cb) => {
      const listener = (_e, point) => cb(point);
      ipcRenderer.on('overlay:cursor', listener);
      return () => ipcRenderer.removeListener('overlay:cursor', listener);
    },
  },
  ui: {
    openSettings: () => ipcRenderer.send('ui:openSettings'),
    togglePet: () => ipcRenderer.send('ui:togglePet'),
  },
});
