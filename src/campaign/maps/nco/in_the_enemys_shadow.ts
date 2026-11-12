import { campaignLevel, ell, rect, mkBase } from '../builder';

/** Vardona Compound (In the Enemy's Shadow) — Sewer tunnels, hangar and General Davis's compound. Hand-laid from the mission description (Liquipedia/Fandom). */
export const in_the_enemys_shadow = campaignLevel({
  id: 'nco_in_the_enemys_shadow', name: "Vardona Compound (In the Enemy's Shadow)", subtitle: "Sewer tunnels, hangar and General Davis's compound", description: "Sewer tunnels, hangar and General Davis's compound",
  size: 128, theme: 'canyon',
  tiers: [[rect(34,64,52,9), 1], [rect(64,64,9,50), 1], [ell(100,64,20,20), 2, true], [ell(64,28,14,10), 1, true], [ell(64,100,14,10), 1, true], [ell(14,64,9,9), 1]],
  ramps: [[[50,64],[56,64],6,1,1], [[84,64],[92,64],6,1,2]],
  massifs: [[rect(34,30,60,18), 3], [rect(34,98,60,18), 3]],
  pits: [],
  bases: [mkBase([14,64], 0.785, 'main'), mkBase([112,64], 3.93, 'main')],
  home: 0, foe: 1, noResources: true
});
