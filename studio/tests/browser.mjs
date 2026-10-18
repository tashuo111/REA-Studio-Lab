// Run with Playwright 1.58.2. Screen capture is a generated canvas fixture, not a real desktop.
import assert from 'node:assert/strict';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../server.mjs';
const moduleName = process.env.STUDIO_PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(resolve(moduleName)).href : 'playwright');
const output = resolve(process.env.STUDIO_TEST_OUTPUT || 'studio/.local/browser-tests');
await mkdir(output, { recursive: true });
const server = createAppServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const checks = [];
async function change(id, value) {
  await page.locator(`#${id}`).fill(String(value)); await page.locator(`#${id}`).dispatchEvent('change');
}
async function save(button, name) {
  const event = page.waitForEvent('download', { timeout: 25000 }); await page.locator(`#${button}`).click();
  const download = await event; const path = resolve(output, name); await download.saveAs(path); return path;
}
async function statusIncludes(text) { await page.waitForFunction(value => document.querySelector('#status').textContent.includes(value), text); }
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  assert.equal(await page.title(), 'REA Studio Lab');
  await page.screenshot({ path: resolve(output, 'prototype-preview.png'), fullPage: true });
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('#time-readout').textContent.startsWith('00:00.0'));
  await page.locator('#play').click();
  checks.push('Demo renders and playback advances');
  await change('trim-start', 0.4); await change('trim-end', 2.4);
  await change('zoom-start', 0.5); await change('zoom-end', 2.1);
  await page.locator('#zoom-scale').evaluate(el => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const saved = await save('save-project', 'demo-project.json');
  const parsed = JSON.parse(await readFile(saved, 'utf8'));
  assert.equal(parsed.zoom.scale, 2); assert.equal(parsed.trim.start, 0.4);
  const png1 = await save('export-frame', 'aurora.png');
  await page.getByRole('button', { name: '海洋绿', exact: true }).click();
  const png2 = await save('export-frame', 'ocean.png');
  assert.notDeepEqual(await readFile(png1), await readFile(png2));
  await page.locator('#project-input').setInputFiles(saved); await statusIncludes('参数已恢复');
  assert.equal(await page.getByRole('button', { name: '极光紫', exact: true }).getAttribute('aria-pressed'), 'true');
  checks.push('Trim, zoom, background, PNG export and project round trip');
  const exported = await save('export-video', 'edited-demo.webm');
  assert.ok((await stat(exported)).size > 10000);
  await page.locator('#video-input').setInputFiles(exported); await statusIncludes('视频已导入');
  const videoProject = JSON.parse(await readFile(await save('save-project', 'video-project.json'), 'utf8'));
  assert.equal(videoProject.source.width, 1280); assert.equal(videoProject.source.height, 720);
  assert.ok(Math.abs(videoProject.source.duration - 2) < 0.45, `Export duration was ${videoProject.source.duration}`);
  const videoBytes = await readFile(exported);
  await page.locator('#video-input').setInputFiles({ name: 'renamed-copy.webm', mimeType: 'video/webm', buffer: videoBytes }); await statusIncludes('视频已导入');
  await page.locator('#project-input').setInputFiles(resolve(output, 'video-project.json')); await statusIncludes('参数已恢复');
  assert.equal(await page.locator('#source-name').textContent(), 'edited-demo.webm');
  checks.push('Real WebM encoded, decoded at 720p / ~2 seconds, renamed and restored by SHA-256');
  await page.locator('#video-input').setInputFiles({ name: 'invalid.webm', mimeType: 'video/webm', buffer: Buffer.from('not a video') });
  await statusIncludes('视频无法解码');
  assert.equal(await page.locator('#source-name').textContent(), 'edited-demo.webm');
  await page.locator('#project-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
  await statusIncludes('不支持的项目格式');
  assert.equal(await page.locator('#source-name').textContent(), 'edited-demo.webm');
  checks.push('Corrupt media and project files report errors and preserve current work');
  await page.evaluate(() => { navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('Denied by test', 'NotAllowedError'); }; });
  await page.locator('#record').click(); await statusIncludes('已取消屏幕选择');
  assert.equal(await page.locator('#record').isEnabled(), true);
  await page.evaluate(async () => {
    const { paintDemo } = await import('/render.mjs');
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      paintDemo(canvas, 0); const stream = canvas.captureStream(30);
      let tick = 0; const timer = setInterval(() => paintDemo(canvas, tick++ / 30), 33);
      window.__fixtureStream = stream; window.__fixtureTimer = timer;
      return stream;
    };
  });
  await page.locator('#record').click(); await statusIncludes('正在录屏');
  await page.waitForTimeout(1300);
  await page.locator('#stop-record').click(); await statusIncludes('录屏已载入');
  assert.ok((await page.locator('#source-name').textContent()).startsWith('recording-'));
  assert.equal(await page.evaluate(() => window.__fixtureStream.getTracks().every(track => track.readyState === 'ended')), true);
  await page.evaluate(() => clearInterval(window.__fixtureTimer));
  await save('download-source', 'synthetic-recording.webm');
  checks.push('Synthetic capture start/stop, original download, rejection and stream cleanup');
  await page.locator('#demo').click(); await page.locator('#export-video').click();
  await statusIncludes('正在实时导出'); await page.locator('#cancel-export').click(); await statusIncludes('已取消导出');
  assert.equal(await page.locator('#export-video').isEnabled(), true);
  checks.push('Export cancellation releases the editor');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: resolve(output, 'prototype-mobile.png'), fullPage: true });
  checks.push('390px responsive layout has no horizontal overflow');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: await browser.version(), checks, pageErrors: errors }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
