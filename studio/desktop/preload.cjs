const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioDesktop', {
  version: '0.2.0',
  prepareCapture: () => ipcRenderer.invoke('studio:capture-prepare'),
  captureOutcome: token => ipcRenderer.invoke('studio:capture-outcome', token),
  setActivity: kind => { if ([null, 'choosing', 'recording', 'loading', 'exporting'].includes(kind)) ipcRenderer.send('studio:activity', kind); },
  onSaveResult: listener => {
    if (typeof listener !== 'function') return;
    ipcRenderer.on('studio:save-result', (_event, result) => listener({ state: result.state, name: result.name }));
  },
});
