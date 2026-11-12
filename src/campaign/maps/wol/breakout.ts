import { campaignLevel, ell, rect, mkBase } from '../builder';

/** New Folsom (Breakout) - Prison base from the road. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const breakout = campaignLevel({
  id: 'wol_breakout', name: 'New Folsom (Breakout)', subtitle: 'Prison base from the road', description: 'Prison base from the road', size: 128, theme: 'canyon',
  tiers: [[rect(64,64,110,10), 1, true], [ell(14,64,10,10), 1, true], [ell(112,64,14,16), 2, true], [ell(64,36,12,8), 2, true], [ell(64,92,12,8), 2, true]],
  ramps: [[[100,64],[106,64],7,1,2]],
  massifs: [[ell(40,40,14,6), 3], [ell(88,90,14,6), 3], [ell(40,88,14,6), 3], [ell(88,40,14,6), 3]],
  pits: [],
  bases: [mkBase([14,64], 0.785, 'main'), mkBase([112,64], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
