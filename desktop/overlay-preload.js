const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfg', {
  onUpdate: (cb) => ipcRenderer.on('cfg', (e, c) => cb(c))
});
