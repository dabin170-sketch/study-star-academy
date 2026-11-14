import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 빌드 결과 파일 목록을 precache-manifest.json으로 내보낸다.
 * public/sw.js가 설치될 때 이 목록을 모두 캐시해, 한 번 접속한 뒤에는 인터넷 없이도 앱이 열린다.
 */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify({ version: Date.now(), files: ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', ...files.map((f) => `/${f}`)] }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          pdf: ['pdfjs-dist'],
        },
      },
    },
  },
  optimizeDeps: { exclude: ['@academy/shared', '@academy/learning-engine', '@academy/document-parser'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
