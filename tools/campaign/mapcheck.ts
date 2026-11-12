// Usage: bun tools/campaign/mapcheck.ts [nco|wol]  — per mission: spawn/objective points on walls or cut off from the start, stray resources.
import { CAMPAIGNS } from '../../src/campaign/registry';
import { LEVELS } from '../../src/levels';
import { rasterFor } from '../../src/levels/LevelRaster';
import { readFileSync, readdirSync } from 'fs';
import { validateMission } from '../../src/campaign/data/validate';
const only = process.argv[2];
const dirOf = (id: string) => `src/campaign/campaigns/${id}/missions`;
let problems = 0;
for (const c of CAMPAIGNS) {
  if (only && c.id !== only) continue;
  const files = readdirSync(dirOf(c.id));
  for (const m of c.missions) {
    const def: any = (LEVELS as any)[m.mapId]; const tag = `${c.id}/${m.key}`;
    if (!def) { console.log(`✗ ${tag}: no level ${m.mapId}`); problems++; continue; }
    if (m.data) { // data mission: real points and references from the .opensc2mission, no source scraping
      const issues = validateMission(m.data, def);
      const errs = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
      if (errs.length) problems++;
      console.log(`${errs.length ? '✗' : '✓'} ${tag} (data${warns.length ? `, ${warns.length} warning(s)` : ''})` + issues.map(i => `\n   ${i.level === 'error' ? 'error' : 'warn '} ${i.where}: ${i.msg}`).join(''));
      continue;
    }
    const r = rasterFor(def), res = r.res, N = res * res;
    const cell = (x: number, y: number) => Math.round(y * 2) * res + Math.round(x * 2);
    const ok = (x: number, y: number) => x >= 0 && y >= 0 && x <= def.size && y <= def.size && !r.wall[cell(x, y)];
    const comp = new Int32Array(N).fill(-1); let nc = 0; const size: number[] = [];
    for (let s = 0; s < N; s++) {
      if (comp[s]! >= 0 || r.wall[s]) continue;
      const q = [s]; comp[s] = nc; let n = 0;
      while (q.length) { const i = q.pop()!; n++; const x = i % res, z = (i / res) | 0;
        for (const j of [i - 1, i + 1, i - res, i + res]) { if (j < 0 || j >= N || comp[j]! >= 0 || r.wall[j]) continue; if ((j === i - 1 && x === 0) || (j === i + 1 && x === res - 1)) continue; comp[j] = nc; q.push(j); } }
      size.push(n); nc++;
    }
    // nearest walkable cell within 2 tiles (engine snaps targets)
    const snap = (x: number, y: number): number => { for (let d = 0; d <= 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const px = x + dx * 0.5, py = y + dy * 0.5; if (ok(px, py)) return comp[cell(px, py)]!; } return -1; };
    const msgs: string[] = [];
    const src = files.filter(f => f.toLowerCase() === (m.key.replace(/_/g, '') + '.ts').toLowerCase() || f.replace('.ts', '').toLowerCase() === m.key.replace(/_/g, '').toLowerCase()).map(f => readFileSync(`${dirOf(c.id)}/${f}`, 'utf8')).join('\n');
    if (!src) msgs.push('source file not found for point scan');
    const pts: [number, number][] = [];
    for (const mt of src.matchAll(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)) { const x = +mt[1]!, y = +mt[2]!; if (x >= 6 && y >= 6 && x <= def.size - 6 && y <= def.size - 6) pts.push([x, y]); }
    for (const mt of src.matchAll(/'(?:player|enemy)'\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/g)) pts.push([+mt[1]!, +mt[2]!]);
    // start = first spawnNova point, else home base th
    const sn = src.match(/spawnNova\(rt,\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/);
    const home = def.starts[0].base, th = def.bases[home].th;
    const start: [number, number] = sn ? [+sn[1]!, +sn[2]!] : [th[0], th[1]];
    const sc = snap(start[0], start[1]);
    if (sc < 0) msgs.push(`start ${start} not on walkable ground`);
    const seen = new Set<string>(); const cut: string[] = [], wall: string[] = [];
    for (const [x, y] of pts) {
      const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      if (!ok(x, y)) { if (snap(x, y) < 0) wall.push(k); }
      const cc = snap(x, y); if (cc >= 0 && sc >= 0 && cc !== sc && !(size[cc]! < 200)) cut.push(k);
      else if (cc >= 0 && sc >= 0 && cc !== sc) cut.push(k + '(tiny)');
    }
    if (wall.length) msgs.push(`points inside walls: ${wall.join(' ')}`);
    if (cut.length) msgs.push(`points cut off from start ${start} (comp ${sc}): ${cut.join(' ')}`);
    // resources
    const nres = def.bases.reduce((a: number, b: any) => a + b.minerals.length + b.geysers.length, 0);
    const bare = m.noPlayerBase && m.startingMinerals === 0;
    const mining = /mineGoal|mined|gather|harvest/.test(src);
    if (nres && bare && !mining) msgs.push(`stray resources: ${nres} patches/geysers on a no-base, no-mining mission`);
    for (const b of def.bases) for (const p of [...b.minerals, ...b.geysers] as [number, number][]) if (r.blocked[cell(p[0], p[1])]) { msgs.push(`resource at ${p} inside blocked terrain`); break; }
    const big = size.map((n, i) => [n, i] as const).filter(([n]) => n >= 200);
    if (msgs.length) { problems++; console.log(`✗ ${tag} (${big.length} main walkable regions)\n   ` + msgs.join('\n   ')); } else console.log(`✓ ${tag}`);
  }
}
console.log(`\n${problems} mission(s) with problems`);
