/**
 * Mission Builder document store: the open MissionData, undo / redo, dirty state and the current selection.
 * Every edit goes through `edit(fn)` (one undo step) or a gesture (`begin` / `live` ... / `end`: a whole drag is one step).
 * Pure TS (no DOM), unit-tested in store.test.ts.
 */
import type { MissionData } from '../../../src/campaign/data/MissionData';
import { stringifyMission } from '../../../src/campaign/data/serialize';

export type SelKind = 'group' | 'region' | 'path' | 'decor' | 'pickup' | 'trigger' | 'line' | 'objective' | 'tier' | 'massif' | 'pit' | 'road' | 'ramp' | 'base';
export interface Selection { kind: SelKind; id: string | number }

const LIMIT = 200;

export class MissionStore {
  doc: MissionData;
  sel: Selection | null = null;
  private past: string[] = [];
  private future: string[] = [];
  private saved: string;
  private gesture: string | null = null;
  private subs = new Set<() => void>();
  /** Bumped on every change (React's useSyncExternalStore snapshot). */
  version = 0;

  /** Read-only hand-coded missions: their real map (a LevelDef from the game), drawn instead of `doc.map`. */
  level: import('../../../src/levels/LevelTypes').LevelDef | null = null;

  constructor(doc: MissionData, public readonly readOnly = false) {
    this.doc = doc;
    this.saved = stringifyMission(doc);
  }

  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  private emit() { this.version++; for (const f of this.subs) f(); }
  getVersion = () => this.version;

  /** One undoable edit. `fn` mutates a fresh copy of the document. */
  edit(fn: (d: MissionData) => void) {
    if (this.readOnly) return;
    const before = JSON.stringify(this.doc);
    const next: MissionData = JSON.parse(before);
    fn(next);
    if (JSON.stringify(next) === before) return;
    this.push(before);
    this.doc = next;
    this.emit();
  }

  /** Start a drag: the edits until end() are one undo step. */
  begin() { if (!this.readOnly && this.gesture === null) this.gesture = JSON.stringify(this.doc); }
  /** Mutate during a gesture (no undo step of its own). */
  live(fn: (d: MissionData) => void) {
    if (this.readOnly) return;
    if (this.gesture === null) { this.edit(fn); return; }
    const next: MissionData = JSON.parse(JSON.stringify(this.doc));
    fn(next); this.doc = next; this.emit();
  }
  end() {
    if (this.gesture === null) return;
    if (this.gesture !== JSON.stringify(this.doc)) this.push(this.gesture);
    this.gesture = null; this.emit();
  }

  private push(snapshot: string) {
    this.past.push(snapshot); if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo() { const s = this.past.pop(); if (s === undefined) return; this.future.push(JSON.stringify(this.doc)); this.doc = JSON.parse(s); this.emit(); }
  redo() { const s = this.future.pop(); if (s === undefined) return; this.past.push(JSON.stringify(this.doc)); this.doc = JSON.parse(s); this.emit(); }

  select(s: Selection | null) { this.sel = s; this.emit(); }

  /** The file text that would be saved now. */
  text() { return stringifyMission(this.doc); }
  get dirty() { return this.text() !== this.saved; }
  markSaved(text = this.text()) { this.saved = text; this.emit(); }

  /** A fresh id like `group3` that is not used by any group / region / path / trigger / line / decor yet. */
  freshId(prefix: string) {
    const d = this.doc;
    const used = new Set<string>([...d.groups, ...d.regions, ...d.paths, ...d.triggers, ...d.dialogue, ...d.objectives, ...(d.map.decor ?? []), ...(d.pickups ?? [])].map(x => x.id));
    for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }
}

/** A blank mission (new file in the editor). */
export function blankMission(campaign: string, key: string, title: string): MissionData {
  return {
    version: 1, key, campaign, order: 99, chapter: '', title, subtitle: '', playerFaction: 'terran', enemyFaction: 'terran',
    briefing: '', spec: '', noPlayerBase: true, noEnemyBase: true, aiOff: true, startingMinerals: 0, startingGas: 0,
    map: {
      name: title, subtitle: '', description: '', size: 128, theme: 'meadow', baseTier: 1,
      bases: [{ th: [20, 108], face: 0.785, kind: 'main', minerals: [], geysers: [] }, { th: [108, 20], face: 3.93, kind: 'main', minerals: [], geysers: [] }],
      home: 0, foe: 1, noResources: true
    },
    regions: [], paths: [], groups: [], objectives: [], speakers: {}, dialogue: [], triggers: []
  };
}
