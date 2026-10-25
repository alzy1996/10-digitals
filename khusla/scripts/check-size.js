// Fails the build check if the gzipped shell is over 2 MB, a model file ended up in dist/,
// or a secret / .env file is tracked by git.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';

const DIST = new URL('../dist', import.meta.url).pathname;
const LIMIT = 2 * 1024 * 1024;
const MODEL_EXT = new Set(['.tflite', '.task', '.onnx', '.wasm', '.bin', '.safetensors', '.pb', '.h5']);
const COMPRESSED = new Set(['.woff2', '.woff', '.png', '.jpg', '.jpeg', '.webp']);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let failed = false;
if (!existsSync(DIST)) {
  console.error('dist/ not found: run npm run build first');
  process.exit(1);
}
const files = walk(DIST);
let total = 0;
const rows = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  if (MODEL_EXT.has(ext)) {
    console.error(`MODEL FILE IN dist/: ${f}`);
    failed = true;
  }
  const raw = readFileSync(f);
  const size = COMPRESSED.has(ext) ? raw.length : gzipSync(raw, { level: 9 }).length;
  total += size;
  rows.push([f.replace(`${DIST}/`, ''), size]);
}
rows.sort((a, b) => b[1] - a[1]);
console.log('Largest files (gzipped):');
for (const [f, s] of rows.slice(0, 8)) console.log(`  ${(s / 1024).toFixed(1).padStart(8)} KB  ${f}`);
console.log(`Total gzipped shell: ${(total / 1024 / 1024).toFixed(2)} MB (limit 2.00 MB), ${files.length} files`);
if (total > LIMIT) {
  console.error('FAIL: gzipped shell is over 2 MB');
  failed = true;
}

// secrets: no tracked .env (except .env.example), no obvious tokens in tracked files
try {
  const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  const tracked = execSync('git ls-files', { encoding: 'utf8', cwd: root }).split('\n').filter(Boolean);
  const envFiles = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'));
  if (envFiles.length) {
    console.error(`FAIL: tracked env files: ${envFiles.join(', ')}`);
    failed = true;
  }
  const patterns = [/AIza[0-9A-Za-z_-]{35}/, /CLOUDFLARE_API_TOKEN\s*=\s*\S+/, /CF_API_TOKEN\s*=\s*\S+/, /-----BEGIN (RSA )?PRIVATE KEY-----/];
  for (const f of tracked.filter((x) => x.startsWith('khusla/') && !x.includes('node_modules') && /\.(js|jsx|json|toml|md|html|env\.example)$/.test(x))) {
    const text = readFileSync(join(root, f), 'utf8');
    for (const p of patterns) {
      if (p.test(text)) {
        console.error(`FAIL: possible secret in ${f} (${p})`);
        failed = true;
      }
    }
  }
  console.log('Secret scan: done');
} catch {
  console.log('Secret scan skipped (not a git checkout)');
}
process.exit(failed ? 1 : 0);
