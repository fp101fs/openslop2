/**
 * Form schema for every trigger condition and action kind: the Mission Builder renders these as plain forms (no code), with
 * id fields as dropdowns of what exists in the mission. forms.test.ts checks every kind in MissionData has a schema.
 */
import type { Action, Cond } from '../../../src/campaign/data/MissionData';

export type FieldType =
  | 'num' | 'text' | 'longtext' | 'bool' | 'pt' | 'json'
  | { enum: string[] }
  | 'group' | 'unit' | 'who' | 'region' | 'path' | 'line' | 'lines' | 'objective' | 'trigger' | 'stat' | 'hook' | 'steps';
export interface Field { key: string; type: FieldType; label: string; optional?: boolean }
export interface KindSchema { label: string; help: string; fields: Field[]; make: () => any }

const f = (key: string, type: FieldType, label: string, optional = false): Field => ({ key, type, label, optional });

export const CONDS: Record<Cond['k'], KindSchema> = {
  start: { label: 'Mission starts', help: 'Runs once when the mission begins.', fields: [], make: () => ({ k: 'start' }) },
  time: { label: 'Time reached', help: 'Mission time in seconds.', fields: [f('sec', 'num', 'Seconds')], make: () => ({ k: 'time', sec: 10 }) },
  every: { label: 'Every N seconds', help: 'Repeats (use with "once: off").', fields: [f('sec', 'num', 'Seconds')], make: () => ({ k: 'every', sec: 30 }) },
  enter: { label: 'Units enter a region', help: 'Who: player, enemy, a group or one unit (group#1).', fields: [f('region', 'region', 'Region'), f('who', 'who', 'Who', true), f('n', 'num', 'At least', true)], make: () => ({ k: 'enter', region: '', who: 'player' }) },
  near: { label: 'Units near a point', help: 'Within r tiles of a point.', fields: [f('at', 'pt', 'Point'), f('r', 'num', 'Radius'), f('who', 'who', 'Who', true)], make: () => ({ k: 'near', at: [64, 64], r: 8, who: 'player' }) },
  dies: { label: 'Unit dies', help: 'A group (all of it) or one unit (group#n).', fields: [f('unit', 'unit', 'Unit')], make: () => ({ k: 'dies', unit: '' }) },
  wiped: { label: 'Group wiped out', help: 'Every unit of the group is dead.', fields: [f('group', 'group', 'Group')], make: () => ({ k: 'wiped', group: '' }) },
  killed: { label: 'N of a group killed', help: '', fields: [f('group', 'group', 'Group'), f('n', 'num', 'Count')], make: () => ({ k: 'killed', group: '', n: 1 }) },
  objective: { label: 'Objective changes', help: '', fields: [f('id', 'objective', 'Objective'), f('status', { enum: ['done', 'failed', 'active'] }, 'Status')], make: () => ({ k: 'objective', id: '', status: 'done' }) },
  trigger: { label: 'After another trigger', help: 'Chains: runs when that trigger has fired (add a delay for timing).', fields: [f('id', 'trigger', 'Trigger')], make: () => ({ k: 'trigger', id: '' }) },
  stat: { label: 'Counter reaches', help: '', fields: [f('id', 'stat', 'Counter'), f('op', { enum: ['>=', '<='] }, 'Compare'), f('n', 'num', 'Value')], make: () => ({ k: 'stat', id: '', op: '>=', n: 1 }) },
  hook: { label: 'Code hook (escape hatch)', help: 'A function the mission .ts file passes to dataMission().', fields: [f('name', 'hook', 'Hook')], make: () => ({ k: 'hook', name: '' }) },
  pickup: { label: 'Pallet picked up', help: 'One pallet (id), or at least N of them (no id).', fields: [f('id', 'text', 'Pallet id', true), f('n', 'num', 'At least', true)], make: () => ({ k: 'pickup', n: 1 }) },
};

