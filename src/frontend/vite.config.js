import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite React app for the DND guild UI.
// Dev: `npm run dev:frontend` (port 5173, proxies /api to the Express backend on 2121).
// Prod: `npm run build:frontend` emits static assets to ../../dist/frontend,
// which src/backend/app.js serves. Backend remains the API + static host.
export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:2121',
      '/handleSendMessage': 'http://localhost:2121',
      '/handleGetAgentStatus': 'http://localhost:2121',
      '/handleStartProject': 'http://localhost:2121',
      '/handleGetSharedLog': 'http://localhost:2121'
    }
  },
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true
  }
});
