// Original SVG art: chunky ink outlines, flat colours, wobbly hand-inked edges.
import { TILE_H, TILE_W, TileDef } from './tiles';

export const C = 40;                    // px per cell
export const TW = TILE_W * C;           // 240
export const TH = TILE_H * C;           // 160

export const P = {
  ink: '#1c1a17', paper: '#fbf0dc',
  grass: '#79b35e', grassDark: '#5c9a4c',
  plot: '#d5d975', plotDark: '#b3bd52', plotLight: '#e6e993',
  water: '#5ec2dc', waterLight: '#e1f6fb', waterDark: '#3a9fc0',
  dump: '#a8645a', dumpDark: '#6b3a35',
  forest: '#41735b', forestDark: '#27483b', leaf: '#4f8a63',
  road: '#8d929c', cobble: '#a9aeb7', cityPlot: '#bcc0c8', cityPlotDark: '#9aa0aa',
  orange: '#f08a24', orangeDark: '#bd5d0d', blue: '#3f86cf', blueDark: '#245a93',
  red: '#d4473b', wood: '#8a5a3b',
};
export const PLAYER_COLORS = [
  { main: P.orange, dark: P.orangeDark, name: 'Orange' },
  { main: P.blue, dark: P.blueDark, name: 'Blue' },
];

