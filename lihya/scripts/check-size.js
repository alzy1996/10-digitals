#!/usr/bin/env node
// Build hygiene gate (PRD 10.6, 14.1):
//  - the gzipped app shell (index.html + the JS and CSS it loads up front) stays under 2 MB,
//  - no model or WASM file ends up in dist/ (models come from their CDNs, never Firebase Hosting),
//  - no .env file in dist/ or in git, no Cloudflare/API token pattern in tracked files.
// Usage: npm run build && npm run check:size
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SHELL_LIMIT = 2 * 1024 * 1024;
const MODEL_EXT = new Set(['.task', '.tflite', '.onnx', '.wasm', '.bin', '.pb', '.safetensors']);

const errors = [];
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run npm run build first.');
  process.exit(1);
}

const files = walk(DIST);
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;

// 1. App shell = index.html + every script/stylesheet/modulepreload it references.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = new Set();
for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
  const tag = m[0];
  const url = m[1];
  if (/^https?:/.test(url)) continue;
  if (tag.startsWith('<script') || /rel="(stylesheet|modulepreload)"/.test(tag)) refs.add(url.replace(/^\//, ''));
}
let shell = Buffer.byteLength(gzipSync(html));
const rows = [['index.html', shell]];
for (const r of refs) {
  const p = join(DIST, r);
  if (!existsSync(p)) continue;
  const size = gz(p);
  shell += size;
  rows.push([r, size]);
}
console.log('App shell (gzipped, loaded up front):');
for (const [name, size] of rows) console.log(`  ${name.padEnd(48)} ${kb(size)}`);
console.log(`  ${'TOTAL'.padEnd(48)} ${kb(shell)}  (limit ${kb(SHELL_LIMIT)})`);
if (shell > SHELL_LIMIT) errors.push(`App shell is ${kb(shell)} gzipped, over the 2 MB limit.`);

// 2. Lazy chunks, for the report.
const lazy = files
  .filter((p) => /\.(js|css)$/.test(p) && !refs.has(relative(DIST, p)))
  .map((p) => [relative(DIST, p), gz(p)])
  .sort((a, b) => b[1] - a[1]);
console.log('\nLazy chunks (gzipped, loaded on demand), largest first:');
for (const [name, size] of lazy.slice(0, 15)) console.log(`  ${name.padEnd(48)} ${kb(size)}`);
if (lazy.length > 15) console.log(`  ... and ${lazy.length - 15} more`);
const total = files.reduce((s, p) => s + statSync(p).size, 0);
console.log(`\ndist/ total on disk: ${kb(total)} in ${files.length} files`);

// 3. No model files in dist.
const models = files.filter((p) => MODEL_EXT.has(extname(p).toLowerCase()));
for (const p of models) errors.push(`Model/WASM file in dist/: ${relative(DIST, p)} (must load from its CDN).`);

// 4. No env files in dist, none tracked in git, no token patterns in tracked files.
for (const p of files) if (/(^|\/)\.env/.test(relative(DIST, p))) errors.push(`Env file in dist/: ${relative(DIST, p)}`);
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of tracked) {
    if (/(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith('.env.example')) errors.push(`Env file tracked in git: ${f}`);
    if (/\.dev\.vars/.test(f)) errors.push(`Wrangler secrets file tracked in git: ${f}`);
  }
  const patterns = [
    /CLOUDFLARE_API_TOKEN\s*=\s*\S{20,}/,
    /\bBearer\s+[A-Za-z0-9_-]{40,}/,
    /-----BEGIN (RSA )?PRIVATE KEY-----/,
    /\bAIza[0-9A-Za-z_-]{35}\b/,
  ];
  for (const f of tracked) {
    if (!/\.(js|jsx|json|toml|md|html|css|csv|txt|yml|yaml)$/.test(f) || f.includes('package-lock')) continue;
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const re of patterns) if (re.test(text)) errors.push(`Possible secret in ${f} (${re.source})`);
  }
} catch {
  console.warn('git not available: skipped the tracked-files secret scan.');
}

if (errors.length) {
  console.error('\nFAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK: shell under 2 MB, no model files in dist/, no env files or tokens tracked.');
