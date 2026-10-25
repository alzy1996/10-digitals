import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // we ship public/manifest.webmanifest ourselves
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        globIgnores: ['mediapipe/**', 'models/**'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // AI runtime + hand model: download once, then instant + offline
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/mediapipe/') ||
              url.pathname.startsWith('/models/') ||
              (url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/')) ||
              (url.origin === 'https://storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-assets-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts-v1', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
})
