import {
  ACTION_OF, Action, Breakdown, GameState, MAX_ROLLS, Outcome, Player, RuleError, apply, cityFreePlots, freePlots,
  geometry, legalTargets, newGame, onBoard, score,
} from './engine';
import { aiAction } from './ai';
import { Net, NetStatus, saveToken } from './net';
import type { S2C } from './protocol';
import { C, PLAYER_COLORS, Pose, cabinSprite, svgDefs, tileArt } from './art';
import { tileById } from './tiles';

const PAD = 20;
const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;
const board = $<SVGSVGElement>('board');
const diceSvg = $<SVGSVGElement>('dice');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Mode = 'menu' | 'ai' | 'online';
let mode: Mode = 'menu';
let ready = false;                       // a game state exists to show
let state: GameState = newGame();
let mySeat: Player = 0;
let selected: number | null = null;      // selected die id
let moveFrom: string | null = null;      // first tap of a Move
let animating = false;
let inflight = 0;                        // queued/animating state changes
let awaiting = false;                    // online: sent an action, waiting for the server
let awaitTimer = 0;
let prevOwner: Record<string, Player | null> = {};
let artCache = '';
let gen = 0;                             // bumps when leaving a game so stale async work is dropped
let aiTimer = 0;
let chain: Promise<void> = Promise.resolve();

// online
let net: Net | null = null;
let roomId = '';
let netStatus: NetStatus = 'connecting';
let presence: [boolean, boolean] = [true, true];
let everBoth = false;
let rematchAsked = false, oppRematch = false;

const POSES: Pose[] = ['upright', 'long', 'short', 'roof'];
const LABEL: Record<Outcome, string> = { upright: 'Place', long: 'Move', short: 'Swap', roof: 'No action' };
const HELP: Record<Outcome, string> = {
  upright: 'Place: tap a free plot to build there.',
  long: 'Move: tap any cabin (yours or theirs) to pick it up…',
  short: "Swap: tap one of your opponent's cabins to take its place.",
  roof: 'Landed on its roof, nothing happens.',
};

const who = (p: Player) => (p === mySeat ? 'You' : mode === 'ai' ? 'Computer' : 'Your friend');
const whoPoss = (p: Player) => (p === mySeat ? 'Your' : mode === 'ai' ? "Computer's" : "Your friend's");
const canAct = () => mode === 'ai' || (mode === 'online' && netStatus === 'open' && presence[0] && presence[1]);
const myTurn = () => ready && state.current === mySeat && state.phase !== 'over' && canAct() && !animating && inflight === 0 && !awaiting;

