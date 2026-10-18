import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

test('local server serves only the prototype and exposes no upload or repository file endpoint', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal((await health.json()).app, 'rea-studio-lab');
    const page = await fetch(base);
    assert.equal(page.status, 200); assert.match(await page.text(), /REA Studio Lab/);
    for (const path of ['/LICENSE', '/..%2f..%2f.git/config', '/%2e%2e/%2e%2e/AGENTS.md', '/api/upload']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base, { method: 'POST', body: 'private video' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
