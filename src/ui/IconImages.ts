// Button icons (SVG) served from /icons/btn-<name>.svg.
// Anything without a match keeps its emoji / drawn SVG glyph.
import { UNIT_CONFIGS, BUILDING_CONFIGS, RESEARCH } from '../config';
import { ABILITIES } from '../simulation/Mechanics';

type Race = 'terran' | 'zerg' | 'protoss';
const t = (n: string) => 'unit-terran-' + n, z = (n: string) => 'unit-zerg-' + n, p = (n: string) => 'unit-protoss-' + n;
const bt = (n: string) => 'building-terran-' + n, bz = (n: string) => 'building-zerg-' + n, bp = (n: string) => 'building-protoss-' + n;

/** Unit and building type -> icon. */
const ENTITY: Record<string, string> = {
  scv: t('scv'), marine: t('marine'), marauder: t('marauder'), firebat: t('firebat'), medic: t('medic'),
  siege_tank: t('siegetank'), siege_tank_sieged: t('siegetanksiegemode'), medivac: t('medivac'),
  viking: t('vikingfighter'), viking_assault: t('vikingassault'), widow_mine: t('widowmine'), wraith: t('wraith'),
  banshee: t('banshee'), hellion: t('hellion'), hellbat: t('hellionbattlemode'), thor: t('thor'), thor_ap: t('thorsiegemode'),
  goliath: t('goliath'), mule: t('mule'), ghost: t('ghost'), nova: t('nova'), reaper: t('reaper'), liberator: t('liberator'),
  raven: t('raven'), battlecruiser: t('battlecruiser'), cyclone: t('cyclone'), odin: t('odin'), vulture: t('vulture'),
  auto_turret: bt('autoturret'),
  queen: z('queen'), drone: z('drone'), larva: z('larva'), zergling: z('zergling'), roach: z('roach'), hydralisk: z('hydralisk'),
  mutalisk: z('mutalisk'), baneling: z('baneling'), ravager: z('ravager'), ultralisk: z('ultralisk'), broodlord: z('broodlord'),
  viper: z('viper'), lurker: z('lurker'), overseer: z('overseer'), corruptor: z('corruptor'), overlord: z('overlord'),
  swarm_host: z('swarmhost'),
  probe: p('probe'), sentry: p('sentry'), dark_templar: p('darktemplar'), high_templar: p('hightemplar'), archon: p('archon'),
  zealot: p('zealot'), stalker: p('stalker'), void_ray: p('warpray'), immortal: p('immortal'), colossus: p('colossus'),
  carrier: p('carrier'), tempest: p('tempest'), adept: p('adept'), observer: p('observer'), warp_prism: p('warpprism'),
  disruptor: p('disruptor'), phoenix: p('phoenix'), oracle: p('oracle'), mothership: p('mothership'), infestor: z('infestor'),
  fusion_core: bt('fusioncore'), ghost_academy: bt('ghostacademy'), sensor_tower: bt('sensordome'),
  command_center: bt('commandcenter'), planetary_fortress: bt('planetaryfortress'), techlab: bt('techlab'), reactor: bt('reactor'),
  supply_depot: bt('supplydepot'), supply_depot_lowered: bt('supplydepotlowered'), refinery: bt('refinery'), barracks: bt('barracks'),
  engineering_bay: bt('engineeringbay'), bunker: bt('bunker'), missile_turret: bt('missileturret'), factory: bt('factory'),
  armory: bt('armory'), starport: bt('starport'),
  hatchery: bz('hatchery'), lair: bz('lair'), hive: bz('hive'), spawning_pool: bz('spawningpool'), roach_warren: bz('roachwarren'),
  hydralisk_den: bz('hydraliskden'), spine_crawler: bz('spinecrawler'), spore_crawler: bz('sporecrawler'), infestation_pit: bz('infestationpit'),
  extractor: bz('extractor'), baneling_nest: bz('banelingnest'), evolution_chamber: bz('evolutionchamber'), lurker_den: bz('lurkerden'),
  spire: bz('spire'), greater_spire: bz('greaterspire'), nydus_network: bz('nydusnetwork'), nydus_worm: bz('nydusworm'),
  ultralisk_cavern: bz('ultraliskcavern'), creep_tumor: bz('creeptumor'),
  nexus: bp('nexus'), pylon: bp('pylon'), assimilator: bp('assimilator'), gateway: bp('gateway'), forge: bp('forge'),
  photon_cannon: bp('photoncannon'), cybernetics_core: bp('cyberneticscore'), twilight_council: bp('twilightcouncil'),
  robotics_facility: bp('roboticsfacility'), robotics_bay: bp('roboticssupportbay'), templar_archives: bp('templararchives'),
  dark_shrine: bp('darkshrine'), fleet_beacon: bp('fleetbeacon'), shield_battery: bp('shieldbattery'), stargate: bp('stargate'),
};

