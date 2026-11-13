/**
 * The "Starting game" modal: a small centred card over the menu (or the running game), never a separate loading screen.
 *  - `seconds > 0`: counts down 10..1 (one `onTick` beep per second) while the match loads behind it. Play is disabled until
 *    the match is ready, then starts it at once; at 0 it starts by itself. Past 0 and still loading, the number row reads
 *    "Loading… 87%". Cancel / Esc closes it and nothing starts.
 *  - `seconds = 0`: no countdown; it only appears if loading takes more than a moment, and starts as soon as the match is ready.
 * `result` resolves true when the match should start (the caller starts it, then calls `close()`), false when cancelled.
 */
import { setMenu3dPaused } from './menu3d';

export interface CountdownOptions {
  title?: string;
  seconds: number;
  /** Shows the Cancel button (and lets Esc cancel). */
  cancellable?: boolean;
  /** Called on every visible second of the countdown. */
  onTick?: () => void;
  /** Called with each loading progress update (multiplayer sends it to the other player). */
  onProgress?: (frac: number | null) => void;
}

export class StartCountdown {
  private static active: StartCountdown | null = null;

  readonly result: Promise<boolean>;
  private resolveResult!: (go: boolean) => void;
  private settled = false;
  private el: HTMLDivElement;
  private numEl: HTMLElement;
  private playBtn: HTMLButtonElement;
  private endAt: number;
  private shown = -1;
  private ready = false;
  private frac: number | null = null;
  private statusText: string | null = null;
  private timer = 0;
  private revealTimer = 0;
  private closed = false;

  constructor(private o: CountdownOptions) {
    StartCountdown.active?.cancel(); // a newer start replaces an older one
    StartCountdown.active = this;
    this.result = new Promise(res => { this.resolveResult = res; });
    this.endAt = performance.now() + o.seconds * 1000;

    this.el = document.createElement('div');
    this.el.className = 'sc-modal';
    this.el.innerHTML = `<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="sc-title">
      <div class="sc-title" id="sc-title"></div>
      <div class="sc-num" aria-live="polite"></div>
      <div class="sc-btns">
        ${o.seconds > 0 ? '<button type="button" class="sc-btn play" data-sc="play" disabled>Play</button>' : ''}
        ${o.cancellable ? '<button type="button" class="sc-btn cancel" data-sc="cancel">Cancel</button>' : ''}
      </div></div>`;
    (this.el.querySelector('.sc-title') as HTMLElement).textContent = o.title ?? 'Starting game';
    this.numEl = this.el.querySelector('.sc-num') as HTMLElement;
    this.playBtn = this.el.querySelector('[data-sc="play"]') as HTMLButtonElement;
    if (!o.seconds && !o.cancellable) this.el.querySelector('.sc-btns')!.remove();
    this.el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sc]');
      if (b?.dataset.sc === 'play' && this.ready) this.go();
      else if (b?.dataset.sc === 'cancel') this.cancel();
    });
    document.addEventListener('keydown', this.onKey, true);
    document.body.appendChild(this.el);

    this.update();
    this.timer = window.setInterval(() => this.update(), 100);
    if (o.seconds > 0) this.reveal();
    else this.revealTimer = window.setTimeout(() => this.reveal(), 300); // quick loads never flash a card
  }

  /** Loading progress 0..1 (null = unknown), shown once the countdown has run out. */
  progress(frac: number | null) { this.frac = frac; this.o.onProgress?.(frac); this.update(); }
  /** Replaces the number row with a message (e.g. waiting for the other player); null goes back to the countdown. */
  status(text: string | null) { this.statusText = text; this.update(); }

  /** The match can start: enables Play; with no countdown left (or none at all) it starts right away. */
  setReady() {
    if (this.ready || this.settled) return;
    this.ready = true;
    if (this.playBtn) { this.playBtn.disabled = false; this.playBtn.classList.add('on'); }
    this.update();
  }

  cancel() { this.finish(false); this.close(); }

  /** Fade out and remove (after the next frames have painted, so the new scene never flashes half-built). */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.finish(false);
    window.clearInterval(this.timer);
    window.clearTimeout(this.revealTimer);
    document.removeEventListener('keydown', this.onKey, true);
    if (StartCountdown.active === this) StartCountdown.active = null;
    if (this.revealed) setMenu3dPaused(false); // menu 3D models fade back in
    const el = this.el;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 250); }));
  }

  private revealed = false;
  private reveal() {
    if (this.closed) return;
    this.revealed = true;
    setMenu3dPaused(true); // menu 3D models fade out and stop drawing while the match loads
    requestAnimationFrame(() => this.el.classList.add('on'));
  }

  private go() {
    this.finish(true);
    if (this.playBtn) this.playBtn.disabled = true;
    this.numEl.textContent = 'Starting…';
    this.numEl.classList.add('txt');
  }

  private finish(go: boolean) {
    if (this.settled) return;
    this.settled = true;
    window.clearInterval(this.timer);
    this.resolveResult(go);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.o.cancellable && !this.settled) { e.preventDefault(); e.stopPropagation(); this.cancel(); }
    else if (e.key === 'Enter' && this.ready && !this.settled) { e.preventDefault(); e.stopPropagation(); this.go(); }
  };

  private update() {
    if (this.settled) return;
    const left = Math.max(0, Math.ceil((this.endAt - performance.now()) / 1000));
    if (left === 0 && this.ready) { this.go(); return; }
    let text: string;
    if (this.statusText) text = this.statusText;
    else if (left > 0) text = String(left);
    else text = this.frac === null ? 'Loading…' : `Loading… ${Math.min(99, Math.floor(this.frac * 100))}%`;
    const isNum = !this.statusText && left > 0;
    if (isNum && left !== this.shown) {
      this.shown = left;
      this.o.onTick?.();
      this.numEl.classList.remove('pop'); void this.numEl.offsetWidth; this.numEl.classList.add('pop');
    }
    if (this.numEl.textContent !== text) this.numEl.textContent = text;
    this.numEl.classList.toggle('txt', !isNum);
  }
}
