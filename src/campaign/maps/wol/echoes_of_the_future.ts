import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Aiur (Echoes of the Future) - The Overmind's tendrils. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const echoes_of_the_future = campaignLevel({
  id: 'wol_echoes_of_the_future', name: 'Aiur (Echoes of the Future)', subtitle: "The Overmind's tendrils", description: "The Overmind's tendrils", size: 128, theme: 'alien',
  tiers: [[ell(30,100,16,14), 2, true], [ell(100,24,12,12), 1, true], [ell(70,100,12,12), 1, true], [ell(100,70,12,12), 1, true], [ell(30,50,12,12), 1, true], [ell(64,64,10,10), 1, true]],
  ramps: [[[44,92],[54,86],7,2,1]],
  massifs: [[ell(50,60,8,8), 3], [ell(80,60,8,8), 3]],
  pits: [],
  bases: [mkBase([30,100], 0.785, 'main'), mkBase([100,24], 3.93, 'main'), mkBase([70,100], 0, 'natural'), mkBase([100,70], 0, 'natural'), mkBase([30,50], 0, 'natural')],
  home: 0, foe: 1
});
