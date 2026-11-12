/**
 * Mission-as-data format. A `.openslop2mission` file is JSON of this shape; `compile.ts` turns it into a MissionDef the
 * engine runs like any hand-coded mission, and the Mission Builder (tools/mission-builder) reads and writes it.
 * Everything is plain data: ids are strings, points are [x, y] in world tiles (same frame as the LevelDef).
 */
import type { BuildingType, FactionType, UnitType } from '../../types';
import type { BaseDef, Pt, PropRule, Shape } from '../../levels/LevelTypes';
import type { ObjectiveDef } from '../types';

export type Id = string;
/** Campaign difficulty names. Game difficulties map onto them: easy→casual, normal, hard, insane/elite/cheater→brutal. */
export type Diff = 'casual' | 'normal' | 'hard' | 'brutal';
export const DIFFS: Diff[] = ['casual', 'normal', 'hard', 'brutal'];
/** One value for every difficulty, or a value per difficulty (a missing difficulty uses normal's value, else none / 0). */
export type PerDiff<T> = T | Partial<Record<Diff, T>>;
export type Owner = 'player' | 'enemy';

export interface MissionData {
  version: 1;
  key: string;
  campaign: string;
  order: number;
  chapter: string;
  title: string;
  subtitle: string;
  playerFaction: FactionType;
  enemyFaction: FactionType;
  briefing: string;
  /** Research doc, e.g. docs/campaign/wol/01-liberation-day/README.md */
  spec: string;
  gaps?: string[];
  noPlayerBase?: boolean;
  noEnemyBase?: boolean;
  /** Default true for data missions: triggers drive the enemy. */
  aiOff?: boolean;
  startingMinerals: number;
  startingGas: number;
  startingUnits?: { type: UnitType; count: number }[];
  startingBuildings?: { type: BuildingType; dx: number; dy: number }[];
  enemyUpgrades?: PerDiff<EnemyUpgrades>;
  map: MapData;
  regions: Region[];
  paths: PathDef[];
  groups: GroupDef[];
  objectives: ObjectiveDef[];
  speakers: Record<Id, Speaker>;
  dialogue: DialogueLine[];
  triggers: Trigger[];
  /** Code hooks this mission uses (the escape hatch for one-off logic): names passed to dataMission(json, hooks). */
  hooks?: Id[];
  /** Counters the triggers keep (e.g. civilians lost); `showOnVictory` puts them on the end screen. */
  stats?: StatDef[];
  /** Resource pallets: picked up when a player unit walks over one (minerals / gas to the player). */
  pickups?: PickupDef[];
  /** Path the headless autopilot follows in tests. */
  testRoute?: Id;
  /** Free notes about estimates; fields can also carry `note: "UNVERIFIED ..."`. */
  unverified?: string[];
}

export interface EnemyUpgrades { infantryArmor?: number; infantryWeapons?: number; vehicleArmor?: number; vehicleWeapons?: number; shipArmor?: number; shipWeapons?: number; hpScale?: number }

export interface MapData {
  name: string;
  subtitle: string;
  description: string;
  size: number;
  theme: 'alien' | 'sandstone' | 'marsara' | 'canyon' | 'meadow' | 'frost' | 'moss' | 'swamp';
  baseTier?: number;
  /** [shape, tier, plaza?] */
  tiers?: [Shape, number, boolean?][];
  /** [a, b, width, tierFrom, tierTo] */
  ramps?: [Pt, Pt, number, number, number][];
  massifs?: [Shape, number][];
  /** [shape, depth, liquid?] */
  pits?: [Shape, number, boolean?][];
  bases: BaseDef[];
  home: number;
  foe: number;
  props?: PropRule[];
  richness?: number;
  noResources?: boolean;
  /** Paved roads along a polyline; with `tier` the road is flattened to that tier (a trench where the ground around is higher). */
  roads?: RoadDef[];
  /** Props placed at exact spots (statue, gas station, signs...). `kit` is a PropKits id. */
  decor?: DecorDef[];
  /** Editor-only tracing overlay: image placed over the world rect x,y,w,h (world tiles). Ignored by the game. */
  refImage?: { src: string; x: number; y: number; w: number; h: number; opacity?: number };
}

/** `shoulder`: flat verge (tiles) on each side of the paving, flattened to the road's tier too. */
export interface RoadDef { pts: Pt[]; width: number; tier?: number; shoulder?: number }
/** `block` = radius (tiles) of an unwalkable footprint under the prop; `variant` picks one of the kit's meshes. */
export interface DecorDef { id: Id; kit: string; at: Pt; rot?: number; scale?: number; variant?: number; block?: number; note?: string }
export interface Region { id: Id; name?: string; shape: Shape }
export interface PickupDef { id: Id; at: Pt; minerals?: number; gas?: number; note?: string }
export interface PathDef { id: Id; pts: Pt[] }

export interface GroupUnit {
  type: UnitType | BuildingType;
  count: PerDiff<number>;
  /** Hit points override (heroes, stand-ins). */
  hp?: number;
  /** Display name for a hero unit (e.g. "Jim Raynor"). */
  hero?: string;
}
export type Behavior =
  | { kind: 'hold' }
  | { kind: 'guard'; region: Id }
  | { kind: 'patrol'; path: Id }
  | { kind: 'attackMove'; path: Id }
  /** Follow a unit (group id or `group#n`); `scripted` units cannot be selected by the player. */
  | { kind: 'follow'; leader: Id; scripted?: boolean };
