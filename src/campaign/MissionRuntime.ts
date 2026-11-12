import type { GameWorld } from '../simulation/GameWorld';
import type { UnitType, PlayerId } from '../types';
import { lineKey, revealLine, doneLine } from './voiceKey';
import type { MissionDef, ObjectiveDef, ObjectiveStatus } from './types';

/** `id` is stable across a save and its reload: the context that created the timer plus its creation index there (see `ctx`). */
interface Timer { id: string; at: number; every?: number; fires: number; fn: () => void; }
/** Silent stand-in for the sound system while a save is being restored (any call or property chain is a no-op). */
const MUTE: any = new Proxy(function () {}, { get: () => MUTE, apply: () => MUTE });

/**
 * Per-match mission state: objectives, timers, and the small trigger API mission scripts use. Owns win/lose for
 * customWin missions. Ticked from GameWorld.update. Missions never touch the world directly except through here.
 */
export class MissionRuntime {
  public readonly objectives = new Map<string, { def: ObjectiveDef; status: ObjectiveStatus; progress: number }>();
  public elapsed = 0;
  public result: 'victory' | 'defeat' | null = null;
  public message = '';
  public messageT = 0;
  /** Bumps whenever an objective appears, progresses, completes or fails, so the HUD can pop open. */
  public version = 0;
  /** Most recent objective change, for the HUD flash. */
  /** Every objective change in order, so the HUD can toast each one even when several land in a frame. */
  public readonly log: { id: string; kind: 'reveal' | 'complete' | 'fail' | 'progress' }[] = [];
  public lastEvent: { id: string; kind: 'reveal' | 'complete' | 'fail' | 'progress'; at: number } | null = null;
  private timers: Timer[] = [];
  private ticks: ((dt: number) => void)[] = [];
  /** Free-form per-mission state bag. */
  public readonly state: Record<string, any> = {};
  /** Named counters (data missions' `stats`, e.g. civilians lost). Saved with the state bag. */
  public readonly stats: Record<string, number> = {};
  /** Speaker of the current `message` (data missions' dialogue), for the HUD's portrait card. */
  public speaker: { id: string; name: string; portrait?: string; unit?: string; team?: string } | null = null;
  /** Lines waiting for the dialogue card (filled by say(); the HUD drains it in order). */
  public readonly lineQueue: { text: string; sec: number; speaker: MissionRuntime['speaker']; key: string; at: number }[] = [];
  /** Event handlers (data-mission triggers) by id, so a save's fireLog can replay them like timers. */
  private events = new Map<string, { fires: number; fn: () => void }>();

  // ---- save / load bookkeeping ----
  /** Callback being run right now ('s' = mission setup, `<timerId>@<n>` = the n-th firing of a timer). Timers and units it creates get ids from it,
   *  so re-running the same callbacks after a load recreates the same timers and finds the same units (see restore()). Null inside onTick. */
  private ctx: { key: string; timers: number; spawns: number } | null = null;
  private untracked = 0;
  /** Every timer firing so far, in order (ids). Loading a save replays these to rebuild the script's private state. */
  public fireLog: string[] = [];
  /** True while a save is being restored: no voice, no win / lose. */
  public restoring = false;

  constructor(public readonly def: MissionDef, public readonly world: GameWorld) {
    world.spawnTagger = () => this.ctx ? `${this.ctx.key}:${this.ctx.spawns++}` : undefined;
    for (const o of def.objectives) this.objectives.set(o.id, { def: o, status: o.hidden ? 'hidden' : 'active', progress: 0 });
    this.ctx = { key: 's', timers: 0, spawns: 0 };
    try {
      def.script?.(this);
      // objectives that are visible from the start never go through reveal(): narrate the primary ones once the mission is under way
      for (const o of def.objectives) if (!o.hidden && !o.passive && o.kind === 'primary') this.after(2, () => { const t = revealLine(o.text); this.world.sound.playMissionLine?.(lineKey(t), t); });
    } finally { this.ctx = null; }
  }

