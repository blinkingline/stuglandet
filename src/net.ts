import type { C2S, S2C } from './protocol';

export type NetStatus = 'connecting' | 'open' | 'down' | 'unreachable';

const tokenKey = (room: string) => `cabin-token-${room}`;
const getToken = (room: string) => { try { return localStorage.getItem(tokenKey(room)) ?? undefined; } catch { return undefined; } };
export const saveToken = (room: string, t: string) => { try { localStorage.setItem(tokenKey(room), t); } catch { /* private mode */ } };

/** WebSocket wrapper that reconnects with backoff and re-joins its seat using a stored token. */
export class Net {
  private ws: WebSocket | null = null;
  private closed = false;
  private tries = 0;
  private everOpened = false;
  private timer = 0;

  constructor(
    private room: string,
    private on: { msg: (m: S2C) => void; status: (s: NetStatus) => void },
  ) {}

  connect() {
    if (this.closed) return;
    if (!location.host) { this.on.status('unreachable'); return; } // opened from a file: no server
    this.on.status('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { this.fail(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.everOpened = true; this.tries = 0;
      this.send({ t: 'hello', room: this.room, token: getToken(this.room) });
      this.on.status('open');
    };
    ws.onmessage = (e) => { try { this.on.msg(JSON.parse(e.data) as S2C); } catch { /* ignore junk */ } };
    ws.onclose = () => { if (this.ws === ws) this.fail(); };
    ws.onerror = () => { /* onclose follows */ };
  }

  private fail() {
    if (this.closed) return;
    this.tries++;
    this.on.status(!this.everOpened && this.tries >= 3 ? 'unreachable' : 'down');
    const wait = Math.min(8000, 700 * 2 ** Math.min(this.tries, 4));
    this.timer = window.setTimeout(() => this.connect(), wait);
  }

  send(m: C2S) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  close() {
    this.closed = true; clearTimeout(this.timer);
    const w = this.ws; this.ws = null; try { w?.close(); } catch { /* */ }
  }
}
