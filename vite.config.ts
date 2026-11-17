import { defineConfig } from 'vite';
// `npm run dev` runs the client on :5173 and proxies the game socket to the server (`npm run dev:server`, :8787)
export default defineConfig({
  server: { proxy: { '/ws': { target: 'http://127.0.0.1:8787', ws: true } } },
});
