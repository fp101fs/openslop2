import type { MissionDef } from '../../../types';
import { wave, place, reach, mustSurvive } from '../../../helpers';
import { spawnNova } from '../../../helpers';

/** Mission 1. Spec: docs/campaign/nova-covert-ops.md#1-the-escape-sharpsburg */
export const theEscape: MissionDef = {
  key: 'the_escape', order: 1, chapter: 'Mission Pack 1', title: 'The Escape', subtitle: 'Sharpsburg · Defenders of Man base',
  playerFaction: 'terran', enemyFaction: 'terran', mapId: 'nco_escape', difficulty: 'normal',
  startingMinerals: 0, startingGas: 0, noEnemyBase: true, noPlayerBase: true, aiOff: true, customWin: true,
  briefing: 'Nova wakes in a Defenders of Man facility with no memory. Slip past the ghosts and turrets, reach the vulture bikes, outrun the pursuit and shoot down the Warhawk.',
  objectives: [
    { id: 'armory', text: 'Reach the Armory', kind: 'primary' },
    { id: 'research', text: 'Reach the Research Bay', kind: 'primary', hidden: true },
    { id: 'escape', text: 'Escape the facility', kind: 'primary', hidden: true },
    { id: 'starport', text: 'Reach the Starport', kind: 'primary', hidden: true },
    { id: 'survive', text: 'Nova must survive', kind: 'primary', passive: true },
    { id: 'rescue', text: 'Rescue ghosts', kind: 'bonus', target: 3 }
  ],
  spec: 'docs/campaign/nova-covert-ops.md',
  gaps: ['Vulture-bike chase is on foot with scripted pursuit waves, not a scrolling freeway', 'Warhawk is a stand-in Battlecruiser with a lane-laser pattern missing', 'Ghost cones/detection use the generic detection model'],
  script(rt) {
    const nova = spawnNova(rt, [14, 16]); rt.focus(14, 16);
    mustSurvive(rt, 'survive', () => nova);
    rt.after(1, () => rt.say('Nova, you are awake. The Defenders of Man hold this facility. Find the armory and recover your gear.'));
    // phase 1: stealth facility (ghost guards + flame-turret stand-ins)
    for (const at of [[28, 20], [34, 32], [48, 24], [56, 26], [38, 36]] as [number, number][]) wave(rt, [{ type: 'ghost', n: 1 }], at, at, 'enemy', true);
    place(rt, 'enemy', [{ type: 'missile_turret', at: [30, 26] }, { type: 'missile_turret', at: [52, 26] }, { type: 'missile_turret', at: [58, 22] }]);
    // landmark structures the objectives point at (Defenders of Man property)
    place(rt, 'enemy', [{ type: 'armory', at: [34, 30] }, { type: 'engineering_bay', at: [52, 29] }, { type: 'starport', at: [106, 109] }]);
    reach(rt, 'armory', [34, 26], 6);
    rt.onTick(() => { if (rt.status('armory') === 'done' && !rt.state.armory) { rt.state.armory = true; rt.say('Armory reached. Suit systems are coming online. Head for the research bay.'); rt.reveal('research'); } });
    reach(rt, 'research', [52, 26], 6);
    rt.onTick(() => { if (rt.status('research') === 'done' && !rt.state.research) { rt.state.research = true; rt.say('Research bay secured. Now get out of the facility before they seal it.'); rt.reveal('escape'); } });
    // rescue captives (one is automatic at the end of phase 1)
    const rescued = new Set<number>();
    const sites: [number, number][] = [[14, 34], [38, 36], [62, 21]];
    rt.onTick(() => sites.forEach((s, i) => {
      if (rescued.has(i) || !rt.near(s[0], s[1], 4, 'player').length) return;
      rescued.add(i); rt.say('Ghost freed. She is joining you.'); rt.add('rescue'); rt.spawn('ghost', 'player', s[0] + 1, s[1] + 1);
    }));
    // phase 2: freeway pursuit once Nova leaves the facility
    reach(rt, 'escape', [70, 24], 5, () => rt.status('research') === 'done');
    rt.onTick(() => {
      if (rt.status('escape') !== 'done' || rt.state.chase) return;
      rt.state.chase = true; rt.reveal('starport'); rt.say('You are out. Vulture bikes ahead. Drive!');
      rt.spawn('ghost', 'player', 72, 24);
      for (let i = 0; i < 6; i++) rt.after(i * 14, () => wave(rt, [{ type: i % 3 === 2 ? 'banshee' : 'vulture', n: 2 }], [100, 24], [70, 24], 'enemy'));
    });
    // phase 3: Warhawk boss at the starport
    rt.onTick(() => {
      if (rt.state.boss || !(nova.pos.x > 96 && nova.pos.y > 60)) return;
      const w = rt.spawn('battlecruiser', 'enemy', 108, 96)[0]!; w.maxHealth = w.health = 900; rt.state.boss = w;
      rt.say('Warhawk inbound. Keep moving between lanes.');
    });
    rt.onTick(() => { if (rt.status('starport') === 'done' && !rt.state.sp) { rt.state.sp = true; rt.say('Starport reached. The Warhawk is down. Nova, you made it.'); } });
    reach(rt, 'starport', [106, 104], 5, () => !!rt.state.boss && rt.state.boss.isDead);
  }
};
