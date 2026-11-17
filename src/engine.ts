// Pure rules engine. No DOM, no I/O: the same file runs in the browser and on a server.
import { CITY, ISLAND, POOL, TILE_H, TILE_W, TileDef, tileById } from './tiles';

export type Player = 0 | 1;
export type Outcome = 'upright' | 'long' | 'short' | 'roof';
export const CABINS_PER_PLAYER = 12;
export const MAX_ROLLS = 3;

// out of 50 throws: upright (place) 7, long side (move) 10, short side (swap) 12, roof (nothing) 21
export const WEIGHTS: Record<Outcome, number> = { upright: 7, long: 10, short: 12, roof: 21 };
export const ACTION_OF: Record<Outcome, 'place' | 'move' | 'swap' | 'none'> = {
  upright: 'place', long: 'move', short: 'swap', roof: 'none',
};

export type Rng = () => number; // [0,1)

export interface Die { id: number; outcome: Outcome; done: boolean }

export interface PlacedTile { defId: string; col: number; row: number }

export interface GameState {
  tiles: PlacedTile[];                 // 9 tiles, index = row*3+col
  owner: Record<string, Player | null>; // plotId -> owner
  supply: [number, number];
  current: Player;
  phase: 'setup' | 'rolling' | 'resolving' | 'over';
  rollsUsed: number;
  dice: Die[];
  turn: number;
  scores?: [Breakdown, Breakdown];
  winners?: Player[];
}

export type Action =
  | { type: 'setup'; plot: string }   // opening move: each player puts one cabin in the city
  | { type: 'roll' }
  | { type: 'keep' }
  | { type: 'place'; die: number; plot: string }
  | { type: 'move'; die: number; from: string; to: string }
  | { type: 'swap'; die: number; plot: string }
  | { type: 'skip'; die: number };

// ---------- geometry ----------
export interface Plot {
  id: string; tile: number; letter: string;
  cells: [number, number][]; // global cell coords
  x: number; y: number; w: number; h: number; // global cell rect
}
export interface Geometry {
  plots: Plot[];
  plotById: Record<string, Plot>;
  cellKind: Map<string, string>;       // "x,y" -> layout char
  neighbors: Record<string, string[]>; // plot adjacency (side-sharing)
  lakeAdj: Set<string>;
  dumpAdj: Set<string>;
  tilePlots: string[][];
}
const key = (x: number, y: number) => `${x},${y}`;
const geoCache = new Map<string, Geometry>();

export function geometry(tiles: PlacedTile[]): Geometry {
  const ck = tiles.map((t) => t.defId).join('|');
  const hit = geoCache.get(ck);
  if (hit) return hit;
  const plots: Plot[] = [];
  const cellKind = new Map<string, string>();
  const cellPlot = new Map<string, string>();
  const tilePlots: string[][] = [];
  tiles.forEach((pt, ti) => {
    const def = tileById(pt.defId);
    const ox = pt.col * TILE_W, oy = pt.row * TILE_H;
    const byLetter = new Map<string, [number, number][]>();
    def.layout.forEach((row, y) => [...row].forEach((ch, x) => {
      const gx = ox + x, gy = oy + y;
      cellKind.set(key(gx, gy), ch);
      if (ch >= 'a' && ch <= 'z') {
        if (!byLetter.has(ch)) byLetter.set(ch, []);
        byLetter.get(ch)!.push([gx, gy]);
      }
    }));
    tilePlots[ti] = [];
    for (const [letter, cells] of byLetter) {
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x + 1, h = Math.max(...ys) - y + 1;
      if (w * h !== cells.length) throw new Error(`plot ${def.id}/${letter} not a rectangle`);
      const id = `${ti}${letter}`;
      plots.push({ id, tile: ti, letter, cells, x, y, w, h });
      tilePlots[ti].push(id);
      cells.forEach(([cx, cy]) => cellPlot.set(key(cx, cy), id));
    }
  });
  const neighbors: Record<string, string[]> = {};
  const lakeAdj = new Set<string>(), dumpAdj = new Set<string>();
  const plotById: Record<string, Plot> = {};
  for (const p of plots) { neighbors[p.id] = []; plotById[p.id] = p; }
  for (const p of plots) {
    for (const [cx, cy] of p.cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(cx + dx, cy + dy);
        const other = cellPlot.get(k);
        if (other && other !== p.id && !neighbors[p.id].includes(other)) neighbors[p.id].push(other);
        const kind = cellKind.get(k);
        if (kind === 'W') lakeAdj.add(p.id);
        if (kind === 'D') dumpAdj.add(p.id);
      }
    }
  }
  const g = { plots, plotById, cellKind, neighbors, lakeAdj, dumpAdj, tilePlots };
  geoCache.set(ck, g);
  return g;
}

// ---------- helpers ----------
export const other = (p: Player): Player => (p === 0 ? 1 : 0);
export const defOf = (s: GameState, tileIdx: number): TileDef => tileById(s.tiles[tileIdx].defId);

