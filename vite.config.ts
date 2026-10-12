import { resolve } from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({ root: 'web', build: { outDir: '../web-dist', emptyOutDir: true, rollupOptions: { input: { main: resolve('web/index.html'), settings: resolve('web/settings.html') } } } });
