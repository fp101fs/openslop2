import type { Renderer } from './Renderer';

/**
 * Automatic quality step-down. Watches the real frame rate while a match is running; if the average over a short window
 * stays under DOWN_FPS it moves one preset down the ladder (render resolution / shadows / post-processing), without
 * overwriting the player's saved choice. After a long stretch of comfortably high fps it climbs back, but never above the
 * player's own preset. Each failed climb (fps drops again) doubles the wait before the next attempt.
 */
const LADDER = ['low', 'performance', 'balanced', 'high', 'ultra'];
const WINDOW_MS = 1500;      // measuring window
const DOWN_FPS = 42;         // average under this for a whole window -> step down
const UP_FPS = 56;           // average above this ...
const UP_AFTER_MS = 12000;   // ... for this long -> try one step back up
const COOLDOWN_MS = 4000;    // after any change let things settle before judging again
const HITCH_MS = 250;        // frames longer than this (tab switch, shader compile) are ignored

export class AutoQuality {
  private renderer: Renderer;
  private last = 0;
  private sum = 0; private n = 0;
  private winStart = 0;
  private cooldownUntil = 0;
  private goodSince = 0;
  private upWait = UP_AFTER_MS;
  private lastUp = 0;
  private cur = -1;            // ladder index currently applied
  private user = '';
  public onChange: ((from: string, to: string) => void) | null = null;

  constructor(renderer: Renderer) { this.renderer = renderer; }

  public get enabled(): boolean { try { return localStorage.getItem('sc2_auto_quality') !== '0'; } catch { return true; } }
  public set enabled(v: boolean) {
    try { localStorage.setItem('sc2_auto_quality', v ? '1' : '0'); } catch {}
    if (!v) this.restore();
    this.reset();
  }

  /** Put the player's chosen preset back. */
  private restore() {
    const u = (this.renderer.constructor as typeof Renderer).loadQuality();
    if (this.cur >= 0 && LADDER[this.cur] !== u) this.renderer.setQuality(u, false);
    this.cur = LADDER.indexOf(u);
  }

  /** Forget the current measurement (menu open, paused, tab hidden ...). */
  public reset() { this.last = 0; this.sum = 0; this.n = 0; this.winStart = 0; this.goodSince = 0; }

  /** Call once per rendered frame with the rAF timestamp while a match is actually running. */
  public tick(now: number) {
    if (!this.enabled) return;
    const user = (this.renderer.constructor as typeof Renderer).loadQuality();
    if (user !== this.user) { this.user = user; this.cur = LADDER.indexOf(user); this.upWait = UP_AFTER_MS; this.cooldownUntil = now + COOLDOWN_MS; this.reset(); }
    if (this.cur < 0) return;
    const dt = this.last ? now - this.last : 0;
    this.last = now;
    if (!dt || dt > HITCH_MS) return;
    if (now < this.cooldownUntil) return;
    if (!this.winStart) this.winStart = now;
    this.sum += dt; this.n++;
    if (now - this.winStart < WINDOW_MS) return;
    const fps = 1000 * this.n / this.sum;
    this.sum = 0; this.n = 0; this.winStart = 0;

    const userIdx = LADDER.indexOf(user);
    if (fps < DOWN_FPS && this.cur > 0) {
      // if we just climbed and it did not hold, wait longer before trying again
      if (this.lastUp && now - this.lastUp < 20000) this.upWait = Math.min(this.upWait * 2, 120000);
      this.apply(this.cur - 1, now);
    } else if (fps >= UP_FPS && this.cur < userIdx) {
      if (!this.goodSince) this.goodSince = now;
      if (now - this.goodSince >= this.upWait) { this.lastUp = now; this.apply(this.cur + 1, now); }
    } else this.goodSince = 0;
  }

  private apply(idx: number, now: number) {
    const from = LADDER[this.cur]!, to = LADDER[idx]!;
    this.cur = idx;
    this.renderer.setQuality(to, false);
    this.cooldownUntil = now + COOLDOWN_MS;
    this.goodSince = 0;
    this.onChange?.(from, to);
  }
}
