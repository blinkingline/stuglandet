// Cabin geometry from your caliper/scale measurements. Units: centimetres, grams.
// Axes (local): x = width (14 mm), y = up (height), z = length along the ridge (17.3 mm).
export const MEASURED = {
  massG: 1.55,
  width: 1.40,        // gable width
  length: 1.73,       // along the ridge
  peak: 1.53,         // total height at the peak
  wall: 0.89,         // height of the vertical walls
  groove: 0.15,       // 1.5 x 1.5 mm groove in the base (assumed to run along the length)
};

export function geometry(m = MEASURED) {
  const hw = m.width / 2, hl = m.length / 2;
  const prof = [[-hw, 0], [hw, 0], [hw, m.wall], [0, m.peak], [-hw, m.wall]]; // gable outline (x, y)
  const verts = [];
  for (const z of [-hl, hl]) for (const [x, y] of prof) verts.push([x, y, z]);

  // cross-section area/centroid (ignoring the groove for the hull used in statics)
  const rise = m.peak - m.wall;
  const aRect = m.width * m.wall, aTri = 0.5 * m.width * rise;
  const yRect = m.wall / 2, yTri = m.wall + rise / 3;
  const gA = m.groove * m.groove, gY = m.groove / 2;       // groove channel along z (full length)
  const A = aRect + aTri - gA;
  const comY = (aRect * yRect + aTri * yTri - gA * gY) / A;
  const volume = A * m.length;
  const density = m.massG / volume;

  // outward face normals, grouped by game outcome
  const slope = Math.hypot(hw, rise);
  const nr = [rise / slope, hw / slope];                    // roof normal (x,y) for the +x slope
  const faces = [
    { n: [0, -1, 0], outcome: 'upright', name: 'base' },
    { n: [1, 0, 0], outcome: 'long', name: 'wall +x' },
    { n: [-1, 0, 0], outcome: 'long', name: 'wall -x' },
    { n: [0, 0, 1], outcome: 'short', name: 'gable +z' },
    { n: [0, 0, -1], outcome: 'short', name: 'gable -z' },
    { n: [nr[0], nr[1], 0], outcome: 'roof', name: 'roof +x' },
    { n: [-nr[0], nr[1], 0], outcome: 'roof', name: 'roof -x' },
  ];
  return { m, verts, prof, com: [0, comY, 0], volume, density, faces, slope, rise };
}

export const OUTCOMES = ['upright', 'long', 'short', 'roof'];
export const OBSERVED = { upright: 7, long: 10, short: 12, roof: 21 }; // your 50 throws
