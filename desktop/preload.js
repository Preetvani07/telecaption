const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load-settings'),
  save: (s) => ipcRenderer.send('save-settings', s)
});
