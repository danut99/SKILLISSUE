/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev:phone` serves over self-signed HTTPS so the microphone works on a phone on the same Wi-Fi.
export default defineConfig(({ mode }) => ({
  server: { port: 5180 },
  preview: { port: 5181 },
  plugins: [
    ...(mode === 'phone' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: 'VROOMBOX - desenează și condu',
        short_name: 'VROOMBOX',
        description: 'Desenează-ți vehiculul, cu roți cu tot, și condu-l. Motorul e vocea ta.',
        lang: 'ro',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#16213e',
        theme_color: '#16213e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'] },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
}))
