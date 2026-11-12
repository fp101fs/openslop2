import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Aiur Archive (In Utter Darkness) - Last stand of the Protoss. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const in_utter_darkness = campaignLevel({
  id: 'wol_in_utter_darkness', name: 'Aiur Archive (In Utter Darkness)', subtitle: 'Last stand of the Protoss', description: 'Last stand of the Protoss', size: 128, theme: 'alien',
  tiers: [[ell(64,64,20,18), 3, true], [ell(100,100,12,12), 1, true], [ell(28,100,12,12), 1, true], [ell(64,12,10,10), 1, true]],
  ramps: [[[64,82],[64,96],10,3,1]],
  massifs: [[ell(36,36,10,10), 3], [ell(92,36,10,10), 3]],
  pits: [],
  bases: [mkBase([64,64], 0.785, 'main'), mkBase([64,12], 3.93, 'main'), mkBase([100,100], 0, 'natural'), mkBase([28,100], 0, 'natural')],
  home: 0, foe: 1
});
