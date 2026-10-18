import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function buildCursor(destination) {
  if (process.platform !== 'win32') throw new Error('Cursor helper targets Windows');
  const compiler = join(process.env.SystemRoot || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  await mkdir(dirname(destination), { recursive: true });
  await promisify(execFile)(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:x64', `/out:${destination}`, fileURLToPath(new URL('./cursor-helper.cs', import.meta.url))], { windowsHide: true });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCursor(fileURLToPath(new URL('../.local/cursor-helper.exe', import.meta.url)));
  console.log('Built local cursor helper');
}
