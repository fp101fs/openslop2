import type { LevelDef } from '../../levels/LevelTypes';
import { NCO_MAPS } from './nco';
import { WOL_MAPS } from './wol';

/** Every campaign level, keyed by id. Merged into LEVELS (src/levels/index.ts) so the engine treats them like any skirmish map. */
export const CAMPAIGN_LEVELS: Record<string, LevelDef> = { ...NCO_MAPS, ...WOL_MAPS };
