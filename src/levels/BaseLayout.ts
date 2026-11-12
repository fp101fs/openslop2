import type { BaseDef, LevelDef, Pt } from './LevelTypes';
import { fitBaseResources, hallAreaBlocked, TOWN_HALL_SIZE } from './LevelHelpers';
import { rasterFor } from './LevelRaster';

/**
 * Fits every base of a level to SC2 geometry on that level's terrain: a 5x5 town hall on clear ground with its mineral
 * fields and geysers 3 cells from its edge (see fitBaseResources). A base authored too close to a wall slides as a whole
 * (hall + resources, up to 7 cells) to the nearest spot where the full layout fits; if none does, it keeps the best one.
 */
export function settleLevel(def: LevelDef): LevelDef {
  const R = rasterFor(def);
  // same rule as Pathfinding: a cell is a wall if any half-tile sample it touches is
  const wall = (cx: number, cy: number) => {
    if (cx < 1 || cy < 1 || cx >= def.size - 1 || cy >= def.size - 1) return true;
    for (let sy = 0; sy <= 2; sy++) for (let sx = 0; sx <= 2; sx++) if (R.isWall(cx + sx * 0.5, cy + sy * 0.5)) return true;
    return false;
  };
  const bases = def.bases.map(b => settleBase(b, wall, (x, y) => R.isRamp(x, y)));
  return { ...def, bases };
}

function settleBase(b: BaseDef, wall: (x: number, y: number) => boolean, ramp: (x: number, y: number) => boolean): BaseDef {
  if (!b.minerals.length && !b.geysers.length) return b;
  const score = (dx: number, dy: number) => {
    const mv = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
    const f = fitBaseResources(mv(b.th), b.minerals.map(mv), b.geysers.map(mv), hallAreaBlocked(mv(b.th), wall));
    let gap = 99, bad = 0;
    const h = TOWN_HALL_SIZE / 2;
    for (let x = f.th[0] - h + 0.5; x < f.th[0] + h; x++) for (let y = f.th[1] - h + 0.5; y < f.th[1] + h; y++)
      if (wall(Math.floor(x), Math.floor(y)) || ramp(x, y)) bad += 10;
    for (const [x, y, w, hh] of [...f.minerals.map(m => [m[0], m[1], 2, 1]), ...f.geysers.map(g => [g[0], g[1], 3, 3])] as number[][]) {
      gap = Math.min(gap, Math.max(Math.abs(x - f.th[0]) - (TOWN_HALL_SIZE + w) / 2, Math.abs(y - f.th[1]) - (TOWN_HALL_SIZE + hh) / 2));
      for (let cx = Math.round(x - w / 2); cx < x + w / 2; cx++) for (let cy = Math.round(y - hh / 2); cy < y + hh / 2; cy++) if (wall(cx, cy)) bad++;
    }
    const dropped = b.minerals.length + b.geysers.length - f.minerals.length - f.geysers.length;
    return { f, pen: bad * 10 + dropped * 5 + Math.max(0, 3 - gap) };
  };
  const shifts: [number, number][] = [];
  for (let dx = -7; dx <= 7; dx++) for (let dy = -7; dy <= 7; dy++) if (dx * dx + dy * dy <= 49) shifts.push([dx, dy]);
  shifts.sort((p, q) => (p[0] ** 2 + p[1] ** 2) - (q[0] ** 2 + q[1] ** 2));
  let best = score(0, 0);
  if (best.pen > 1e-6) for (const [dx, dy] of shifts) {
    const s = score(dx, dy);
    if (s.pen < best.pen - 1e-6) best = s;
    if (best.pen <= 1e-6) break;
  }
  return { ...b, th: best.f.th, minerals: best.f.minerals, geysers: best.f.geysers };
}
