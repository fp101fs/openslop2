import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Ihan Crystal Memory (Whispers of Doom) - Zeratul and the shrines. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const whispers_of_doom = campaignLevel({
  id: 'wol_whispers_of_doom', name: 'Ihan Crystal Memory (Whispers of Doom)', subtitle: 'Zeratul and the shrines', description: 'Zeratul and the shrines', size: 128, theme: 'alien',
  tiers: [[rect(64,64,110,8), 1, true], [ell(30,40,8,8), 1, true], [ell(64,30,8,8), 1, true], [ell(100,50,8,8), 1, true], [ell(114,64,8,8), 1, true]],
  ramps: [],
  massifs: [[ell(50,64,10,10), 3], [ell(86,64,10,10), 3]],
  pits: [[ell(40,64,5,14), 1.8, false], [ell(96,64,5,14), 1.8, false]],
  bases: [mkBase([14,64], 0.785, 'main'), mkBase([114,64], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
