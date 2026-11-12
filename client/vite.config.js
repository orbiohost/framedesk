import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API is proxied so the browser sees one origin, exactly like production
// behind Nginx. That keeps cookies first-party and CSRF simple.
export default defineConfig({
  plugins: [react()],
  // ffmpeg.wasm starts its own module worker; pre-bundling would break its URL.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