// ---------- toast ----------
let toastTimer = 0;
function toast(msg: string) {
  const t = $<HTMLDivElement>('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- intents -> state changes ----------
/** Send an intent (no UI gating). Local games apply it immediately; online games ask the server. */
function act(a: Action) {
  if (mode === 'ai') {
    let next: GameState;
    try { next = apply(state, state.current, a); } catch (e) { if (e instanceof RuleError) { toast(e.message); return; } throw e; }
    void present(next, a);
  } else if (mode === 'online' && net) {
    awaiting = true; clearTimeout(awaitTimer);
    awaitTimer = window.setTimeout(() => { awaiting = false; renderAll(); }, 4000);
    net.send({ t: 'act', action: a });
  }
}
function dispatch(a: Action) { if (myTurn()) act(a); }

/** Queue a state change; rolls play the tumble animation first. */
function present(next: GameState, a: Action | null): Promise<void> {
  const g = gen;
  inflight++;
  chain = chain.then(() => doPresent(next, a, g)).catch(console.error);
  return chain;
}

async function doPresent(next: GameState, a: Action | null, g: number) {
  // `inflight` must drop BEFORE the final render, or the board renders as "not your turn" and never refreshes
  let released = false;
  const release = () => { if (!released) { released = true; if (g === gen) inflight = Math.max(0, inflight - 1); } };
  try {
    if (g !== gen) return;
    const prev = state;
    prevOwner = { ...prev.owner };
    if (a?.type === 'roll') {
      animating = true; selected = null; moveFrom = null;
      state = next;
      renderHud(); renderActions(); renderBoard(); renderBanner();
      await animateRoll(next.dice.map((d) => d.outcome), prev.current);
      animating = false;
      if (g !== gen) return;
      release();
      renderAll();
      afterSettle(a);
      return;
    }
    state = next; moveFrom = null;
    if (state.phase === 'resolving' && state.current === mySeat) {
      const cur = state.dice.find((d) => d.id === selected && !d.done);
      selected = cur ? cur.id : (state.dice.find((d) => !d.done && legalTargets(state, d.id).length) ?? state.dice.find((d) => !d.done))?.id ?? null;
    } else selected = null;
    if (prev.phase === 'setup' && state.phase === 'rolling') toast(state.current === mySeat ? 'You throw first' : `${who(state.current)} throws first`);
    else if (state.phase !== 'over' && prev.current !== state.current && state.current === mySeat && mode !== 'menu') toast('Your turn');
    release();
    renderAll();
    afterSettle(a);
  } finally { release(); }
}

/** After each visible change: auto-keep the 3rd throw, or let the computer move. */
function afterSettle(a: Action | null) {
  if (!ready || state.phase === 'over') return;
  if (state.current === mySeat && state.phase === 'rolling' && state.rollsUsed >= MAX_ROLLS && canAct()) {
    setTimeout(() => { if (state.current === mySeat && state.phase === 'rolling' && state.rollsUsed >= MAX_ROLLS) act({ type: 'keep' }); }, 250);
    return;
  }
  if (mode === 'ai' && state.current !== mySeat) {
    const g = gen;
    clearTimeout(aiTimer);
    aiTimer = window.setTimeout(() => {
      if (g !== gen || mode !== 'ai' || state.current === mySeat || animating || state.phase === 'over') return;
      act(aiAction(state));
    }, reduceMotion ? 80 : a?.type === 'roll' ? 1000 : 700);
  }
}

// ---------- rendering ----------
function renderAll() {
  renderHud(); renderBoard(); renderDiceStatic(); renderActions(); renderBanner(); renderOver(); renderScoreModal();
}

function renderHud() {
  const el = $<HTMLElement>('hud');
  if (!ready) { el.innerHTML = ''; return; }
  const sc = score(state);
  el.innerHTML = ([0, 1] as Player[]).map((p) => `
    <button class="pcard ${state.current === p && state.phase !== 'over' ? 'on' : ''}" data-score title="Show score breakdown">
      <span class="dot" style="background:${PLAYER_COLORS[p].main}"></span>
      <div><div class="nm">${who(p)}${mode === 'online' && p !== mySeat && !presence[p] ? ' (away)' : ''}</div>
      <div class="sub">${PLAYER_COLORS[p].name} · ${onBoard(state, p)} built · ${state.supply[p]} in supply</div></div>
      <div class="pts" title="Score if the game ended now">${sc[p].total}</div>
    </button>`).join('');
  el.querySelectorAll<HTMLElement>('[data-score]').forEach((b) => { b.onclick = openScore; });
}

function plotCenter(id: string) {
  const p = geometry(state.tiles).plotById[id];
  return { x: PAD + (p.x + p.w / 2) * C, y: PAD + (p.y + p.h / 2) * C, p };
}

function renderBoard() {
  if (!ready) { board.innerHTML = ''; return; }
  if (!artCache) {
    artCache = state.tiles.map((t) => tileArt(tileById(t.defId), PAD + t.col * 240, PAD + t.row * 160)).join('');
  }
  const g = geometry(state.tiles);
  let pieces = '';
  for (const p of g.plots) {
    const o = state.owner[p.id];
    if (o === null) continue;
    const { x, y } = plotCenter(p.id);
    const isNew = prevOwner[p.id] !== o;
    pieces += `<g transform="translate(${x} ${y + 3})"><g class="piece ${isNew ? 'pop' : ''}">
      <ellipse cx="0" cy="14" rx="14" ry="4" fill="rgba(0,0,0,.25)"/>${cabinSprite('upright', o)}</g></g>`;
  }
  let hl = '';
  for (const id of currentTargets()) {
    const p = g.plotById[id];
    const x = PAD + p.x * C + 4, y = PAD + p.y * C + 4, w = p.w * C - 8, h = p.h * C - 8;
    hl += `<rect class="hl-ink" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>
           <rect class="hl" data-plot="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>`;
  }
  if (moveFrom) {
    const p = g.plotById[moveFrom];
    hl += `<rect class="pick" x="${PAD + p.x * C + 2}" y="${PAD + p.y * C + 2}" width="${p.w * C - 4}" height="${p.h * C - 4}" rx="11"/>`;
  }
  board.innerHTML = `<defs>${svgDefs()}</defs>
    <g filter="url(#wob)"><rect x="${PAD - 2}" y="${PAD - 2}" width="724" height="484" rx="12" fill="#79b35e" stroke="#1c1a17" stroke-width="9"/>${artCache}</g>
    <g filter="url(#wob2)">${pieces}</g><g>${hl}</g>`;
}

function currentTargets(): string[] {
  if (!myTurn()) return [];
  if (state.phase === 'setup') return cityFreePlots(state);
  if (state.phase !== 'resolving' || selected === null) return [];
  const d = state.dice.find((x) => x.id === selected);
  if (!d || d.done) return [];
  if (ACTION_OF[d.outcome] === 'move' && moveFrom) return freePlots(state);
  return legalTargets(state, d.id);
}

board.addEventListener('click', (e) => {
  const t = (e.target as Element).closest('[data-plot]') as HTMLElement | null;
  if (!t || !myTurn()) return;
  const plot = t.dataset.plot!;
  if (state.phase === 'setup') { dispatch({ type: 'setup', plot }); return; }
  if (selected === null) return;
  const d = state.dice.find((x) => x.id === selected);
  if (!d) return;
  switch (ACTION_OF[d.outcome]) {
    case 'place': dispatch({ type: 'place', die: d.id, plot }); break;
    case 'swap': dispatch({ type: 'swap', die: d.id, plot }); break;
    case 'move':
      if (!moveFrom) { moveFrom = plot; renderBoard(); renderActions(); }
      else dispatch({ type: 'move', die: d.id, from: moveFrom, to: plot });
      break;
  }
});

// ---------- dice tray ----------
const slotX = (i: number, n: number) => 180 + (i - (n - 1) / 2) * 112;
const SLOT_Y = 66;

function renderDiceStatic() {
  if (!ready) { diceSvg.innerHTML = ''; return; }
  const me = state.current;
  const n = state.phase === 'setup' ? 1 : state.dice.length || Math.min(3, state.supply[me]);
  let s = '';
  for (let i = 0; i < n; i++) {
    const d = state.dice[i];
    const x = slotX(i, n);
    if (!d) { s += `<g transform="translate(${x} ${SLOT_Y}) scale(1.5)" opacity=".28">${cabinSprite('upright', me)}</g>`; continue; }
    const act_ = ACTION_OF[d.outcome];
    const can = !d.done && state.phase === 'resolving' && (act_ === 'none' || legalTargets(state, d.id).length > 0);
    s += `<g class="die ${d.done ? 'done' : ''} ${selected === d.id && state.current === mySeat ? 'sel' : ''}" data-die="${d.id}">
      <ellipse cx="${x}" cy="${SLOT_Y + 26}" rx="26" ry="6" fill="rgba(0,0,0,.2)"/>
      <rect class="ring" x="${x - 42}" y="${SLOT_Y - 40}" width="84" height="94" rx="14"/>
      <g transform="translate(${x} ${SLOT_Y}) scale(1.5)">${cabinSprite(d.outcome as Pose, me)}</g>
      <g class="badge"><text x="${x}" y="${SLOT_Y + 52}" ${can || d.done || state.phase !== 'resolving' ? '' : 'opacity=".5"'}>${d.done ? '✓' : LABEL[d.outcome]}</text></g>
    </g>`;
  }
  diceSvg.innerHTML = s;
}

diceSvg.addEventListener('click', (e) => {
  const el = (e.target as Element).closest('[data-die]') as HTMLElement | null;
  if (!el || !myTurn() || state.phase !== 'resolving') return;
  const id = Number(el.dataset.die);
  const d = state.dice.find((x) => x.id === id);
  if (!d || d.done) return;
  selected = id; moveFrom = null;
  renderAll();
});

function renderActions() {
  const A = $<HTMLElement>('actions'), H = $<HTMLElement>('hint');
  if (!ready) { A.innerHTML = ''; H.textContent = mode === 'online' ? 'Joining the game…' : ''; return; }
  const me = state.current;
  const btn = (label: string, id: string, alt = false, dis = false) =>
    `<button class="btn ${alt ? 'alt' : ''}" id="${id}" ${dis ? 'disabled' : ''}>${label}</button>`;
  A.innerHTML = '';
  if (state.phase === 'over') H.textContent = 'Game over!';
  else if (animating) H.textContent = me === mySeat ? 'Rolling…' : `${who(me)} is rolling…`;
  else if (mode === 'online' && !canAct()) H.textContent = presence[1 - mySeat] ? 'Reconnecting…' : 'Waiting for your friend…';
  else if (me !== mySeat) {
    H.textContent = state.phase === 'setup' ? `${who(me)} is choosing a starting plot…`
      : state.phase === 'rolling' ? `${who(me)} is rolling…` : `${who(me)} is building…`;
  } else if (state.phase === 'setup') {
    H.textContent = 'Build your first cabin on any free city plot.';
  } else if (state.phase === 'rolling' && state.rollsUsed === 0) {
    A.innerHTML = btn('🎲 Roll cabins', 'b-roll');
    H.textContent = `Your turn: roll up to ${Math.min(3, state.supply[me])} cabins (up to 3 throws).`;
  } else if (state.phase === 'rolling') {
    const left = MAX_ROLLS - state.rollsUsed;
    A.innerHTML = btn(`Reroll all (${left} left)`, 'b-roll', true, left === 0) + btn('Keep these', 'b-keep');
    H.textContent = 'Happy with the throw? Keep it, or roll all cabins again.';
  } else if (state.phase === 'resolving') {
    const d = state.dice.find((x) => x.id === selected);
    if (!d) { H.textContent = ''; return; }
    const noTargets = ACTION_OF[d.outcome] !== 'none' && legalTargets(state, d.id).length === 0;
    H.textContent = noTargets ? 'Nothing legal for this cabin.' : moveFrom ? 'Now tap a free plot to put it down.' : HELP[d.outcome];
    A.innerHTML = (noTargets ? btn('Skip this cabin', 'b-skip') : '') + (moveFrom ? btn('Cancel', 'b-cancel', true) : '');
  }
  // While it's not your move (opponent's turn, or a roll is animating) show the roll buttons greyed out
  // instead of removing them, so the panel doesn't jump around.
  if (state.phase === 'rolling' && !A.innerHTML) {
    const left = MAX_ROLLS - state.rollsUsed;
    A.innerHTML = state.rollsUsed === 0 ? btn('🎲 Roll cabins', 'b-roll', false, true)
      : btn(`Reroll all (${left} left)`, 'b-roll', true, true) + btn('Keep these', 'b-keep', false, true);
  }
  const on = (id: string, fn: () => void) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  on('b-roll', () => dispatch({ type: 'roll' }));
  on('b-keep', () => dispatch({ type: 'keep' }));
  on('b-skip', () => selected !== null && dispatch({ type: 'skip', die: selected }));
  on('b-cancel', () => { moveFrom = null; renderAll(); });
}

// ---------- banner (invite link / connection status) ----------
const inviteLink = () => `${location.origin}${location.pathname}#/g/${roomId}`;
function renderBanner() {
  const el = $<HTMLElement>('banner');
  if (mode !== 'online') { el.hidden = true; return; }
  let html = '';
  if (netStatus === 'unreachable') html = "Can't reach the game server. Online play needs the hosted version of this game.";
  else if (netStatus !== 'open') html = ready ? 'Connection lost. Reconnecting…' : 'Connecting…';
  else if (ready && !presence[1 - mySeat]) {
    const fresh = mySeat === 0 && !everBoth && state.phase === 'setup' && Object.values(state.owner).every((o) => o === null);
    html = fresh
      ? `<div class="invite"><b>Send this link to a friend to start:</b><input id="invite-url" readonly value="${inviteLink()}" />
         <button class="btn small" id="b-copy">Copy</button>${typeof navigator.share === 'function' ? '<button class="btn small alt" id="b-share">Share</button>' : ''}</div>`
      : mySeat === 0 ? 'Your friend disconnected. Waiting for them to come back…' : 'The host disconnected. Waiting for them to come back…';
  }
  el.hidden = !html;
  el.innerHTML = html;
  const copy = document.getElementById('b-copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(inviteLink()); toast('Link copied'); }
    catch { (document.getElementById('invite-url') as HTMLInputElement)?.select(); toast('Press copy on the selected link'); }
  };
  const share = document.getElementById('b-share');
  if (share) share.onclick = () => navigator.share({ title: 'Cabin Country', text: 'Come play Cabin Country with me!', url: inviteLink() }).catch(() => {});
}

// ---------- roll animation ----------
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const f1 = (n: number) => n.toFixed(2);

function animateRoll(outcomes: Outcome[], owner: Player): Promise<void> {
  const n = outcomes.length;
  const W = [0.34, 0.26, 0.22, 0.18], H = [54, 32, 17, 7];
  const cum = W.reduce<number[]>((a, w) => (a.push((a[a.length - 1] ?? 0) + w), a), []);
  const dur = reduceMotion ? 120 : 1050;
  diceSvg.innerHTML = outcomes.map((_, i) => `
    <g id="dg${i}"><ellipse id="ds${i}" cx="0" cy="26" rx="26" ry="6" fill="rgba(0,0,0,.22)"/><g id="dp${i}"></g></g>`).join('');
  const seqs = outcomes.map((o) => {
    const seq: Pose[] = [];
    for (let k = 0; k < 4; k++) {
      let p: Pose;
      do { p = POSES[Math.floor(Math.random() * 4)]; } while (k > 0 && p === seq[k - 1]);
      seq.push(p);
    }
    seq[3] = o;
    if (seq[2] === o) seq[2] = POSES.find((p) => p !== o)!;
    return seq;
  });
  const lastPose: (Pose | null)[] = outcomes.map(() => null);
  const dirs = outcomes.map((_, i) => (i % 2 ? -1 : 1));
  const t0 = performance.now();
  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      let allDone = true;
      outcomes.forEach((o, i) => {
        const delay = reduceMotion ? 0 : i * 140;
        const T = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
        if (T < 1) allDone = false;
        const g = document.getElementById(`dg${i}`), sp = document.getElementById(`dp${i}`), sh = document.getElementById(`ds${i}`);
        if (!g || !sp || !sh) { allDone = true; return; }
        let k = cum.findIndex((c) => T <= c); if (k < 0) k = 3;
        const lo = k === 0 ? 0 : cum[k - 1], u = (T - lo) / (cum[k] - lo);
        const lift = H[k] * 4 * u * (1 - u);
        const x0 = slotX(i, n) + (i % 2 ? 90 : -90), x1 = slotX(i, n);
        const x = x0 + (x1 - x0) * ease(T);
        const rot = dirs[i] * (1 - ease(T)) * 540;
        const squash = u > 0.86 ? 1 - 0.16 * Math.sin((Math.PI * (u - 0.86)) / 0.14) * (k < 3 ? 1 : 0.6) : 1;
        let settle = 0;
        if (T >= 1 && o === 'roof') { const ts = Math.min(1, (now - t0 - delay - dur) / 450); settle = 9 * Math.sin(ts * 14) * (1 - ts); if (ts < 1) allDone = false; }
        const pose = seqs[i][k];
        if (lastPose[i] !== pose) { sp.innerHTML = cabinSprite(pose, owner); lastPose[i] = pose; }
        g.setAttribute('transform', `translate(${f1(x)} ${f1(SLOT_Y - lift)})`);
        sp.setAttribute('transform', `rotate(${f1(rot + settle)}) scale(1.5 ${f1(1.5 * squash)})`);
        sh.setAttribute('cy', String(26 + lift));
        sh.setAttribute('rx', f1(26 - lift * 0.28));
        sh.setAttribute('opacity', f1(1 - lift / 90));
      });
      if (allDone) resolve(); else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }).then(() => { renderDiceStatic(); });
}

