// Computer opponent. One-ply lookahead on the real scoring rules, a reroll decision based on
// expected value, and a little noise so it plays well but is not perfect. Pure: no DOM, no I/O.
import {
  Action, CABINS_PER_PLAYER, GameState, MAX_ROLLS, Outcome, Player, Rng, WEIGHTS, WEIGHT_TOTAL, cityFreePlots,
  freePlots, geometry, legalTargets, movablePlots, other, score, swappablePlots,
} from './engine';

export interface AiOptions {
  noise: number;    // std-dev of random jitter added to each option's value (points)
  blunder: number;  // chance of picking randomly among the top few options instead of the best
}
export const NORMAL: AiOptions = { noise: 0.9, blunder: 0.07 };

type Owner = GameState['owner'];

function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-9), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Position value from `me`'s point of view: live score difference plus a small bonus for clustering. */
function evalOwner(s: GameState, owner: Owner, me: Player): number {
  const sc = score({ ...s, owner });
  let v = sc[me].total - sc[other(me)].total;
  const g = geometry(s.tiles);
  let adj = 0;
  for (const p of g.plots) {
    const o = owner[p.id];
    if (o === null) continue;
    for (const q of g.neighbors[p.id]) if (owner[q] === o) adj += o === me ? 1 : -1;
  }
  v += 0.12 * adj;
  // finishing the game while behind is bad, while ahead is good
  if (Object.values(owner).filter((o) => o === me).length === CABINS_PER_PLAYER) v += sc[me].total > sc[other(me)].total ? 25 : -25;
  return v;
}

interface Option { action: Action; owner: Owner; outcome: Outcome }

function options(s: GameState, only?: Outcome): Option[] {
  const me = s.current, out: Option[] = [];
  const seen = new Set<Outcome>();
  for (const d of s.dice) {
    if (d.done || seen.has(d.outcome) || (only && d.outcome !== only)) continue;
    seen.add(d.outcome);
    if (d.outcome === 'upright') {
      for (const plot of freePlots(s)) out.push({ action: { type: 'place', die: d.id, plot }, owner: { ...s.owner, [plot]: me }, outcome: 'upright' });
    } else if (d.outcome === 'short') {
      for (const plot of swappablePlots(s, me)) out.push({ action: { type: 'swap', die: d.id, plot }, owner: { ...s.owner, [plot]: me }, outcome: 'short' });
    } else if (d.outcome === 'long') {
      const free = freePlots(s);
      for (const from of movablePlots(s)) for (const to of free) {
        out.push({ action: { type: 'move', die: d.id, from, to }, owner: { ...s.owner, [to]: s.owner[from], [from]: null }, outcome: 'long' });
      }
    }
  }
  return out;
}

/** Best (noise-free) improvement the current player can get from a die that lands in this way. */
function bestGain(s: GameState, outcome: Outcome, base: number): number {
  if (outcome === 'roof') return 0;
  // build options as if a die of that outcome were pending
  const probe: GameState = { ...s, dice: [{ id: 0, outcome, done: false }] };
  const opts = options(probe);
  if (!opts.length) return 0;
  let best = -Infinity;
  for (const o of opts) best = Math.max(best, evalOwner(s, o.owner, s.current) - base);
  return best;
}

function pick<T extends { v: number }>(scored: T[], rng: Rng, o: AiOptions): T {
  scored.sort((a, b) => b.v - a.v);
  if (scored.length > 1 && rng() < o.blunder) return scored[Math.floor(rng() * Math.min(4, scored.length))];
  return scored[0];
}

/** Choose the next single action for `s.current`. */
export function aiAction(s: GameState, rng: Rng = Math.random, o: AiOptions = NORMAL): Action {
  const me = s.current;
  if (s.phase === 'setup') {
    const sc = cityFreePlots(s).map((plot) => ({ plot, v: evalOwner(s, { ...s.owner, [plot]: me }, me) + o.noise * gauss(rng) }));
    return { type: 'setup', plot: pick(sc, rng, o).plot };
  }
  if (s.phase === 'rolling') {
    if (s.rollsUsed === 0) return { type: 'roll' };
    if (s.rollsUsed >= MAX_ROLLS) return { type: 'keep' };
    const base = evalOwner(s, s.owner, me);
    const gain: Record<Outcome, number> = { upright: 0, long: 0, short: 0, roof: 0 };
    (['upright', 'long', 'short'] as Outcome[]).forEach((k) => (gain[k] = bestGain(s, k, base)));
    const current = s.dice.reduce((t, d) => t + gain[d.outcome], 0);
    const per = (Object.keys(WEIGHTS) as Outcome[]).reduce((t, k) => t + (WEIGHTS[k] / WEIGHT_TOTAL) * gain[k], 0);
    return current + 0.15 < per * s.dice.length ? { type: 'roll' } : { type: 'keep' };
  }
  // resolving
  const scored = options(s).map((x) => ({ x, v: evalOwner(s, x.owner, me) + o.noise * gauss(rng) }));
  if (!scored.length) {
    const d = s.dice.find((x) => !x.done && legalTargets(s, x.id).length === 0)!;
    return { type: 'skip', die: d.id };
  }
  return pick(scored, rng, o).x.action;
}

/** Uniformly random legal action (used to test the engine and server, and as a weak baseline). */
export function randomAction(s: GameState, rng: Rng = Math.random): Action {
  const choice = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  if (s.phase === 'setup') return { type: 'setup', plot: choice(cityFreePlots(s)) };
  if (s.phase === 'rolling') {
    return s.rollsUsed === 0 ? { type: 'roll' } : s.rollsUsed >= MAX_ROLLS || rng() < 0.5 ? { type: 'keep' } : { type: 'roll' };
  }
  const d = s.dice.find((x) => !x.done)!;
  const t = legalTargets(s, d.id);
  if (!t.length) return { type: 'skip', die: d.id };
  if (d.outcome === 'upright') return { type: 'place', die: d.id, plot: choice(t) };
  if (d.outcome === 'short') return { type: 'swap', die: d.id, plot: choice(t) };
  return { type: 'move', die: d.id, from: choice(t), to: choice(freePlots(s)) };
}

