import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { CACHE_HOSTS } from './src/ai/shared/cdn.js';

const runtimeCaching = CACHE_HOSTS.map(({ prefix, cache }) => ({
  urlPattern: ({ url }) => url.href.startsWith(prefix),
  handler: 'CacheFirst',
  options: {
    cacheName: cache,
    expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
    cacheableResponse: { statuses: [0, 200] },
    rangeRequests: true,
  },
}));

// Mode "pages" (npm run build:pages) is the GitHub Pages demo at alzy1996.github.io/10-digitals/khusla/.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/10-digitals/khusla/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/sprite.svg', 'icons/favicon.svg', 'templates/*.csv'],
      manifest: {
        name: 'KHUSLA خُصلة',
        short_name: 'KHUSLA',
        description: 'Hair cut, color and style simulator with the Agreement Card',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#5B2A4D',
        background_color: '#FBF8F4',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,csv}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__/],
        cleanupOutdatedCaches: true,
        runtimeCaching,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
}));
