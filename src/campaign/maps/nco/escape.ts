import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Sharpsburg (The Escape) — Defenders of Man facility, freeway and starport. Hand-laid from the mission description (Liquipedia/Fandom). */
export const escape = campaignLevel({
  id: 'nco_escape', name: 'Sharpsburg (The Escape)', subtitle: 'Defenders of Man facility, freeway and starport', description: 'Defenders of Man facility, freeway and starport',
  size: 128, theme: 'sandstone',
  tiers: [[ell(24,26,18,14), 1, true], [rect(64,24,92,13), 1], [rect(104,66,13,86), 1], [ell(106,106,16,15), 2, true]],
  ramps: [[[106,92],[106,100],8,1,2]],
  massifs: [[ell(64,64,22,18), 3], [ell(30,70,9,10), 3], [ell(76,100,10,8), 3]],
  pits: [[ell(46,52,7,6), 1.6, false]],
  bases: [mkBase([22,22], 0.785, 'main'), mkBase([106,106], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
