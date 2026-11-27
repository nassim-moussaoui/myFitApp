/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH if needed.
const base = process.env.BASE_PATH ?? '/myFitApp/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      manifest: {
        id: base,
        name: 'MyFit, suivi nutrition',
        short_name: 'MyFit',
        description: 'Calories, protéines, glucides, lipides et poids. Hors ligne, données gardées sur le téléphone.',
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        categories: ['health', 'fitness', 'food'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,txt}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // The barcode decoder is large; precache it anyway so scanning known products works offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Product lookups: network first, cached copy when offline or slow.
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'off-products',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'off-search',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'off-images',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Any same-origin asset that is not precached.
            urlPattern: ({ sameOrigin, request }) => sameOrigin && request.destination !== 'document',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'assets' },
          },
        ],
      },
    }),
  ],
  build: {
    target: ['es2021', 'safari15'],
    modulePreload: { polyfill: false },
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
