import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Tarsonis City (Enemy Intelligence) — Ruined city: garrison outposts, then the Defenders' base. Hand-laid from the mission description (Liquipedia/Fandom). */
export const enemy_intelligence = campaignLevel({
  id: 'nco_enemy_intelligence', name: 'Tarsonis City (Enemy Intelligence)', subtitle: "Ruined city: garrison outposts, then the Defenders' base", description: "Ruined city: garrison outposts, then the Defenders' base",
  size: 128, theme: 'canyon',
  tiers: [[ell(24,24,18,16), 1, true], [ell(66,26,14,10), 1, true], [ell(100,104,16,14), 2, true], [ell(26,76,12,12), 1, true], [rect(64,70,40,30), 1, true]],
  ramps: [[[88,98],[78,92],7,2,1]],
  massifs: [[ell(50,52,9,7), 3], [ell(86,56,8,10), 3], [ell(10,50,6,8), 3]],
  pits: [],
  bases: [mkBase([24,24], 0.785, 'main'), mkBase([100,104], 3.93, 'main'), mkBase([66,22],-1.57,'natural')],
  home: 0, foe: 1
});
