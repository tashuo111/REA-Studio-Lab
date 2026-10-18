import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const routes = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['public/model.mjs', 'text/javascript; charset=utf-8']],
  ['/render.mjs', ['public/render.mjs', 'text/javascript; charset=utf-8']],
  ['/media.mjs', ['public/media.mjs', 'text/javascript; charset=utf-8']],
]);

export function createAppServer() {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try { path = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch { response.writeHead(400).end(); return; }
    if (path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ app: 'rea-studio-lab', version: '0.4.0' }));
      return;
    }
    const route = routes.get(path);
    if (!route) { response.writeHead(404).end('Not found'); return; }
    try {
      const contents = await readFile(new URL(route[0], import.meta.url));
      response.writeHead(200, { 'Content-Type': route[1] });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch {
      response.writeHead(500).end('Unable to load application file');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.STUDIO_PORT || 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('STUDIO_PORT must be 1024–65535');
  const server = createAppServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Choose another STUDIO_PORT.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`REA Studio Lab: http://127.0.0.1:${port}`));
}