// ---------- score breakdown ----------
let scoreOpen = false;

function breakdownTable([a, b]: [Breakdown, Breakdown]) {
  const row = (label: string, k: keyof Breakdown) => `<tr><td>${label}</td><td>${a[k]}</td><td>${b[k]}</td></tr>`;
  return `<table>
    <tr><th></th><th style="color:${PLAYER_COLORS[0].dark}">${who(0)}</th><th style="color:${PLAYER_COLORS[1].dark}">${who(1)}</th></tr>
    ${row('Cabins built', 'cabins')}${row('Next to a lake', 'lake')}${row('In the city', 'city')}${row('Next to a dump', 'dump')}
    ${row('Most cabins on a tile (+2)', 'tiles')}${row('Most in the city (+3)', 'cityMajority')}${row('Largest group (+6)', 'group')}
    ${row('Total', 'total').replace('<tr>', '<tr class="tot">')}</table>`;
}

function renderScoreModal() {
  const el = $<HTMLElement>('breakdown');
  if (!scoreOpen || !ready) { scoreOpen = false; el.hidden = true; return; }
  const live = state.phase !== 'over';
  el.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="Score breakdown">
    <h2>Score breakdown</h2>
    ${live ? '<p class="sub">If the game ended now.</p>' : ''}
    ${breakdownTable(score(state))}
    <div style="display:flex;justify-content:flex-end"><button class="btn" id="sb-close">Close</button></div></div>`;
  el.hidden = false;
  el.onclick = (e) => { if (e.target === el) closeScore(); };
  $('sb-close').onclick = closeScore;
}

function openScore() { if (!ready) return; scoreOpen = true; renderScoreModal(); $('sb-close').focus(); }
function closeScore() { scoreOpen = false; renderScoreModal(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && scoreOpen) closeScore(); });

// ---------- game over ----------
function renderOver() {
  const el = $<HTMLElement>('over');
  if (!ready || state.phase !== 'over' || !state.scores) { el.hidden = true; return; }
  const tie = state.winners!.length === 2;
  const w = state.winners![0];
  const win = tie ? 'A tie!' : w === mySeat ? 'You win! 🎉' : `${who(w)} wins`;
  const again = mode === 'online'
    ? (rematchAsked ? '<button class="btn" disabled>Waiting for friend…</button>'
      : `<button class="btn" id="o-new">${oppRematch ? 'Rematch (friend is ready)' : 'Rematch'}</button>`)
    : '<button class="btn" id="o-new">Play again</button>';
  el.innerHTML = `<div class="card"><h2>${win}</h2>${breakdownTable(state.scores)}
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn alt" id="o-look">Look at board</button><button class="btn alt" id="o-menu">Menu</button>${again}</div></div>`;
  el.hidden = false;
  const on = (id: string, fn: () => void) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
  on('o-look', () => { el.hidden = true; });
  on('o-menu', () => leave());
  on('o-new', () => {
    if (mode === 'ai') startAi();
    else if (net) { rematchAsked = true; net.send({ t: 'rematch' }); renderOver(); }
  });
}

