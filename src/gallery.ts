import { ALL_TILES } from './tiles';
import { TW, TH, svgDefs, tileArt } from './art';
const COLS = 4, GAP = 26, LABEL = 46, PADG = 20;
const rows = Math.ceil(ALL_TILES.length / COLS);
const W = PADG * 2 + COLS * TW + (COLS - 1) * GAP, H = PADG * 2 + rows * (TH + LABEL) + (rows - 1) * GAP;
let body = '';
ALL_TILES.forEach((t, i) => {
  const x = PADG + (i % COLS) * (TW + GAP), y = PADG + Math.floor(i / COLS) * (TH + LABEL + GAP);
  const plots = new Set(t.layout.join('').match(/[a-z]/g)).size;
  body += `<g filter="url(#wob)">${tileArt(t, x, y)}</g>
    <text x="${x}" y="${y + TH + 20}" font-size="17" font-weight="700" fill="#1c1a17">${t.name}</text>
    <text x="${x}" y="${y + TH + 38}" font-size="14" fill="#5a4f3c">${t.id} · ${t.kind} · ${plots} plots</text>`;
});
document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fbf0dc;font-family:'Chalkboard SE','Comic Sans MS',system-ui,sans-serif"><defs>${svgDefs()}</defs>${body}</svg>`;
document.body.style.margin = '0';
