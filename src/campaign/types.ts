/**
 * Campaign framework types. A campaign is a list of missions; a mission is DATA (this file's MissionDef) plus an optional
 * `script(rt)` that registers triggers on the shared MissionRuntime. One file per mission, one folder per campaign, so a
 * correction to a single mission never touches the engine or the other missions.
 */
import type { BuildingType, FactionType, UnitType, DifficultyLevel } from '../types';

export type ObjectiveKind = 'primary' | 'bonus';
export type ObjectiveStatus = 'hidden' | 'active' | 'done' | 'failed';

export interface ObjectiveDef {
  id: string;
  text: string;
  kind: ObjectiveKind;
  /** Counted objective ("Destroy hatcheries 0/6"). */
  target?: number;
  /** Completes automatically when every other primary is done ("Nova must survive"); the script fails it via mustSurvive. */
  passive?: boolean;
  /** Starts hidden until `rt.reveal(id)`. */
  hidden?: boolean;
}

export interface MissionDef {
  /** Stable key inside its campaign, e.g. 'the_escape'. */
  key: string;
  /** 1-based position in the campaign. */
  order: number;
  chapter: string;
  title: string;
  subtitle: string;
  playerFaction: FactionType;
  enemyFaction: FactionType;
  /** Playable terrain. Missions share our generated maps until a bespoke LevelDef is built (see `map` notes). */
  /** Level id registered by src/campaign/maps (one bespoke map per mission). */
  mapId: string;
  difficulty: DifficultyLevel;
  /** Remove the default skirmish bases: hero missions / scripted maps place everything themselves. */
  noEnemyBase?: boolean;
  noPlayerBase?: boolean;
  /** Turn the built-in Zerg AI off (scripts drive the enemy). */
  aiOff?: boolean;
  startingMinerals: number;
  startingGas: number;
  startingBuildings?: { type: BuildingType; dx: number; dy: number }[];
  startingUnits?: { type: UnitType; count: number }[];
  /** Short blurb on the select screen. */
  briefing: string;
  objectives: ObjectiveDef[];
  /** Mission logic: register timers / waves / triggers. Omit for plain "destroy everything" missions. */
  script?: (rt: import('./MissionRuntime').MissionRuntime) => void;
  /** When true the engine's default "destroy all enemies" win test is off; the script decides (rt.win()). */
  customWin?: boolean;
  /** Override the default linear unlock rule (previous mission done). Receives the set of completed mission keys. */
  unlock?: (done: Set<string>) => boolean;
  /** Honest list of things in the real mission that this implementation does not reproduce yet (shown in docs, not the UI). */
  gaps?: string[];
  /** Real-mission spec: docs/campaign/<file>.md */
  spec: string;
  /** Source data when the mission was built from a .opensc2mission file (src/campaign/data). */
  data?: import('./data/MissionData').MissionData;
}

export interface CampaignDef {
  id: string;
  name: string;
  tagline: string;
  color: string;
  /** Rig kind shown on the select screen (an existing unit model). */
  hero: import('../graphics/RiggedModels').RigKind;
  missions: MissionDef[];
}
