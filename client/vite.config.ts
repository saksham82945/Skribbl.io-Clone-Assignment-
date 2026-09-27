import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the Socket.IO server runs separately; proxy it so the client can use same-origin URLs.
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
