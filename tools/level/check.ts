// Level sanity check: bun tools/level/check.ts <level_id> [--map]
// Prints an ASCII map (tiers, ramps, cliffs, bases, shortest path between the starts) and validates resources.
import { LEVELS } from '../../src/levels';
import { LevelRaster } from '../../src/levels/LevelRaster';

const id = process.argv[2] ?? 'alien_planet';
const def = LEVELS[id];
if (!def) { console.error('unknown level', id, Object.keys(LEVELS)); process.exit(1); }
const r = new LevelRaster(def);
const S = def.size;
const walk = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return false;
  for (let sy = 0; sy <= 2; sy++) for (let sx = 0; sx <= 2; sx++) if (r.isWall(x + sx * 0.5, y + sy * 0.5)) return false;
  return true;
};

// Dijkstra (8 dirs, euclidean costs, no corner cutting) from a point
function search(sx: number, sy: number) {
  const dist = new Float64Array(S * S).fill(Infinity), par = new Int32Array(S * S).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, n: number) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; } };
  const pop = () => { const top = heap[0]!; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r2 = l + 1; if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l; if (r2 < heap.length && heap[r2]![0] < heap[m]![0]) m = r2; if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m; } } return top; };
  const s = Math.floor(sy) * S + Math.floor(sx); dist[s] = 0; push(0, s);
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]!) continue;
    const cx = c % S, cy = (c / S) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const n = ny * S + nx, nd = d + (dx && dy ? Math.SQRT2 : 1);
      if (nd < dist[n]!) { dist[n] = nd; par[n] = c; push(nd, n); }
    }
  }
  return { dist, par };
}

const d0 = def.starts[0].defense, d1 = def.starts[1].defense;
const { dist, par } = search(d0[0], d0[1]);
const path = new Set<number>();
const pathCells: [number, number][] = [];
let c = Math.floor(d1[1]) * S + Math.floor(d1[0]);
if (!isFinite(dist[c]!)) console.log('!! enemy ramp unreachable from player ramp');
while (c >= 0 && dist[c]! > 0) { path.add(c); pathCells.push([c % S, (c / S) | 0]); c = par[c]!; }

let problems = 0;
const bad = (m: string) => { problems++; console.log('!!', m); };
def.bases.forEach((b, i) => {
  const t = r.tierAt(b.th[0], b.th[1]);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (r.isWall(b.th[0] + dx, b.th[1] + dy) || r.isRamp(b.th[0] + dx, b.th[1] + dy) || Math.abs(r.tierAt(b.th[0] + dx, b.th[1] + dy) - t) > 0.01) { bad(`base ${i} (${b.kind}) TH footprint not flat/walkable at (${dx},${dy})`); dx = 9; break; }
  }
  const res: [string, [number, number]][] = [...b.minerals.map(p => ['mineral', p] as [string, [number, number]]), ...b.geysers.map(p => ['geyser', p] as [string, [number, number]])];
  for (const [k, p] of res) {
    const ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !r.isWall(p[0] + dx!, p[1] + dy!) && !r.isRamp(p[0] + dx!, p[1] + dy!) && Math.abs(r.tierAt(p[0] + dx!, p[1] + dy!) - t) < 0.01);
    if (!ok) bad(`base ${i} ${k} at (${p[0].toFixed(1)},${p[1].toFixed(1)}) on cliff/ramp/other tier`);
    const dp = Math.min(...pathCells.map(([x, y]) => Math.hypot(x + 0.5 - p[0], y + 0.5 - p[1])));
    if (dp < 4.5) bad(`base ${i} ${k} at (${p[0].toFixed(1)},${p[1].toFixed(1)}) only ${dp.toFixed(1)} from the main attack path`);
  }
  const d = dist[Math.floor(b.th[1]) * S + Math.floor(b.th[0])]!;
  if (!isFinite(d)) bad(`base ${i} (${b.kind}) unreachable from player main`);
});
console.log(`${def.name}: ${S}x${S}, bases=${def.bases.length}, main-to-main path=${pathCells.length} tiles, problems=${problems}`);

const step = S > 128 ? 2 : 1, mark = new Map<number, string>();
def.bases.forEach(b => { mark.set(Math.floor(b.th[1] / step) * 1000 + Math.floor(b.th[0] / step), 'T'); b.minerals.forEach(p => mark.set(Math.floor(p[1] / step) * 1000 + Math.floor(p[0] / step), 'm')); b.geysers.forEach(p => mark.set(Math.floor(p[1] / step) * 1000 + Math.floor(p[0] / step), 'g')); });
const lines: string[] = [];
for (let y = 0; y < S; y += step) {
  let line = '';
  for (let x = 0; x < S; x += step) {
    const m = mark.get((y / step) * 1000 + x / step);
    if (m) { line += m; continue; }
    const wx = x + 0.5, wz = y + 0.5;
    if (r.isLiquid(wx, wz)) line += '~';
    else if (r.isWall(wx, wz)) line += r.blocked[r.res * Math.round(wz * 2) + Math.round(wx * 2)] ? '█' : '#';
    else if (r.isRamp(wx, wz)) line += '/';
    else if (path.has(y * S + x)) line += '.';
    else line += String(Math.max(0, Math.round(r.tierAt(wx, wz))));
  }
  lines.push(line);
}
console.log(lines.join('\n'));

if (process.argv.includes('--suggest')) {
  // find open flat spots (and a face direction hugging the nearest wall) where an extra base + its 180° mirror would be valid
  const { mkBase, mirrorBase } = await import('../../src/levels/LevelHelpers');
  const valid = (b: any) => {
    const t = r.tierAt(b.th[0], b.th[1]);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (r.isWall(b.th[0] + dx, b.th[1] + dy) || r.isRamp(b.th[0] + dx, b.th[1] + dy) || Math.abs(r.tierAt(b.th[0] + dx, b.th[1] + dy) - t) > 0.01) return false;
    const pts = [...b.minerals, ...b.geysers];
    return pts.every((p: number[]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !r.isWall(p[0]! + dx!, p[1]! + dy!) && !r.isRamp(p[0]! + dx!, p[1]! + dy!) && Math.abs(r.tierAt(p[0]! + dx!, p[1]! + dy!) - t) < 0.01)
      && Math.min(...pathCells.map(([x, y]) => Math.hypot(x + 0.5 - p[0]!, y + 0.5 - p[1]!))) > 5);
  };
  const out: string[] = [];
  for (let y = 12; y < S / 2 + 20; y += 3) for (let x = 12; x < S - 12; x += 3) {
    if (def.bases.some(b => Math.hypot(b.th[0] - x, b.th[1] - y) < 34) || Math.hypot(x - S / 2, y - S / 2) < 32) continue;
    if (Math.min(...pathCells.map(([px, py]) => Math.hypot(px - x, py - y))) < 14) continue;
    for (let k = 0; k < 16; k++) {
      const face = (k / 16) * Math.PI * 2;
      const b = mkBase([x, y], face, 'third');
      if (!valid(b)) continue;
      if (!valid(mirrorBase(b, S, 'rot'))) continue;
      // resources should hug a wall
      let wd = 99; for (let d = 6; d < 20; d += 2) if (r.isWall(x + Math.cos(face) * d, y + Math.sin(face) * d)) { wd = d; break; }
      out.push(`${wd.toString().padStart(2)} mkBase([${x}, ${y}], ${face.toFixed(3)})`);
    }
  }
  out.sort(); console.log('candidates (wall distance behind minerals, lower = better hugging):\n' + out.slice(0, 14).join('\n'));
}
