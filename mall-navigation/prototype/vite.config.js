import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const ENGINE_LIBS = /node_modules[\\/](three|troika-three-text|troika-three-utils|troika-worker-utils|bidi-js|webgl-sdf-generator)[\\/]/
const ENGINE_SRC = /src[\\/]engine[\\/]/

/**
 * troika-three-text 0.52.5 bundles the unicode-font-resolver client, which downloads fallback fonts from a
 * third-party CDN for any character the sign fonts lack (CONTRACT.md section 3: no runtime network calls except
 * same-origin files; it also never finishes offline, in a basement car park). It is replaced by a small
 * self-contained stub (it runs inside troika's worker, so no outer references) that maps every leftover character
 * to the font at `unicodeFontsURL`, which src/engine/fonts.js points at our own Latin sign font: at worst a blank
 * glyph, never a request. src/engine/textGuard.js and tools/validate-venue.mjs keep such characters out in the
 * first place. Also ~1.8 KB gzip less in the engine chunk. The build fails loudly if troika's code changes shape
 * (review the stub on any troika upgrade).
 */
const TROIKA_FILE = /troika-three-text[\\/]dist[\\/]troika-three-text\.esm\.js$/
const TROIKA_STUBS = {
  unicodeFontResolverClientFactory:
    'function unicodeFontResolverClientFactory(){return{getFontsForString:function(s,o){return Promise.resolve({fontUrls:[o&&o.dataUrl],chars:new Uint8Array(s.length)})}}}',
}
function troikaNoCdn() {
  return {
    name: 'dallni-troika-no-cdn',
    enforce: 'pre',
    transform(code, id) {
      if (!TROIKA_FILE.test(id.split('?')[0])) return null
      let out = code
      for (const [name, stub] of Object.entries(TROIKA_STUBS)) {
        const re = new RegExp(`^function ${name}\\(\\)\\{.*$`, 'm')
        if (!re.test(out)) throw new Error(`dallni-troika-no-cdn: ${name} not found in ${id}: troika-three-text changed, review the stubs`)
        out = out.replace(re, () => stub)
      }
      return { code: out, map: null }
    },
  }
}

// Relative base so the build works from any sub-path (Firebase Hosting, artifact preview, file server).
export default defineConfig({
  base: './',
  plugins: [troikaNoCdn(), react(), tailwindcss()],
  // troika is served through the plugin pipeline in dev too (not pre-bundled), so dev and build run the same stub;
  // the engine's other dependencies are pre-bundled up front (the engine loads late: no reload when it arrives)
  optimizeDeps: {
    exclude: ['troika-three-text'],
    include: ['three', 'three/addons/controls/OrbitControls.js', 'troika-three-utils', 'troika-worker-utils', 'bidi-js', 'webgl-sdf-generator'],
  },
  build: {
    // the 3D engine is ~0.8 MB minified on its own; the first screen does not load it (src/engineHost.js).
    // Budgets (gzip) are checked after every build by tools/check-budgets.mjs.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Both load lazily after the first screen (src/engineHost.js), in parallel:
            // - engine3d: the libraries, three + troika (PLAN.md 19.2 budget "three + loaders + troika" <= 220 KB gzip).
            //   They change rarely, so phones keep them cached across app updates;
            // - scene3d: Dallni's own 3D code (src/engine: scene builder, labels, markers, route), its own budget.
            // tools/check-budgets.mjs checks both and their total after every build. src/engine/tokens.js (plain
            // colours, used by the UI shell) stays out of both.
            { name: 'engine3d', test: ENGINE_LIBS },
            {
              name: 'scene3d',
              test: (id) => ENGINE_SRC.test(id) && !/tokens\.js$/.test(id),
              // do not drag tokens.js (shared with the shell) into the lazy chunk as a dependency
              includeDependenciesRecursively: false,
            },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
