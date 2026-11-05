const { ipcMain, dialog, shell } = require('electron');

// One place to see the whole main<->renderer contract.
class IpcRouter {
  constructor({ store, overlayManager, assistantService, assistantManager, onOpenSettings, onTogglePet }) {
    this.store = store;
    this.overlayManager = overlayManager;
    this.onOpenSettings = onOpenSettings;
    this.onTogglePet = onTogglePet;
    this.assistantService = assistantService;
    this.assistantManager = assistantManager;
  }

  register() {
    ipcMain.handle('settings:getAll', () => this.store.getAll());
    ipcMain.handle('settings:get', (_e, key) => this.store.get(key));
    ipcMain.handle('settings:set', (_e, { key, value }) => {
      this.store.set(key, value);
      return true;
    });
    ipcMain.handle('settings:setMany', (_e, values) => {
      this.store.setMany(values);
      return true;
    });
    ipcMain.on('overlay:setInteractive', (_e, bool) => this.overlayManager.setInteractive(bool));
    ipcMain.on('ui:openSettings', () => this.onOpenSettings());
    ipcMain.on('ui:togglePet', () => this.onTogglePet());
    if (this.assistantService) this._registerAssistant();
  }

  _registerAssistant() {
    const service = this.assistantService, manager = this.assistantManager;
    const trusted = event => [manager.win, this.overlayManager.win].some(win => win && !win.isDestroyed() && event.sender === win.webContents);
    const handle = (name, action) => ipcMain.handle(`assistant:${name}`, (event, payload) => {
      if (!trusted(event)) throw new Error('这个窗口没有访问小黑助手的权限。');
      return action(payload);
    });
    handle('getState', () => service.snapshot());
    handle('connect', async () => {
      const result = await service.connect(this.store.get('codexBinary') || service.binary);
      this.store.set('codexAutoConnect', true); return result;
    });
    handle('refresh', () => service.refresh());
    handle('select', id => service.select(id));
    handle('send', payload => service.send(payload || {}));
    handle('respond', payload => service.respond(payload || {}));
    handle('interrupt', id => service.interrupt(id));
    handle('installHooks', enabled => service.installHooks(enabled === true));
    handle('login', async () => {
      const result = await service.login();
      const url = new URL(result.authUrl || result.verificationUrl || '');
      if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Codex 没有返回可识别的官方登录地址。');
      await shell.openExternal(url.href); return true;
    });
    handle('newProject', async () => {
      const result = await dialog.showOpenDialog(manager.win, { title: '选择 Codex 项目目录', properties: ['openDirectory'] });
      return !result.canceled && result.filePaths[0] ? service.newSession(result.filePaths[0]) : null;
    });
    handle('chooseBinary', async () => {
      if (service.hasActiveTasks()) throw new Error('请先结束小黑中的运行任务，再切换 Codex 程序。');
      const result = await dialog.showOpenDialog(manager.win, { title: '选择 Codex CLI 程序', properties: ['openFile'] });
      if (result.canceled || !result.filePaths[0]) return null;
      service.client?.stop(); service.binary = result.filePaths[0];
      this.store.set('codexBinary', service.binary); return service.connect();
    });
    ipcMain.on('assistant:toggle', event => { if (trusted(event)) manager.toggle(); });
    ipcMain.on('assistant:hide', event => { if (trusted(event)) manager.hide(); });
    ipcMain.on('assistant:anchor', (event, rect) => {
      if (event.sender !== this.overlayManager.win?.webContents || !rect) return;
      if (!['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]) && Math.abs(rect[key]) < 100000)) return;
      const bounds = this.overlayManager.win.getBounds();
      manager.setAnchor({ x: bounds.x + rect.x, y: bounds.y + rect.y, width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
  }
}

module.exports = { IpcRouter };
