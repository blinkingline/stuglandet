import { describe, it, expect } from 'vitest';
import {
  apply, newGame, rollOutcome, geometry, score, isBlocked, legalTargets, onBoard,
  CABINS_PER_PLAYER, GameState, Player, Outcome, Rng, RuleError, freePlots, cityFreePlots,
} from './engine';

function mulberry(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const plotOf = (s: GameState, tile: string, letter: string) =>
  `${s.tiles.findIndex((t) => t.defId === tile)}${letter}`;

describe('setup', () => {
  it('has 9 tiles incl. city and island, in varying positions', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = newGame(mulberry(i));
      const ids = s.tiles.map((t) => t.defId);
      expect(ids).toHaveLength(9);
      expect(new Set(ids).size).toBe(9);
      expect(ids).toContain('city'); expect(ids).toContain('island');
      seen.add(`${ids.indexOf('city')}-${ids.indexOf('island')}`);
    }
    expect(seen.size).toBeGreaterThan(10);
  });
  it('every plot on every tile is exactly 2x2 cells', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame(mulberry(seed));
      const ps = geometry(s.tiles).plots;
      expect(ps.length).toBeGreaterThan(30);
      ps.forEach((p) => { expect(p.w).toBe(2); expect(p.h).toBe(2); });
    }
  });
});

describe('opening placement', () => {
  it('each player builds one cabin in the city, then the opener throws first', () => {
    let s = newGame(mulberry(2)); const first = s.current;
    expect(s.phase).toBe('setup');
    const city = cityFreePlots(s);
    expect(() => apply(s, first, { type: 'setup', plot: freePlots(s).find((p) => !city.includes(p))! })).toThrow(RuleError);
    expect(() => apply(s, first, { type: 'roll' })).toThrow(RuleError);
    s = apply(s, first, { type: 'setup', plot: city[0] });
    expect(s.current).toBe(1 - first); expect(s.phase).toBe('setup');
    expect(() => apply(s, (1 - first) as Player, { type: 'setup', plot: city[0] })).toThrow(RuleError);
    s = apply(s, (1 - first) as Player, { type: 'setup', plot: city[1] });
    expect(s.phase).toBe('rolling'); expect(s.current).toBe(first);
    expect(s.supply).toEqual([11, 11]); expect(onBoard(s, 0)).toBe(1); expect(onBoard(s, 1)).toBe(1);
  });
});

describe('dice weights', () => {
  it('match 10/10/8/22 out of 50', () => {
    const r = mulberry(42); const n = 200000;
    const c: Record<Outcome, number> = { upright: 0, long: 0, short: 0, roof: 0 };
    for (let i = 0; i < n; i++) c[rollOutcome(r)]++;
    expect(c.upright / n).toBeCloseTo(0.20, 2);
    expect(c.long / n).toBeCloseTo(0.20, 2);
    expect(c.short / n).toBeCloseTo(0.16, 2);
    expect(c.roof / n).toBeCloseTo(0.44, 2);
  });
});

function withDice(s: GameState, outcomes: Outcome[]): GameState {
  const t = structuredClone(s);
  t.supply[t.current] -= outcomes.length;
  t.dice = outcomes.map((o, i) => ({ id: i, outcome: o, done: false }));
  t.rollsUsed = 1; t.phase = 'rolling';
  return t;
}

describe('actions', () => {
  it('place, then turn passes; roof dice return to supply', () => {
    let s = withDice(newGame(mulberry(1)), ['upright', 'roof', 'roof']);
    const me = s.current;
    s = apply(s, me, { type: 'keep' });
    expect(s.supply[me]).toBe(CABINS_PER_PLAYER - 3 + 2);
    s = apply(s, me, { type: 'place', die: 0, plot: freePlots(s)[0] });
    expect(onBoard(s, me)).toBe(1);
    expect(s.current).toBe(1 - me);
    expect(s.supply[me]).toBe(CABINS_PER_PLAYER - 1);
  });
  it('rejects out-of-turn and wrong-die actions', () => {
    const s = withDice(newGame(mulberry(1)), ['upright']);
    const kept = apply(s, s.current, { type: 'keep' });
    expect(() => apply(kept, (1 - s.current) as Player, { type: 'keep' })).toThrow(RuleError);
    expect(() => apply(kept, kept.current, { type: 'swap', die: 0, plot: freePlots(kept)[0] })).toThrow(RuleError);
  });
  it('move relocates any cabin and returns the rolled one; swap exchanges', () => {
    let s = newGame(mulberry(5)); const a = s.current, b = (1 - a) as Player;
    const ps = freePlots(s);
    s.owner[ps[0]] = b; s.supply[b]--;
    s = withDice(s, ['long']); s = apply(s, a, { type: 'keep' });
    expect(legalTargets(s, 0)).toContain(ps[0]);
    s = apply(s, a, { type: 'move', die: 0, from: ps[0], to: ps[1] });
    expect(s.owner[ps[0]]).toBeNull(); expect(s.owner[ps[1]]).toBe(b);
    expect(s.supply[a]).toBe(CABINS_PER_PLAYER);
    // now b's turn: b rolls short -> a has nothing to swap -> auto-skipped, turn passes
    s = withDice(s, ['short']); s = apply(s, b, { type: 'keep' });
    expect(s.current).toBe(a);
  });
  it('swap sends the opponent cabin back to their supply', () => {
    let s = newGame(mulberry(6)); const a = s.current, b = (1 - a) as Player;
    const p = freePlots(s)[0]; s.owner[p] = b; s.supply[b]--;
    s = withDice(s, ['short']); s = apply(s, a, { type: 'keep' });
    s = apply(s, a, { type: 'swap', die: 0, plot: p });
    expect(s.owner[p]).toBe(a); expect(s.supply[b]).toBe(CABINS_PER_PLAYER);
  });
});

