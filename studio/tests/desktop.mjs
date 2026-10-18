// End-to-end Windows test. Actual capture targets only a window created by this test.
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const version = require('../package.json').version;
const { _electron } = await import(pathToFileURL(resolve(process.env.STUDIO_PLAYWRIGHT_MODULE || 'studio/.local/tooling/node_modules/playwright/index.mjs')).href);
const output = resolve(process.env.STUDIO_DESKTOP_TEST_OUTPUT || 'studio/.local/desktop-tests');
await mkdir(output, { recursive: true });
const executablePath = process.env.STUDIO_DESKTOP_EXE || require('../.local/tooling/node_modules/electron');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ executablePath, args: process.env.STUDIO_DESKTOP_EXE ? [] : [resolve('studio/desktop/main.cjs')], env, timeout: 30000 });
application.process().stderr?.on('data', chunk => { if (process.env.STUDIO_CAPTURE_DEBUG === '1') process.stderr.write(chunk); });
const checks = [], errors = [], resolutionResults = [];
const page = await application.firstWindow();
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);
async function statusIncludes(text) { await page.waitForFunction(value => document.querySelector('#status').textContent.includes(value), text); }
async function change(id, value) { await page.locator(`#${id}`).fill(String(value)); await page.locator(`#${id}`).dispatchEvent('change'); }
async function save(button, expectedName) {
  const count = await application.evaluate(() => globalThis.__studioTestDownloads.length);
  await page.locator(`#${button}`).click();
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const downloads = await application.evaluate(() => globalThis.__studioTestDownloads);
    if (downloads.length > count) {
      const result = downloads.at(-1);
      assert.equal(result.state, 'completed'); assert.equal(result.name, expectedName);
      return result.path;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Download did not complete: ${expectedName}. UI: ${await page.locator('#status').textContent()}`);
}
async function openPicker() {
  const next = application.waitForEvent('window', { timeout: 15000 });
  await page.locator('#record').click();
  const picker = await next;
  await picker.waitForURL('studio://app/picker.html');
  await picker.waitForFunction(() => !document.querySelector('#message').textContent.startsWith('正在'));
  return picker;
}
try {
  await page.waitForURL('studio://app/');
  await page.locator('.badge').filter({ hasText: `桌面版 ${version}` }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ secure: isSecureContext, node: typeof require, process: typeof process, pickerApi: typeof capturePicker })), { secure: true, node: 'undefined', process: 'undefined', pickerApi: 'undefined' });
  assert.equal(await page.evaluate(async () => (await fetch('/desktop/main.cjs')).status), 404);
  assert.equal(await page.evaluate(async () => (await fetch('/styles.css', { method: 'POST' })).status), 405);
  checks.push('Standalone secure local protocol; renderer has no Node.js or picker IPC access; only listed assets served');
  await application.evaluate(({ session }, directory) => {
    globalThis.__studioTestDownloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const name = item.getFilename();
      const path = directory + '/' + Date.now() + '-' + name;
      item.setSavePath(path);
      item.once('done', (_event, state) => globalThis.__studioTestDownloads.push({ state, name, path }));
    });
  }, output);
  await page.screenshot({ path: join(output, 'desktop-preview.png'), fullPage: true });
  await change('trim-start', 0.4); await change('trim-end', 2.4);
  await change('zoom-start', 0.5); await change('zoom-end', 2.1);
  await page.locator('#zoom-scale').evaluate(element => { element.value = '2'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const saved = JSON.parse(await readFile(await save('save-project', 'rea-studio-project.json'), 'utf8'));
  assert.equal(saved.zoom.scale, 2); assert.equal(saved.zoom.end - saved.zoom.start, 1.6);
  const png = await save('export-frame', 'rea-studio-frame.png');
  assert.ok((await stat(png)).size > 10000);
  const exported = await save('export-video', 'rea-studio-export.webm');
  assert.ok((await stat(exported)).size > 10000);
  await page.locator('#video-input').setInputFiles(exported); await statusIncludes('视频已导入');
  const decoded = JSON.parse(await readFile(await save('save-project', 'rea-studio-project.json'), 'utf8'));
  assert.equal(decoded.source.width, 1280); assert.equal(decoded.source.height, 720);
  assert.ok(Math.abs(decoded.source.duration - 2) < 0.5);
  checks.push('Native download handling saves JSON/PNG/WebM; edited 2-second WebM decodes at 1280x720');
  for (const [resolution, width, height] of [['1080p', 1920, 1080], ['1440p', 2560, 1440], ['2160p', 3840, 2160]]) {
    await page.locator('#demo').click();
    await page.locator('#output-resolution').selectOption(resolution);
    await change('trim-end', 1.5);
    await page.locator('#padding').evaluate(element => { element.value = '0'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    const bounds = await page.locator('#preview').boundingBox();
    await page.locator('#preview').click({ position: { x: bounds.width * 0.75, y: bounds.height * 0.25 } });
    const paramsPath = await save('save-project', 'rea-studio-project.json');
    const params = JSON.parse(await readFile(paramsPath, 'utf8'));
    assert.equal(params.version, 3); assert.equal(params.output.resolution, resolution);
    assert.ok(Math.abs(params.zoom.x - 0.75) < 0.005); assert.ok(Math.abs(params.zoom.y - 0.25) < 0.005);
    await page.locator('#output-resolution').selectOption('720p');
    await page.locator('#project-input').setInputFiles(paramsPath); await statusIncludes('参数已恢复');
    assert.equal(await page.locator('#output-resolution').inputValue(), resolution);
    const frame = await readFile(await save('export-frame', 'rea-studio-frame.png'));
    assert.equal(frame.readUInt32BE(16), width); assert.equal(frame.readUInt32BE(20), height);
    const started = performance.now();
    const encoded = await save('export-video', 'rea-studio-export.webm');
    const exportWallMs = Math.round(performance.now() - started);
    await page.locator('#video-input').setInputFiles(encoded); await statusIncludes('视频已导入');
    assert.equal(await page.locator('#output-resolution').inputValue(), resolution);
    const highres = JSON.parse(await readFile(await save('save-project', 'rea-studio-project.json'), 'utf8'));
    assert.equal(highres.source.width, width); assert.equal(highres.source.height, height);
    assert.ok(Math.abs(highres.source.duration - 1.5) < 0.5, `${resolution} duration: ${highres.source.duration}`);
    resolutionResults.push({ resolution, width, height, duration: highres.source.duration, bytes: (await stat(encoded)).size, exportWallMs, outputFile: encoded });
    checks.push(`${resolution}: PNG and real decoded WebM ${width}x${height}; focus geometry and project restore; selected resolution survives import`);
  }
  await page.screenshot({ path: join(output, 'desktop-4k-preview.png'), fullPage: true });
  await page.locator('#demo').click();
  const legacy = { ...saved, version: 1 }; delete legacy.output;
  await page.locator('#project-input').setInputFiles({ name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await statusIncludes('参数已恢复');
  assert.equal(await page.locator('#output-resolution').inputValue(), '720p');
  checks.push('Version 1 project migrates to 720p with its original edits');
  const cancelledPicker = await openPicker();
  await cancelledPicker.locator('#cancel').click();
  await statusIncludes('已取消屏幕选择');
  assert.equal(await page.locator('#record').isEnabled(), true);
  checks.push('Capture picker cancellation returns to the editor without starting capture');

  const fixtureCreated = application.waitForEvent('window');
  await application.evaluate(async ({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ title: 'REA Capture Fixture', width: 800, height: 500, x: 40, y: 40, backgroundColor: '#13493c', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    fixture.setMenuBarVisibility(false);
    const html = '<!doctype html><html><head><title>REA Capture Fixture</title></head><body style="margin:0;background:#13493c;color:white;font:28px Segoe UI;display:grid;place-content:center;height:100vh"><div>REA Capture Fixture</div><p id="clock"></p><script>setInterval(()=>document.getElementById("clock").textContent=String(performance.now().toFixed(0)),33)</script></body></html>';
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    globalThis.__studioFixtureWindow = fixture;
  });
  const fixture = await fixtureCreated;
  await fixture.waitForFunction(() => document.title === 'REA Capture Fixture');
  await page.bringToFront();
  const picker = await openPicker();
  await picker.locator('[data-kind="window"]').click();
  await picker.getByRole('button', { name: 'REA Capture Fixture', exact: true }).click();
  await picker.getByRole('button', { name: 'REA Capture Fixture', exact: true }).screenshot({ path: join(output, 'capture-fixture-selection.png') });
  await picker.locator('#confirm').click();
  await statusIncludes('正在录屏');
  await page.waitForTimeout(1800);
  await page.locator('#stop-record').click(); await statusIncludes('录屏已载入');
  const rawName = await page.locator('#source-name').textContent();
  assert.ok(rawName.startsWith('recording-'));
  const raw = await save('download-source', rawName);
  assert.ok((await stat(raw)).size > 2000);
  await page.locator('#video-input').setInputFiles(raw); await statusIncludes('视频已导入');
  const captured = JSON.parse(await readFile(await save('save-project', 'rea-studio-project.json'), 'utf8'));
  assert.ok(captured.source.duration >= 1 && captured.source.duration < 10);
  assert.ok(captured.source.width >= 500 && captured.source.height >= 300);
  await page.locator('#zoom-enabled').uncheck();
  await page.locator('#scrub').evaluate(element => { element.value = '0.6'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(250);
  await save('export-frame', 'rea-studio-frame.png');
  checks.push(`Real Windows window capture of test-owned fixture; stop, save, decode: ${captured.source.width}x${captured.source.height}, ${captured.source.duration.toFixed(2)} seconds`);
  await application.evaluate(() => globalThis.__studioFixtureWindow.destroy());
  const closePicker = await openPicker();
  const pickerClosed = closePicker.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'studio://app/picker.html').close());
  await pickerClosed;
  await statusIncludes('已取消屏幕选择');
  await page.locator('#demo').click();
  await page.locator('#export-video').click(); await statusIncludes('正在实时导出');
  await page.locator('#cancel-export').click(); await statusIncludes('已取消导出');
  assert.equal(await page.locator('#export-video').isEnabled(), true);
  checks.push('Closing picker cancels request; export cancellation releases controls');
  assert.deepEqual(errors, []);
  const versions = await application.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }));
  const result = { testedAt: new Date().toISOString(), executablePath, versions, checks, resolutionResults, pageErrors: errors, limitations: ['System Save As UI bypassed only by test harness setSavePath; production uses Save As', 'Actual capture limited to a test-owned application window; full-screen capture and long recordings not tested', 'High-resolution encoding uses a generated 720p demo as the source: verifies output pixels, not recovered 4K source detail', '4K checks use short clips; sustained frame rate, CPU and peak memory have not been measured'] };
  await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Renderer status:', await page.locator('#status').textContent().catch(() => 'unavailable'));
  console.error('Page errors:', errors);
  throw error;
} finally {
  // End pending work before closing; test failures must not leave a recorder running.
  await application.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await application.close();
}
