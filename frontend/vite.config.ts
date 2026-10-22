import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies the API so the session cookie is first-party.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
    },
  },
});
