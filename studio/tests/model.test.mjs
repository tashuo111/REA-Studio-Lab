import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject, cropAt, zoomAt, frameRect, sameSource, OUTPUT_PRESETS, focusAt, MAX_POINTER_SAMPLES, MAX_PROJECT_BYTES } from '../public/model.mjs';

test('saved project round trips and rejects malformed/unbounded metadata', () => {
  const p = createProject();
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  for (const edit of [q => q.trim.end = 0, q => q.zoom.x = NaN, q => q.frame.padding = -1, q => q.version = 99, q => q.source.duration = Infinity, q => q.zoom.end = q.zoom.start, q => q.frame.background = '__proto__']) {
    const bad = structuredClone(p); edit(bad); assert.throws(() => parseProject(bad));
  }
});

test('legacy parameters migrate to 720p; output presets round trip without allowing arbitrary canvas sizes', () => {
  const legacy = createProject(); legacy.version = 1; delete legacy.output;
  const migrated = parseProject(legacy);
  assert.equal(migrated.version, 3); assert.equal(migrated.output.resolution, '720p');
  for (const resolution of Object.keys(OUTPUT_PRESETS)) assert.equal(parseProject(createProject(undefined, resolution)).output.resolution, resolution);
  for (const output of [null, {}, { resolution: '8k' }, { resolution: '__proto__' }, { resolution: 2160 }]) assert.throws(() => parseProject({ ...createProject(), output }));
  const p = createProject(), base = frameRect(p.source, p.frame);
  for (const preset of Object.values(OUTPUT_PRESETS)) {
    const rect = frameRect(p.source, p.frame, preset.width, preset.height);
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(rect[key] / (preset.width / 1280) - base[key]) < 1e-8);
  }
});

function trackedProject() {
  const project = createProject({ kind: 'video', name: 'capture.webm', size: 123, lastModified: 1, sha256: 'a'.repeat(64), width: 1920, height: 1080, duration: 5 });
  project.pointer = { kind: 'window', samples: [{ t: 0, x: 0.2, y: 0.3 }, { t: 1, x: 0.8, y: 0.7 }, { t: 2, x: null, y: null }, { t: 3, x: 0.9, y: 0.9 }] };
  Object.assign(project.zoom, { mode: 'follow', start: 0, end: 5, scale: 2 });
  return project;
}

test('saved traces are bounded, ordered and associated with video; legacy projects retain fixed focus', () => {
  const project = trackedProject();
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  const edits = [p => p.pointer.samples[1].t = 0, p => p.pointer.samples[1].t = 6, p => p.pointer.samples[1].x = 2, p => p.pointer.samples[1].y = NaN, p => p.pointer.samples[1].x = null, p => p.pointer.kind = 'unknown', p => p.pointer = null, p => p.zoom.smoothing = 0, p => p.zoom.mode = 'unknown', p => p.pointer.samples = Array(MAX_POINTER_SAMPLES + 1).fill(p.pointer.samples[0])];
  for (const edit of edits) { const copy = structuredClone(project); edit(copy); assert.throws(() => parseProject(copy)); }
  assert.throws(() => parseProject({ ...createProject(), pointer: project.pointer }));
  for (const version of [1, 2]) {
    const legacy = { ...project, version }; delete legacy.zoom.mode; delete legacy.zoom.smoothing;
    const restored = parseProject(legacy);
    assert.equal(restored.zoom.mode, 'manual'); assert.equal(restored.pointer, null);
  }
  const maximum = trackedProject(); maximum.source.duration = 120;
  maximum.pointer.samples = Array.from({ length: MAX_POINTER_SAMPLES }, (_, index) => ({ t: index * 120 / MAX_POINTER_SAMPLES, x: 0.123456, y: 0.654321 }));
  assert.ok(Buffer.byteLength(JSON.stringify(parseProject(maximum), null, 2)) < MAX_PROJECT_BYTES);
});

test('follow camera is smooth, deterministic when seeking, holds outside the source, and stays within source edges', () => {
  const p = trackedProject();
  const fast = focusAt({ ...p.zoom, smoothing: 0.05 }, 1, p.pointer);
  const slow = focusAt({ ...p.zoom, smoothing: 0.6 }, 1, p.pointer);
  assert.ok(fast.x > slow.x && slow.x > 0.2 && fast.x < 0.800001);
  const middle = focusAt(p.zoom, 1.7, p.pointer);
  assert.deepEqual(middle, focusAt(p.zoom, 2, p.pointer));
  focusAt(p.zoom, 4, p.pointer);
  assert.deepEqual(middle, focusAt(p.zoom, 1.7, p.pointer));
  for (const time of [0, 0.01, 0.7, 2.8, 4.99, 5]) {
    const c = cropAt(p.source, p.zoom, time, p.pointer);
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= p.source.width + 1e-8 && c.y + c.height <= p.source.height + 1e-8);
  }
  assert.deepEqual(focusAt({ ...p.zoom, mode: 'manual' }, 1, p.pointer), { x: p.zoom.x, y: p.zoom.y });
});

test('zoom enters and exits continuously and never exposes outside source pixels', () => {
  const p = createProject();
  assert.equal(zoomAt(p.zoom, p.zoom.start), 1);
  assert.equal(zoomAt(p.zoom, p.zoom.end), 1);
  assert.equal(zoomAt(p.zoom, (p.zoom.start + p.zoom.end) / 2), 1.7);
  assert.ok(zoomAt(p.zoom, p.zoom.start + 0.001) < 1.0001);
  for (const x of [0, 0.5, 1]) for (const y of [0, 0.5, 1]) for (const time of [0, 3, 6, 12]) {
    const r = cropAt(p.source, { ...p.zoom, scale: 3, x, y }, time);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= p.source.width + 1e-8 && r.y + r.height <= p.source.height + 1e-8);
  }
});

test('portrait/ultrawide input fits the composition; source matching catches wrong files', () => {
  const p = createProject();
  for (const source of [{ width: 1080, height: 1920 }, { width: 3840, height: 1080 }]) {
    const r = frameRect(source, p.frame);
    assert.ok(r.width <= 1168 && r.height <= 608 && r.x >= 56 && r.y >= 56);
    assert.ok(Math.abs(r.width / r.height - source.width / source.height) < 1e-6);
  }
  assert.ok(sameSource(p.source, { ...p.source }));
  assert.equal(sameSource(p.source, { ...p.source, size: 100 }), false);
});

test('saved media is identified by bytes rather than filename or download timestamp', () => {
  const source = { kind: 'video', name: 'recording.webm', size: 123, lastModified: 1, sha256: 'a'.repeat(64), width: 1280, height: 720, duration: 2 };
  assert.ok(sameSource(source, { ...source, name: 'renamed.webm', lastModified: 999 }));
  assert.equal(sameSource(source, { ...source, sha256: 'b'.repeat(64) }), false);
  assert.deepEqual(parseProject(createProject(source)).source, source);
  assert.throws(() => parseProject(createProject({ ...source, sha256: null })));
});
