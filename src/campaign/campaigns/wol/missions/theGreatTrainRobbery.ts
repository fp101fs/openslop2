import { mission } from '../common';
import { boss, wave } from '../../../helpers';
import type { Pt } from '../../../helpers';
import { diffScale } from '../../../helpers';

/** 15. The Great Train Robbery - 8 trains on 3 tracks; trains 6/7 are speed-boosted; Marauder Kill Teams after train 5. */
export const theGreatTrainRobbery = mission({
  key: 'the_great_train_robbery', order: 15, chapter: 'Rebellion', title: 'The Great Train Robbery', subtitle: 'Destroy 8 Dominion Trains',
  enemyFaction: 'terran', mapId: 'wol_the_great_train_robbery', noPlayerBase: false, startingMinerals: 300,
  unlock: d => d.size >= 6, startingUnits: [{ type: 'marine', count: 4 }],
  briefing: 'Intercept the Dominion trains hauling a Tarsonis find. Diamondbacks chase them down; don\'t let two get away.',
  objectives: [
    { id: 'trains', text: 'Destroy Dominion Trains', kind: 'primary', target: 8 },
    { id: 'escape', text: 'Don\'t let 2 Trains get away', kind: 'primary', passive: true },
    { id: 'tanks', text: 'Find all 6 Diamondback Tanks', kind: 'bonus', target: 6 },
    { id: 'bones', text: 'Find the 3 Defiler Bones', kind: 'bonus', target: 3 }
  ],
  gaps: ['Trains are armoured Siege Tanks driving the tracks; Diamondbacks are Goliaths', 'Escape limit uses 2 on Hard+ and 3 otherwise per the guide'],
  script(rt) {
    const lanes = [40, 64, 92]; const limit = diffScale(rt) >= 1.35 ? 2 : 3; let escaped = 0, killed = 0;
    const trains: { u: any; done: boolean }[] = [];
    const launch = (i: number) => {
      const y = lanes[i % 3]!; const u = boss(rt, 'siege_tank', 'enemy', [4, y], 700 + i * 120); u.setCommand({ type: 'move', targetPos: { x: 124, y } });
      if (i >= 5 && i <= 6) u.speed *= 1.6;
      wave(rt, [{ type: 'marine', n: 2 + i }, ...(i >= 5 ? [{ type: 'hellion' as const, n: 3 }] : [])], [8, y], [124, y], 'enemy', true);
      trains.push({ u, done: false });
      if (i === 3) rt.say('The Dominion is building bunkers along the tracks.');
      if (i === 4) { for (let k = 0; k < 2; k++) wave(rt, [{ type: 'marauder', n: 15 }, { type: 'medic', n: 3 }], [20 + k * 60, 20], [64, 64], 'enemy', true); rt.say('Marauder Kill Teams are on the move.'); }
    };
    for (let i = 0; i < 8; i++) rt.after(60 + i * 150, () => { launch(i); rt.say(`Train ${i + 1} is coming.`); });
    rt.onTick(() => { for (const t of trains) { if (t.done) continue;
      if (t.u.isDead) { t.done = true; killed++; rt.progress('trains', killed); if (trains.indexOf(t) === 7) rt.complete('trains'); }
      else if (t.u.pos.x > 120) { t.done = true; escaped++; t.u.isDead = true; if (escaped >= limit) rt.fail('escape'); } } });
    const tanksAt: Pt[] = [[30, 52], [20, 20], [100, 20], [64, 50], [64, 78], [90, 80]]; const gt = new Set<number>();
    rt.onTick(() => tanksAt.forEach((s, i) => { if (!gt.has(i) && rt.near(s[0], s[1], 3, 'player').length) { gt.add(i); rt.spawn('goliath', 'player', s[0], s[1]); rt.progress('tanks', gt.size); } }));
    const bonesAt: Pt[] = [[64, 84], [34, 36], [64, 100]]; const gb = new Set<number>();
    rt.onTick(() => bonesAt.forEach((s, i) => { if (!gb.has(i) && rt.near(s[0], s[1], 3, 'player').length) { gb.add(i); rt.progress('bones', gb.size); } }));
  }
});
