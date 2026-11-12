import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Cerros Shipyards (End Game) — Five Gorgons, a war machine and its repair bay. Hand-laid from the mission description (Liquipedia/Fandom). */
export const end_game = campaignLevel({
  id: 'nco_end_game', name: 'Cerros Shipyards (End Game)', subtitle: 'Five Gorgons, a war machine and its repair bay', description: 'Five Gorgons, a war machine and its repair bay',
  size: 128, theme: 'sandstone',
  tiers: [[ell(104,104,18,16), 2, true], [ell(22,22,16,14), 2, true], [ell(104,40,12,12), 1, true], [ell(40,104,12,12), 1, true], [ell(64,64,18,18), 1, true]],
  ramps: [[[92,96],[82,88],8,2,1]],
  massifs: [[ell(70,40,8,6), 3], [ell(40,70,6,8), 3], [ell(90,60,8,6), 3]],
  pits: [],
  bases: [mkBase([104,104], 0.785, 'main'), mkBase([22,22], 3.93, 'main'), mkBase([104,66],0,'natural'), mkBase([66,104],1.57,'natural')],
  home: 0, foe: 1
});