// ---------- menu / modes ----------
function resetGame(s: GameState) {
  state = s; artCache = ''; prevOwner = { ...s.owner }; selected = null; moveFrom = null;
  animating = false; inflight = 0; awaiting = false; chain = Promise.resolve();
  rematchAsked = false; oppRematch = false; clearTimeout(aiTimer);
}

function leave() {
  gen++; clearTimeout(aiTimer); clearTimeout(awaitTimer);
  net?.close(); net = null; ready = false; mode = 'menu'; animating = false; inflight = 0; awaiting = false;
  history.replaceState(null, '', location.pathname + location.search);
  renderAll(); showMenu();
}

function showMenu(note = '') {
  const el = $<HTMLElement>('menu');
  el.hidden = false;
  el.innerHTML = `<div class="card"><h1>🏡 Cabin Country</h1>
    <p>Build the best cabins on the best plots. Two players.</p>
    ${note ? `<div class="note">${note}</div>` : ''}
    <div class="stack"><button class="btn" id="m-ai">🤖 Play the computer</button>
    <button class="btn alt" id="m-friend">🔗 Invite a friend</button></div>
    <details><summary>How to play</summary><ul>
      <li>Each player first builds a cabin in the city.</li>
      <li>On your turn, throw 3 cabins like dice (up to 3 throws, rerolling all).</li>
      <li>Upright: build on any free plot. Long side: move any cabin. Short side: swap with an opponent's cabin. On its roof: nothing.</li>
      <li>A tile completely filled by one player is blocked and frozen.</li>
      <li>The game ends when someone builds their last cabin. Points: cabins, lake neighbours, city, minus dump neighbours, most cabins per tile (+2), city majority (+3), biggest group (+6).</li></ul></details></div>`;
  $('m-ai').onclick = () => startAi();
  $('m-friend').onclick = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const room = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
    history.replaceState(null, '', `${location.pathname}${location.search}#/g/${room}`);
    startOnline(room);
  };
}