function seeded(str: string) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function svgDefs(): string {
  return `
  <filter id="wob" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wob2" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="1" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
}

// ---------- small drawing helpers ----------
const I = P.ink;
const f = (n: number) => n.toFixed(1);
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, sw = 2) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${I}" stroke-width="${sw}"/>`;
const circle = (cx: number, cy: number, r: number, fill: string, sw = 2) => ellipse(cx, cy, r, r, fill, sw);
const poly = (pts: number[][], fill: string, sw = 2) =>
  `<polygon points="${pts.map((p) => p.map(f).join(',')).join(' ')}" fill="${fill}" stroke="${I}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, w = 2, c = I) =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const rectS = (x: number, y: number, w: number, h: number, fill: string, sw = 2, rx = 2) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${fill}" stroke="${I}" stroke-width="${sw}"/>`;

/** ink-outlined union of cells: outline stroke layer first, flat fill on top. */
function region(cells: [number, number][], fill: string): string {
  const rs = cells.map(([x, y]) => `<rect x="${x * C}" y="${y * C}" width="${C}" height="${C}"/>`).join('');
  const rs2 = cells.map(([x, y]) => `<rect x="${x * C - 0.6}" y="${y * C - 0.6}" width="${C + 1.2}" height="${C + 1.2}"/>`).join('');
  return `<g fill="${I}" stroke="${I}" stroke-width="6" stroke-linejoin="round">${rs}</g><g fill="${fill}">${rs2}</g>`;
}

function ripples(cells: [number, number][], r: () => number): string {
  return cells.map(([x, y]) => {
    const px = x * C + 6 + r() * 12, py = y * C + 10 + r() * 20;
    return `<path d="M${f(px)} ${f(py)} q4 -4 8 0 t8 0 t8 0" fill="none" stroke="${P.waterLight}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
}

// ---------- props ----------
const lilyPad = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path d="M0 0 L9 -3 A10 10 0 1 1 3 -9 Z" fill="#6cb85a" stroke="${I}" stroke-width="2" stroke-linejoin="round"/></g>`;
const reeds = (x: number, y: number) => {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const dx = (i - 2) * 5, h = 24 + (i % 3) * 7;
    s += line(x + dx, y, x + dx + (i - 2) * 1.5, y - h, 2.2, '#3d6e3a');
    if (i % 2 === 0) s += `<rect x="${f(x + dx - 1.8 + (i - 2) * 1.5)}" y="${f(y - h - 5)}" width="3.6" height="9" rx="1.8" fill="#7a4a2a" stroke="${I}" stroke-width="1.4"/>`;
  }
  return s;
};
const frog = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${ellipse(0, 0, 8, 6, '#8bd05a')}${circle(-4, -6, 3, '#8bd05a', 1.6)}${circle(4, -6, 3, '#8bd05a', 1.6)}${circle(-4, -6, 1, I, 0)}${circle(4, -6, 1, I, 0)}<path d="M-4 2 q4 3 8 0" fill="none" stroke="${I}" stroke-width="1.5"/></g>`;
const lotus = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${poly([[0, 0], [-6, -8], [0, -14], [6, -8]], '#f4a6c0', 1.8)}${poly([[-8, 0], [-10, -6], [-3, -9]], '#f9c6d8', 1.6)}${poly([[8, 0], [10, -6], [3, -9]], '#f9c6d8', 1.6)}</g>`;
const stone = (x: number, y: number, s = 1) => ellipse(x, y, 9 * s, 6 * s, '#b9bbb4', 2.2);
const sailboat = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${poly([[-18, 0], [18, 0], [12, 9], [-12, 9]], '#b5543f', 2.2)}${line(0, 0, 0, -30, 2.4)}${poly([[2, -29], [2, -4], [20, -4]], '#fbf3e0', 2.2)}${poly([[-2, -24], [-2, -4], [-14, -4]], '#f0d9a8', 2.2)}</g>`;
const heron = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${line(-3, 4, -4, 20, 2.2)}${line(3, 4, 4, 20, 2.2)}<path d="M8 -2 q10 -6 6 -20" fill="none" stroke="${I}" stroke-width="6" stroke-linecap="round"/><path d="M8 -2 q10 -6 6 -20" fill="none" stroke="#e9eef2" stroke-width="3" stroke-linecap="round"/>${ellipse(0, 0, 13, 8, '#e9eef2', 2.2)}${circle(14, -22, 4, '#e9eef2', 2)}${poly([[17, -23], [28, -21], [17, -20]], '#f0a424', 1.8)}${circle(15, -23, 1, I, 0)}</g>`;
const wheel = (x: number, y: number, r: number, rot: number) => {
  let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">${circle(0, 0, r, 'none', 2.6)}`;
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; s += line(0, 0, Math.cos(a) * r, Math.sin(a) * r, 1.1); }
  return s + `${circle(0, 0, 1.8, I, 0)}</g>`;
};
const bike = (x: number, y: number, rot: number) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">${wheel(-15, 0, 10, 0)}${wheel(15, 0, 10, 0)}${line(-15, 0, -3, -12, 2.6)}${line(-3, -12, 10, -12, 2.6)}${line(10, -12, 15, 0, 2.6)}${line(-15, 0, 2, 0, 2.6)}${line(2, 0, -3, -12, 2.6)}${line(10, -12, 8, -18, 2.6)}${line(5, -18, 13, -18, 2.6)}${line(-3, -12, -5, -17, 2.6)}${line(-8, -17, -2, -17, 2.6)}</g>`;
const mattress = (x: number, y: number, w: number, tilt: number, col: string) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${tilt})">${rectS(-w / 2, -5, w, 10, col, 2.2, 3)}${line(-w / 2 + 4, -1, w / 2 - 4, -1, 1.2)}<circle cx="${f(-w / 2 + 6)}" cy="2" r="1.2" fill="${I}"/><circle cx="0" cy="2" r="1.2" fill="${I}"/><circle cx="${f(w / 2 - 6)}" cy="2" r="1.2" fill="${I}"/></g>`;
const mound = (x: number, y: number, s: number) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})"><path d="M-16 8 Q-14 -12 0 -12 Q14 -12 16 8 Z" fill="#7a4a35" stroke="${I}" stroke-width="2.4" stroke-linejoin="round"/>${circle(-5, -2, 2.4, '#d95c4a', 1.4)}${circle(5, 2, 2.4, '#e8c24a', 1.4)}${circle(0, -7, 2, '#7bbf55', 1.4)}<path d="M-4 -16 q-3 -4 0 -7 t0 -7" fill="none" stroke="#f1e4d0" stroke-width="1.8" stroke-linecap="round"/></g>`;

