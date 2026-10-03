import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The browser sees one origin (localhost:5173), so cookies and the SEC-03 Origin check just work.
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
