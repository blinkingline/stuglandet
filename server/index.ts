// Authoritative game server: one in-memory room per invite link. Serves the built client too.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { Action, GameState, Player, RuleError, apply, newGame, Rng } from '../src/engine';
import { C2S, ROOM_RE, S2C } from '../src/protocol';

const rng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

interface Seat { token: string; ws: WebSocket | null }
interface Room {
  id: string; state: GameState; seats: [Seat | null, Seat | null];
  rematch: Set<Player>; touched: number;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json',
};

function cleanAction(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && /^[0-9][a-z]$/.test(v) ? v : null);
  const die = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 3 ? v : null);
  switch (o.type) {
    case 'roll': return { type: 'roll' };
    case 'keep': return { type: 'keep' };
    case 'setup': { const plot = str(o.plot); return plot ? { type: 'setup', plot } : null; }
    case 'place': { const d = die(o.die), plot = str(o.plot); return d !== null && plot ? { type: 'place', die: d, plot } : null; }
    case 'swap': { const d = die(o.die), plot = str(o.plot); return d !== null && plot ? { type: 'swap', die: d, plot } : null; }
    case 'skip': { const d = die(o.die); return d !== null ? { type: 'skip', die: d } : null; }
    case 'move': { const d = die(o.die), from = str(o.from), to = str(o.to); return d !== null && from && to ? { type: 'move', die: d, from, to } : null; }
    default: return null;
  }
}

export interface RunningServer { port: number; close(): Promise<void>; rooms: Map<string, Room> }

export function startServer(opts: { port: number; staticDir?: string; host?: string; maxMsgPerSec?: number }): Promise<RunningServer> {
  const rooms = new Map<string, Room>();
  const staticDir = opts.staticDir ? path.resolve(opts.staticDir) : null;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
      if (!staticDir) { res.writeHead(404); res.end(); return; }
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      let file = path.join(staticDir, path.normalize(rel));
      if (!file.startsWith(staticDir)) { res.writeHead(403); res.end(); return; }
      let data: Buffer;
      try { data = await readFile(file); } catch { file = path.join(staticDir, 'index.html'); data = await readFile(file); }
      const ext = path.extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(data);
    } catch { res.writeHead(500); res.end(); }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const send = (ws: WebSocket | null, m: S2C) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
  const presence = (r: Room): [boolean, boolean] => [0, 1].map((i) => r.seats[i]?.ws?.readyState === WebSocket.OPEN) as [boolean, boolean];
  const broadcast = (r: Room, m: S2C) => r.seats.forEach((s) => send(s?.ws ?? null, m));

  wss.on('connection', (ws) => {
    let room: Room | null = null;
    let seat: Player | null = null;
    let burst = 0;
    const tick = setInterval(() => (burst = 0), 1000);
    (ws as WebSocket & { alive?: boolean }).alive = true;
    ws.on('pong', () => ((ws as WebSocket & { alive?: boolean }).alive = true));

    ws.on('message', (raw) => { try {
      if (++burst > (opts.maxMsgPerSec ?? 20)) { ws.close(1008, 'slow down'); return; }
      let m: C2S;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (m.t === 'hello') {
        if (room || typeof m.room !== 'string' || !ROOM_RE.test(m.room)) { send(ws, { t: 'err', msg: 'bad room' }); return; }
        let r = rooms.get(m.room);
        if (!r) {
          if (rooms.size >= 5000) { send(ws, { t: 'err', msg: 'server busy' }); return; }
          r = { id: m.room, state: newGame(rng), seats: [null, null], rematch: new Set(), touched: Date.now() };
          rooms.set(r.id, r);
        }
        let s: Player | null = null;
        if (typeof m.token === 'string') {
          const i = r.seats.findIndex((x) => x && x.token === m.token);
          if (i >= 0) { s = i as Player; try { r.seats[i]!.ws?.close(4000, 'replaced'); } catch { /* */ } }
        }
        if (s === null) {
          const free = r.seats.findIndex((x) => x === null);
          if (free < 0) { send(ws, { t: 'full' }); ws.close(); return; }
          s = free as Player;
          r.seats[s] = { token: randomBytes(16).toString('hex'), ws: null };
        }
        r.seats[s]!.ws = ws; room = r; seat = s; r.touched = Date.now();
        send(ws, { t: 'welcome', seat: s, token: r.seats[s]!.token, state: r.state, present: presence(r) });
        broadcast(r, { t: 'presence', present: presence(r) });
        return;
      }
      if (!room || seat === null) return;
      room.touched = Date.now();

      if (m.t === 'act') {
        const p = presence(room);
        if (!p[0] || !p[1]) { send(ws, { t: 'err', msg: 'Waiting for your friend to join.' }); return; }
        const action = cleanAction(m.action);
        if (!action) { send(ws, { t: 'err', msg: 'bad action' }); return; }
        try {
          room.state = apply(room.state, seat, action, rng);
        } catch (e) {
          send(ws, { t: 'err', msg: e instanceof RuleError ? e.message : 'bad action' });
          return;
        }
        broadcast(room, { t: 'update', action, state: room.state });
      } else if (m.t === 'rematch') {
        if (room.state.phase !== 'over') return;
        room.rematch.add(seat);
        if (room.rematch.size === 2) {
          room.rematch.clear();
          room.state = newGame(rng);
          broadcast(room, { t: 'reset', state: room.state });
        } else {
          room.seats.forEach((x, i) => { if (i !== seat) send(x?.ws ?? null, { t: 'rematch', from: seat as Player }); });
        }
      }
    } catch (e) { if (process.env.DBG) console.error('handler error', e); ws.close(1011); } });

    ws.on('close', () => {
      clearInterval(tick);
      if (room && seat !== null && room.seats[seat]?.ws === ws) {
        room.seats[seat]!.ws = null;
        broadcast(room, { t: 'presence', present: presence(room) });
      }
    });
    ws.on('error', () => ws.terminate());
  });

  // heartbeat + room cleanup
  const sweep = setInterval(() => {
    wss.clients.forEach((c) => {
      const w = c as WebSocket & { alive?: boolean };
      if (w.alive === false) { w.terminate(); return; }
      w.alive = false; w.ping();
    });
    const cutoff = Date.now() - 6 * 3600 * 1000;
    for (const [id, r] of rooms) if (r.touched < cutoff && presence(r).every((x) => !x)) rooms.delete(id);
  }, 25000);

  return new Promise((resolve) => {
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port, rooms,
        close: () => new Promise<void>((done) => {
          clearInterval(sweep);
          wss.clients.forEach((c) => c.terminate());
          wss.close(() => server.close(() => done()));
        }),
      });
    });
  });
}
