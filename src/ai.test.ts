import { describe, it, expect } from 'vitest';
import { apply, newGame, GameState, Player, Rng } from './engine';
import { aiAction, randomAction, NORMAL } from './ai';

function mulberry(seed: number): Rng {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function play(seed: number, players: [(s: GameState, r: Rng) => ReturnType<typeof aiAction>, (s: GameState, r: Rng) => ReturnType<typeof aiAction>]) {
  const r = mulberry(seed);
  let s = newGame(r); let steps = 0;
  while (s.phase !== 'over' && steps++ < 3000) s = apply(s, s.current, players[s.current](s, r), r);
  return s;
}

describe('computer opponent', () => {
  it('only ever makes legal moves and finishes games', () => {
    for (let i = 0; i < 12; i++) expect(play(i, [aiAction, aiAction]).phase).toBe('over');
  }, 120000);
  it('beats a random player almost every time, from either seat', () => {
    let wins = 0, games = 0;
    for (let i = 0; i < 25; i++) {
      for (const seat of [0, 1] as Player[]) {
        const pl: [typeof aiAction, typeof aiAction] = seat === 0 ? [aiAction, randomAction] : [randomAction, aiAction];
        const s = play(1000 + i, pl);
        games++; if (s.winners!.length === 1 && s.winners![0] === seat) wins++;
      }
    }
    expect(wins / games).toBeGreaterThan(0.9);
  }, 120000);
  it('is beatable: noise-free AI wins most but not all games against the normal AI', () => {
    const sharp = (s: GameState, r: Rng) => aiAction(s, r, { noise: 0, blunder: 0 });
    let sharpWins = 0, n = 0;
    for (let i = 0; i < 20; i++) for (const seat of [0, 1] as Player[]) {
      const s = play(5000 + i, seat === 0 ? [sharp, (a, r) => aiAction(a, r, NORMAL)] : [(a, r) => aiAction(a, r, NORMAL), sharp]);
      n++; if (s.winners!.length === 1 && s.winners![0] === seat) sharpWins++;
    }
    console.log('noise-free vs normal win rate', (sharpWins / n).toFixed(2));
    expect(sharpWins / n).toBeLessThan(0.95);
  }, 120000);
  it('thinks fast enough for a UI turn', () => {
    const r = mulberry(7); let s = newGame(r); let worst = 0;
    while (s.phase !== 'over') {
      const t = performance.now(); const a = aiAction(s, r); worst = Math.max(worst, performance.now() - t);
      s = apply(s, s.current, a, r);
    }
    console.log('slowest single decision ms', worst.toFixed(1));
    expect(worst).toBeLessThan(400);
  });
});
