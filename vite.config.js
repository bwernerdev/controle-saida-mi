import { defineConfig } from 'vite';

// base relativa: o mesmo build serve o GitHub Pages (subpasta /controle-saida-mi/)
// e o APK (Capacitor carrega os arquivos de dentro do app).
export default defineConfig({
  base: './',
  server: { port: 5190, strictPort: true },
  build: { outDir: 'dist', target: 'es2020' },
});
