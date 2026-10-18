const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioDesktop', {
  version: process.argv.find(value => value.startsWith('--studio-version='))?.slice('--studio-version='.length) || 'development',
  prepareCapture: () => ipcRenderer.invoke('studio:capture-prepare'),
  captureOutcome: token => ipcRenderer.invoke('studio:capture-outcome', token),
  preparePointer: token => ipcRenderer.invoke('studio:pointer-prepare', token),
  startPointer: (token, epoch) => ipcRenderer.invoke('studio:pointer-start', token, epoch),
  stopPointer: token => ipcRenderer.invoke('studio:pointer-stop', token),
  setActivity: kind => { if ([null, 'choosing', 'recording', 'loading', 'exporting'].includes(kind)) ipcRenderer.send('studio:activity', kind); },
  onSaveResult: listener => {
    if (typeof listener !== 'function') return;
    ipcRenderer.on('studio:save-result', (_event, result) => listener({ state: result.state, name: result.name }));
  },
});