export interface GroupDef {
  id: Id;
  owner: Owner;
  at: Pt;
  /** Radians, for buildings / initial facing. */
  facing?: number;
  units: GroupUnit[];
  /** 'start' = placed when the mission begins; 'trigger' = only created by a spawn / dropPods action. */
  spawn: 'start' | 'trigger';
  behavior?: Behavior;
  /** Units spread on a grid this many tiles apart (default 1.3). */
  spread?: number;
  /** Player can't select or order these (mission-controlled allies, cutscene actors). */
  scripted?: boolean;
  /** No unit auto-targets these (cutscene actors); triggers and cutscene `kill` steps still can. */
  untargetable?: boolean;
  /** The whole group is drawn in this unit stat (e.g. 'civiliansLost' counts deaths). */
  deathStat?: Id;
  note?: string;
}

export interface Speaker {
  name: string;
  /** Voice for generated clips (tools/campaign/genvoice.ts): a Kokoro voice id. */
  voice: string;
  /** Portrait art in public/ (e.g. 'ui/portraits/adjutant.png'), else the unit portrait of `unit`. */
  portrait?: string;
  unit?: UnitType;
  /** 'enemy' draws the unit portrait in enemy colours. */
  team?: Owner;
}
export interface DialogueLine {
  id: Id;
  speaker: Id;
  text: string;
  /** Seconds the card stays up (default from text length). */
  sec?: number;
  source?: 'paraphrase' | 'exact' | 'UNVERIFIED';
}

export interface StatDef { id: Id; label: string; showOnVictory?: boolean; /** Shown as "n / of" on the end screen. */ of?: number }

export interface Trigger {
  id: Id;
  when: Cond;
  /** Extra conditions that must all hold when `when` is met. */
  if?: Cond[];
  /** Default true. A repeating trigger fires each time `when` becomes true again (edge-triggered). */
  once?: boolean;
  /** Seconds between the condition and the actions. */
  delay?: number;
  do: Action[];
  note?: string;
}

/** Who a region / unit test looks at: an owner, a group id, or one unit `group#n`. */
export type Who = Owner | Id;

export type Cond =
  | { k: 'start' }
  | { k: 'time'; sec: number }
  | { k: 'every'; sec: number }
  | { k: 'enter'; region: Id; who?: Who; n?: number }
  | { k: 'near'; at: Pt; r: number; who?: Who }
  | { k: 'dies'; unit: Id }
  | { k: 'wiped'; group: Id }
  | { k: 'killed'; group: Id; n: number }
  | { k: 'objective'; id: Id; status: 'done' | 'failed' | 'active' }
  | { k: 'trigger'; id: Id }
  | { k: 'stat'; id: Id; op: '>=' | '<='; n: number }
  | { k: 'hook'; name: string }
  /** A pallet was picked up (`id`), or at least `n` pallets were (no id). */
  | { k: 'pickup'; id?: Id; n?: number };

export interface CutStep { wait: number; camera?: Pt; say?: Id; move?: { unit: Id; to: Pt }; kill?: { unit: Id; by?: Id } }

export type Action =
  | { a: 'spawn'; group: Id }
  | { a: 'dropPods'; group: Id; pods: number; at?: Pt }
  | { a: 'say'; line: Id }
  | { a: 'sayAll'; lines: Id[]; gap?: number }
  | { a: 'objective'; id: Id; op: 'reveal' | 'complete' | 'fail' | 'add'; n?: number }
  | { a: 'camera'; to: Pt }
  | { a: 'cutscene'; steps: CutStep[] }
  | { a: 'attackMove'; group: Id; path?: Id; to?: Pt }
  | { a: 'move'; group: Id; to: Pt }
  | { a: 'attack'; group: Id; target: Id }
  | { a: 'follow'; group: Id; leader: Id; scripted?: boolean }
  | { a: 'transfer'; group: Id; to: Owner }
  | { a: 'land'; group: Id; at: Pt }
  | { a: 'tutorial'; id: Id; title: string; text: string }
  | { a: 'block'; region: Id; on: boolean }
  | { a: 'autosave' }
  | { a: 'resources'; minerals?: number; gas?: number }
  | { a: 'stat'; id: Id; op: 'add' | 'set'; n: number }
  | { a: 'remove'; group: Id }
  | { a: 'win' }
  | { a: 'lose'; reason: string }
  | { a: 'hook'; name: string; args?: unknown };

export type CondKind = Cond['k'];
export type ActionKind = Action['a'];

/** Every condition / action kind, for editors and validators. The `Exact` checks fail to compile if a kind is added to the
 *  unions above but not listed here (or the other way round). */
export const COND_KINDS = ['start', 'time', 'every', 'enter', 'near', 'dies', 'wiped', 'killed', 'objective', 'trigger', 'stat', 'hook', 'pickup'] as const;
export const ACTION_KINDS = ['spawn', 'dropPods', 'say', 'sayAll', 'objective', 'camera', 'cutscene', 'attackMove', 'move', 'attack', 'follow',
  'transfer', 'land', 'tutorial', 'block', 'autosave', 'resources', 'stat', 'remove', 'win', 'lose', 'hook'] as const;
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _condsListed: Exact<CondKind, (typeof COND_KINDS)[number]> = true;
const _actionsListed: Exact<ActionKind, (typeof ACTION_KINDS)[number]> = true;
void _condsListed; void _actionsListed;
