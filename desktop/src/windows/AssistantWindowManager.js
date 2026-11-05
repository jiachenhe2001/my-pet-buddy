const { BrowserWindow, screen } = require('electron');
const path = require('node:path');
const { placeAssistant } = require('./assistantPlacement');

class AssistantWindowManager {
  create() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({ width: 400, height: 650, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', resizable: false, movable: false, skipTaskbar: true,
      fullscreenable: false, alwaysOnTop: true, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, '../../preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', event => event.preventDefault());
    this.win.loadFile(path.join(__dirname, '../../assistant/assistant.html'));
    this.win.webContents.on('did-finish-load', () => this._position());
    this.win.on('close', event => { if (!this.closing) { event.preventDefault(); this.hide(); } });
    this.win.on('closed', () => { this.win = null; });
    return this.win;
  }
  setAnchor(rect) {
    if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key]))) return;
    this.anchor = rect; if (this.win?.isVisible()) this._position();
  }
  _position() {
    if (!this.win || this.win.isDestroyed()) return;
    const area = screen.getPrimaryDisplay().workArea;
    const anchor = this.anchor || { x: area.x + area.width * .84 - 60, y: area.y + area.height * .96 - 120, width: 120, height: 120 };
    const display = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) }).workArea;
    const next = placeAssistant(anchor, display), bounds = { x: next.x, y: next.y, width: next.width, height: next.height };
    const previous = this.win.getBounds();
    if (Object.keys(bounds).some(key => previous[key] !== bounds[key])) this.win.setBounds(bounds, false);
    if (!this.win.webContents.isLoading()) this.win.webContents.send('assistant:placement', next);
  }
  show({ focus = true } = {}) {
    this.create(); this._position();
    if (focus) { this.win.show(); this.win.focus(); } else this.win.showInactive();
  }
  toggle() { if (this.win?.isVisible()) this.hide(); else this.show(); }
  hide() { if (this.win && !this.win.isDestroyed()) this.win.hide(); }
}
module.exports = { AssistantWindowManager };
