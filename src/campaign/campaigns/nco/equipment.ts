import { doneSet } from '../../progress';

/**
 * Nova's equipment (Liquipedia "Nova Covert Ops"): 4 slots, 4 pieces equipped, switchable between missions. Stats are the Liquipedia values.
 * `from` = mission key that grants it (equipment acquired in a mission is usable from the next mission; in-mission pickups from the start of the
 * mission that lists them, see `inMission`). `abilities` = ability ids (Mechanics.ABILITIES) the item enables.
 */
export type Slot = 'helmet' | 'suit' | 'gadget' | 'weapon';
export interface Item {
  id: string; slot: Slot; name: string; desc: string;
  /** Mission whose completion unlocks it (undefined = available from the first mission). */
  from?: string;
  /** Available inside this mission (found there) even before it is completed. */
  inMission?: string;
  hp?: number; armor?: number; speed?: number; energy?: number; regen?: number; noCloak?: boolean;
  weapon?: { damage: number; range: number; cd: number; bonusLight?: number };
  abilities?: string[];
}

export const ITEMS: Item[] = [
  { id: 'ghost_visor', slot: 'helmet', name: 'Ghost Visor', desc: 'Reveals enemy units within 20 and detects cloaked/burrowed.', abilities: [] },
  { id: 'rangefinder_oculus', slot: 'helmet', name: 'Rangefinder Oculus', desc: '+2 vision and +2 range on non-melee weapons.', from: 'sudden_strike' },
  { id: 'indoctrination_visor', slot: 'helmet', name: 'Indoctrination Visor', desc: 'Domination: take control of an enemy unit.', inMission: 'in_the_enemys_shadow', from: 'in_the_enemys_shadow', abilities: ['dominate'] },
  { id: 'tactical_stealth_suit', slot: 'suit', name: 'Tactical Stealth Suit', desc: 'Permanent cloak. +150 life, +1 armor, +0.25 speed.', hp: 150, armor: 1, speed: 0.25 },
  { id: 'turbojet_jumpsuit', slot: 'suit', name: 'Turbojet Jumpsuit', desc: 'Cliff jumping. +250 life, +2 armor, +0.5 speed. Cannot cloak.', inMission: 'sudden_strike', from: 'sudden_strike', hp: 250, armor: 2, speed: 0.5, noCloak: true },
  { id: 'apollo_infantry_suit', slot: 'suit', name: 'Apollo Infantry Suit', desc: '+200 life, +1 armor, +0.25 speed, +100 energy, +50% energy regen. Can cloak.', from: 'trouble_in_paradise', hp: 200, armor: 1, speed: 0.25, energy: 100, regen: 0.5, abilities: ['cloak'] },
  { id: 'phase_reactor_suit', slot: 'suit', name: 'Phase Reactor Suit', desc: 'Blink every 8 s. +200 life, +1 armor, +0.25 speed.', inMission: 'in_the_enemys_shadow', from: 'in_the_enemys_shadow', hp: 200, armor: 1, speed: 0.25, abilities: ['nova_blink'] },
  { id: 'pulse_grenade', slot: 'gadget', name: 'Pulse Grenades', desc: '50 energy, up to 100 damage in an area.', abilities: ['pulse_grenade'] },
  { id: 'flashbang', slot: 'gadget', name: 'Flashbang Grenades', desc: '25 energy: stun + disable detection for 5 s.', from: 'the_escape', abilities: ['flashbang'] },
  { id: 'stim_infusion', slot: 'gadget', name: 'Stim Infusion', desc: '+50% attack/move speed for 10 s, heals 200.', from: 'enemy_intelligence', abilities: ['stim_infusion'] },
  { id: 'holo_decoy', slot: 'gadget', name: 'Holo Decoy', desc: 'A controllable decoy for 45 s (25% damage).', from: 'night_terrors', abilities: ['holo_decoy'] },
  { id: 'ionic_force_field', slot: 'gadget', name: 'Ionic Force Field', desc: 'Absorbs 500 damage for 10 s.', from: 'dark_skies', abilities: ['ionic_force_field'] },
  { id: 'canister_rifle', slot: 'weapon', name: 'C-20A Canister Rifle', desc: 'Dmg 30, range 7. Snipe: 125 damage.', weapon: { damage: 30, range: 7, cd: 1.5 }, abilities: ['snipe'] },
  { id: 'hellfire_shotgun', slot: 'weapon', name: 'Hellfire Shotgun', desc: 'Dmg 20 (+20 vs light), range 4, frontal arc.', from: 'the_escape', weapon: { damage: 20, range: 4, cd: 1.5, bonusLight: 20 } },
  { id: 'monomolecular_blade', slot: 'weapon', name: 'Monomolecular Blade', desc: 'Melee dmg 100, ignores armor.', inMission: 'enemy_intelligence', from: 'enemy_intelligence', weapon: { damage: 100, range: 1.2, cd: 1.5 } },
  { id: 'plasma_rifle', slot: 'weapon', name: 'Plasma Rifle', desc: 'Dmg 15, range 6. Plasma Shot: 100 damage.', from: 'flashpoint', weapon: { damage: 15, range: 6, cd: 0.86 }, abilities: ['plasma_shot'] },
  { id: 'blazefire_gunblade', slot: 'weapon', name: 'Blazefire Gunblade', desc: 'Dmg 90 (+80 splash), range 4. Fury of One.', inMission: 'in_the_enemys_shadow', from: 'in_the_enemys_shadow', weapon: { damage: 90, range: 4, cd: 1.2 }, abilities: ['fury_of_one'] }
];

