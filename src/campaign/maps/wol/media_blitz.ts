import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Korhal (Media Blitz) - Three Dominion bases and broadcast towers. Hand-laid from the mission description and Liquipedia map (Wings of Liberty). */
export const media_blitz = campaignLevel({
  id: 'wol_media_blitz', name: 'Korhal (Media Blitz)', subtitle: 'Three Dominion bases and broadcast towers', description: 'Three Dominion bases and broadcast towers', size: 128, theme: 'alien',
  tiers: [[ell(64,64,14,14), 2, true], [ell(20,64,12,12), 1, true], [ell(64,20,12,12), 1, true], [ell(108,64,12,12), 1, true], [ell(108,108,12,12), 1, true]],
  ramps: [[[78,64],[86,64],7,2,1]],
  massifs: [[ell(40,40,8,8), 3], [ell(88,40,8,8), 3], [ell(88,88,8,8), 3], [ell(40,88,8,8), 3]],
  pits: [],
  bases: [mkBase([64,64], 0.785, 'main'), mkBase([108,108], 3.93, 'main'), mkBase([20,64], 0, 'natural'), mkBase([64,20], 0, 'natural'), mkBase([108,64], 0, 'natural')],
  home: 0, foe: 1
});
