// Real Windows capture of a test-owned window. No other desktop pixels are recorded.
import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _electron } = await import(pathToFileURL(resolve('studio/.local/tooling/node_modules/playwright/index.mjs')).href);
const output = resolve(process.env.STUDIO_POINTER_TEST_OUTPUT || 'studio/.local/pointer-tests');
await mkdir(output, { recursive: true });
const executablePath = process.env.STUDIO_DESKTOP_EXE || require('../.local/tooling/node_modules/electron');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const application = await _electron.launch({ executablePath, args: process.env.STUDIO_DESKTOP_EXE ? [] : [resolve('studio/desktop/main.cjs')], env });
const external = process.env.STUDIO_EXTERNAL_POINTER === '1';
const fixtureApp = external ? await _electron.launch({ executablePath: require('../.local/tooling/node_modules/electron'), args: [resolve('studio/tests/fixtures/pointer-host.cjs')], env }) : application;
const page = await application.firstWindow(); page.setDefaultTimeout(15000);
const errors = [], checks = [], stages = [];
page.on('pageerror', error => errors.push(error.stack));
const status = text => page.waitForFunction(value => document.querySelector('#status').textContent.includes(value), text);
async function save(button) {
  const count = await application.evaluate(() => globalThis.__pointerDownloads.length);
  await page.locator(`#${button}`).click();
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    const files = await application.evaluate(() => globalThis.__pointerDownloads);
    if (files.length > count) { assert.equal(files.at(-1).state, 'completed'); return files.at(-1).path; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Save timed out: ' + await page.locator('#status').textContent());
}
async function field(id, value) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('change'); }
async function scrub(value) { await page.locator('#scrub').evaluate((element, time) => { element.value = String(time); element.dispatchEvent(new Event('input', { bubbles: true })); }, value); await page.waitForTimeout(200); }
try {
  await page.waitForURL('studio://app/');
  assert.equal(await page.locator('#follow-option').isDisabled(), true);
  await assert.rejects(page.evaluate(() => window.studioDesktop.preparePointer(999999)));
  await assert.rejects(page.evaluate(() => window.studioDesktop.startPointer(999999, Date.now())));
  checks.push('No trace on old/demo video; following is disabled and unselected capture tokens cannot start sampling');
  await application.evaluate(({ session }, directory) => {
    globalThis.__pointerDownloads = [];
    session.defaultSession.on('will-download', (_event, item) => {
      const path = directory + '/' + Date.now() + '-' + item.getFilename(); item.setSavePath(path);
      item.once('done', (_event, state) => globalThis.__pointerDownloads.push({ path, state }));
    });
  }, output);
  const created = fixtureApp.waitForEvent('window');
  await fixtureApp.evaluate(async ({ BrowserWindow }) => {
    const fixture = new BrowserWindow({ title: 'REA Pointer Fixture', width: 900, height: 600, x: 100, y: 100, backgroundColor: '#193c49', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    fixture.setMenuBarVisibility(false);
    const html = '<!doctype html><html><head><title>REA Pointer Fixture</title><style>body{margin:0;height:100vh;background:linear-gradient(90deg,#862344 0%,#862344 33%,#236453 33%,#236453 67%,#314996 67%);color:white;font:24px Segoe UI}h1{padding:20px}section{display:flex;justify-content:space-around;padding-top:120px}button{font:24px Segoe UI;padding:30px;color:#122d35;background:white;border:0;border-radius:12px}</style></head><body><h1>Mouse Follow Test</h1><section><button>Left target</button><button>Right target</button></section><p id="clock"></p><script>setInterval(()=>document.getElementById("clock").textContent=String(performance.now().toFixed(0)),33)</script></body></html>';
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    globalThis.__pointerFixture = fixture;
  });
  const fixturePage = await created;
  await fixturePage.waitForFunction(() => document.title === 'REA Pointer Fixture');
  await fixturePage.evaluate(() => { window.__testClicks = []; document.addEventListener('pointerdown', event => window.__testClicks.push({ x: event.clientX / innerWidth, y: event.clientY / innerHeight })); });
  await page.bringToFront();
  const pickerEvent = application.waitForEvent('window'); await page.locator('#record').click();
  const picker = await pickerEvent; await picker.waitForURL('studio://app/picker.html');
  await picker.locator('[data-kind="window"]').click();
  await picker.getByRole('button', { name: 'REA Pointer Fixture', exact: true }).click();
  console.log('Selected capture id:', await picker.getByRole('button', { name: 'REA Pointer Fixture', exact: true }).getAttribute('data-source-id'));
  await picker.locator('#confirm').click(); await status('鼠标轨迹记录中');
  for (const fraction of [0.22, 0.78, 0.35]) {
    stages.push(await fixtureApp.evaluate(({ screen }, fraction) => {
      const point = screen.getCursorScreenPoint(), fixture = globalThis.__pointerFixture;
      fixture.setBounds({ x: Math.round(point.x - 900 * fraction), y: Math.round(point.y - 300), width: 900, height: 600 });
      fixture.setAlwaysOnTop(true); fixture.show(); fixture.moveTop();
      return { fraction, point, bounds: fixture.getBounds(), displays: screen.getAllDisplays().map(display => ({ id: display.id, scaleFactor: display.scaleFactor, bounds: display.bounds })) };
    }, fraction));
    await page.waitForTimeout(1100);
  }
  if (process.env.STUDIO_POINTER_MANUAL === '1') {
    await fixtureApp.evaluate(() => globalThis.__pointerFixture.setBounds({ x: 100, y: 100, width: 900, height: 600 }));
    await writeFile(join(output, 'manual-ready.json'), JSON.stringify({ message: 'Use sky to click both targets in REA Pointer Fixture, then create manual-done.txt', output }));
    console.log('Manual cursor test ready: ' + output);
    const until = Date.now() + 90000;
    while (true) { try { await access(join(output, 'manual-done.txt')); break; } catch { if (Date.now() > until) throw new Error('Manual cursor test timed out'); await page.waitForTimeout(300); } }
  }
  await fixtureApp.evaluate(() => globalThis.__pointerFixture.setAlwaysOnTop(false));
  await page.bringToFront(); await page.locator('#stop-record').click(); await status('录屏已载入');
  const recordStatus = await page.locator('#status').textContent();
  const parametersPath = await save('save-project');
  const recorded = JSON.parse(await readFile(parametersPath, 'utf8'));
  assert.equal(recorded.zoom.mode, 'follow', JSON.stringify({ recordStatus, recorded, stages }));
  assert.equal(recorded.pointer.kind, 'window'); assert.ok(recorded.pointer.samples.length >= 60);
  const visible = recorded.pointer.samples.filter(sample => sample.x !== null);
  const clicks = await fixturePage.evaluate(() => window.__testClicks);
  if (process.env.STUDIO_POINTER_MANUAL === '1') {
    assert.ok(clicks.length >= 2, 'Both test targets must be clicked with the real Windows cursor');
    // External native capture includes the title bar; in-process Aura captures client content.
    const geometry = await fixtureApp.evaluate(({ screen }) => ({ bounds: globalThis.__pointerFixture.getBounds(), content: globalThis.__pointerFixture.getContentBounds(), scale: screen.getDisplayMatching(globalThis.__pointerFixture.getBounds()).scaleFactor }));
    for (const click of clicks) {
      const border = (geometry.bounds.width * geometry.scale - recorded.source.width) / 2;
      const top = geometry.bounds.height * geometry.scale - recorded.source.height - border;
      const x = external ? ((geometry.content.x - geometry.bounds.x) * geometry.scale + click.x * geometry.content.width * geometry.scale - border) / recorded.source.width : click.x;
      const y = external ? ((geometry.content.y - geometry.bounds.y) * geometry.scale + click.y * geometry.content.height * geometry.scale - top) / recorded.source.height : click.y;
      assert.ok(visible.some(sample => Math.abs(sample.x - x) < 0.025 && Math.abs(sample.y - y) < 0.025), JSON.stringify({ click, x, y, geometry, visible }));
    }
    checks.push('Real Windows clicks agree with recorded source-relative cursor coordinates within 2.5 percent on both axes');
  }
  assert.ok(visible.some(sample => sample.x < 0.3) && visible.some(sample => sample.x > 0.7), JSON.stringify({ visible, stages }));
  assert.equal(await page.locator('#manual-focus').isHidden(), true);
  assert.equal(await page.locator('#follow-controls').isVisible(), true);
  assert.equal(await application.evaluate(() => process._getActiveHandles().filter(handle => handle.constructor.name === 'ChildProcess' && handle.exitCode === null).length), 0);
  const raw = await save('download-source');
  checks.push('Real Windows mouse samples map to a moving decorated capture window; new recording enables follow; helper exits on stop');

  await field('zoom-end', recorded.source.duration); await field('zoom-start', 0);
  await page.locator('#zoom-scale').evaluate(element => { element.value = '2'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const sampleTime = Math.min(recorded.source.duration - 0.5, 2.3);
  await scrub(sampleTime);
  const followed = await readFile(await save('export-frame'));
  await page.locator('#zoom-mode').selectOption('manual');
  assert.equal(await page.locator('#manual-focus').isVisible(), true);
  const manual = await readFile(await save('export-frame'));
  assert.notDeepEqual(followed, manual);
  await page.locator('#zoom-mode').selectOption('follow');
  await scrub(0.5); await scrub(sampleTime);
  assert.deepEqual(await readFile(await save('export-frame')), followed);
  await page.locator('#follow-smoothing').evaluate(element => { element.value = '0.4'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const settings = await save('save-project');
  await page.locator('#video-input').setInputFiles(raw); await status('视频已导入');
  assert.equal(await page.locator('#follow-option').isDisabled(), true);
  await page.locator('#project-input').setInputFiles(settings); await status('参数已恢复');
  assert.equal(await page.locator('#zoom-mode').inputValue(), 'follow');
  assert.equal(await page.locator('#follow-smoothing').inputValue(), '0.4');
  checks.push('Fixed/follow modes share zoom timing; preview images differ; seeking is deterministic; source + JSON restore full trace and smoothing');
  await page.locator('#output-resolution').selectOption('1440p');
  await field('trim-start', 0.4); await field('trim-end', 3.2);
  await scrub(2);
  await page.screenshot({ path: join(output, 'mouse-follow-preview.png'), fullPage: true });
  const exportStarted = performance.now();
  const exported = await save('export-video'); const exportWallMs = Math.round(performance.now() - exportStarted);
  await page.locator('#video-input').setInputFiles(exported); await status('视频已导入');
  const decoded = JSON.parse(await readFile(await save('save-project'), 'utf8'));
  assert.equal(decoded.source.width, 2560); assert.equal(decoded.source.height, 1440);
  assert.ok(decoded.source.duration > 2.2 && decoded.source.duration < 3.3);
  assert.equal(decoded.pointer, null);
  await page.locator('#project-input').setInputFiles(settings); await status('请先导入此参数对应的原片');
  checks.push('Following camera exports to decoded 2560x1440 WebM; a trace cannot be applied to a different video');
  assert.deepEqual(errors, []);
  const result = { testedAt: new Date().toISOString(), executablePath, externalWindow: external, checks, errors, realMouseInput: process.env.STUDIO_POINTER_MANUAL === '1', clicks, stages, source: recorded.source, samples: recorded.pointer.samples.length, visibleSamples: visible.length, xRange: [Math.min(...visible.map(sample => sample.x)), Math.max(...visible.map(sample => sample.x))], export: { width: decoded.source.width, height: decoded.source.height, duration: decoded.source.duration, bytes: (await stat(exported)).size, exportWallMs }, limitations: ['Real capture covers a test-owned decorated window on this Windows computer; full-screen capture and mixed-DPI multiple-monitor hardware not exercised', 'Coordinate transform tests cover negative origins and 100/125/150/200 percent scales; these are simulated geometry cases', 'Timing is tied to MediaRecorder start and sampled with a 33ms timer, not frame-accurate input capture', 'CPU and peak process-family memory not measured'] };
  await writeFile(join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Renderer:', await page.locator('#status').textContent().catch(() => 'closed'));
  console.error('Page errors:', errors); throw error;
} finally {
  if (external) {
    await fixtureApp.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
    await fixtureApp.close();
  }
  await application.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await application.close();
}
