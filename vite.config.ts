import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('pdfjs-dist')) return 'pdf-lib';
              if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('canvg')) return 'html2pdf-lib';
              if (id.includes('mammoth') || id.includes('xlsx')) return 'office-lib';
            }
          }
        }
      }
    }
  };
});
