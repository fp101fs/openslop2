import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Mar Sara Outskirts (Zero Hour) - Hold the high-ground base. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const zero_hour = campaignLevel({
  id: 'wol_zero_hour', name: 'Mar Sara Outskirts (Zero Hour)', subtitle: 'Hold the high-ground base', description: 'Hold the high-ground base', size: 128, theme: 'sandstone',
  tiers: [[ell(104,104,18,16), 2, true], [ell(24,24,12,12), 1, true], [ell(24,64,12,12), 1, true], [ell(64,24,10,10), 1, true], [ell(104,24,10,10), 1, true], [ell(24,104,10,10), 1, true]],
  ramps: [[[90,96],[80,88],9,2,0]],
  massifs: [[ell(64,64,12,10), 3], [ell(84,60,8,8), 3]],
  pits: [],
  bases: [mkBase([104,104], 0.785, 'main'), mkBase([24,24], 3.93, 'main'), mkBase([24,64], 0, 'natural'), mkBase([64,24], 1.5, 'natural'), mkBase([104,24], 2, 'natural'), mkBase([24,104], 0, 'natural')],
  home: 0, foe: 1
});
