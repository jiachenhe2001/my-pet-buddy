const { app, dialog, Notification } = require('electron');
const path = require('node:path');
const { SettingsStore } = require('./src/store/SettingsStore');
const { createElectronStoreBackend } = require('./src/store/electronStoreBackend');
const { DEFAULTS } = require('./src/store/defaults');
const { OverlayWindowManager } = require('./src/windows/OverlayWindowManager');
const { SettingsWindowManager } = require('./src/windows/SettingsWindowManager');
const { IpcRouter } = require('./src/ipc/IpcRouter');
const { TrayController } = require('./src/tray/TrayController');
const { LaunchAgent } = require('./src/system/LaunchAgent');
const { AssistantWindowManager } = require('./src/windows/AssistantWindowManager');
const { CodexService } = require('./src/codex/CodexService');

class AppController {
  constructor() {
    this.store = new SettingsStore(createElectronStoreBackend(), DEFAULTS);
    this.overlay = new OverlayWindowManager();
    this.settingsWindow = new SettingsWindowManager();
    this.launchAgent = new LaunchAgent();
    this.assistantWindow = new AssistantWindowManager();
  }

  start() {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) { app.quit(); return; }

    app.whenReady().then(() => {
      if (process.platform === 'win32') app.setAppUserModelId('com.mypetbuddy.desktop');
      if (process.platform === 'darwin') {
        // Register as a menu-bar AGENT app: no Dock icon, and — crucially —
        // focusing our popover never "activates" the app onto its own Space,
        // so clicking the tray icon while in a fullscreen app no longer yanks
        // you back to the desktop. (Paired with LSUIElement in the Info.plist.)
        app.setActivationPolicy('accessory');
        if (app.dock) app.dock.hide();
      }

      this.overlay.create();
      this.settingsWindow.create(); // pre-create the popover so it opens instantly & flicker-free
      this.assistantWindow.create();
      const hookCommand = app.isPackaged ? [process.execPath] : [process.execPath, path.join(__dirname, 'main.js')];
      this.codex = new CodexService({ directory: app.getPath('userData'), hookCommand,
        binary: this.store.get('codexBinary') || process.env.PET_BUDDY_CODEX_BIN || '' });
      this.codex.on('change', snapshot => {
        for (const win of [this.overlay.win, this.assistantWindow.win]) {
          if (win && !win.isDestroyed()) win.webContents.send('assistant:changed', snapshot);
        }
      });
      this.codex.on('attention', event => {
        const needsInput = ['waiting_approval', 'waiting_input'].includes(event.type);
        if (this.store.get('enabled')) {
          this.codex.select(event.sessionId).catch(() => {});
          this.assistantWindow.show({ focus: false });
        }
        if (Notification.isSupported() && !this.assistantWindow.win?.isFocused()) {
          const notification = new Notification({ title: needsInput ? '小黑：需要你确认一下' : '小黑：Codex 有新状态',
            body: event.message, silent: true, icon: path.join(__dirname, 'assets/icons/icon128.png') });
          notification.on('click', () => { this.codex.select(event.sessionId).catch(() => {}); this.assistantWindow.show(); });
          notification.show();
        }
      });
      this.codex.start().then(() => {
        if (this.store.get('codexAutoConnect')) this.codex.connect().catch(() => {});
      });

      // Single source of truth for reacting to setting changes.
      this.store.on('change', (payload) => {
        const { key, value } = payload;
        // 1) forward every change to the overlay renderer
        for (const win of [this.overlay.win, this.settingsWindow.win]) {
          if (win && !win.isDestroyed()) {
            win.webContents.send('settings:changed', { ...payload, settings: this.store.getAll() });
          }
        }
        // 2) 'enabled' consistently shows/hides the pet — no matter whether it
        //    was toggled from the tray menu or the popover's header switch.
        if (key === 'enabled') {
          value ? this.overlay.show() : this.overlay.hide();
          if (!value) this.assistantWindow.hide();
        }
        // 3) launch-at-login reflects to the OS
        if (key === 'launchOnLogin') {
          this.launchAgent.set(value);
        }
      });

      const router = new IpcRouter({
        store: this.store,
        overlayManager: this.overlay,
        assistantManager: this.assistantWindow,
        assistantService: this.codex,
        onOpenSettings: () => this.settingsWindow.toggle(),
        onTogglePet: () => this._togglePet(),
      });
      router.register();

      this.tray = new TrayController({
        store: this.store,
        onToggle: () => this._togglePet(),
        onOpenPanel: (bounds) => this.settingsWindow.toggle(bounds),
        onOpenAssistant: () => this.assistantWindow.show(),
        onToggleLaunch: (checked) => this.store.set('launchOnLogin', checked),
        onQuit: () => app.quit(),
      });
      this.tray.build();

      // Reflect persisted enabled/launch state on startup.
      this.launchAgent.set(this.store.get('launchOnLogin'));
      if (this.store.get('enabled')) this.overlay.show(); else this.overlay.hide();

      // Local edition: assets/settings are bundled; no automatic update requests.
    });

    app.on('window-all-closed', () => {}); // tray-resident; never auto-quit
    app.on('before-quit', event => {
      if (!this._quitting && this.codex?.hasActiveTasks()) {
        event.preventDefault(); if (this._quitPrompt) return; this._quitPrompt = true;
        dialog.showMessageBox({ type: 'question', title: 'Codex 仍有任务在运行', message: '退出桌宠会断开小黑控制的 Codex 任务。',
          buttons: ['继续运行', '退出桌宠'], defaultId: 0, cancelId: 0 }).then(({ response }) => {
          this._quitPrompt = false; if (response === 1) { this._quitting = true; app.quit(); }
        });
        return;
      }
      this._quitting = true; this.assistantWindow.closing = true; this.codex?.stop();
    });
  }

  _togglePet() {
    // Just flip the flag — the store 'change' handler does the show/hide,
    // so tray and popover toggles behave identically.
    this.store.set('enabled', !this.store.get('enabled'));
  }
}

// The installed executable doubles as a hook client; no extra Node installation.
const hookIndex = process.argv.indexOf('--pet-buddy-hook');
if (hookIndex >= 0) require('./src/codex/hook-client').runHook(process.argv[hookIndex + 1]).finally(() => app.exit(0));
else new AppController().start();
