// Tile definitions. Each tile is a 6x4 cell grid.
//  a-z  = buildable plot (same letter = one rectangular plot)
//  W    = lake cell        D = dump cell
//  T    = trees (decor)    H = haystacks (decor)    = = road (decor)     . = grass (decor)
export const TILE_W = 6;
export const TILE_H = 4;

export type TileKind = 'meadow' | 'lake' | 'dump' | 'forest' | 'city' | 'island';

export interface TileDef {
  id: string;
  name: string;
  kind: TileKind;
  layout: string[];
}

/** Layout from a 3x2 grid of 2x2-cell slots. P = buildable plot (always exactly 2x2), W lake, D dump, T trees, H haystacks, = road, . grass. */
function slots(top: string, bottom: string): string[] {
  let n = 0;
  const out = ['', '', '', ''];
  [top, bottom].forEach((row, r) => [...row].forEach((ch) => {
    const c = ch === 'P' ? String.fromCharCode(97 + n++) : ch;
    out[r * 2] += c + c;
    out[r * 2 + 1] += c + c;
  }));
  return out;
}

export const CITY: TileDef = { id: 'city', name: 'Market Town', kind: 'city', layout: slots('PPP', 'PPP') };
// the single plot sits in the middle of the tile, ringed by water on all four sides
export const ISLAND: TileDef = { id: 'island', name: 'Heron Isle', kind: 'island', layout: ['WWWWWW', 'WWaaWW', 'WWaaWW', 'WWWWWW'] };

export const POOL: TileDef[] = [
  // lakes
  { id: 'reed-pond', name: 'Reed Pond', kind: 'lake', layout: slots('WWP', 'PPP') },
  { id: 'brook', name: 'Winding Brook', kind: 'lake', layout: slots('PPW', 'PPW') },
  { id: 'lily-pool', name: 'Lily Pool', kind: 'lake', layout: slots('WWP', 'WPP') },
  { id: 'big-water', name: 'Wide Water', kind: 'lake', layout: slots('PPW', 'PPP') },
  // dumps
  { id: 'bike-yard', name: 'Bicycle Graveyard', kind: 'dump', layout: slots('PDD', 'PPP') },
  { id: 'mattress', name: 'Mattress Mound', kind: 'dump', layout: slots('PPP', 'PPD') },
  { id: 'compost', name: 'Compost Heaps', kind: 'dump', layout: slots('DDP', 'DPP') },
  // forests
  { id: 'birch', name: 'Birch Grove', kind: 'forest', layout: slots('PTP', 'PTT') },
  { id: 'spruce', name: 'Spruce Hollow', kind: 'forest', layout: slots('PTP', 'PTP') },
  { id: 'mushroom', name: 'Mushroom Wood', kind: 'forest', layout: slots('WPP', 'PPT') },
  { id: 'old-oak', name: 'Old Oak', kind: 'forest', layout: slots('PTT', 'PTP') },
  // meadows
  { id: 'hay', name: 'Hay Meadow', kind: 'meadow', layout: slots('HHH', 'PPP') },
  { id: 'beehives', name: 'Beehive Field', kind: 'meadow', layout: slots('PP.', 'PP.') },
  { id: 'stone-wall', name: 'Stone-Wall Field', kind: 'meadow', layout: slots('P.P', 'P.P') },
];

export const ALL_TILES: TileDef[] = [CITY, ISLAND, ...POOL];
export const tileById = (id: string): TileDef => {
  const t = ALL_TILES.find((x) => x.id === id);
  if (!t) throw new Error('unknown tile ' + id);
  return t;
};
