const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load-settings'),
  save: (s) => ipcRenderer.send('save-settings', s),
  updateCfg: (patch) => ipcRenderer.send('update-cfg', patch),
  closePanel: () => ipcRenderer.send('close-panel'),
  toggleCaptions: () => ipcRenderer.send('toggle-captions'),
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (cb) => ipcRenderer.on('state', (e, s) => cb(s)),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  onLog: (cb) => ipcRenderer.on('log-entry', (e, l) => cb(l)),
  quit: () => ipcRenderer.send('quit-app')
});