/** Ability id -> icon (warp_<unit> / morph_<unit> fall back to the unit's icon). */
const ABILITY: Record<string, string> = {
  cloak: 'ability-terran-cloak-color', snipe: 'ability-terran-snipe-color', emp_round: 'ability-terran-emp-color',
  steady_targeting: 'ability-terran-snipe-color', stim_infusion: 'ability-terran-stimpack-color',
  ionic_force_field: 'ability-terran-defensivematrix', dominate: 'ability-terran-domination',
  pulse_grenade: 'upgrade-nova-pulsegrenade', nuke: 'ability-terran-nuclearstrike-color', scan: 'ability-terran-scannersweep-color',
  mule: t('mule'), planetary: bt('planetaryfortress'), auto_turret: bt('autoturret'), creep_tumor: bz('creeptumor'),
  spread_tumor: bz('creeptumor'), nydus_worm: bz('nydusworm'), lair: bz('lair'), hive: bz('hive'), greater_spire: bz('greaterspire'),
  lift: 'ability-terran-liftoff', land: 'ability-terran-land', techlab: bt('techlab'), reactor: bt('reactor'),
  burrow: 'ability-zerg-burrow-color', transfuse: 'ability-zerg-transfusion-color', blink: 'ability-protoss-blink-color',
  nova_blink: 'ability-protoss-stealth-blink', chrono: 'ability-protoss-chronobeam', archon_merge: p('archon'),
  feedback: 'ability-protoss-feedback-color', fungal: 'ability-zerg-fungalgrowth-color', psionic_storm: 'ability-protoss-psistorm-color',
};

/** Research id (one-shot techs and level lines, per race) -> icon. */
const RESEARCH_IMG: Record<string, string | Partial<Record<Race, string>>> = {
  metabolic_boost: 'upgrade-zerg-metabolicboost', centrifugal_hooks: 'upgrade-zerg-centrifugalhooks',
  chitinous_plating: 'upgrade-zerg-chitinousplating', charge: 'ability-protoss-charge-color', blink_tech: 'ability-protoss-blink-color',
  resonating_glaives: 'upgrade-protoss-resonatingglaives-orange', psionic_storm: 'ability-protoss-psistorm-color',
  seismic_spines: 'upgrade-kerrigan-seismicspines', drilling_claws: 'upgrade-terran-researchdrillingclaws',
  smart_servos: 'upgrade-terran-transformationservos', thermal_lance: 'upgrade-protoss-extendedthermallance',
  warp_gate: bp('warpgate'), combat_shields: 'techupgrade-terran-combatshield-color', shield_upgrade: 'upgrade-protoss-shieldslevel1',
  weapons: { terran: 'upgrade-terran-infantryweaponslevel1', protoss: 'upgrade-protoss-groundweaponslevel1' },
  armor: { terran: 'upgrade-terran-infantryarmorlevel1', zerg: 'upgrade-zerg-groundcarapace-level1', protoss: 'upgrade-protoss-groundarmorlevel1' },
  melee_attacks: 'upgrade-zerg-meleeattacks-level1', missile_attacks: 'upgrade-zerg-missileattacks-level1',
  vehicle_weapons: 'upgrade-terran-vehicleweaponslevel1', vehicle_armor: 'upgrade-terran-vehicleplatinglevel1',
  ship_weapons: { terran: 'upgrade-terran-shipweaponslevel1', zerg: 'upgrade-zerg-airattacks-level1', protoss: 'upgrade-protoss-airweaponslevel1' },
  ship_armor: { terran: 'upgrade-terran-shipplatinglevel1', zerg: 'upgrade-zerg-flyercarapace-level1', protoss: 'upgrade-protoss-airarmorlevel1' },
};