const birch = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">${rectS(-3, -6, 6, 26, '#f1ede3', 2, 1.5)}<path d="M-3 2h6M-3 9h4M-3 15h6" stroke="${I}" stroke-width="1.6"/>${circle(0, -12, 11, '#8fcb6a', 2.2)}${circle(-7, -6, 7, '#7bbd5a', 2)}${circle(7, -7, 7, '#7bbd5a', 2)}</g>`;
const spruce = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">${rectS(-2.5, 8, 5, 10, '#6b4a30', 1.8, 1)}${poly([[-13, 12], [0, -2], [13, 12]], '#2f6a50', 2.2)}${poly([[-11, 3], [0, -11], [11, 3]], '#3c7c5c', 2.2)}${poly([[-8, -5], [0, -18], [8, -5]], '#4a8d68', 2.2)}</g>`;
const toadstool = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">${rectS(-4, 0, 8, 13, '#f3e8d2', 2, 3)}<path d="M-15 2 Q-14 -14 0 -14 Q14 -14 15 2 Z" fill="#d4473b" stroke="${I}" stroke-width="2.2" stroke-linejoin="round"/>${circle(-6, -5, 2.2, '#fff', 0)}${circle(5, -7, 2.6, '#fff', 0)}${circle(8, -1, 1.8, '#fff', 0)}</g>`;
const oak = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${s})">${rectS(-5, -2, 10, 24, '#7a5236', 2.2, 2)}${ellipse(0, 12, 2.6, 3.6, I, 0)}${circle(0, -14, 15, '#5fa04e', 2.4)}${circle(-12, -6, 10, '#4f9145', 2.2)}${circle(12, -6, 10, '#4f9145', 2.2)}</g>`;
const owl = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${ellipse(0, 0, 6, 7, '#b08a5a', 1.8)}${circle(-2.5, -2, 2.4, '#fff', 1.2)}${circle(2.5, -2, 2.4, '#fff', 1.2)}${circle(-2.5, -2, 0.9, I, 0)}${circle(2.5, -2, 0.9, I, 0)}${poly([[-1, 0], [1, 0], [0, 2.5]], '#f0a424', 1)}</g>`;
const haystack = (x: number, y: number, sc = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${sc})"><path d="M-17 12 Q-17 -12 0 -18 Q17 -12 17 12 Z" fill="#ebc45a" stroke="${I}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-9 8 Q-8 -4 -2 -12 M0 10 Q1 -2 2 -13 M9 8 Q8 -2 5 -10" fill="none" stroke="#b98d2a" stroke-width="1.6" stroke-linecap="round"/><path d="M-3 -17 l-3 -5 M1 -18 l1 -6 M4 -16 l4 -4" stroke="${I}" stroke-width="1.6" stroke-linecap="round"/></g>`;
const hayBale = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${circle(0, 0, 8.5, '#e8b94a', 2.2)}${circle(0, 0, 5, 'none', 1.4)}${circle(0, 0, 2, 'none', 1.2)}</g>`;
const beehive = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${ellipse(0, 4, 8, 5, '#e8b94a', 2)}${ellipse(0, -2, 7, 4.5, '#f1c85a', 2)}${ellipse(0, -8, 5.5, 4, '#e8b94a', 2)}${circle(0, 4, 2, I, 0)}<circle cx="11" cy="-8" r="1.6" fill="${I}"/><circle cx="-11" cy="-4" r="1.6" fill="${I}"/></g>`;
const wallStones = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${rectS(-10, -6, 9, 6, '#b9bbb4', 2, 2)}${rectS(0, -6, 10, 6, '#a4a69f', 2, 2)}${rectS(-6, 0, 11, 6, '#a4a69f', 2, 2)}</g>`;
const lamp = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${line(0, 0, 0, -22, 3)}${rectS(-4, -30, 8, 9, '#f6e27a', 2, 2)}${line(-5, 0, 5, 0, 3)}</g>`;
const stall = (x: number, y: number) =>
  `<g transform="translate(${f(x)} ${f(y)})">${rectS(-14, 0, 28, 12, '#c9935f', 2.2, 2)}${poly([[-17, 0], [17, 0], [13, -12], [-13, -12]], '#d4473b', 2.2)}<path d="M-6 -12 V0 M2 -12 V0 M10 -12 V0" stroke="#fbf0dc" stroke-width="3"/>${circle(-7, 6, 2.6, '#8fcb6a', 1.4)}${circle(0, 6, 2.6, '#f08a24', 1.4)}${circle(7, 6, 2.6, '#d95c4a', 1.4)}</g>`;

function plotLook(kind: string, id: string): { fill: string; dark: string } {
  if (kind === 'city') return { fill: P.cityPlot, dark: P.cityPlotDark };
  return { fill: P.plot, dark: P.plotDark }; // every other plot is the same meadow green
}

/** one buildable plot, hand-inked, with tufts and pebbles. */
function plotArt(x: number, y: number, w: number, h: number, kind: string, seed: string, hay: boolean): string {
  const r = seeded(seed);
  const look = plotLook(kind, seed);
  const ix = x * C + 4, iy = y * C + 4, iw = w * C - 8, ih = h * C - 8;
  let s = `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="9" fill="${look.fill}" stroke="${I}" stroke-width="3.4"/>`;
  s += `<clipPath id="c${seed}"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="9"/></clipPath><g clip-path="url(#c${seed})">`;
  // soft patches
  for (let i = 0; i < 4; i++) s += `<ellipse cx="${f(ix + r() * iw)}" cy="${f(iy + r() * ih)}" rx="${f(8 + r() * 10)}" ry="${f(4 + r() * 5)}" fill="${look.dark}" opacity=".45"/>`;
  if (hay) for (let i = 1; i < 5; i++) s += line(ix + 4, iy + (ih / 5) * i, ix + iw - 4, iy + (ih / 5) * i, 1.4, '#c29a2a');
  // ink hatching along the top and bottom edges
  const n = Math.max(3, Math.round(iw / 12));
  for (let i = 0; i < n; i++) {
    const px = ix + 6 + r() * (iw - 12);
    s += `<path d="M${f(px)} ${iy + ih} l2 -${f(4 + r() * 6)} l2.5 ${f(4 + r() * 6)} z" fill="${I}"/>`;
    if (r() < 0.6) s += `<path d="M${f(px + 7)} ${iy} l2 ${f(3 + r() * 5)} l2 -${f(3 + r() * 5)} z" fill="${I}" opacity=".85"/>`;
  }
  // pebbles
  for (let i = 0; i < 2; i++) s += ellipse(ix + 8 + r() * (iw - 16), iy + 8 + r() * (ih - 16), 3 + r() * 2, 2 + r(), '#c7cbc3', 1.4);
  return s + `</g>`;
}

