import { campaignLevel, ell, rect, mkBase } from '../builder';

/** New Andasar (Flashpoint) — Ruined city: memories, nukes and an operations centre. Hand-laid from the mission description (Liquipedia/Fandom). */
export const flashpoint = campaignLevel({
  id: 'nco_flashpoint', name: 'New Andasar (Flashpoint)', subtitle: 'Ruined city: memories, nukes and an operations centre', description: 'Ruined city: memories, nukes and an operations centre',
  size: 128, theme: 'frost',
  tiers: [[ell(22,22,16,14), 1, true], [ell(106,106,16,14), 2, true], [rect(64,64,34,34), 1, true], [ell(100,30,10,10), 1], [ell(28,98,10,10), 1]],
  ramps: [[[96,96],[86,86],7,2,1]],
  massifs: [[ell(50,40,8,8), 3], [ell(78,88,8,8), 3], [ell(40,74,6,6), 3]],
  pits: [],
  bases: [mkBase([22,22], 0.785, 'main'), mkBase([106,106], 3.93, 'main'), mkBase([64,40],-1.57,'natural')],
  home: 0, foe: 1
});
