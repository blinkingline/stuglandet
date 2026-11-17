import type { Action, GameState, Player } from './engine';

export type C2S =
  | { t: 'hello'; room: string; token?: string }
  | { t: 'act'; action: Action }
  | { t: 'rematch' };

export type S2C =
  | { t: 'welcome'; seat: Player; token: string; state: GameState; present: [boolean, boolean] }
  | { t: 'presence'; present: [boolean, boolean] }
  | { t: 'update'; action: Action; state: GameState }
  | { t: 'reset'; state: GameState }
  | { t: 'rematch'; from: Player }
  | { t: 'full' }
  | { t: 'err'; msg: string };

export const ROOM_RE = /^[a-z0-9]{8,24}$/;