export function onBoard(s: GameState, p: Player): number {
  return Object.values(s.owner).filter((o) => o === p).length;
}

/** A tile is blocked when every plot holds a cabin of ONE player. City and island never block. */
export function isBlocked(s: GameState, tileIdx: number): boolean {
  const def = defOf(s, tileIdx);
  if (def.kind === 'city' || def.kind === 'island') return false;
  const ps = geometry(s.tiles).tilePlots[tileIdx];
  const first = s.owner[ps[0]];
  return first !== null && ps.every((id) => s.owner[id] === first);
}
export const plotBlocked = (s: GameState, plotId: string) =>
  isBlocked(s, geometry(s.tiles).plotById[plotId].tile);

export const freePlots = (s: GameState): string[] =>
  geometry(s.tiles).plots.map((p) => p.id).filter((id) => s.owner[id] === null);

export const movablePlots = (s: GameState): string[] =>
  geometry(s.tiles).plots.map((p) => p.id).filter((id) => s.owner[id] !== null && !plotBlocked(s, id));

export const swappablePlots = (s: GameState, me: Player): string[] =>
  movablePlots(s).filter((id) => s.owner[id] === other(me));

/** Free plots on the city tile (opening placement). */
export const cityFreePlots = (s: GameState): string[] =>
  freePlots(s).filter((id) => defOf(s, geometry(s.tiles).plotById[id].tile).kind === 'city');

/** Legal targets for a die (plot ids). For 'move' these are the cabins that can be picked up. */
export function legalTargets(s: GameState, dieId: number): string[] {
  if (s.phase !== 'resolving') return [];
  const d = s.dice.find((x) => x.id === dieId);
  if (!d || d.done) return [];
  switch (ACTION_OF[d.outcome]) {
    case 'place': return freePlots(s);
    case 'move': return freePlots(s).length ? movablePlots(s) : [];
    case 'swap': return swappablePlots(s, s.current);
    default: return [];
  }
}

// ---------- setup ----------
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(rng: Rng = Math.random): GameState {
  const chosen = shuffle(POOL, rng).slice(0, 7);
  const defs = shuffle([CITY, ISLAND, ...chosen], rng);
  const tiles: PlacedTile[] = defs.map((d, i) => ({ defId: d.id, col: i % 3, row: Math.floor(i / 3) }));
  const owner: Record<string, Player | null> = {};
  geometry(tiles).plots.forEach((p) => (owner[p.id] = null));
  return {
    tiles, owner, supply: [CABINS_PER_PLAYER, CABINS_PER_PLAYER],
    current: rng() < 0.5 ? 0 : 1, phase: 'setup', rollsUsed: 0, dice: [], turn: 1,
  };
}

export function rollOutcome(rng: Rng): Outcome {
  let n = Math.floor(rng() * 50);
  for (const o of ['upright', 'long', 'short', 'roof'] as Outcome[]) {
    if (n < WEIGHTS[o]) return o;
    n -= WEIGHTS[o];
  }
  return 'roof';
}

// ---------- reducer ----------
export class RuleError extends Error {}
const fail = (m: string): never => { throw new RuleError(m); };

