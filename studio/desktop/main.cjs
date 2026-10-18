const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const APP_URL = 'studio://app/';
const PICKER_URL = 'studio://app/picker.html';
const UPSTREAM_URL = 'https://github.com/morluto/rea';
const VERSION = '0.2.0';
const root = path.join(__dirname, '..');
const routes = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['public/model.mjs', 'text/javascript; charset=utf-8']],
  ['/render.mjs', ['public/render.mjs', 'text/javascript; charset=utf-8']],
  ['/media.mjs', ['public/media.mjs', 'text/javascript; charset=utf-8']],
  ['/picker.html', ['desktop/picker.html', 'text/html; charset=utf-8']],
  ['/picker.css', ['desktop/picker.css', 'text/css; charset=utf-8']],
  ['/picker.js', ['desktop/picker.js', 'text/javascript; charset=utf-8']],
]);
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
let mainWindow, pendingCapture = null, activity = null, captureSequence = 0, captureOutcome = null;

app.setName('REA Studio Lab');
app.setAppUserModelId('local.rea-studio-lab');
protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function trustedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'studio:' && url.hostname === 'app' && !url.port && !url.username && !url.password;
  } catch { return false; }
}
function senderIs(event, window, expectedUrl) {
  return window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === expectedUrl;
}
function secureWindow(window, allowUpstream = false) {
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (allowUpstream && url === UPSTREAM_URL) shell.openExternal(UPSTREAM_URL).catch(() => {});
    return { action: 'deny' };
  });
}
function finishCapture(source, failureMessage) {
  const pending = pendingCapture;
  if (!pending) return;
  pendingCapture = null;
  captureOutcome = { token: pending.token, state: source ? 'selected' : failureMessage ? 'failed' : 'cancelled', message: failureMessage };
  clearTimeout(pending.timeout);
  if (pending.window && !pending.window.isDestroyed()) pending.window.destroy();
  // null rejects the request. An empty object is an invalid stream grant in Electron 44.
  pending.callback(source ? { video: source } : null);
}
async function chooseCapture(request, callback) {
  if (!mainWindow || mainWindow.isDestroyed() || request.frame !== mainWindow.webContents.mainFrame || request.frame.url !== APP_URL || !trustedUrl(request.securityOrigin) || !request.videoRequested || request.audioRequested || !request.userGesture || pendingCapture || captureOutcome?.state !== 'pending') {
    callback(null); return;
  }
  const pending = { token: captureOutcome.token, callback, sources: new Map(), window: null, timeout: setTimeout(() => finishCapture(undefined, '录制来源选择超时，请重新开始'), 120000) };
  pendingCapture = pending;
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: false });
    if (pendingCapture !== pending) return;
    for (const source of sources) pending.sources.set(source.id, source);
    const picker = new BrowserWindow({
      parent: mainWindow, modal: true, width: 880, height: 650, minWidth: 600, minHeight: 480,
      title: '选择录制来源 · REA Studio Lab', backgroundColor: '#111719', show: false,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    pending.window = picker;
    secureWindow(picker);
    picker.on('closed', () => { if (pendingCapture === pending) finishCapture(); });
    picker.once('ready-to-show', () => picker.show());
    await picker.loadURL(PICKER_URL);
  } catch (error) {
    console.error('Unable to open capture picker:', error.message);
    if (pendingCapture === pending) finishCapture(undefined, '无法读取录制来源，请重新开始');
  }
}

ipcMain.handle('studio:capture-prepare', event => {
  if (!senderIs(event, mainWindow, APP_URL) || pendingCapture) throw new Error('Capture is unavailable');
  captureOutcome = { token: ++captureSequence, state: 'pending' };
  return captureSequence;
});
ipcMain.handle('studio:capture-outcome', (event, token) => {
  if (!senderIs(event, mainWindow, APP_URL) || captureOutcome?.token !== token) return null;
  return captureOutcome;
});
ipcMain.handle('studio:capture-sources', event => {
  const pending = pendingCapture;
  if (!pending || !senderIs(event, pending.window, PICKER_URL)) throw new Error('Unavailable capture request');
  return Array.from(pending.sources.values(), source => ({ id: source.id, name: source.name, kind: source.id.startsWith('screen:') ? 'screen' : 'window', thumbnail: source.thumbnail.toDataURL() }));
});
ipcMain.on('studio:capture-select', (event, id) => {
  const pending = pendingCapture;
  if (!pending || !senderIs(event, pending.window, PICKER_URL) || typeof id !== 'string') return;
  const source = pending.sources.get(id);
  if (source) finishCapture(source);
});
ipcMain.on('studio:capture-cancel', event => {
  if (pendingCapture && senderIs(event, pendingCapture.window, PICKER_URL)) finishCapture();
});
ipcMain.on('studio:activity', (event, value) => {
  if (senderIs(event, mainWindow, APP_URL) && [null, 'choosing', 'recording', 'loading', 'exporting'].includes(value)) activity = value;
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  protocol.handle('studio', async request => {
    if (!trustedUrl(request.url)) return new Response('Forbidden', { status: 403 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const route = routes.get(new URL(request.url).pathname);
    if (!route) return new Response('Not found', { status: 404 });
    try {
      const bytes = await readFile(path.join(root, route[0]));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'Content-Type': route[1], 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
    } catch { return new Response('Unable to load application file', { status: 500 }); }
  });
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler(() => false);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    // Electron 44 sends display capture as media with no camera/microphone types.
    // This opens only the second-stage display handler; it still requires a user selection.
    const displayRequest = permission === 'display-capture' || (permission === 'media' && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0);
    callback(Boolean(mainWindow && !mainWindow.isDestroyed() && contents === mainWindow.webContents && details.isMainFrame && details.requestingUrl === APP_URL && displayRequest));
  });
  ses.setDisplayMediaRequestHandler(chooseCapture);
  ses.on('will-download', (event, item, contents) => {
    if (!mainWindow || mainWindow.isDestroyed() || contents !== mainWindow.webContents || !trustedUrl(item.getInitiatorOrigin()) || !item.getURL().startsWith('blob:studio://app/')) {
      event.preventDefault(); return;
    }
    const filename = path.basename(item.getFilename());
    const extension = path.extname(filename).slice(1).toLowerCase();
    if (!['webm', 'mp4', 'm4v', 'mov', 'mkv', 'ogv', 'ogg', 'avi', 'png', 'json'].includes(extension)) { event.preventDefault(); return; }
    item.setSaveDialogOptions({
      title: '保存文件 · REA Studio Lab', defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    const target = contents;
    item.once('done', (_event, state) => {
      if (!target.isDestroyed()) target.send('studio:save-result', { state, name: filename });
    });
  });
  mainWindow = new BrowserWindow({
    width: 1460, height: 1000, minWidth: 1000, minHeight: 700,
    title: `REA Studio Lab ${VERSION}`, backgroundColor: '#101719', show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  secureWindow(mainWindow, true);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (['recording', 'exporting', 'loading'].includes(activity)) {
      const answer = dialog.showMessageBoxSync(mainWindow, { type: 'question', title: '任务正在进行', message: '关闭将中止当前录制、读取或导出。', detail: '如需保留本次内容，请继续操作并保存后再关闭。', buttons: ['继续操作', '关闭窗口'], defaultId: 0, cancelId: 0, noLink: true });
      if (answer === 0) { event.preventDefault(); return; }
    }
    finishCapture();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('render-process-gone', () => { activity = null; finishCapture(); });
  await mainWindow.loadURL(APP_URL);
}).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
