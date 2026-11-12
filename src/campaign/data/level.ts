/** Map half of a data mission. Kept apart from compile.ts (which needs config.ts) because config → maps → this file at load time. */
import type { LevelDef } from '../../levels/LevelTypes';
import { campaignLevel } from '../maps/builder';
import type { MissionData } from './MissionData';

export const levelIdOf = (d: Pick<MissionData, 'campaign' | 'key'>) => `${d.campaign}_${d.key}`;

/** The LevelDef of a data mission's map (id = `<campaign>_<key>`, the MissionDef's mapId). */
export function dataLevel(d: MissionData): LevelDef {
  const { refImage: _ref, ...map } = d.map;
  return campaignLevel({ ...map, id: levelIdOf(d) } as any);
}