/** Hard-coded command-card buttons, matched by their label. */
const BUTTON: Record<string, string | Partial<Record<Race, string>>> = {
  Move: 'command-move', Stop: 'command-stop', 'Hold Position': 'command-holdposition', Patrol: 'command-patrol',
  Attack: 'command-attack', Cancel: 'command-cancel',
  Gather: { terran: 'ability-terran-gather', zerg: 'ability-zerg-gather', protoss: 'ability-protoss-gather' },
  'Build Structure': { terran: 'command-terran-buildstructure', protoss: 'command-protoss-buildstructure' },
  'Build Advanced Structure': { terran: 'command-terran-buildadvancedstructure', protoss: 'command-protoss-buildadvancedstructure' },
  Repair: 'ability-terran-repair', Stimpack: 'ability-terran-stimpack-color',
  'Siege Mode': t('siegetanksiegemode'), 'Tank Mode': t('siegetank'),
  'High Impact Payload': t('thorsiegemode'), 'Explosive Payload': t('thor'),
  'Fighter Mode': t('vikingfighter'), 'Assault Mode': t('vikingassault'),
  Load: 'ability-terran-load', 'Unload All': 'ability-terran-unloadall', Salvage: 'ability-terran-salvage',
  Raise: bt('supplydepot'), Lower: bt('supplydepotlowered'), 'Select Larva': z('larva'), Larva: z('larva'),
};

const pick = (v: string | Partial<Record<Race, string>> | undefined, race?: string) =>
  typeof v === 'string' ? v : v && race ? v[race as Race] : undefined;

/** Every icon name this module can reference (used by tools/fetch-icons.ts). */
/** Button-art URL of a unit / structure type (/icons/btn-<name>.svg), or null when it has none. */
export const entityIconUrl = (type: string): string | null => (ENTITY[type] ? `/icons/btn-${ENTITY[type]}.svg` : null);

export function allIconNames(): string[] {
  const out = new Set<string>([...Object.values(ENTITY), ...Object.values(ABILITY)]);
  for (const v of [...Object.values(RESEARCH_IMG), ...Object.values(BUTTON)]) {
    if (typeof v === 'string') out.add(v); else Object.values(v).forEach(x => x && out.add(x));
  }
  return [...out].sort();
}

export const imgTag = (name: string) => `<img class="sc2-ico" src="/icons/btn-${name}.svg" alt="" draggable="false">`;

/** Icon for a research button, or the given fallback. */
export function researchIcon(id: string, race: string, fallback: string): string {
  const n = pick(RESEARCH_IMG[id], race);
  return n ? imgTag(n) : fallback;
}

/** Icon for a hard-coded command-card button label (strips " x3" / " (5)" suffixes). */
export function buttonIcon(label: string, race?: string): string | null {
  const key = label.replace(/\s+(x\d+|\(\d+\))$/, '').trim();
  const n = pick(BUTTON[key], race) ?? (/^Larva\b/.test(key) ? z('larva') : undefined);
  return n ? imgTag(n) : null;
}

let applied = false;
/** Swap the emoji `icon` of every mapped unit, building, ability and research for its SC2 button image (once). */
export function applyIconImages(): void {
  if (applied) return;
  applied = true;
  for (const [k, c] of Object.entries(UNIT_CONFIGS)) if (ENTITY[k]) c.icon = imgTag(ENTITY[k]!);
  for (const [k, c] of Object.entries(BUILDING_CONFIGS)) if (ENTITY[k]) c.icon = imgTag(ENTITY[k]!);
  for (const [k, a] of Object.entries(ABILITIES)) {
    const n = ABILITY[k] ?? ENTITY[k.replace(/^(warp|morph)_/, '')];
    if (n) a.icon = imgTag(n);
  }
  for (const r of RESEARCH) { const n = pick(RESEARCH_IMG[r.id]); if (n) r.icon = imgTag(n); }
}
