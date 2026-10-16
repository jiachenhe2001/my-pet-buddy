const { app } = require('electron');

// Cross-platform launch-at-login wrapper.
class LaunchAgent {
  set(enabled) {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return;
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  }
  get() {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return false;
    return app.getLoginItemSettings().openAtLogin;
  }
}

module.exports = { LaunchAgent };
