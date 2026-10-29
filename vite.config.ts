import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative paths so it works on GitHub Pages under /<repo>/ and on any static host
  plugins: [react()],
  server: { host: true, port: 5173 },
});