export function tileArt(def: TileDef, ox: number, oy: number): string {
  const r = seeded(def.id);
  const cells: Record<string, [number, number][]> = {};
  def.layout.forEach((row, y) => [...row].forEach((ch, x) => { (cells[ch] ||= []).push([x, y]); }));
  const plots: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {};
  for (const [ch, cs] of Object.entries(cells)) {
    if (ch < 'a' || ch > 'z') continue;
    const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    plots[ch] = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }

  let g = `<g transform="translate(${ox} ${oy})">`;
  g += `<rect width="${TW}" height="${TH}" fill="${P.grass}"/>`;
  // grass tufts on the base
  for (let i = 0; i < 22; i++) {
    const x = r() * TW, y = r() * TH;
    g += `<path d="M${f(x)} ${f(y)} l1.5 -5 l1.5 5 M${f(x + 4)} ${f(y)} l1.5 -4 l1.5 4" fill="none" stroke="${P.grassDark}" stroke-width="1.6" stroke-linecap="round"/>`;
  }

  // lake
  if (cells.W) {
    g += region(cells.W, P.water) + ripples(cells.W, r);
    if (def.id === 'reed-pond') g += reeds(26, 74) + reeds(124, 70) + lilyPad(72, 36) + lilyPad(92, 50, 0.8);
    if (def.id === 'brook') g += stone(190, 44, 0.9) + stone(200, 82, 1) + stone(186, 122, 0.9) + lilyPad(180, 22, 0.8) + lilyPad(212, 146, 0.8) + frog(209, 142);
    if (def.id === 'lily-pool') g += lilyPad(30, 38) + lilyPad(108, 30, 0.9) + lilyPad(132, 56, 0.75) + lilyPad(30, 128) + lotus(54, 146) + frog(33, 124);
    if (def.id === 'big-water') g += sailboat(200, 46) + lilyPad(176, 68, 0.7);
    if (def.id === 'mushroom') g += lilyPad(30, 34, 0.9) + reeds(54, 70) + lilyPad(58, 40, 0.7);
    if (def.id === 'island') g += heron(196, 34) + lilyPad(30, 30, 0.8) + reeds(20, 150) + reeds(220, 150) + lilyPad(30, 120, 0.8) + lilyPad(206, 124, 0.8);
  }
  // island ground
  if (def.kind === 'island') g += region(Object.entries(cells).filter(([ch]) => ch >= 'a' && ch <= 'z').flatMap(([, cs]) => cs), P.grassDark);
  // dump
  if (cells.D) {
    g += region(cells.D, P.dump);
    cells.D.forEach(([x, y], i) => {
      const cx = x * C + C / 2 + (r() - 0.5) * 8, cy = y * C + C / 2 + (r() - 0.5) * 8;
      const slotHead = x % 2 === 0 && y % 2 === 0;
      if (def.id === 'bike-yard') { if (slotHead) g += bike(x * C + 40, y * C + 44, (r() - 0.5) * 16); }
      else if (def.id === 'mattress') { if (slotHead) g += mattress(x * C + 40, y * C + 26, 38, (r() - 0.5) * 14, '#9fc7d9') + mattress(x * C + 40, y * C + 52, 34, (r() - 0.5) * 14, '#e8d9a8'); }
      else if (slotHead) g += mound(x * C + 40, y * C + 46, 1.7);
    });
  }
  // forest floor + trees
  if (cells.T) {
    g += region(cells.T, P.forestDark);
    cells.T.forEach(([x, y], i) => {
      const cx = x * C + C / 2, cy = y * C + C / 2;
      if (def.id === 'birch') g += birch(cx - 2 + (r() - 0.5) * 8, cy, 0.95);
      else if (def.id === 'spruce') g += spruce(cx - 7, cy + 2, 0.9) + spruce(cx + 9, cy - 4, 0.75);
      else if (def.id === 'mushroom') g += toadstool(cx - 4 + r() * 8, cy - 2, 1.05) + (i % 3 === 0 ? toadstool(cx + 10, cy + 10, 0.65) : '');
      else if (x % 2 === 0 && y % 2 === 0) g += oak(x * C + 40, y * C + 48, 1.3);
    });
    if (def.id === 'old-oak') g += owl(122, 118);
  }
  // haystacks (decor, not buildable)
  if (cells.H) {
    g += region(cells.H, '#d6ae4c');
    cells.H.forEach(([x, y]) => {
      if (x % 2 === 0 && y % 2 === 0) g += haystack(x * C + 24, y * C + 50, 0.95) + haystack(x * C + 56, y * C + 38, 0.8);
    });
  }
  // roads
  if (cells['=']) {
    g += region(cells['='], P.road);
    cells['='].forEach(([x, y]) => {
      g += `<circle cx="${x * C + 10}" cy="${y * C + 12}" r="2" fill="${P.cobble}"/><circle cx="${x * C + 28}" cy="${y * C + 26}" r="2" fill="${P.cobble}"/><circle cx="${x * C + 20}" cy="${y * C + 34}" r="1.6" fill="${P.cobble}"/>`;
    });
  }

  if (def.id === 'city') g += `<rect x="0" y="76" width="${TW}" height="8" fill="${P.road}"/><rect x="76" y="0" width="8" height="${TH}" fill="${P.road}"/><rect x="156" y="0" width="8" height="${TH}" fill="${P.road}"/>`;
  // plots
  const hay = false;
  for (const [ch, p] of Object.entries(plots)) {
    g += plotArt(p.x0, p.y0, p.x1 - p.x0 + 1, p.y1 - p.y0 + 1, def.kind, `${def.id}-${ch}`, hay);
  }

  // props on grass junctions / roads
  if (def.id === 'beehives') g += beehive(184, 24) + beehive(212, 32) + beehive(196, 58) + beehive(184, 104) + beehive(212, 112) + beehive(196, 138);
  if (def.id === 'stone-wall') g += wallStones(104, 28) + wallStones(134, 24) + wallStones(118, 56) + wallStones(104, 108) + wallStones(134, 104) + wallStones(118, 136);
  if (def.id === 'city') g += lamp(80, 84) + lamp(160, 84);
  // seam
  g += `<rect x="1" y="1" width="${TW - 2}" height="${TH - 2}" fill="none" stroke="${I}" stroke-width="1.2" opacity=".35"/>`;
  return g + `</g>`;
}

