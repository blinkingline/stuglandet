// Sweep the unknowns (surface friction, bounciness, throw height) and score each against your 50 throws.
import { simulate } from './run.mjs';
import { OUTCOMES, OBSERVED } from './geometry.mjs';

const N = +(process.argv[2] ?? 1500);
const rows = [];
for (const friction of [0.2, 0.4, 0.6, 0.9])
  for (const restitution of [0.1, 0.3, 0.5])
    for (const height of [8, 20, 40]) {
      const r = simulate({ friction, restitution, height }, N, 11);
      let ll = 0;
      for (const o of OUTCOMES) ll += OBSERVED[o] * Math.log(Math.max(r.pct[o], 1e-3));
      rows.push({ friction, restitution, height, ll, ...Object.fromEntries(OUTCOMES.map((o) => [o, +(100 * r.pct[o]).toFixed(1)])) });
    }
rows.sort((a, b) => b.ll - a.ll);
const best = rows[0].ll;
console.log('observed (50 throws):', OUTCOMES.map((o) => `${o} ${(2 * OBSERVED[o])}%`).join('  '));
console.log('fric rest  drop | upright  long short  roof | loglik (vs best)');
for (const r of rows.slice(0, 12))
  console.log(`${r.friction.toFixed(1)}  ${r.restitution.toFixed(1)}  ${String(r.height).padStart(3)}  | ${String(r.upright).padStart(5)} ${String(r.long).padStart(5)} ${String(r.short).padStart(5)} ${String(r.roof).padStart(5)} | ${(r.ll - best).toFixed(2)}`);
console.log('...\nworst:'); for (const r of rows.slice(-3)) console.log(JSON.stringify(r));
const ok = rows.filter((r) => best - r.ll < 2);
console.log(`\n${ok.length}/${rows.length} settings are statistically indistinguishable from the best (within 2 log-lik units).`);
const avg = Object.fromEntries(OUTCOMES.map((o) => [o, (ok.reduce((s, r) => s + r[o], 0) / ok.length).toFixed(1)]));
console.log('average of plausible settings:', avg);
