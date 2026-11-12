// Shared analysis for campaign maps: walkable regions (same wall rule the pathfinder uses), mission points, start.
import { LEVELS } from '../../src/levels';
import { LevelRaster } from '../../src/levels/LevelRaster';
import { readFileSync, readdirSync } from 'fs';
import type { MissionDef } from '../../src/campaign/types';

export interface Analysis {
  def: any; r: LevelRaster; comp: Int32Array; size: number[]; cell: (x: number, y: number) => number;
  ok: (x: number, y: number) => boolean; snap: (x: number, y: number) => number;
  pts: [number, number][]; start: [number, number]; src: string;
}
export const missionSource = (cid: string, m: MissionDef) => {
  const dir = `src/campaign/campaigns/${cid}/missions`;
  const want = m.key.replace(/_/g, '').toLowerCase();
  return readdirSync(dir).filter(f => f.replace('.ts', '').toLowerCase() === want).map(f => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
};
export function analyze(cid: string, m: MissionDef, extraOps: any[] = []): Analysis | null {
  const base: any = (LEVELS as any)[m.mapId]; if (!base) return null;
  const def = extraOps.length ? { ...base, ops: [...base.ops, ...extraOps] } : base;
  const r = new LevelRaster(def), res = r.res, N = res * res;
  const cell = (x: number, y: number) => Math.round(y * 2) * res + Math.round(x * 2);
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x <= def.size && y <= def.size && !r.wall[cell(x, y)];
  const comp = new Int32Array(N).fill(-1); const size: number[] = []; let nc = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s]! >= 0 || r.wall[s]) continue;
    const q = [s]; comp[s] = nc; let n = 0;
    while (q.length) {
      const i = q.pop()!; n++; const x = i % res;
      for (const j of [i - 1, i + 1, i - res, i + res]) {
        if (j < 0 || j >= N || comp[j]! >= 0 || r.wall[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === res - 1)) continue;
        comp[j] = nc; q.push(j);
      }
    }
    size.push(n); nc++;
  }
  const snap = (x: number, y: number): number => {
    for (let d = 0; d <= 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const px = x + dx * 0.5, py = y + dy * 0.5; if (ok(px, py)) return comp[cell(px, py)]!;
    }
    return -1;
  };
  const src = missionSource(cid, m);
  const pts: [number, number][] = [];
  for (const mt of src.matchAll(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)) { const x = +mt[1]!, y = +mt[2]!; if (x >= 6 && y >= 6 && x <= def.size - 6 && y <= def.size - 6) pts.push([x, y]); }
  for (const mt of src.matchAll(/'(?:player|enemy)'\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/g)) pts.push([+mt[1]!, +mt[2]!]);
  const sn = src.match(/spawnNova\(rt,\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
  const th = def.bases[def.starts[0].base].th;
  const start: [number, number] = sn ? [+sn[1]!, +sn[2]!] : [th[0], th[1]];
  return { def, r, comp, size, cell, ok, snap, pts, start, src };
}
