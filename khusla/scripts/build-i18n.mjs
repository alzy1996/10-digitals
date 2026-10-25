// Writes src/lib/i18n/en.json and ar.json from scripts/i18n-source.mjs (one source keeps both in sync).
import { writeFileSync } from 'node:fs';
import { T } from './i18n-source.mjs';

const en = {};
const ar = {};
for (const [k, [e, a]] of Object.entries(T)) {
  en[k] = e;
  ar[k] = a;
}
const dir = new URL('../src/lib/i18n/', import.meta.url);
writeFileSync(new URL('en.json', dir), `${JSON.stringify(en, null, 2)}\n`);
writeFileSync(new URL('ar.json', dir), `${JSON.stringify(ar, null, 2)}\n`);
console.log(`i18n: ${Object.keys(T).length} keys`);
