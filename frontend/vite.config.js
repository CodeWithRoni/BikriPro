import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works on the web, inside Electron (file://)
// and inside Capacitor (Android/iOS WebView).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
