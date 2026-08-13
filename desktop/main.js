const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');

let overlay = null;
let settingsWin = null;
let tray = null;
let overlayVisible = true;

const OVERLAY_HEIGHT = 220;

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const defaults = { server: '', room: '', fontSize: 34, position: 'bottom' };
  try {
    return Object.assign(defaults, JSON.parse(fs.readFileSync(settingsFile(), 'utf8')));
  } catch {
    return defaults;
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
    webPreferences: { contextIsolation: true }
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenSpaces: true });
  overlay.setIgnoreMouseEvents(true); // click-through
  overlay.loadFile('overlay.html', {
    query: {
      server: s.server,
      room: s.room,
      fontSize: String(s.fontSize),
      position: s.position
    }
  });
  overlay.once('ready-to-show', () => {
    if (overlayVisible) overlay.showInactive(); // show WITHOUT activating
  });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 420,
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
    { label: overlayVisible ? 'Hide overlay' : 'Show overlay', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

ipcMain.handle('load-settings', () => loadSettings());
ipcMain.on('save-settings', (e, s) => {
  saveSettings(s);
  createOverlay();
  if (settingsWin) settingsWin.close();
});

app.whenReady().then(() => {
  const s = loadSettings();
  buildTray();
  globalShortcut.register('CommandOrControl+Alt+T', toggleOverlay);
  if (!s.server || !s.room) openSettings(); else createOverlay();
});

// tray app: keep running when all windows closed
app.on('window-all-closed', () => {});
app.on('will-quit', () => globalShortcut.unregisterAll());
