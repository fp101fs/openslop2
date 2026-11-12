/** Lists every campaign mission with its known gaps vs the real SC2 mission (the `gaps` field of each MissionDef).
 *    bun tools/campaign/gaps.ts [campaignId]      e.g. bun tools/campaign/gaps.ts nco */
import { CAMPAIGNS } from '../../src/campaign/registry';
const only = process.argv[2];
for (const c of CAMPAIGNS) {
  if (only && c.id !== only) continue;
  console.log(`\n== ${c.name} (${c.missions.length} missions)`);
  for (const m of c.missions) {
    console.log(`${String(m.order).padStart(2)}. ${m.title}  [map ${m.mapId}]`);
    for (const g of m.gaps ?? ['(none recorded)']) console.log(`      - ${g}`);
  }
}
