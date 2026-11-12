/**
 * Multiplayer timing trace: what happened when, on this computer, during an online match.
 *
 * - Start timeline: start pressed -> models loaded -> keyframe sent/received/applied -> both started. Logged to the
 *   console once the match starts (the guest's timeline also travels to the host, so one console shows both).
 * - Stalls: every wait for the other player's orders longer than 100 ms, with the turn it was stuck on.
 * - Load: frame time and simulation time per frame, exchanged every 2 s (with a ping), so a slow device shows up by name.
 *
 * `gameApp.netTrace()` prints everything; `?netdebug=1` shows a small live overlay (works on phones without a console).
 */

export interface TraceEvent { at: number; ev: string; data?: Record<string, unknown> }

export interface NetStats {
  /** Frames per second over the last window. */
  fps: number;
  /** Average / worst simulation time per frame (ms). */
  simAvg: number;
  simMax: number;
  /** Worst frame time (ms). */
  frameMax: number;
  /** Time spent waiting for the other player in the window (ms) and how many waits. */
  waitMs: number;
  waits: number;
  /** Current lockstep turn. */
  turn: number;
  /** Last measured round trip (ms). */
  rtt: number;
}

const events: TraceEvent[] = [];
let t0 = performance.now();

export const NetTrace = {
  /** Start a new trace (start pressed). */
  reset() { events.length = 0; t0 = performance.now(); },
  mark(ev: string, data?: Record<string, unknown>) {
    const e: TraceEvent = { at: Math.round(performance.now() - t0), ev, data };
    events.push(e);
    if (events.length > 400) events.splice(0, 100);
    if (debugOn()) console.info(`[net] +${e.at}ms ${ev}`, data ?? '');
    return e;
  },
  events(): TraceEvent[] { return events.slice(); },
  /** One line per event, for the console. */
  format(list: TraceEvent[] = events): string {
    return list.map(e => `+${String(e.at).padStart(6)}ms  ${e.ev}${e.data ? '  ' + JSON.stringify(e.data) : ''}`).join('\n');
  },
  /** The start timeline only (sent to the host with the guest's "ready"). */
  startEvents(): TraceEvent[] { return events.filter(e => !e.ev.startsWith('stall')).slice(0, 40); }
};

export function debugOn(): boolean {
  try { return typeof location !== 'undefined' && new URLSearchParams(location.search).has('netdebug'); } catch { return false; }
}

/** Rolling per-frame load numbers (reset every report). */
export class LoadMeter {
  private frames = 0;
  private simSum = 0;
  private simMax = 0;
  private frameMax = 0;
  private waitMs = 0;
  private waits = 0;
  private since = performance.now();

  frame(frameMs: number, simMs: number) {
    this.frames++;
    this.simSum += simMs;
    if (simMs > this.simMax) this.simMax = simMs;
    if (frameMs > this.frameMax) this.frameMax = frameMs;
  }
  stall(ms: number) { this.waits++; this.waitMs += ms; }

  take(turn: number, rtt: number): NetStats {
    const now = performance.now(), secs = Math.max(0.001, (now - this.since) / 1000);
    const s: NetStats = {
      fps: Math.round(this.frames / secs), simAvg: +(this.simSum / Math.max(1, this.frames)).toFixed(1), simMax: +this.simMax.toFixed(1),
      frameMax: Math.round(this.frameMax), waitMs: Math.round(this.waitMs), waits: this.waits, turn, rtt: Math.round(rtt)
    };
    this.frames = 0; this.simSum = 0; this.simMax = 0; this.frameMax = 0; this.waitMs = 0; this.waits = 0; this.since = now;
    return s;
  }
}
