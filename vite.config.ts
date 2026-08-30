import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react', 'pdfjs-dist'],
  },
  build: {
    commonjsOptions: {
      include: [/mammoth/, /node_modules/],
    },
  },
  define: {
    'process.env.NODE_DEBUG': false,
  },
});