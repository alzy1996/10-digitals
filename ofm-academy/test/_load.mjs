/**
 * Test helper: bundle a src/ module with esbuild and import the result.
 *
 * Node can strip TypeScript types but will not resolve extensionless or JSON
 * imports, and the sim deliberately uses both. esbuild is already present via
 * Vite, so the tests exercise the same resolution the app is built with rather
 * than a hand-rolled approximation.
 */

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");

const cache = new Map();

/** load("sim/engine.ts") -> the module's exports */
export async function load(rel) {
  if (cache.has(rel)) return cache.get(rel);

  const result = await build({
    entryPoints: [join(SRC, rel)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    loader: { ".json": "json" },
    logLevel: "silent",
  });

  const code = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  const mod = await import(url);
  cache.set(rel, mod);
  return mod;
}
