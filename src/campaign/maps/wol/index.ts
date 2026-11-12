import type { LevelDef } from '../../../levels/LevelTypes';
import { liberation_day } from './liberation_day';
import { the_outlaws } from './the_outlaws';
import { zero_hour } from './zero_hour';
import { the_evacuation } from './the_evacuation';
import { outbreak } from './outbreak';
import { safe_haven } from './safe_haven';
import { havens_fall } from './havens_fall';
import { smash_and_grab } from './smash_and_grab';
import { the_dig } from './the_dig';
import { the_moebius_factor } from './the_moebius_factor';
import { supernova } from './supernova';
import { maw_of_the_void } from './maw_of_the_void';
import { the_devils_playground } from './the_devils_playground';
import { welcome_to_the_jungle } from './welcome_to_the_jungle';
import { breakout } from './breakout';
import { ghost_of_a_chance } from './ghost_of_a_chance';
import { the_great_train_robbery } from './the_great_train_robbery';
import { cutthroat } from './cutthroat';
import { engine_of_destruction } from './engine_of_destruction';
import { media_blitz } from './media_blitz';
import { piercing_the_shroud } from './piercing_the_shroud';
import { whispers_of_doom } from './whispers_of_doom';
import { a_sinister_turn } from './a_sinister_turn';
import { echoes_of_the_future } from './echoes_of_the_future';
import { in_utter_darkness } from './in_utter_darkness';
import { gates_of_hell } from './gates_of_hell';
import { belly_of_the_beast } from './belly_of_the_beast';
import { shatter_the_sky } from './shatter_the_sky';
import { all_in } from './all_in';

/** Wings of Liberty maps, one file each. Key = LevelDef id (also the mission's mapId). */
export const WOL_MAPS: Record<string, LevelDef> = {
  [liberation_day.id]: liberation_day,
  [the_outlaws.id]: the_outlaws,
  [zero_hour.id]: zero_hour,
  [the_evacuation.id]: the_evacuation,
  [outbreak.id]: outbreak,
  [safe_haven.id]: safe_haven,
  [havens_fall.id]: havens_fall,
  [smash_and_grab.id]: smash_and_grab,
  [the_dig.id]: the_dig,
  [the_moebius_factor.id]: the_moebius_factor,
  [supernova.id]: supernova,
  [maw_of_the_void.id]: maw_of_the_void,
  [the_devils_playground.id]: the_devils_playground,
  [welcome_to_the_jungle.id]: welcome_to_the_jungle,
  [breakout.id]: breakout,
  [ghost_of_a_chance.id]: ghost_of_a_chance,
  [the_great_train_robbery.id]: the_great_train_robbery,
  [cutthroat.id]: cutthroat,
  [engine_of_destruction.id]: engine_of_destruction,
  [media_blitz.id]: media_blitz,
  [piercing_the_shroud.id]: piercing_the_shroud,
  [whispers_of_doom.id]: whispers_of_doom,
  [a_sinister_turn.id]: a_sinister_turn,
  [echoes_of_the_future.id]: echoes_of_the_future,
  [in_utter_darkness.id]: in_utter_darkness,
  [gates_of_hell.id]: gates_of_hell,
  [belly_of_the_beast.id]: belly_of_the_beast,
  [shatter_the_sky.id]: shatter_the_sky,
  [all_in.id]: all_in,
};
