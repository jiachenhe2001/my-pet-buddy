const { BrowserWindow, screen } = require('electron');
const path = require('path');

class OverlayWindowManager {
  constructor() { this.win = null; this._cursorTimer = null; this._interactive = false; }

  create() {
    this._interactive = false;
    const { workArea } = screen.getPrimaryDisplay();
    this.win = new BrowserWindow({
      x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height,
      transparent: true, frame: false, resizable: false, movable: false,
      focusable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        contextIsolation: true, nodeIntegration: false,
      },
    });
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    this.win.loadFile(path.join(__dirname, '..', '..', 'overlay', 'overlay.html'));

    // Native cursor sampling also works when ignored windows don't receive DOM
    // mouse moves, and when an animation moves under a stationary cursor.
    this._cursorTimer = setInterval(() => {
      if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
      const point = screen.getCursorScreenPoint(), bounds = this.win.getBounds();
      this.win.webContents.send('overlay:cursor', { x: point.x - bounds.x, y: point.y - bounds.y });
    }, 50);
    this._cursorTimer.unref();

    // Keep the overlay fitted to the primary display on ANY display change:
    // resolution/scaling change, or a monitor being plugged in / unplugged.
    const refit = () => this.applyDisplayBounds();
    screen.on('display-metrics-changed', refit);
    screen.on('display-added', refit);
    screen.on('display-removed', refit);
    this.win.on('closed', () => {
      clearInterval(this._cursorTimer);
      for (const event of ['display-metrics-changed', 'display-added', 'display-removed']) screen.removeListener(event, refit);
      this.win = null;
    });
    return this.win;
  }

  applyDisplayBounds() {
    if (!this.win) return;
    const { workArea } = screen.getPrimaryDisplay();
    this.win.setBounds(workArea);
  }

  setInteractive(bool) {
    if (this.win && this._interactive !== Boolean(bool)) {
      this._interactive = Boolean(bool);
      this.win.setIgnoreMouseEvents(!this._interactive, { forward: true });
    }
  }

  show() { if (this.win) this.win.showInactive(); }
  hide() { if (this.win) this.win.hide(); }
}

module.exports = { OverlayWindowManager };