// ---------- cabin sprites (centered on 0,0, ~ +-20px) ----------
export type Pose = 'upright' | 'long' | 'short' | 'roof';
export function cabinSprite(pose: Pose, owner: 0 | 1): string {
  const c = PLAYER_COLORS[owner];
  const house = `<polygon points="-12,-1 0,-15 12,-1" fill="${c.dark}" stroke="${I}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="-9.5" y="-1" width="19" height="15" fill="${c.main}" stroke="${I}" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="-2.5" y="5" width="5" height="9" fill="#3a2a20"/><rect x="4.5" y="2.5" width="3.6" height="3.6" fill="#fbe9a8" stroke="${I}" stroke-width="1"/>
    <rect x="-8" y="2.5" width="3.6" height="3.6" fill="#fbe9a8" stroke="${I}" stroke-width="1"/>`;
  switch (pose) {
    case 'upright':
      return `<g transform="translate(0 2)">${house}</g>`;
    case 'long':
      return `<g transform="rotate(90) translate(0 2)">${house}</g>`;
    case 'short':
      return `<g><rect x="-15" y="-10" width="30" height="10" rx="2" fill="${c.dark}" stroke="${I}" stroke-width="2.4"/>
        <rect x="-15" y="0" width="30" height="10" rx="2" fill="${c.main}" stroke="${I}" stroke-width="2.4"/>
        <path d="M-15 0h30" stroke="${I}" stroke-width="3"/>
        <path d="M-9 -5h18M-9 5h18" stroke="${I}" stroke-width="1" opacity=".4"/>
        <rect x="6" y="-12" width="6" height="8" fill="#8b4b3a" stroke="${I}" stroke-width="1.8"/><path d="M6 -8h6" stroke="${I}" stroke-width="1"/></g>`;
    case 'roof':
      return `<g transform="rotate(158) translate(0 2)">${house}</g>`;
  }
}
