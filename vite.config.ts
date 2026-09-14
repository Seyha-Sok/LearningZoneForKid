import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { english: 'index.html', khmer: 'khmer.html' } } },
  // Local Python packages and datasets are large and are not website source.
  server: {
    watch: { ignored: ['**/.checks/**', '**/Ultralytics/**', '**/server-dist/**'] },
    proxy: { '/api': { target: 'http://127.0.0.1:3001', xfwd: true } },
  },
  optimizeDeps: { entries: ['index.html'] },
});
