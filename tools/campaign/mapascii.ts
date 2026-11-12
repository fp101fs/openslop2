// Usage: bun tools/campaign/mapascii.ts <levelId> [step]  — prints tier map ('#'=blocked, '/'=ramp, digit=tier) + resources; BFS reachability from home start.
import { LEVELS } from '../../src/levels';
import { rasterFor } from '../../src/levels/LevelRaster';
const id = process.argv[2]!, step = +(process.argv[3] ?? 2);
const def: any = (LEVELS as any)[id]; if (!def) { console.log('no level', id, Object.keys(LEVELS).filter(k => k.includes(id.slice(0, 4)))); process.exit(1); }
const r = rasterFor(def), res = r.res;
const at = (x: number, y: number) => Math.round(y * 2) * res + Math.round(x * 2);
const mark = new Map<string, string>();
def.bases.forEach((b: any, i: number) => { mark.set(Math.round(b.th[0] / step) + ',' + Math.round(b.th[1] / step), 'T'); b.minerals.forEach((p: any) => mark.set(Math.round(p[0] / step) + ',' + Math.round(p[1] / step), 'm')); b.geysers.forEach((p: any) => mark.set(Math.round(p[0] / step) + ',' + Math.round(p[1] / step), 'g')); });
for (const a of process.argv.slice(4)) { const [n, x, y] = a.split(':'); mark.set(Math.round(+x! / step) + ',' + Math.round(+y! / step), n!); }
let out = '';
for (let y = 0; y < def.size; y += step) {
  let row = String(y).padStart(3) + ' ';
  for (let x = 0; x < def.size; x += step) {
    const m = mark.get(x / step + ',' + y / step); if (m) { row += m; continue; }
    const i = at(x, y); row += r.blocked[i] ? '#' : r.ramp[i] ? '/' : String(Math.max(0, Math.round(r.tier[i]!)));
  }
  out += row + '\n';
}
console.log(out);
