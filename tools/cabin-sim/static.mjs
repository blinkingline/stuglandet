// Pure-geometry analysis: no physics engine. Where is the centre of mass, which faces are stable,
// how deep is each stability "well", and what would a no-bounce (quasi-static) cabin do?
import { geometry, OUTCOMES, OBSERVED } from './geometry.mjs';

const G = geometry();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const mm = (cm) => (cm * 10).toFixed(2);

console.log('=== Geometry ===');
console.log(`volume ${(G.volume * 1000).toFixed(0)} mm3, mass ${G.m.massG} g => density ${G.density.toFixed(3)} g/cm3 (light wood is ~0.4-0.6; looks like solid wood)`);
console.log(`centre of mass: ${mm(G.com[1])} mm above the base (peak is ${mm(G.m.peak)} mm), centred left/right and front/back`);

// COM relative vectors to each vertex
const q = G.verts.map((v) => sub(v, G.com));
const H = (u) => Math.max(...q.map((p) => -dot(p, u)));       // COM height above table when "up" is u (body frame)

console.log('\n=== Stability of each resting face ===');
console.log('height = how high the centre of mass sits when resting on that face; barrier = energy to tip over its easiest edge (as a drop height of the cabin, mm)');
const wells = [];
for (const f of G.faces) {
  const u = f.n.map((c) => -c);                                // resting on face f => body "up" is -n
  const h = H(u);
  // tipping barrier: rotate about each edge of the face; find max COM height along the rotation path
  // approximate by sampling directions on the great circle between u and neighbouring face normals
  let barrier = Infinity;
  for (const g of G.faces) {
    if (g === f || dot(f.n, g.n) > 0.999 * 1) continue;
    const un = g.n.map((c) => -c);
    if (dot(u, un) < -0.5) continue;                           // only adjacent-ish faces
    let peak = h;
    for (let t = 0; t <= 1; t += 0.01) {
      const w = norm([u[0] * (1 - t) + un[0] * t, u[1] * (1 - t) + un[1] * t, u[2] * (1 - t) + un[2] * t]);
      peak = Math.max(peak, H(w));
    }
    barrier = Math.min(barrier, peak - h);
  }
  wells.push({ name: f.name, outcome: f.outcome, h, barrier });
  console.log(`${f.name.padEnd(9)} -> ${f.outcome.padEnd(7)} COM height ${mm(h)} mm, tip barrier ${mm(barrier)} mm`);
}

// quasi-static: random orientation, slide downhill in COM height until it settles on a face
function settle(u) {
  for (let it = 0; it < 4000; it++) {
    let best = -Infinity, bi = 0;
    for (let i = 0; i < q.length; i++) { const v = -dot(q[i], u); if (v > best) { best = v; bi = i; } }
    const p = q[bi], pu = dot(p, u);
    const d = [p[0] - pu * u[0], p[1] - pu * u[1], p[2] - pu * u[2]];
    if (Math.hypot(...d) < 1e-9) break;
    u = norm([u[0] + 0.02 * d[0] / Math.hypot(...p), u[1] + 0.02 * d[1] / Math.hypot(...p), u[2] + 0.02 * d[2] / Math.hypot(...p)]);
    for (const f of G.faces) if (-dot(f.n, u) > 0.9995) return f.outcome;
  }
  return null;
}
const N = 200000, c = { upright: 0, long: 0, short: 0, roof: 0 }; let lost = 0;
let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < N; i++) {
  const z = 2 * rnd() - 1, a = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z);
  const o = settle([r * Math.cos(a), z, r * Math.sin(a)]);
  if (o) c[o]++; else lost++;
}
console.log('\n=== Quasi-static estimate (no bounce, no spin: cabin gently rolls to rest from a random pose) ===');
const tot = N - lost;
console.log('outcome   model%   your 50 throws');
for (const o of OUTCOMES) console.log(`${o.padEnd(8)} ${(100 * c[o] / tot).toFixed(1).padStart(6)}%   ${(100 * OBSERVED[o] / 50).toFixed(0)}% (${OBSERVED[o]}/50)`);
console.log(`(${lost} of ${N} orientations did not converge)`);
