import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import i18nLocales from '../tools/i18n/viteLocales.mjs';

export default defineConfig({
  plugins: [react(), i18nLocales({ dir: fileURLToPath(new URL('./src/i18n/locales', import.meta.url)) })],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
