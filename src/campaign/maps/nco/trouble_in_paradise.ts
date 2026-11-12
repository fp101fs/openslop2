import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Tyrador IX (Trouble in Paradise) — Resort world: hatcheries, shield projectors and a mothership. Hand-laid from the mission description (Liquipedia/Fandom). */
export const trouble_in_paradise = campaignLevel({
  id: 'nco_trouble_in_paradise', name: 'Tyrador IX (Trouble in Paradise)', subtitle: 'Resort world: hatcheries, shield projectors and a mothership', description: 'Resort world: hatcheries, shield projectors and a mothership',
  size: 128, theme: 'meadow',
  tiers: [[ell(22,100,18,16), 2, true], [ell(104,24,16,14), 1, true], [ell(64,64,14,14), 1, true]],
  ramps: [[[34,92],[44,84],7,2,0]],
  massifs: [[ell(50,40,9,6), 3], [ell(80,90,8,6), 3]],
  pits: [[ell(112,104,12,10), 1.8, true], [rect(64,118,80,12), 1.4, true]],
  bases: [mkBase([22,100], 0.785, 'main'), mkBase([104,24], 3.93, 'main'), mkBase([64,64],0,'third')],
  home: 0, foe: 1
});