function startAi() {
  gen++; net?.close(); net = null;
  mode = 'ai'; mySeat = 0; ready = true;
  resetGame(newGame());
  $<HTMLElement>('menu').hidden = true;
  renderAll();
  toast(state.current === mySeat ? 'You build first' : 'Computer builds first');
  afterSettle(null);
}

function startOnline(room: string) {
  gen++; net?.close();
  mode = 'online'; roomId = room; ready = false; everBoth = false; netStatus = 'connecting'; presence = [false, false];
  resetGame(newGame());
  $<HTMLElement>('menu').hidden = true;
  renderAll();
  const g = gen;
  net = new Net(room, {
    status: (s) => { if (g !== gen) return; netStatus = s; renderAll(); },
    msg: (m) => { if (g === gen) onNetMessage(m); },
  });
  net.connect();
}

function onNetMessage(m: S2C) {
  switch (m.t) {
    case 'welcome':
      mySeat = m.seat; saveToken(roomId, m.token); presence = m.present;
      if (presence[0] && presence[1]) everBoth = true;
      resetGame(m.state); ready = true; renderAll();
      if (state.phase === 'setup' && state.current === mySeat && canAct()) toast('You build first');
      afterSettle(null);
      break;
    case 'presence':
      presence = m.present; if (presence[0] && presence[1]) everBoth = true;
      if (ready) renderAll();
      if (ready && canAct() && state.phase === 'setup' && state.current === mySeat) toast('Friend joined. You build first');
      break;
    case 'update':
      awaiting = false; clearTimeout(awaitTimer);
      if (ready) void present(m.state, m.action);
      break;
    case 'reset':
      resetGame(m.state); ready = true; renderAll();
      toast(state.current === mySeat ? 'Rematch: you build first' : 'Rematch started');
      break;
    case 'rematch': oppRematch = true; renderOver(); break;
    case 'full': leave(); showMenu('That game already has two players.'); break;
    case 'err': awaiting = false; clearTimeout(awaitTimer); toast(m.msg); renderAll(); break;
  }
}

$('b-score').onclick = openScore;
$('b-menu').onclick = () => { if (mode === 'menu') return; if (confirm('Leave this game?')) leave(); };

// ---------- boot ----------
const hash = location.hash.match(/^#\/g\/([a-z0-9]{8,24})$/);
if (hash) startOnline(hash[1]);
else { renderAll(); showMenu(); }

const dbg = window as unknown as { __game: () => GameState; __mode: () => string };
dbg.__game = () => state;
dbg.__mode = () => `${mode}:${netStatus}:${mySeat}:${presence.join(',')}`;
(window as unknown as { __dbg: () => unknown }).__dbg = () => ({ mode, ready, cur: state.current, mySeat, animating, inflight, awaiting, canAct: canAct(), targets: currentTargets().length });
