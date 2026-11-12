import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Agria (The Evacuation) - Colony road and spaceport. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const the_evacuation = campaignLevel({
  id: 'wol_the_evacuation', name: 'Agria (The Evacuation)', subtitle: 'Colony road and spaceport', description: 'Colony road and spaceport', size: 128, theme: 'meadow',
  tiers: [[rect(64,64,110,8,0.78), 1, true], [ell(24,24,14,12), 1, true], [ell(104,104,16,14), 2, true], [ell(104,24,10,10), 1, true], [ell(24,104,10,10), 1, true]],
  ramps: [[[94,94],[84,84],7,2,1]],
  massifs: [[ell(44,70,8,10), 3], [ell(84,50,8,10), 3], [ell(64,30,10,6), 3]],
  pits: [],
  bases: [mkBase([24,24], 0.785, 'main'), mkBase([104,104], 3.93, 'main'), mkBase([104,24], 0, 'natural'), mkBase([24,104], 0, 'natural')],
  home: 0, foe: 1
});