  private timerId(): string { return this.ctx ? `${this.ctx.key}.${this.ctx.timers++}` : `k${this.untracked++}`; }
  private fire(t: Timer) {
    const prev = this.ctx;
    this.ctx = { key: `${t.id}@${t.fires++}`, timers: 0, spawns: 0 };
    this.fireLog.push(t.id);
    try { t.fn(); } finally { this.ctx = prev; }
  }

  /** Register a replayable event (a data-mission trigger's actions). Fire it with fireEvent(id). */
  defineEvent(id: string, fn: () => void) { this.events.set(id, { fires: 0, fn }); }
  /** Run a registered event now, under its own context: units and timers it creates get stable ids, and the firing is logged so
   *  loading a save replays it (see replayFired). No-op while a save is being restored (the replay does it). */
  fireEvent(id: string) {
    const e = this.events.get(id); if (!e || this.restoring) return;
    this.runEvent(id, e);
  }
  private runEvent(id: string, e: { fires: number; fn: () => void }) {
    const prev = this.ctx;
    this.ctx = { key: `ev:${id}@${e.fires++}`, timers: 0, spawns: 0 };
    // '!' marks an event in the log: timer ids never start with it (timers made inside an event get ids 'ev:<id>@n.k')
    this.fireLog.push(`!ev:${id}`);
    try { e.fn(); } finally { this.ctx = prev; }
  }

