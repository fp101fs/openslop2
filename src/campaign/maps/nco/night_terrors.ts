import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Jarban Minor (Night Terrors) — Nine extraction sites under infested skies. Hand-laid from the mission description (Liquipedia/Fandom). */
export const night_terrors = campaignLevel({
  id: 'nco_night_terrors', name: 'Jarban Minor (Night Terrors)', subtitle: 'Nine extraction sites under infested skies', description: 'Nine extraction sites under infested skies',
  size: 128, theme: 'swamp',
  tiers: [[ell(24,24,17,15), 1, true], [ell(64,64,14,12), 1, true], [ell(104,104,17,15), 1, true], [ell(104,24,12,12), 1, true], [ell(24,104,12,12), 1, true]],
  ramps: [],
  massifs: [[ell(44,70,8,8), 3], [ell(84,56,8,8), 3], [ell(64,26,10,5), 3], [ell(64,104,10,5), 3]],
  pits: [[ell(48,48,7,7), 1.4, true], [ell(80,80,7,7), 1.4, true]],
  bases: [mkBase([24,24], 0.785, 'main'), mkBase([104,104], 3.93, 'main'), mkBase([64,64],0.6,'natural')],
  home: 0, foe: 1
});
