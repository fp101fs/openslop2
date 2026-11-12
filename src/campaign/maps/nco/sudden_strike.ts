import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Borea (Sudden Strike) — Four canyon lanes into Horner's base. Hand-laid from the mission description (Liquipedia/Fandom). */
export const sudden_strike = campaignLevel({
  id: 'nco_sudden_strike', name: 'Borea (Sudden Strike)', subtitle: "Four canyon lanes into Horner's base", description: "Four canyon lanes into Horner's base",
  size: 128, theme: 'alien',
  tiers: [[ell(26,100,20,18), 2, true], [ell(42,84,10,8), 1], [rect(64,64,76,10,0.785), 0]],
  ramps: [[[40,92],[50,84],8,2,1], [[50,84],[58,74],8,1,0]],
  massifs: [[ell(64,40,14,6,0.6), 3], [ell(40,40,8,14), 3], [ell(88,84,12,7,0.9), 3], [ell(100,64,6,16), 3], [ell(70,100,12,6), 3]],
  pits: [],
  bases: [mkBase([26,100], 0.785, 'main'), mkBase([104,24], 3.93, 'main'), mkBase([40,72],-0.8,'natural')],
  home: 0, foe: 1
});