export const SLOTS: Slot[] = ['helmet', 'suit', 'gadget', 'weapon'];
const KEY = 'sc2_nco_loadout';
const DEFAULTS: Record<Slot, string> = { helmet: 'ghost_visor', suit: 'tactical_stealth_suit', gadget: 'pulse_grenade', weapon: 'canister_rifle' };

export function unlocked(item: Item, done: Set<string>, currentMission?: string): boolean {
  if (!item.from && !item.inMission) return true;
  return (!!item.from && done.has(item.from)) || (!!item.inMission && item.inMission === currentMission);
}
export function loadout(): Record<Slot, string> {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
export function setLoadout(l: Record<Slot, string>) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ } }
/** Next unlocked item in `slot` after the current one (menu cycling). */
export function cycle(slot: Slot, missionKey?: string) {
  const done = doneSet('nco'), l = loadout(); const pool = ITEMS.filter(i => i.slot === slot && unlocked(i, done, missionKey));
  const at = pool.findIndex(i => i.id === l[slot]); l[slot] = pool[(at + 1) % pool.length]!.id; setLoadout(l); return l;
}
export function itemOf(id: string) { return ITEMS.find(i => i.id === id); }

/** Apply the equipped loadout to a Nova unit (stats + enabled abilities). Falls back to defaults for items not yet unlocked. */
export function applyLoadout(nova: any, missionKey: string) {
  const done = doneSet('nco'), l = loadout(), items: Item[] = [];
  for (const s of SLOTS) { const it = itemOf(l[s]); items.push(it && unlocked(it, done, missionKey) ? it : itemOf(DEFAULTS[s])!); }
  nova.maxHealth += items.reduce((a, i) => a + (i.hp ?? 0), 0); nova.health = nova.maxHealth;
  nova.armor += items.reduce((a, i) => a + (i.armor ?? 0), 0);
  nova.speed += items.reduce((a, i) => a + (i.speed ?? 0), 0);
  nova.maxEnergy += items.reduce((a, i) => a + (i.energy ?? 0), 0); nova.energy = nova.maxEnergy;
  nova.noCloak = items.some(i => i.noCloak);
  nova.energyRegenMult = 1 + items.reduce((a, i) => a + (i.regen ?? 0), 0);
  const w = items.find(i => i.slot === 'weapon')!.weapon!; nova.damage = w.damage; nova.attackRange = w.range; nova.attackSpeed = 1 / w.cd;
  if (w.bonusLight) nova.bonusDamage = { type: 'light', amount: w.bonusLight };
  if (items.some(i => i.id === 'rangefinder_oculus') && w.range > 2) nova.attackRange += 2;
  nova.loadoutAbilities = new Set(items.flatMap(i => i.abilities ?? []).concat(['nuke']));
  nova.loadoutItems = items.map(i => i.id);
}
