// Rapier Monte Carlo: throw many cabins onto a table, classify how each lands.
// Units: cm, g, s. Cabins ignore each other (collision groups) so thousands can share one world.
import RAPIER from '@dimforge/rapier3d-compat';
import { geometry, OUTCOMES } from './geometry.mjs';

await RAPIER.init();
const G = geometry();
const { width: W, length: L, peak: P, wall: Wl, groove: gr } = G.m;
const hw = W / 2, hl = L / 2;

function prism(prof) { // prof: [[x,y]...] extruded along z
  const a = [];
  for (const z of [-hl, hl]) for (const [x, y] of prof) a.push(x, y, z);
  return new Float32Array(a);
}
// body = upper block (above groove) + two feet either side of the 1.5 mm groove
const PARTS = [
  prism([[-hw, gr], [hw, gr], [hw, Wl], [0, P], [-hw, Wl]]),
  prism([[-hw, 0], [-gr / 2, 0], [-gr / 2, gr], [-hw, gr]]),
  prism([[gr / 2, 0], [hw, 0], [hw, gr], [gr / 2, gr]]),
];
const FACES = G.faces;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function randQuat(r) { // uniform random rotation
  const u1 = r(), u2 = r() * 2 * Math.PI, u3 = r() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}
function rot(q, v) { // rotate v by quaternion q
  const { x, y, z, w } = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

export const DEFAULTS = { friction: 0.5, restitution: 0.3, height: 20, hspeed: 40, spin: 15, throwSpread: 1 };

export function simulate(params = {}, n = 600, seed = 1) {
  const p = { ...DEFAULTS, ...params }, r = rng(seed);
  const counts = { upright: 0, long: 0, short: 0, roof: 0 }; let unsettled = 0;
  const world = new RAPIER.World({ x: 0, y: -981, z: 0 });
  world.timestep = 1 / 240;
  const floor = world.createCollider(
    RAPIER.ColliderDesc.cuboid(1e4, 5, 1e4).setTranslation(0, -5, 0)
      .setFriction(p.friction).setRestitution(p.restitution).setCollisionGroups(0x0001ffff));
  const bodies = [];
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const q = randQuat(r);
    const ox = (i % cols) * 40, oz = Math.floor(i / cols) * 40;
    const h = p.height * (0.7 + 0.6 * r());
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(ox, h, oz).setRotation(q).setCcdEnabled(true));
    const sp = p.hspeed * r(), ang = 2 * Math.PI * r();
    rb.setLinvel({ x: sp * Math.cos(ang), y: 0, z: sp * Math.sin(ang) }, true);
    const w = p.spin * Math.sqrt(r()), a2 = Math.acos(2 * r() - 1), a3 = 2 * Math.PI * r();
    rb.setAngvel({ x: w * Math.sin(a2) * Math.cos(a3), y: w * Math.cos(a2), z: w * Math.sin(a2) * Math.sin(a3) }, true);
    for (const v of PARTS) world.createCollider(
      RAPIER.ColliderDesc.convexHull(v).setDensity(G.density).setFriction(p.friction)
        .setRestitution(p.restitution).setCollisionGroups(0x00020001), rb);
    bodies.push({ rb, calm: 0, done: false });
  }
  let left = n;
  for (let step = 0; step < 240 * 8 && left > 0; step++) {
    world.step();
    if (step % 12 !== 0) continue;
    for (const b of bodies) {
      if (b.done) continue;
      const lv = b.rb.linvel(), av = b.rb.angvel();
      const calm = Math.hypot(lv.x, lv.y, lv.z) < 0.5 && Math.hypot(av.x, av.y, av.z) < 0.2;
      b.calm = calm ? b.calm + 1 : 0;
      if (b.calm >= 10) { b.done = true; left--; }
    }
  }
  for (const b of bodies) {
    if (!b.done) { unsettled++; }
    const q = b.rb.rotation();
    let best = 2, name = null;
    for (const f of FACES) { const y = rot(q, f.n)[1]; if (y < best) { best = y; name = f.outcome; } }
    if (best < -0.9) counts[name]++; else unsettled++;   // not flat on a face => resting on an edge, discard
  }
  world.free();
  const tot = n - unsettled;
  return { counts, unsettled, n, tot, pct: Object.fromEntries(OUTCOMES.map((o) => [o, tot ? counts[o] / tot : 0])) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, +v]));
  const n = arg.n ?? 1000; delete arg.n;
  const t = Date.now(); const res = simulate(arg, n, 7);
  console.log('params', { ...DEFAULTS, ...arg });
  for (const o of OUTCOMES) console.log(o.padEnd(8), (100 * res.pct[o]).toFixed(1).padStart(5) + '%', `(${res.counts[o]})`);
  console.log(`unsettled/edge: ${res.unsettled} of ${res.n}, ${(Date.now() - t) / 1000}s`);
}
