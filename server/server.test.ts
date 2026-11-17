import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from './index';
import { randomAction } from '../src/ai';
import type { GameState, Player } from '../src/engine';
import type { S2C, C2S } from '../src/protocol';

function client(port: number, room: string, token?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox: S2C[] = []; let waiter: ((m: S2C) => void) | null = null;
  ws.on('message', (d) => { const m = JSON.parse(d.toString()) as S2C; if (process.env.DBG) console.log(room, m.t, m.t === 'err' ? (m as any).msg : ''); if (waiter) { const w = waiter; waiter = null; w(m); } else inbox.push(m); });
  const next = (pred: (m: S2C) => boolean = () => true) => new Promise<S2C>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message; inbox=' + JSON.stringify(inbox.map((m) => m.t)))), 4000);
    const done = (m: S2C) => { clearTimeout(timer); resolve(m); };
    const pump = (): void => {
      while (inbox.length) { const m = inbox.shift()!; if (pred(m)) return done(m); if (m.t === 'err') { clearTimeout(timer); return reject(new Error('server error: ' + m.msg)); } }
      waiter = (m) => (pred(m) ? done(m) : m.t === 'err' ? (clearTimeout(timer), reject(new Error('server error: ' + m.msg))) : pump());
    };
    pump();
  });
  const send = (m: C2S) => ws.send(JSON.stringify(m));
  const open = new Promise<void>((r) => ws.on('open', () => { send({ t: 'hello', room, token }); r(); }));
  return { ws, next, send, open };
}

describe('server', () => {
  it('seats two players, enforces turns, plays a full game, reconnects and rematches', async () => {
    const srv = await startServer({ port: 0, host: '127.0.0.1', maxMsgPerSec: 1e9 });
    const room = 'abcd1234wxyz';
    const a = client(srv.port, room); await a.open;
    const wa = (await a.next((m) => m.t === 'welcome')) as Extract<S2C, { t: 'welcome' }>;
    expect(wa.seat).toBe(0);
    // acting before the friend arrives is refused
    a.send({ t: 'act', action: { type: 'roll' } });
    expect(((await a.next((m) => m.t === 'err')) as Extract<S2C, { t: 'err' }>).msg).toMatch(/friend/i);

    const b = client(srv.port, room); await b.open;
    const wb = (await b.next((m) => m.t === 'welcome')) as Extract<S2C, { t: 'welcome' }>;
    expect(wb.seat).toBe(1);
    const c = client(srv.port, room); await c.open;
    expect((await c.next()).t).toBe('full');

    let state: GameState = wa.state;
    const seats: Record<number, ReturnType<typeof client>> = { 0: a, 1: b };
    // wrong player cannot act
    const wrong = (1 - state.current) as Player;
    seats[wrong].send({ t: 'act', action: state.phase === 'setup' ? { type: 'setup', plot: '0a' } : { type: 'roll' } });
    expect((await seats[wrong].next((m) => m.t === 'err')).t).toBe('err');

    let steps = 0;
    while (state.phase !== 'over' && steps++ < 4000) {
      const who = state.current;
      seats[who].send({ t: 'act', action: randomAction(state) });
      const ua = (await a.next((m) => m.t === 'update')) as Extract<S2C, { t: 'update' }>;
      const ub = (await b.next((m) => m.t === 'update')) as Extract<S2C, { t: 'update' }>;
      expect(ub.state).toEqual(ua.state);
      state = ua.state;
    }
    expect(state.phase).toBe('over');

    if (process.env.DBG) console.log('STAGE game over');
    // reconnect with token keeps the seat
    a.ws.close();
    const a2 = client(srv.port, room, wa.token); await a2.open;
    const wa2 = (await a2.next((m) => m.t === 'welcome')) as Extract<S2C, { t: 'welcome' }>;
    expect(wa2.seat).toBe(0); expect(wa2.state.phase).toBe('over');

    if (process.env.DBG) console.log('STAGE reconnected');
    // rematch needs both
    a2.send({ t: 'rematch' });
    expect((await b.next((m) => m.t === 'rematch')).t).toBe('rematch');
    b.send({ t: 'rematch' });
    const reset = (await a2.next((m) => m.t === 'reset')) as Extract<S2C, { t: 'reset' }>;
    expect(reset.state.phase).toBe('setup');
    [a2, b, c].forEach((x) => x.ws.terminate());
    await srv.close();
  }, 60000);
});
