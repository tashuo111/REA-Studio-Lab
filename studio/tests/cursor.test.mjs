import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { normalizePoint, CursorCapture } = createRequire(import.meta.url)('../desktop/cursor.cjs');

test('capture coordinates handle negative monitor origins, physical/DIP scales and outside positions', () => {
  for (const factor of [1, 1.25, 1.5, 2]) {
    const bounds = { x: -1920 * factor, y: 100 * factor, width: 1920 * factor, height: 1080 * factor };
    assert.deepEqual(normalizePoint({ x: (-1920 + 480) * factor, y: (100 + 540) * factor }, bounds), { x: 0.25, y: 0.5 });
    assert.deepEqual(normalizePoint({ x: 0, y: 200 }, bounds), { x: null, y: null });
  }
  assert.deepEqual(normalizePoint(null, null), { x: null, y: null });
});

test('screen sampler requires the selected display, stops cleanly and rejects replayed starts', async () => {
  let point = { x: 50, y: 25 };
  const screen = { getAllDisplays: () => [{ id: 42, bounds: { x: 0, y: 0, width: 100, height: 100 } }], getCursorScreenPoint: () => point };
  const capture = new CursorCapture({ id: 'screen:0:0', display_id: '42' }, screen);
  assert.deepEqual(await capture.ready, { available: true });
  capture.start(performance.timeOrigin + performance.now());
  assert.throws(() => capture.start(performance.timeOrigin + performance.now()));
  point = { x: 75, y: 80 };
  await new Promise(resolve => setTimeout(resolve, 75));
  const result = await capture.stop();
  assert.equal(result.kind, 'screen'); assert.deepEqual(result.samples[0], { t: 0, x: 0.5, y: 0.25 });
  assert.ok(result.samples.some(sample => sample.x === 0.75 && sample.y === 0.8));
  const count = result.samples.length; await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal((await capture.stop()).samples.length, count);
  const unknown = new CursorCapture({ id: 'screen:0:0', display_id: 'wrong' }, screen);
  await assert.rejects(unknown.ready, /无法确定/);
  assert.equal((await unknown.stop()).samples.length, 0);
});

test('repeated stop waits for the same native cleanup and preserves collected samples', async () => {
  let close, ended = 0;
  const capture = Object.assign(Object.create(CursorCapture.prototype), {
    samples: [{ t: 0, x: 0.2, y: 0.3 }], kind: 'window', warning: '', rejectReady() {},
    child: { exitCode: null, stdin: { end() { ended++; } }, kill() { throw new Error('Cleanup should finish before timeout'); } },
    closed: new Promise(resolve => { close = resolve; }),
  });
  const first = capture.stop(), second = capture.stop();
  assert.equal(first, second); assert.equal(ended, 1);
  let settled = false; first.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
  capture.child.exitCode = 0; close();
  assert.deepEqual((await first).samples, [{ t: 0, x: 0.2, y: 0.3 }]);
});
