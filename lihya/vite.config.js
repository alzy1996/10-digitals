import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Model files are never bundled or served from Firebase Hosting (Spark allows
// about 360 MB of transfer a day). They load from their official CDNs with
// pinned versions and the service worker keeps them (CacheFirst), so analysis
// works offline after the first load.
const cdnCache = (urlPattern, cacheName, maxEntries) => ({
  urlPattern,
  handler: 'CacheFirst',
  options: {
    cacheName,
    expiration: { maxEntries, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
    rangeRequests: true,
  },
});

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/sprite.svg', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'templates/products-template.csv'],
      manifest: {
        name: 'LIHYA لحية',
        short_name: 'LIHYA',
        description: 'Beard simulator and barber Cut Card',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0F1012',
        theme_color: '#0F1012',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,csv,webmanifest}'],
        // The age model runtime (transformers.js + onnxruntime) is lazy and Wi-Fi only:
        // keep it out of the install-time precache.
        globIgnores: ['**/age-runtime-*.js', '**/*.wasm', '**/*.onnx', '**/*.tflite', '**/*.task'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          cdnCache(/^https:\/\/storage\.googleapis\.com\/mediapipe-models\//, 'lihya-mediapipe-models', 8),
          cdnCache(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@/, 'lihya-mediapipe-wasm', 8),
          cdnCache(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(@huggingface\/transformers|onnxruntime-web)@/, 'lihya-ort-wasm', 12),
          cdnCache(/^https:\/\/(huggingface\.co|[a-z0-9-]+\.hf\.co)\//, 'lihya-age-model', 12),
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('node_modules/@huggingface/transformers') || id.includes('node_modules/onnxruntime')) return 'age-runtime';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'pdf';
          if (id.includes('node_modules/@mediapipe/tasks-vision')) return 'mediapipe';
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
