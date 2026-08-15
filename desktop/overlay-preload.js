const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  onCfg: (cb) => ipcRenderer.on('cfg', (e, c) => cb(c)),
  log: (level, msg) => ipcRenderer.send('log', level, msg)
});
