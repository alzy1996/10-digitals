// Writes src/lib/i18n/en.json and ar.json from scripts/i18n-source.mjs plus every
// scripts/i18n/*.mjs (one file per service: nails.mjs, beard.mjs). Each exports
// T = { key: [English, Arabic] }. A key defined twice stops the build.
import { readdirSync, writeFileSync } from 'node:fs';
import { T as CORE } from './i18n-source.mjs';

const sources = [['i18n-source.mjs', CORE]];
const extraDir = new URL('./i18n/', import.meta.url);
for (const f of readdirSync(extraDir).filter((x) => x.endsWith('.mjs')).sort()) {
  sources.push([`i18n/${f}`, (await import(new URL(f, extraDir))).T]);
}

const en = {};
const ar = {};
const from = {};
for (const [file, T] of sources) {
  for (const [k, [e, a]] of Object.entries(T)) {
    if (k in from) throw new Error(`i18n key "${k}" defined in ${from[k]} and ${file}`);
    from[k] = file;
    en[k] = e;
    ar[k] = a;
  }
}
const dir = new URL('../src/lib/i18n/', import.meta.url);
writeFileSync(new URL('en.json', dir), `${JSON.stringify(en, null, 2)}\n`);
writeFileSync(new URL('ar.json', dir), `${JSON.stringify(ar, null, 2)}\n`);
console.log(`i18n: ${Object.keys(en).length} keys from ${sources.length} files`);
