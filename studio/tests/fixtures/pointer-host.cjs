// Separate test-owned process so capture exercises Windows' native window surface.
const { app, BrowserWindow } = require('electron');
app.setName('REA Pointer Test Host');
app.whenReady().then(() => {
  const placeholder = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  void placeholder.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
