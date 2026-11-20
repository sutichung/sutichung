import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor';
          if (id.includes('/lightweight-charts/')) return 'chart-vendor';
          if (id.includes('/lucide-react/')) return 'icon-vendor';
          if (id.includes('/hls.js/')) return 'hls-vendor';
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } }
  }
});
