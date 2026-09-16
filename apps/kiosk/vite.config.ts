import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'prompt', // never auto-reload a kiosk mid-shift
      manifest: {
        name: 'GymOS Kiosk',
        short_name: 'GymOS',
        lang: 'fa',
        dir: 'rtl',
        display: 'fullscreen',
        background_color: '#0f1614',
        theme_color: '#0f1614',
        start_url: '/',
      },
      workbox: {
        // Cache-first for the shell: the terminal must boot with no network.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
