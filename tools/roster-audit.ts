/**
 * Generates docs/roster-audit.html: current SC2 multiplayer roster vs what the game has.
 *   bun tools/roster-audit.ts
 * Presence / producibility / abilities are read from the game's own config + ability table; the roster and the
 * "real abilities" lists are written by hand below (SC2 LotV multiplayer). Report only: it changes nothing in the game.
 */
import { UNIT_CONFIGS, BUILDING_CONFIGS, FACTION_TECH } from '../src/config';
import { UNIT_MORPHS } from '../src/config';
import { ABILITIES } from '../src/simulation/Mechanics';
import { readFileSync } from 'node:fs';

type Race = 'terran' | 'zerg' | 'protoss';
type Ab = [label: string, test: string | true]; // test: regex over the caster's game ability names, or true = implemented outside the ability table
interface Item { name: string; key: string | null; abil?: Ab[]; note?: string }

const rigged = new Set([...readFileSync('src/graphics/RiggedModels.ts', 'utf8').matchAll(/^  (\w+): \{ url:/gm)].map(m => m[1]!));
const REUSED: Record<string, string> = { dark_templar: 'Zealot model, tinted', high_templar: 'Zealot model, tinted', lurker: 'Hydralisk model, tinted', overseer: 'Overlord model, tinted', corruptor: 'Mutalisk model, tinted' };
const abilNames: Record<string, string[]> = {};
for (const a of Object.values(ABILITIES)) for (const c of a.casters) (abilNames[c] ??= []).push(a.name);
const producers = (u: string) => Object.entries(BUILDING_CONFIGS).filter(([, c]) => (c.produces as string[]).includes(u)).map(([k]) => BUILDING_CONFIGS[k as keyof typeof BUILDING_CONFIGS].name);
const menu = new Set(Object.values(FACTION_TECH).flatMap(f => [...f.basicBuild, ...f.advancedBuild]) as string[]);
const MORPH_BLD: Record<string, string> = { orbital_command: 'Morph from Command Center', planetary_fortress: 'Morph from Command Center', lair: 'Evolve from Hatchery', hive: 'Evolve from Lair', greater_spire: 'Evolve from Spire', techlab: 'Add-on (Barracks/Factory/Starport)', reactor: 'Add-on (Barracks/Factory/Starport)', supply_depot: 'Build menu', nydus_worm: 'Summoned by Nydus Network', creep_tumor: 'Queen ability' };

const T: Item[] = [
  { name: 'SCV', key: 'scv' }, { name: 'Marine', key: 'marine', abil: [['Stimpack', true], ['Combat Shield', true]] },
  { name: 'Marauder', key: 'marauder', abil: [['Stimpack', true], ['Concussive Shells', '']] }, { name: 'Reaper', key: 'reaper' },
  { name: 'Ghost', key: 'ghost', abil: [['Snipe', 'Snipe'], ['Tactical Nuke', 'Nuke'], ['Cloak', '^Cloak']] },
  { name: 'Hellion', key: 'hellion' }, { name: 'Hellbat', key: 'hellbat' }, { name: 'Widow Mine', key: 'widow_mine', abil: [['Burrow', 'Burrow']] },
  { name: 'Siege Tank', key: 'siege_tank', abil: [['Siege Mode', true]] }, { name: 'Cyclone', key: 'cyclone' }, { name: 'Thor', key: 'thor' },
  { name: 'Viking', key: 'viking' }, { name: 'Medivac', key: 'medivac' }, { name: 'Liberator', key: 'liberator' },
  { name: 'Raven', key: 'raven', abil: [['Auto-Turret', 'Auto-Turret'], ['Interference Matrix', ''], ['Anti-Armor Missile', '']] },
  { name: 'Banshee', key: 'banshee', abil: [['Cloak', '^Cloak']] }, { name: 'Battlecruiser', key: 'battlecruiser', abil: [['Yamato Cannon', ''], ['Tactical Jump', '']] },
];
const TB: Item[] = ['command_center', 'orbital_command', 'planetary_fortress', 'supply_depot', 'refinery', 'barracks', 'engineering_bay', 'bunker', 'factory', 'armory', 'starport', 'missile_turret', 'techlab', 'reactor']
  .map(k => ({ name: BUILDING_CONFIGS[k as keyof typeof BUILDING_CONFIGS].name, key: k })).concat([{ name: 'Sensor Tower', key: null as any }, { name: 'Ghost Academy', key: null as any }, { name: 'Fusion Core', key: null as any }]);
const Z: Item[] = [
  { name: 'Drone', key: 'drone' }, { name: 'Overlord', key: 'overlord', abil: [['Morph to Overseer', 'Overseer'], ['Pneumatized Carapace', '']] },
  { name: 'Overseer', key: 'overseer', abil: [['Detection', true], ['Spawn Changeling', ''], ['Contaminate', '']] },
  { name: 'Queen', key: 'queen', abil: [['Inject Larva', 'Inject'], ['Transfuse', 'Transfuse'], ['Creep Tumor', 'Creep Tumor']] },
  { name: 'Zergling', key: 'zergling', abil: [['Burrow', 'Burrow'], ['Morph to Baneling', 'Baneling'], ['Metabolic Boost', true], ['Adrenal Glands', '']] },
  { name: 'Baneling', key: 'baneling', abil: [['Centrifugal Hooks', true]] },
  { name: 'Roach', key: 'roach', abil: [['Burrow', 'Burrow'], ['Morph to Ravager', 'Ravager'], ['Glial Reconstitution', ''], ['Tunneling Claws', '']] },
  { name: 'Ravager', key: 'ravager', abil: [['Corrosive Bile', ''], ['Burrow', '']] },
  { name: 'Hydralisk', key: 'hydralisk', abil: [['Burrow', 'Burrow'], ['Morph to Lurker', 'Lurker'], ['Grooved Spines', ''], ['Muscular Augments', '']] },
  { name: 'Lurker', key: 'lurker', abil: [['Burrow attack', true], ['Seismic Spines', true], ['Adaptive Talons', '']] },
  { name: 'Infestor', key: null as any }, { name: 'Swarm Host', key: 'swarm_host', abil: [['Spawn Locusts', '']] },
  { name: 'Ultralisk', key: 'ultralisk', abil: [['Chitinous Plating', true], ['Anabolic Synthesis', '']] },
  { name: 'Mutalisk', key: 'mutalisk' }, { name: 'Corruptor', key: 'corruptor', abil: [['Morph to Brood Lord', 'Brood Lord'], ['Caustic Spray', '']] },
  { name: 'Brood Lord', key: 'broodlord' }, { name: 'Viper', key: 'viper', abil: [['Abduct', ''], ['Blinding Cloud', ''], ['Parasitic Bomb', ''], ['Consume', '']] },
  { name: 'Locust', key: null as any }, { name: 'Changeling', key: null as any }, { name: 'Broodling', key: null as any }, { name: 'Infested Terran', key: null as any },
];
const ZB: Item[] = ['hatchery', 'lair', 'hive', 'extractor', 'spawning_pool', 'evolution_chamber', 'spine_crawler', 'spore_crawler', 'roach_warren', 'baneling_nest', 'hydralisk_den', 'lurker_den', 'infestation_pit', 'spire', 'greater_spire', 'nydus_network', 'nydus_worm', 'ultralisk_cavern', 'creep_tumor']
  .map(k => ({ name: BUILDING_CONFIGS[k as keyof typeof BUILDING_CONFIGS].name, key: k }));
const P: Item[] = [
  { name: 'Probe', key: 'probe' }, { name: 'Zealot', key: 'zealot', abil: [['Charge', true]] },
  { name: 'Stalker', key: 'stalker', abil: [['Blink', 'Blink']] }, { name: 'Sentry', key: 'sentry', abil: [['Guardian Shield', 'Guardian'], ['Force Field', ''], ['Hallucination', '']] },
  { name: 'Adept', key: 'adept', abil: [['Resonating Glaives', true], ['Psionic Transfer', '']] },
  { name: 'High Templar', key: 'high_templar', abil: [['Psionic Storm', 'Storm'], ['Feedback', 'Feedback'], ['Archon Warp', 'Archon']] },
  { name: 'Dark Templar', key: 'dark_templar', abil: [['Permanent cloak', true], ['Archon Warp', 'Archon'], ['Shadow Strike', '']] },
  { name: 'Archon', key: 'archon' }, { name: 'Immortal', key: 'immortal', abil: [['Barrier', '']] }, { name: 'Colossus', key: 'colossus', abil: [['Extended Thermal Lance', true]] },
  { name: 'Disruptor', key: null as any }, { name: 'Observer', key: null as any }, { name: 'Warp Prism', key: null as any }, { name: 'Phoenix', key: null as any },
  { name: 'Void Ray', key: 'void_ray', abil: [['Prismatic Alignment', '']] }, { name: 'Oracle', key: null as any }, { name: 'Carrier', key: 'carrier' },
  { name: 'Tempest', key: 'tempest' }, { name: 'Mothership', key: null as any },
];
const PB: Item[] = ['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'shield_battery', 'cybernetics_core', 'twilight_council', 'robotics_facility', 'robotics_bay', 'stargate', 'fleet_beacon', 'templar_archives', 'dark_shrine']
  .map(k => ({ name: BUILDING_CONFIGS[k as keyof typeof BUILDING_CONFIGS].name, key: k }));
PB.splice(4, 0, { name: 'Warp Gate (Gateway transform)', key: 'gateway', note: 'warp' });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const U = UNIT_CONFIGS as Record<string, any>, B = BUILDING_CONFIGS as Record<string, any>;
const chip = (ok: boolean | 'part', t: string) => `<span class="chip ${ok === true ? 'ok' : ok === 'part' ? 'part' : 'no'}">${ok === true ? '✓' : ok === 'part' ? '◐' : '✗'} ${esc(t)}</span>`;
const stats = { have: 0, total: 0, buildable: 0 };

function modelCell(key: string): string {
  if (rigged.has(key)) return chip(true, 'real 3D model');
  if (REUSED[key]) return chip('part', REUSED[key]!);
  return chip('part', 'code-built model');
}
function row(it: Item, kind: 'unit' | 'building'): string {
  stats.total++;
  const k = it.key;
  const cfg = k ? (kind === 'unit' ? U[k] : B[k]) : null;
  if (!cfg) return `<tr class="missing"><td>${esc(it.name)}</td><td>${chip(false, 'not in game')}</td><td>—</td><td>—</td><td>${(it.abil ?? []).map(a => chip(false, a[0])).join('')}</td></tr>`;
  stats.have++;
  let prod = '';
  if (kind === 'unit') {
    const ps = producers(k!), mo = UNIT_MORPHS.find(m => m.to === k);
    if (k === 'archon') prod = chip(true, 'merge 2 High/Dark Templar');
    else if (mo) prod = chip(true, `morph from ${U[mo.from].name}`);
    else if (ps.length) prod = chip(true, ps.join(' / '));
    else prod = chip(false, 'campaign/scripted only - not buildable in skirmish');
    if (prod.includes('✓')) stats.buildable++;
  } else {
    if (MORPH_BLD[k!]) prod = chip(true, MORPH_BLD[k!]!);
    else if (it.note === 'warp') prod = chip(true, 'Research Warp Gate at Cybernetics Core');
    else if (menu.has(k!)) prod = chip(true, 'Build menu');
    else prod = chip(false, 'not in any build menu');
    if (prod.includes('✓')) stats.buildable++;
  }
  const names = abilNames[k!] ?? [];
  const abil = (it.abil ?? []).map(([label, test]) => {
    if (test === true) return chip(true, label);
    if (test === '') return chip(false, label);
    return names.some(n => new RegExp(test, 'i').test(n)) ? chip(true, label) : chip(false, label);
  }).join('');
  const cls = prod.includes('✗') ? 'part' : '';
  return `<tr class="${cls}"><td>${esc(it.name)}</td><td>${chip(true, 'in game')}</td><td>${prod}</td><td>${modelCell(k!)}</td><td>${abil || '<span class="dim">—</span>'}</td></tr>`;
}
const table = (title: string, items: Item[], kind: 'unit' | 'building') => `<h3>${title}</h3><table><tr><th>SC2</th><th>Game</th><th>How you get it</th><th>Model</th><th>Abilities / upgrades</th></tr>${items.map(i => row(i, kind)).join('')}</table>`;

const race = (r: string, units: Item[], blds: Item[]) => `<section><h2 class="${r}">${r[0]!.toUpperCase() + r.slice(1)}</h2>${table('Units', units, 'unit')}${table('Structures', blds, 'building')}</section>`;
const sections = race('terran', T, TB) + race('zerg', Z, ZB) + race('protoss', P, PB);
const roster = new Set([...T, ...Z, ...P, ...TB, ...ZB, ...PB].map(i => i.key));
const extras = [...Object.keys(U).filter(k => !roster.has(k) && !['larva', 'egg', 'siege_tank_sieged', 'mule', 'auto_turret', 'vulture'].includes(k)).map(k => `${U[k].name} (${U[k].race})`),
  ...Object.keys(B).filter(k => !roster.has(k) && !['rocks', 'supply_depot_lowered'].includes(k)).map(k => `${B[k].name} (${B[k].race})`)];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SC2 roster audit</title>
<style>
:root{--bg:#0f1218;--card:#171c26;--tx:#e6e9ef;--dim:#8b93a5;--ok:#22c55e;--okbg:#14301f;--no:#ef4444;--nobg:#3a1717;--part:#f59e0b;--partbg:#3a2c0e;--line:#262d3b}
@media (prefers-color-scheme:light){:root{--bg:#f4f5f8;--card:#fff;--tx:#161a22;--dim:#5b6475;--okbg:#dcfce7;--nobg:#fee2e2;--partbg:#fef3c7;--line:#d9dde6}}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,sans-serif;padding:24px 16px 60px}
main{max-width:1100px;margin:auto}h1{margin:0 0 4px}h2{margin:40px 0 4px;padding-bottom:6px;border-bottom:3px solid}h2.terran{color:#38bdf8}h2.zerg{color:#c084fc}h2.protoss{color:#fbbf24}
h3{margin:18px 0 6px;color:var(--dim);font-size:13px;text-transform:uppercase;letter-spacing:.08em}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.sum div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}.sum b{font-size:22px;display:block}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:7px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--dim)}
tr.missing td:first-child{box-shadow:inset 4px 0 var(--no)}tr.part td:first-child{box-shadow:inset 4px 0 var(--part)}tr:not(.missing):not(.part) td:first-child{box-shadow:inset 4px 0 var(--ok)}
.chip{display:inline-block;margin:1px 4px 1px 0;padding:1px 8px;border-radius:999px;font-size:12px;white-space:nowrap}
.chip.ok{background:var(--okbg);color:var(--ok)}.chip.no{background:var(--nobg);color:var(--no)}.chip.part{background:var(--partbg);color:var(--part)}
.dim{color:var(--dim)}.legend{color:var(--dim)}@media (max-width:700px){table{display:block;overflow-x:auto}}
</style></head><body><main>
<h1>SC2 roster audit</h1>
<p class="legend">Current StarCraft II multiplayer roster against this game, read from the game's own config and ability table (generated by <code>tools/roster-audit.ts</code>; the game is not changed by it).
<span class="chip ok">✓ present / found in game code</span> <span class="chip part">◐ present with a caveat</span> <span class="chip no">✗ missing</span>.
Row colour: green = in game and obtainable, amber = in game but not obtainable in skirmish, red = not in game. Ability checks only look for the ability in the game code, not whether its numbers match SC2. Numbers (costs, times) are from memory of the current balance patch and are not verified.</p>
<div class="sum"><div><b>${stats.have}/${stats.total}</b>roster entries in the game</div><div><b>${stats.buildable}/${stats.have}</b>of those obtainable in a normal match</div><div><b>${stats.total - stats.have}</b>missing entirely</div></div>
${sections}
<section><h2>Extras (in the game, not in current SC2 multiplayer)</h2><p>${extras.map(e => `<span class="chip part">${esc(e)}</span>`).join('')}</p></section>
</main></body></html>`;
await Bun.write('docs/roster-audit.html', html);
console.log('wrote docs/roster-audit.html', stats);
