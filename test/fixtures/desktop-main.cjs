// Isolate the smoke test profile and observe calls to the real native window API.
const { app, BrowserWindow, screen } = require('electron');
app.setPath('userData', process.env.PET_BUDDY_TEST_PROFILE);
// CDP input doesn't move the OS cursor. Feed known coordinates to the normal
// native cursor polling path while retaining the real native click-through API.
const cursor = screen.getCursorScreenPoint;
screen.getCursorScreenPoint = () => global.__petTestCursor || cursor();
const original = BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents = function(ignore, ...args) {
    this.__testIgnoresMouse = ignore;
    return original.call(this, ignore, ...args);
};
require('../../desktop/main');
