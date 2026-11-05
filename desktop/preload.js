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
    reportAnchor: (rect) => ipcRenderer.send('assistant:anchor', rect),
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
  assistant: {
    getState: () => ipcRenderer.invoke('assistant:getState'),
    connect: () => ipcRenderer.invoke('assistant:connect'),
    refresh: () => ipcRenderer.invoke('assistant:refresh'),
    login: () => ipcRenderer.invoke('assistant:login'),
    select: id => ipcRenderer.invoke('assistant:select', id),
    send: payload => ipcRenderer.invoke('assistant:send', payload),
    respond: payload => ipcRenderer.invoke('assistant:respond', payload),
    interrupt: id => ipcRenderer.invoke('assistant:interrupt', id),
    installHooks: () => ipcRenderer.invoke('assistant:installHooks', true),
    uninstallHooks: () => ipcRenderer.invoke('assistant:installHooks', false),
    chooseBinary: () => ipcRenderer.invoke('assistant:chooseBinary'),
    newProject: () => ipcRenderer.invoke('assistant:newProject'),
    toggle: () => ipcRenderer.send('assistant:toggle'),
    hide: () => ipcRenderer.send('assistant:hide'),
    onChange: cb => {
      const listener = (_e, state) => cb(state); ipcRenderer.on('assistant:changed', listener);
      return () => ipcRenderer.removeListener('assistant:changed', listener);
    },
    onPlacement: cb => {
      const listener = (_e, placement) => cb(placement); ipcRenderer.on('assistant:placement', listener);
      return () => ipcRenderer.removeListener('assistant:placement', listener);
    },
  },
});
