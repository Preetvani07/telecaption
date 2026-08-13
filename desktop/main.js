const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

let overlay = null;
let settingsWin = null;
let panel = null;
let tray = null;
let overlayVisible = true;

const OVERLAY_HEIGHT = 220;
const PANEL_W = 300;
const PANEL_H = 500;

const DEFAULTS = { server: '', room: '', fontSize: 34, duration: 6, position: 'bottom' };

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch {
    return Object.assign({}, DEFAULTS);
  }
}

function saveSettings(s) {
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

function createOverlay() {
  const s = loadSettings();
  if (overlay) { overlay.destroy(); overlay = null; }
  if (!s.server || !s.room) return; // not configured yet

  const wa = screen.getPrimaryDisplay().workArea;
  const y = s.position === 'top' ? wa.y : wa.y + wa.height - OVERLAY_HEIGHT;

  overlay = new BrowserWindow({
    x: wa.x,
    y,
    width: wa.width,
    height: OVERLAY_HEIGHT,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,       // never steals focus from the app underneath
    hasShadow: false,
    show: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false, // captions must render even though window is never focused
      preload: path.join(__dirname, 'overlay-preload.js')
    }
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  overlay.setIgnoreMouseEvents(true); // click-through
  overlay.loadFile('overlay.html', {
    query: {
      server: s.server,
      room: s.room,
      fontSize: String(s.fontSize),
      duration: String(s.duration),
      position: s.position
    }
  });
  overlay.once('ready-to-show', () => {
    if (overlayVisible) overlay.showInactive(); // show WITHOUT activating
  });
}

// screen recorders / meeting apps grab topmost — take it back periodically
setInterval(() => {
  if (overlay && !overlay.isDestroyed() && overlayVisible) {
    overlay.setAlwaysOnTop(true, 'screen-saver');
  }
}, 4000);

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 500,
    resizable: false,
    title: 'TeleCaption Settings',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  settingsWin.removeMenu();
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

function togglePanel() {
  if (panel) { panel.close(); return; }
  const wa = screen.getPrimaryDisplay().workArea;
  panel = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    x: wa.x + wa.width - PANEL_W - 12,
    y: wa.y + Math.round((wa.height - PANEL_H) / 2),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  panel.setAlwaysOnTop(true, 'screen-saver');
  panel.loadFile('panel.html');
  panel.once('ready-to-show', () => panel.show());
  panel.on('closed', () => { panel = null; });
}

function toggleOverlay() {
  if (!overlay) return;
  overlayVisible = !overlayVisible;
  if (overlayVisible) overlay.showInactive(); else overlay.hide();
  buildTray();
}

// tiny green-dot tray icon drawn at runtime (no binary asset needed)
function trayIcon() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
    '<circle cx="8" cy="8" r="6" fill="#4caf50"/>' +
    '<circle cx="8" cy="8" r="2.5" fill="#ffffff"/></svg>';
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
}

function buildTray() {
  if (!tray) tray = new Tray(trayIcon());
  tray.setToolTip('TeleCaption');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings…', click: openSettings },
    { label: 'Control panel  (Ctrl+Alt+U)', click: togglePanel },
    { label: (overlayVisible ? 'Hide' : 'Show') + ' captions  (Ctrl+Alt+T)', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('double-click', openSettings);
}

ipcMain.handle('load-settings', () => loadSettings());

ipcMain.on('save-settings', (e, s) => {
  saveSettings(Object.assign(loadSettings(), s));
  createOverlay();
  if (settingsWin) settingsWin.close();
});

// live tweaks from the control panel — applied without recreating the overlay
ipcMain.on('update-cfg', (e, patch) => {
  const merged = Object.assign(loadSettings(), patch);
  saveSettings(merged);
  if (patch.position !== undefined) { createOverlay(); return; }
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('cfg', merged);
});

ipcMain.on('close-panel', () => { if (panel) panel.close(); });
ipcMain.on('toggle-captions', toggleOverlay);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // relaunching the installed app while it runs in tray → bring the UI up
  app.on('second-instance', () => openSettings());

  app.whenReady().then(() => {
    buildTray();
    globalShortcut.register('CommandOrControl+Alt+T', toggleOverlay);
    globalShortcut.register('CommandOrControl+Alt+U', togglePanel);
    openSettings();   // UI shows on every launch
    createOverlay();  // captions start alongside if already configured
  });
}

// tray app: keep running when all windows closed
app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
