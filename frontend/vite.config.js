import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  ...(mode === 'test' ? { esbuild: { jsx: 'automatic' } } : {}),
  // The browser sees one origin (localhost:5173), so cookies and the SEC-03 Origin check just work.
  server: { proxy: { '/api': 'http://localhost:8080' } },
}));
