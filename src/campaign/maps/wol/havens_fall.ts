import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Haven (Haven's Fall) - Burn the infestation. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const havens_fall = campaignLevel({
  id: 'wol_havens_fall', name: "Haven (Haven's Fall)", subtitle: 'Burn the infestation', description: 'Burn the infestation', size: 128, theme: 'frost',
  tiers: [[ell(20,64,16,14), 2, true], [ell(108,64,16,14), 2, true], [ell(64,24,12,12), 1, true], [ell(64,104,12,12), 1, true], [ell(64,64,10,10), 1, true]],
  ramps: [[[34,64],[44,64],8,2,1]],
  massifs: [[ell(44,40,8,8), 3], [ell(84,40,8,8), 3], [ell(44,90,8,8), 3]],
  pits: [],
  bases: [mkBase([20,64], 0.785, 'main'), mkBase([108,64], 3.93, 'main'), mkBase([64,24], 0, 'natural'), mkBase([64,104], 0, 'natural'), mkBase([64,64], 0, 'natural')],
  home: 0, foe: 1
});
