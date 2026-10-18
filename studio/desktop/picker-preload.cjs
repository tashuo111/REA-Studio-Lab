const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('capturePicker', {
  sources: () => ipcRenderer.invoke('studio:capture-sources'),
  select: id => { if (typeof id === 'string') ipcRenderer.send('studio:capture-select', id); },
  cancel: () => ipcRenderer.send('studio:capture-cancel'),
});
