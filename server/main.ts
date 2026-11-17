import { startServer } from './index';
const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR ?? 'dist';
startServer({ port, staticDir, host: process.env.HOST ?? '0.0.0.0' }).then((s) => console.log(`cabin-country listening on :${s.port}, serving ${staticDir}`));
