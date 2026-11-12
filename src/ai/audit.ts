/**
 * AI roster audit: `bun src/ai/audit.ts [minutes] [difficulty...]` runs a headless skirmish per race and difficulty and prints
 * which roster units / structures the computer opponent actually built (and when).
 */
import { runAudit, type Race, type Difficulty, type AuditResult } from './headlessWorld';
import { rosterUnits, rosterBuildings } from './roster';

const out = console.log.bind(console);
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const minutes = Number(process.argv[2] ?? 20);
const diffs = (process.argv.slice(3).length ? process.argv.slice(3) : ['easy', 'normal', 'hard', 'elite']) as Difficulty[];
for (const race of ['terran', 'zerg', 'protoss'] as Race[]) {
  const results: AuditResult[] = [];
  for (const d of diffs) results.push(await runAudit(race, d, minutes));
  const row = (name: string, has: (r: AuditResult) => boolean, t: (r: AuditResult) => number | undefined) =>
    out(name.padEnd(20) + results.map(r => (has(r) ? `${Math.floor((t(r) ?? 0) / 60)}:${String((t(r) ?? 0) % 60).padStart(2, '0')}` : '  -  ').padEnd(9)).join(''));
  out(`\n=== ${race.toUpperCase()} (${minutes} min) ` + ' '.repeat(Math.max(0, 6 - race.length)) + diffs.map(d => d.padEnd(9)).join(''));
  for (const u of rosterUnits(race)) row(u, r => r.units.has(u), r => r.firstSeen[u]);
  out('-- structures');
  for (const b of rosterBuildings(race)) row(b, r => r.buildings.has(b), r => r.firstSeen[b]);
  const warp = results.map(r => [...r.units].filter(u => u.startsWith('warpin:')).length);
  if (race === 'protoss') out('warp-in types'.padEnd(20) + warp.map(n => String(n).padEnd(9)).join(''));
}
