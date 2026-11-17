import { build } from 'esbuild';
await build({
  entryPoints: { main: 'server/main.ts' }, outdir: 'dist-server', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node20', packages: 'external', sourcemap: true,
});
console.log('built dist-server/main.mjs');
