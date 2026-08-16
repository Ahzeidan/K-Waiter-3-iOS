import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    exclude: ['tests/e2e/**', 'tests/production/**', 'node_modules/**'],
    coverage: { reporter: ['text', 'html'] },
  },
});