export const ACTIONS: Record<Action['a'], KindSchema> = {
  spawn: { label: 'Spawn group', help: 'Creates a group whose spawn is "trigger".', fields: [f('group', 'group', 'Group')], make: () => ({ a: 'spawn', group: '' }) },
  dropPods: { label: 'Drop pods', help: 'The group lands in pods (one copy of the group per pod).', fields: [f('group', 'group', 'Group'), f('pods', 'num', 'Pods'), f('at', 'pt', 'Where', true)], make: () => ({ a: 'dropPods', group: '', pods: 3 }) },
  say: { label: 'Say a line', help: 'Speaker card + beep + voice.', fields: [f('line', 'line', 'Line')], make: () => ({ a: 'say', line: '' }) },
  sayAll: { label: 'Say lines in order', help: '', fields: [f('lines', 'lines', 'Lines'), f('gap', 'num', 'Gap (s)', true)], make: () => ({ a: 'sayAll', lines: [] }) },
  objective: { label: 'Objective', help: 'Reveal, complete, fail or count up.', fields: [f('id', 'objective', 'Objective'), f('op', { enum: ['reveal', 'complete', 'fail', 'add'] }, 'Do'), f('n', 'num', 'Add', true)], make: () => ({ a: 'objective', id: '', op: 'complete' }) },
  camera: { label: 'Move camera', help: '', fields: [f('to', 'pt', 'Point')], make: () => ({ a: 'camera', to: [64, 64] }) },
  cutscene: { label: 'Cutscene', help: 'Letterbox, input locked, steps in order (Esc skips).', fields: [f('steps', 'steps', 'Steps')], make: () => ({ a: 'cutscene', steps: [{ wait: 3 }] }) },
  attackMove: { label: 'Attack-move', help: 'Along a path, or to a point.', fields: [f('group', 'unit', 'Units'), f('path', 'path', 'Path', true), f('to', 'pt', 'Point', true)], make: () => ({ a: 'attackMove', group: '', to: [64, 64] }) },
  move: { label: 'Move', help: '', fields: [f('group', 'unit', 'Units'), f('to', 'pt', 'Point')], make: () => ({ a: 'move', group: '', to: [64, 64] }) },
  attack: { label: 'Attack a unit', help: '', fields: [f('group', 'unit', 'Units'), f('target', 'unit', 'Target')], make: () => ({ a: 'attack', group: '', target: '' }) },
  follow: { label: 'Follow a unit', help: 'Allies trail the leader and fight on the way.', fields: [f('group', 'group', 'Group'), f('leader', 'unit', 'Leader'), f('scripted', 'bool', 'Not selectable', true)], make: () => ({ a: 'follow', group: '', leader: '', scripted: true }) },
  transfer: { label: 'Change owner', help: 'E.g. a rescued base joins the player.', fields: [f('group', 'group', 'Group'), f('to', { enum: ['player', 'enemy'] }, 'To')], make: () => ({ a: 'transfer', group: '', to: 'player' }) },
  land: { label: 'Fly in and land', help: 'Vikings switch to Assault Mode at the spot.', fields: [f('group', 'group', 'Group'), f('at', 'pt', 'Where')], make: () => ({ a: 'land', group: '', at: [64, 64] }) },
  tutorial: { label: 'Tutorial popup', help: '', fields: [f('id', 'text', 'Id'), f('title', 'text', 'Title'), f('text', 'longtext', 'Text')], make: () => ({ a: 'tutorial', id: 'tut', title: '', text: '' }) },
  block: { label: 'Block / open a region', help: 'Point of no return: units can no longer walk through it.', fields: [f('region', 'region', 'Region'), f('on', 'bool', 'Blocked')], make: () => ({ a: 'block', region: '', on: true }) },
  autosave: { label: 'Autosave', help: '', fields: [], make: () => ({ a: 'autosave' }) },
  resources: { label: 'Give resources', help: '', fields: [f('minerals', 'num', 'Minerals', true), f('gas', 'num', 'Gas', true)], make: () => ({ a: 'resources', minerals: 100 }) },
  stat: { label: 'Counter', help: '', fields: [f('id', 'stat', 'Counter'), f('op', { enum: ['add', 'set'] }, 'Do'), f('n', 'num', 'Value')], make: () => ({ a: 'stat', id: '', op: 'add', n: 1 }) },
  remove: { label: 'Remove group', help: 'Silently, no death effects.', fields: [f('group', 'unit', 'Units')], make: () => ({ a: 'remove', group: '' }) },
  win: { label: 'Win the mission', help: '', fields: [], make: () => ({ a: 'win' }) },
  lose: { label: 'Lose the mission', help: '', fields: [f('reason', 'text', 'Reason')], make: () => ({ a: 'lose', reason: '' }) },
  hook: { label: 'Code hook (escape hatch)', help: 'A function the mission .ts file passes to dataMission().', fields: [f('name', 'hook', 'Hook'), f('args', 'json', 'Arguments', true)], make: () => ({ a: 'hook', name: '' }) },
};

/** One-line summary of a condition / action for lists ("Units enter a region: r_camp (player)"). */
export function summary(x: Cond | Action): string {
  const s = 'k' in x ? CONDS[x.k] : ACTIONS[(x as Action).a];
  const vals = s.fields.map(fl => (x as any)[fl.key]).filter(v => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(v => Array.isArray(v) ? (typeof v[0] === 'number' ? `(${v.join(', ')})` : v.length > 3 ? `${v.length} items` : v.map(o => typeof o === 'object' ? '…' : o).join(', ')) : typeof v === 'object' ? '…' : String(v));
  return vals.length ? `${s.label}: ${vals.join(' · ')}` : s.label;
}