export function apply(prev: GameState, player: Player, a: Action, rng: Rng = Math.random): GameState {
  const s: GameState = structuredClone(prev);
  if (s.phase === 'over') fail('game over');
  if (player !== s.current) fail('not your turn');
  const me = s.current;

  const getDie = (id: number) => {
    const d = s.dice.find((x) => x.id === id);
    if (!d || d.done) return fail('no such pending die');
    return d as Die;
  };
  const finishDie = (d: Die, returnToSupply: boolean) => {
    d.done = true;
    if (returnToSupply) s.supply[me]++;
  };

  switch (a.type) {
    case 'setup': {
      if (s.phase !== 'setup') fail('setup is over');
      if (!cityFreePlots(s).includes(a.plot)) fail('start by building on a free city plot');
      s.owner[a.plot] = me;
      s.supply[me]--;
      s.current = other(me); // after the 2nd placement this hands the first throw back to whoever opened
      if (onBoard(s, 0) + onBoard(s, 1) >= 2) s.phase = 'rolling';
      return s;
    }
    case 'roll': {
      if (s.phase !== 'rolling') fail('cannot roll now');
      if (s.rollsUsed >= MAX_ROLLS) fail('no rolls left');
      if (s.dice.length === 0) {
        const n = Math.min(3, s.supply[me]);
        s.supply[me] -= n;
        s.dice = Array.from({ length: n }, (_, i) => ({ id: i, outcome: 'roof' as Outcome, done: false }));
      }
      s.dice.forEach((d) => (d.outcome = rollOutcome(rng)));
      s.rollsUsed++;
      break;
    }
    case 'keep': {
      if (s.phase !== 'rolling' || s.rollsUsed === 0) fail('roll first');
      s.phase = 'resolving';
      s.dice.forEach((d) => { if (d.outcome === 'roof') finishDie(d, true); });
      break;
    }
    case 'skip': {
      if (s.phase !== 'resolving') fail('not resolving');
      const d = getDie(a.die);
      if (ACTION_OF[d.outcome] !== 'none' && legalTargets(s, d.id).length) fail('that die has a legal action');
      finishDie(d, true);
      break;
    }
    case 'place': {
      if (s.phase !== 'resolving') fail('not resolving');
      const d = getDie(a.die);
      if (d.outcome !== 'upright') fail('die is not upright');
      if (s.owner[a.plot] !== null) fail('plot not free');
      s.owner[a.plot] = me;
      finishDie(d, false);
      break;
    }
    case 'swap': {
      if (s.phase !== 'resolving') fail('not resolving');
      const d = getDie(a.die);
      if (d.outcome !== 'short') fail('die is not on its short side');
      if (!swappablePlots(s, me).includes(a.plot)) fail('cannot swap that cabin');
      s.supply[other(me)]++;
      s.owner[a.plot] = me;
      finishDie(d, false);
      break;
    }
    case 'move': {
      if (s.phase !== 'resolving') fail('not resolving');
      const d = getDie(a.die);
      if (d.outcome !== 'long') fail('die is not on its long side');
      if (!movablePlots(s).includes(a.from)) fail('cannot move that cabin');
      if (s.owner[a.to] !== null) fail('destination not free');
      s.owner[a.to] = s.owner[a.from];
      s.owner[a.from] = null;
      finishDie(d, true); // rolled cabin returns to supply; a built cabin moved instead
      break;
    }
  }

  if (s.phase === 'resolving') {
    // placing a final cabin ends the game at once
    if (a.type === 'place' || a.type === 'swap') {
      if (onBoard(s, me) === CABINS_PER_PLAYER) return finishGame(s);
    }
    // auto-skip dice with nothing legal to do once no pending die can act
    const pending = s.dice.filter((d) => !d.done);
    if (pending.length && pending.every((d) => legalTargets(s, d.id).length === 0)) {
      pending.forEach((d) => finishDie(d, true));
    }
    if (s.dice.every((d) => d.done)) {
      s.current = other(me);
      s.phase = 'rolling';
      s.rollsUsed = 0;
      s.dice = [];
      s.turn++;
    }
  }
  return s;
}

// ---------- scoring ----------
export interface Breakdown {
  cabins: number; lake: number; city: number; dump: number;
  tiles: number; cityMajority: number; group: number; total: number;
}

function strictMax(vals: [number, number]): Player | null {
  if (vals[0] > vals[1]) return 0;
  if (vals[1] > vals[0]) return 1;
  return null;
}

export function score(s: GameState): [Breakdown, Breakdown] {
  const g = geometry(s.tiles);
  const mk = (): Breakdown => ({ cabins: 0, lake: 0, city: 0, dump: 0, tiles: 0, cityMajority: 0, group: 0, total: 0 });
  const out: [Breakdown, Breakdown] = [mk(), mk()];
  for (const p of g.plots) {
    const o = s.owner[p.id];
    if (o === null) continue;
    const b = out[o];
    b.cabins++;
    if (g.lakeAdj.has(p.id)) b.lake++;
    if (g.dumpAdj.has(p.id)) b.dump--;
    if (defOf(s, p.tile).kind === 'city') b.city++;
  }
  s.tiles.forEach((_, ti) => {
    const counts: [number, number] = [0, 0];
    g.tilePlots[ti].forEach((id) => { const o = s.owner[id]; if (o !== null) counts[o]++; });
    const w = strictMax(counts);
    if (w === null) return;
    if (defOf(s, ti).kind === 'city') out[w].cityMajority += 3;
    else out[w].tiles += 2;
  });
  // largest connected group
  const best: [number, number] = [0, 0];
  for (const pl of [0, 1] as Player[]) {
    const seen = new Set<string>();
    for (const p of g.plots) {
      if (s.owner[p.id] !== pl || seen.has(p.id)) continue;
      let size = 0; const stack = [p.id]; seen.add(p.id);
      while (stack.length) {
        const cur = stack.pop()!; size++;
        for (const n of g.neighbors[cur]) {
          if (s.owner[n] === pl && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      best[pl] = Math.max(best[pl], size);
    }
  }
  const gw = strictMax(best);
  if (gw !== null) out[gw].group = 6;
  for (const b of out) b.total = b.cabins + b.lake + b.city + b.dump + b.tiles + b.cityMajority + b.group;
  return out;
}

function finishGame(s: GameState): GameState {
  s.phase = 'over';
  s.scores = score(s);
  const [a, b] = [s.scores[0].total, s.scores[1].total];
  s.winners = a > b ? [0] : b > a ? [1] : [0, 1];
  return s;
}
