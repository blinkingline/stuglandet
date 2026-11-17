// Builds a single self-contained HTML file (dist-single/cabin-country.html)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true, write: false, format: 'iife', target: 'es2022' });
const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('src/style.css', 'utf8');
let html = readFileSync('index.html', 'utf8')
  .replace(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`)
  .replace(/<script type="module"[^>]*><\/script>/, `<script>${js}</script>`);
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/cabin-country.html', html);
console.log('wrote dist-single/cabin-country.html', (html.length / 1024).toFixed(0) + ' KB');
