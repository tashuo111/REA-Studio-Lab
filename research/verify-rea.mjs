import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(process.env.STUDIO_REA_CLI || resolve(root, 'studio/.local/tooling/node_modules/rea-agents/scripts/rea.mjs'));
const output = resolve(root, 'studio/.local/evidence');
const exec = promisify(execFile);
try {
  await readFile(cli);
} catch {
  throw new Error('Install rea-agents@6.7.0 in studio/.local/tooling or set STUDIO_REA_CLI to its scripts/rea.mjs. See studio/README.zh-CN.md.');
}
const version = (await exec(process.execPath, [cli, '--version'])).stdout.trim();
if (version !== '6.7.0') throw new Error(`Expected pinned REA 6.7.0, got ${version}`);
const started = performance.now();
const { stdout, stderr } = await exec(process.execPath, [cli, 'analyze-javascript-application', resolve(root, 'studio/public'), '--analysis-timeout-ms', '30000', '--format', 'json'], { maxBuffer: 64 * 1024 * 1024, timeout: 120000, windowsHide: true });
const evidence = JSON.parse(stdout.replace(/^\uFEFF/, ''));
if (evidence.provider?.id !== 'rea-javascript-application' || !evidence.evidence_id) throw new Error('Unexpected REA result; evidence was not accepted');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'rea-prototype-evidence.json'), stdout);
await writeFile(resolve(output, 'rea-progress.jsonl'), stderr);
const summary = {
  recorded_at: new Date().toISOString(), runtime_version: version, node_version: process.version,
  target: 'studio/public (self-authored prototype, not the paid target application)',
  wall_ms: Math.round(performance.now() - started), evidence_id: evidence.evidence_id,
  evidence_file_sha256: createHash('sha256').update(stdout).digest('hex'),
  subject_sha256: evidence.subject?.digest?.sha256,
  provider: evidence.provider, confidence: evidence.confidence, authority: evidence.authority,
  summary: evidence.normalized_result?.summary, statistics: evidence.normalized_result?.statistics,
  limitations: evidence.limitations,
};
await writeFile(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
