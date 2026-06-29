import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 3000,
    // Proxy to Worker during local dev so you don't need CORS workarounds
    proxy: {
      '/proxy': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
