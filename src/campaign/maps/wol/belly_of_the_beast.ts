import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Char Caverns (Belly of the Beast) - Fissures in the Zerg tunnels. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const belly_of_the_beast = campaignLevel({
  id: 'wol_belly_of_the_beast', name: 'Char Caverns (Belly of the Beast)', subtitle: 'Fissures in the Zerg tunnels', description: 'Fissures in the Zerg tunnels', size: 128, theme: 'swamp',
  tiers: [[rect(40,100,50,10), 1, true], [rect(70,80,10,40), 1, true], [rect(90,50,50,10), 1, true], [ell(112,24,10,10), 2, true]],
  ramps: [],
  massifs: [[ell(40,60,14,14), 3], [ell(90,90,14,14), 3]],
  pits: [[ell(60,60,8,8), 1.6, true]],
  bases: [mkBase([14,100], 0.785, 'main'), mkBase([112,24], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
