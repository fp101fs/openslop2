import type { LevelDef } from '../../../levels/LevelTypes';
import { escape } from './escape';
import { sudden_strike } from './sudden_strike';
import { enemy_intelligence } from './enemy_intelligence';
import { trouble_in_paradise } from './trouble_in_paradise';
import { night_terrors } from './night_terrors';
import { flashpoint } from './flashpoint';
import { in_the_enemys_shadow } from './in_the_enemys_shadow';
import { dark_skies } from './dark_skies';
import { end_game } from './end_game';

/** Nova Covert Ops maps, one file each. Key = LevelDef id (also the mission's mapId). */
export const NCO_MAPS: Record<string, LevelDef> = {
  [escape.id]: escape,
  [sudden_strike.id]: sudden_strike,
  [enemy_intelligence.id]: enemy_intelligence,
  [trouble_in_paradise.id]: trouble_in_paradise,
  [night_terrors.id]: night_terrors,
  [flashpoint.id]: flashpoint,
  [in_the_enemys_shadow.id]: in_the_enemys_shadow,
  [dark_skies.id]: dark_skies,
  [end_game.id]: end_game,
};
