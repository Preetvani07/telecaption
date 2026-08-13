const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load-settings'),
  save: (s) => ipcRenderer.send('save-settings', s),
  updateCfg: (patch) => ipcRenderer.send('update-cfg', patch),
  closePanel: () => ipcRenderer.send('close-panel'),
  toggleCaptions: () => ipcRenderer.send('toggle-captions')
});