describe('blocking', () => {
  it('a fully single-owner tile is frozen; city/island never block', () => {
    let s = newGame(mulberry(9)); const a = s.current, b = (1 - a) as Player;
    const g = geometry(s.tiles);
    const ti = s.tiles.findIndex((t) => !['city', 'island'].includes(t.defId));
    g.tilePlots[ti].forEach((id) => (s.owner[id] = a));
    expect(isBlocked(s, ti)).toBe(true);
    s = withDice(s, ['short']); s.current = b; s.supply[b] -= 0;
    s = apply(s, b, { type: 'keep' });
    // only cabins on blocked tile exist -> nothing to swap -> turn passed
    expect(s.current).toBe(a);
    const city = s.tiles.findIndex((t) => t.defId === 'city');
    geometry(s.tiles).tilePlots[city].forEach((id) => (s.owner[id] = a));
    expect(isBlocked(s, city)).toBe(false);
  });
  it('mixed owners on a full tile do not block (standard rules)', () => {
    const s = newGame(mulberry(9));
    const ti = s.tiles.findIndex((t) => !['city', 'island'].includes(t.defId));
    geometry(s.tiles).tilePlots[ti].forEach((id, i) => (s.owner[id] = (i % 2) as Player));
    expect(isBlocked(s, ti)).toBe(false);
  });
});

describe('scoring', () => {
  it('counts base, lake, dump, city, tile majority, city majority and group', () => {
    const s = newGame(mulberry(11));
    // force a known tile arrangement
    s.tiles.forEach((t, i) => (t.defId = ['city', 'island', 'reed-pond', 'bike-yard', 'birch', 'hay', 'old-oak', 'brook', 'lily-pool'][i]));
    Object.keys(s.owner).forEach((k) => delete s.owner[k]);
    geometry(s.tiles).plots.forEach((p) => (s.owner[p.id] = null));
    const P = (tile: string, l: string) => plotOf(s, tile, l);
    s.owner[P('island', 'a')] = 0;       // lake-adjacent, tile majority for 0
    s.owner[P('city', 'a')] = 1;         // city
    s.owner[P('city', 'b')] = 1;
    s.owner[P('bike-yard', 'a')] = 0;    // touches dump D (col2,row0 neighbours col3)
    const [x, y] = score(s);
    expect(x.cabins).toBe(2); expect(y.cabins).toBe(2);
    expect(x.lake).toBe(1); expect(x.dump).toBe(-1);
    expect(y.city).toBe(2); expect(y.cityMajority).toBe(3);
    expect(x.tiles).toBe(4); // island + bike-yard majorities
    expect(x.total).toBe(2 + 1 - 1 + 4 + x.group);
  });
  it('largest group gives +6, ties give nothing', () => {
    const s = newGame(mulberry(11));
    s.tiles.forEach((t, i) => (t.defId = ['city', 'stone-wall', 'beehives', 'hay', 'island', 'birch', 'old-oak', 'spruce', 'mushroom'][i]));
    Object.keys(s.owner).forEach((k) => delete s.owner[k]);
    geometry(s.tiles).plots.forEach((p) => (s.owner[p.id] = null));
    s.owner['0a'] = 0; s.owner['0b'] = 0; s.owner['0e'] = 1;
    expect(score(s)[0].group).toBe(6);
    s.owner['0f'] = 1; // 1 now has e,f adjacent (2) = tie with 0's a,b (2)
    expect(score(s)[0].group + score(s)[1].group).toBe(0);
  });
});

describe('full random games', () => {
  it('conserve cabins, always terminate, and never throw', () => {
    for (let seed = 0; seed < 60; seed++) {
      const r = mulberry(seed);
      let s = newGame(r); let steps = 0;
      while (s.phase === 'setup') s = apply(s, s.current, { type: 'setup', plot: cityFreePlots(s)[0] });
      while (s.phase !== 'over' && steps++ < 5000) {
        const me = s.current;
        if (s.phase === 'rolling') {
          s = apply(s, me, { type: 'roll' }, r);
          if (s.rollsUsed >= 3 || r() < 0.5) s = apply(s, me, { type: 'keep' });
        } else {
          const d = s.dice.find((x) => !x.done)!;
          const t = legalTargets(s, d.id);
          if (!t.length) s = apply(s, me, { type: 'skip', die: d.id });
          else if (d.outcome === 'upright') s = apply(s, me, { type: 'place', die: d.id, plot: t[Math.floor(r() * t.length)] });
          else if (d.outcome === 'short') s = apply(s, me, { type: 'swap', die: d.id, plot: t[Math.floor(r() * t.length)] });
          else {
            const fp = freePlots(s);
            s = apply(s, me, { type: 'move', die: d.id, from: t[Math.floor(r() * t.length)], to: fp[Math.floor(r() * fp.length)] });
          }
        }
        for (const p of [0, 1] as Player[]) {
          const inHand = s.dice.filter((d) => !d.done).length * (p === s.current ? 1 : 0);
          expect(s.supply[p] + onBoard(s, p) + inHand).toBe(CABINS_PER_PLAYER);
        }
      }
      expect(s.phase).toBe('over');
      expect(s.scores).toBeDefined();
    }
  });
});
