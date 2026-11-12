import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Vardona City (Dark Skies) — Seven lanes, a subway and the Death Fleet. Hand-laid from the mission description (Liquipedia/Fandom). */
export const dark_skies = campaignLevel({
  id: 'nco_dark_skies', name: 'Vardona City (Dark Skies)', subtitle: 'Seven lanes, a subway and the Death Fleet', description: 'Seven lanes, a subway and the Death Fleet',
  size: 128, theme: 'alien',
  tiers: [[ell(24,64,18,24), 2, true], [rect(70,64,60,60), 1, true]],
  ramps: [[[40,64],[52,64],10,2,1]],
  massifs: [[rect(70,36,56,4), 3], [rect(70,52,56,4), 3], [rect(70,76,56,4), 3], [rect(70,92,56,4), 3]],
  pits: [],
  bases: [mkBase([24,64], 0.785, 'main'), mkBase([112,64], 3.93, 'main'), mkBase([24,100],1.57,'natural'), mkBase([24,28],-1.57,'natural')],
  home: 0, foe: 1
});