  // ---- scripting API ----
  /** Player main-base position. */
  get base() { return this.world.buildings.find(b => b.playerId === 'player')?.pos ?? { x: 20, y: 20 }; }
  after(sec: number, fn: () => void) { this.timers.push({ id: this.timerId(), at: this.elapsed + sec, fires: 0, fn }); }
  every(sec: number, fn: () => void, first = sec) { this.timers.push({ id: this.timerId(), at: this.elapsed + first, every: sec, fires: 0, fn }); }
  onTick(fn: (dt: number) => void) { this.ticks.push(fn); }
  say(text: string, sec = 6, speaker: MissionRuntime['speaker'] = null) {
    this.message = text; this.messageT = sec; this.speaker = speaker;
    if (this.restoring) return;
    // a speaker card queues its line (the HUD plays beep + voice when the card shows); plain messages speak at once as before
    if (speaker && (this.world as any).dialogueCards) this.lineQueue.push({ text, sec, speaker, key: lineKey(text), at: this.elapsed });
    else this.world.sound.playMissionLine?.(lineKey(text), text);
  }
  stat(id: string) { return this.stats[id] ?? 0; }
  addStat(id: string, n = 1) { this.stats[id] = (this.stats[id] ?? 0) + n; }
  private note(id: string, kind: 'reveal' | 'complete' | 'fail' | 'progress') { this.version++; this.log.push({ id, kind }); this.lastEvent = { id, kind, at: this.elapsed }; }
  reveal(id: string) {
    const o = this.objectives.get(id); if (!o || o.status !== 'hidden') return;
    o.status = 'active'; this.message = `New objective: ${o.def.text}`; this.messageT = 6; this.speaker = null; this.note(id, 'reveal');
    const t = revealLine(o.def.text); this.world.sound.playMissionLine?.(lineKey(t), t);
  }
  progress(id: string, n: number) {
    const o = this.objectives.get(id); if (!o || o.status !== 'active') return;
    o.progress = n; this.note(id, 'progress'); if (o.def.target && n >= o.def.target) this.complete(id);
  }
  add(id: string, d = 1) { const o = this.objectives.get(id); if (o) this.progress(id, o.progress + d); }
  complete(id: string) {
    const o = this.objectives.get(id); if (!o || o.status === 'done' || o.status === 'failed') return;
    o.status = 'done'; if (o.def.target) o.progress = o.def.target;
    if (!o.def.passive) { this.message = `${o.def.kind === 'bonus' ? 'Bonus' : 'Objective'} complete: ${o.def.text}`; this.messageT = 6; this.speaker = null; }
    this.world.sound.playCommandConfirm?.();
    this.note(id, 'complete');
    if (!o.def.passive) { const t = doneLine(o.def.text, o.def.kind === 'bonus'); this.world.sound.playMissionLine?.(lineKey(t), t); }
    if (this.allPrimaryDone()) this.win();
  }
  fail(id: string) {
    const o = this.objectives.get(id); if (!o || o.status !== 'active') return;
    o.status = 'failed'; this.note(id, 'fail'); if (o.def.kind === 'primary') this.lose(`Objective failed: ${o.def.text}`);
  }
  status(id: string) { return this.objectives.get(id)?.status; }
  allPrimaryDone() { for (const o of this.objectives.values()) if (o.def.kind === 'primary' && !o.def.passive && o.status !== 'done') return false; return true; }
  /** Move the camera (phase changes, cutscene-like beats). */
  focus(x: number, y: number) { (this.world as any).onCameraFocus?.(x, y); }
  win() { if (this.result || this.restoring) return; for (const o of this.objectives.values()) if (o.def.passive && o.status === 'active') o.status = 'done'; this.result = 'victory'; this.world.endMission('victory'); }
  lose(reason: string) { if (this.result || this.restoring) return; this.message = reason; this.speaker = null; this.result = 'defeat'; this.world.endMission('defeat'); }
  spawn(type: UnitType, owner: PlayerId, x: number, y: number, count = 1) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(this.world.spawnUnit(type, owner, { x: x + (i % 4) * 1.3, y: y + Math.floor(i / 4) * 1.3 }));
    return out;
  }
  /** Live units of an owner within r of a point. */
  near(x: number, y: number, r: number, owner: PlayerId) {
    return this.world.units.filter(u => u.playerId === owner && !u.isDead && Math.hypot(u.pos.x - x, u.pos.y - y) <= r);
  }

  // ---- engine ----
  update(dt: number) {
    if (this.result) return;
    this.elapsed += dt; if (this.messageT > 0) this.messageT -= dt;
    for (const t of [...this.timers]) {
      if (this.elapsed < t.at) continue;
      if (t.every) t.at += t.every; else this.timers.splice(this.timers.indexOf(t), 1);
      this.fire(t);
    }
    for (const f of this.ticks) f(dt);
  }

  // ---- save / load ----
  /** Plain-data snapshot of the runtime (the script's own closures are rebuilt by replay, see replayFired / finishRestore). */
  exportState(enc: (v: unknown) => unknown) {
    const state: Record<string, unknown> = {};
    for (const k of Object.keys(this.state)) { const e = enc(this.state[k]); if (e !== undefined) state[k] = e; }
    return {
      elapsed: this.elapsed, result: this.result, message: this.message, messageT: this.messageT, version: this.version,
      log: [...this.log], lastEvent: this.lastEvent,
      objectives: [...this.objectives.values()].map(o => [o.def.id, o.status, o.progress] as [string, ObjectiveStatus, number]),
      timers: this.timers.map(t => ({ id: t.id, at: t.at, fires: t.fires })),
      fireLog: [...this.fireLog], state, stats: { ...this.stats }
    };
  }

  /** Load step 1: re-run, in order and silently, every timer that had fired before the save. The script's private variables (phases,
   *  counters, units it spawned) end up as they were; the world state those callbacks touched is overwritten by the save afterwards. */
  replayFired(fireLog: string[]) {
    const sound = this.world.sound; this.world.sound = MUTE;
    this.restoring = true;
    try {
      for (const id of fireLog) {
        if (id.startsWith('!ev:')) {
          const e = this.events.get(id.slice(4));
          if (e) try { this.runEvent(id.slice(4), e); } catch (err) { console.warn('[load] mission event replay failed', id, err); }
          continue;
        }
        const t = this.timers.find(x => x.id === id);
        if (!t) continue; // made inside an onTick callback: cannot be rebuilt
        this.elapsed = t.at;
        if (t.every) t.at += t.every; else this.timers.splice(this.timers.indexOf(t), 1);
        try { this.fire(t); } catch (e) { console.warn('[load] mission timer replay failed', id, e); }
      }
    } finally { this.world.sound = sound; }
  }

  /** Load step 2 (after the world's units are restored): one silent pass of the onTick watchers so their caches (kills already
   *  counted, triggers already passed) catch up, then the saved objectives, timers and state bag overwrite whatever that changed. */
  finishRestore(s: ReturnType<MissionRuntime['exportState']>, dec: (v: unknown) => unknown) {
    const sound = this.world.sound; this.world.sound = MUTE;
    try { for (const f of this.ticks) { try { f(0); } catch (e) { console.warn('[load] mission watcher failed', e); } } }
    finally { this.world.sound = sound; this.restoring = false; }
    this.elapsed = s.elapsed; this.result = s.result; this.message = s.message; this.messageT = s.messageT; this.version = s.version;
    this.log.length = 0; this.log.push(...s.log); this.lastEvent = s.lastEvent;
    for (const [id, status, progress] of s.objectives) { const o = this.objectives.get(id); if (o) { o.status = status; o.progress = progress; } }
    const saved = new Map(s.timers.map(t => [t.id, t]));
    this.timers = this.timers.filter(t => saved.has(t.id));
    for (const t of this.timers) { const x = saved.get(t.id)!; t.at = x.at; t.fires = x.fires; }
    this.fireLog = [...s.fireLog];
    for (const k of Object.keys(s.state)) this.state[k] = dec(s.state[k]);
    for (const k of Object.keys(this.stats)) delete this.stats[k];
    Object.assign(this.stats, (s as any).stats ?? {});
    this.lineQueue.length = 0;
  }

  /** First visible, unfinished primary objective: the one the panel highlights. */
  currentId(): string | null {
    for (const o of this.objectives.values()) if (o.def.kind === 'primary' && !o.def.passive && o.status === 'active') return o.def.id;
    return null;
  }

  /** HUD markup for the objective panel: done rows get a green check, the current one is highlighted, the newest change flashes. */
  /** The on-screen objective list (top left of the HUD), SC2 style: green section headers, a checkbox per objective. */
  hudHtml(): string {
    const cur = this.currentId();
    const row = (o: { def: ObjectiveDef; status: ObjectiveStatus; progress: number }) => {
      const cnt = o.def.target ? `<span class="o-cnt">(${o.progress}/${o.def.target})</span>` : '';
      const cls = [o.status === 'done' ? 'done' : o.status === 'failed' ? 'fail' : '', o.def.id === cur ? 'cur' : '',
        this.lastEvent?.id === o.def.id && this.lastEvent.kind !== 'progress' ? 'flash' : ''].join(' ');
      return `<div class="o-row ${cls}"><span class="o-box"></span><span class="o-text">${o.def.text}${cnt}</span></div>`;
    };
    const vis = [...this.objectives.values()].filter(o => o.status !== 'hidden');
    const sec = (title: string, list: typeof vis, cls = '') => list.length
      ? `<div class="o-head ${cls}"><span class="o-tri"></span>${title}</div>${list.map(row).join('')}` : '';
    return sec('Main Objectives', vis.filter(o => o.def.kind === 'primary'))
      + sec('Bonus Objectives', vis.filter(o => o.def.kind === 'bonus'), 'bonus')
      // speaker lines show on the dialogue card instead (data missions, ui/mission/MissionUI.ts)
      + (this.messageT > 0 && !(this.speaker && (this.world as any).dialogueCards) ? `<div class="o-msg">${this.message}</div>` : '');
  }

}
