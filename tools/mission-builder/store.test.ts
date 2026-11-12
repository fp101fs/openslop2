import { test, expect } from 'bun:test';
import ld from '../../src/campaign/campaigns/wol/missions/liberation_day.openslop2mission';
import { MissionStore, blankMission } from './src/store';
import { stringifyMission } from '../../src/campaign/data/serialize';
import { renameRefs } from './src/refs';
import { CONDS, ACTIONS, summary } from './src/forms';
import { COND_KINDS, ACTION_KINDS } from '../../src/campaign/data/MissionData';

const fresh = () => new MissionStore(JSON.parse(JSON.stringify(ld)));

test('the mission file is in canonical form: load + serialise is byte-identical', async () => {
  const text = await Bun.file('src/campaign/campaigns/wol/missions/liberation_day.openslop2mission').text();
  expect(stringifyMission(JSON.parse(text))).toBe(text);
  expect(fresh().dirty).toBe(false);
});

test('edit / undo / redo, and a drag gesture is one undo step', () => {
  const s = fresh();
  const at0 = [...s.doc.groups[0]!.at] as [number, number];
  s.edit(d => { d.groups[0]!.at = [1, 2]; });
  expect(s.dirty).toBe(true);
  s.begin(); for (let i = 0; i < 10; i++) s.live(d => { d.groups[0]!.at[0]! += 1; }); s.end();
  expect(s.doc.groups[0]!.at).toEqual([11, 2]);
  s.undo(); expect(s.doc.groups[0]!.at).toEqual([1, 2]);
  s.undo(); expect(s.doc.groups[0]!.at).toEqual(at0);
  expect(s.dirty).toBe(false);
  s.redo(); s.redo(); expect(s.doc.groups[0]!.at).toEqual([11, 2]);
  s.edit(d => { d.title = 'x'; }); expect(s.canRedo).toBe(false);
  s.edit(d => { d.title = 'x'; }); // no-op edits add no undo step
  s.undo(); expect(s.doc.title).toBe('Liberation Day');
});

test('read-only stores ignore edits; freshId avoids every used id', () => {
  const r = new MissionStore(blankMission('wol', 'x', 'X'), true);
  r.edit(d => { d.title = 'changed'; }); expect(r.doc.title).toBe('X');
  const s = fresh();
  s.edit(d => { d.regions.push({ id: 'region1', shape: { k: 'ell', x: 1, y: 1, rx: 1, ry: 1 } }); });
  expect(s.freshId('region')).toBe('region2');
  expect(s.freshId('hb')).toBe('hb7');
});

test('renaming an id updates triggers, behaviours, unit refs and the test route, not other definitions', () => {
  const s = fresh();
  s.edit(d => { d.groups.find(g => g.id === 'raynor')!.id = 'jim'; renameRefs(d, 'raynor', 'jim'); });
  const txt = JSON.stringify(s.doc.triggers) + JSON.stringify(s.doc.groups.map(g => g.behavior));
  expect(txt).not.toContain('"raynor"');
  expect(txt).toContain('"jim"');
  expect(s.doc.speakers.raynor).toBeDefined(); // speaker ids are a separate namespace
  s.edit(d => { renameRefs(d, 'camp', 'camp2'); });
  expect(JSON.stringify(s.doc.triggers)).toContain('camp2#1'); // the cutscene's "camp#1"
  s.edit(d => { renameRefs(d, 'route', 'r'); }); expect(s.doc.testRoute).toBe('r');
});

test('forms: every condition and action kind has a form whose blank value has that kind', () => {
  for (const k of COND_KINDS) { expect(CONDS[k]).toBeDefined(); expect(CONDS[k].make().k).toBe(k); }
  for (const k of ACTION_KINDS) { expect(ACTIONS[k]).toBeDefined(); expect(ACTIONS[k].make().a).toBe(k); }
  expect(Object.keys(CONDS).sort()).toEqual([...COND_KINDS].sort());
  expect(Object.keys(ACTIONS).sort()).toEqual([...ACTION_KINDS].sort());
  expect(summary({ k: 'enter', region: 'r_camp', who: 'player' })).toBe('Units enter a region: r_camp · player');
});

test('a mission built from scratch with the store validates clean', async () => {
  const { validateMission } = await import('../../src/campaign/data/validate');
  const { dataLevel } = await import('../../src/campaign/data/level');
  const s = new MissionStore(blankMission('test', 'scratch', 'Scratch'));
  s.edit(d => {
    d.groups.push({ id: 'hero', owner: 'player', at: [24, 100], spawn: 'start', units: [{ type: 'marine', count: 1, hp: 300, hero: 'Hero' }] });
    d.groups.push({ id: 'foes', owner: 'enemy', at: [90, 40], spawn: 'start', units: [{ type: 'marine', count: { casual: 2, normal: 3, hard: 4, brutal: 5 } }] });
    d.regions.push({ id: 'goal', shape: { k: 'ell', x: 90, y: 40, rx: 8, ry: 8 } });
    d.objectives.push({ id: 'kill', text: 'Kill them', kind: 'primary' });
    d.speakers.hero = { name: 'Hero', voice: 'am_adam', unit: 'marine' };
    d.dialogue.push({ id: 'go', speaker: 'hero', text: 'Go!' });
    d.triggers.push({ id: 't1', when: { k: 'start' }, do: [{ a: 'say', line: 'go' }] }, { id: 't2', when: { k: 'wiped', group: 'foes' }, do: [{ a: 'objective', id: 'kill', op: 'complete' }] });
  });
  expect(validateMission(s.doc, dataLevel(s.doc))).toEqual([]);
});
