import type { InputHandler } from '../input/InputHandler';
import { isWorkerType } from '../config';

/**
 * SC2-style Idle Worker / Select Army buttons just above the minimap (desktop, iPad and phones), with an idle-worker count.
 * Hotkeys F1 (next idle worker) and F2 (select army), like SC2.
 */
export class QuickSelect {
  private el: HTMLDivElement;
  private idleBtn: HTMLButtonElement;
  private armyBtn: HTMLButtonElement;
  private idleCount: HTMLElement;
  private race = '';

  constructor(private input: InputHandler) {
    this.el = document.createElement('div');
    this.el.className = 'quick-select';
    this.idleBtn = this.button('Idle workers (F1): select the next idle worker', () => this.input.selectIdleWorker());
    this.armyBtn = this.button('Select army (F2): every combat unit', () => this.input.selectAllArmy());
    this.idleCount = document.createElement('b');
    this.idleCount.className = 'qs-count';
    this.idleBtn.appendChild(this.idleCount);
    (document.querySelector('.sc2-bottom-console') ?? document.body).appendChild(this.el);
    window.addEventListener('keydown', e => {
      if (e.key !== 'F1' && e.key !== 'F2') return;
      if (this.app?.menuOpen || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      e.preventDefault();
      if (e.key === 'F1') this.input.selectIdleWorker(); else this.input.selectAllArmy();
    });
    setInterval(() => this.refresh(), 250);
    this.refresh();
  }

  private get app(): any { return (window as any).gameApp; }

  /** Fires on press (mouse, touch or pen) so a tap is never lost; keeps the press off the map underneath. */
  private button(title: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'qs-btn';
    b.title = title;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) run(); });
    b.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    b.addEventListener('mousedown', e => e.stopPropagation());
    b.addEventListener('click', e => e.stopPropagation());
    this.el.appendChild(b);
    return b;
  }

  private refresh() {
    const w = this.app?.world;
    if (!w) return;
    const race = w.localFaction as string;
    if (race !== this.race) {
      this.race = race;
      const worker = race === 'zerg' ? 'unit-zerg-drone' : race === 'protoss' ? 'unit-protoss-probe' : 'unit-terran-scv';
      const army = race === 'zerg' ? 'unit-zerg-zergling' : race === 'protoss' ? 'unit-protoss-zealot' : 'unit-terran-marine';
      this.setIcon(this.idleBtn, worker);
      this.setIcon(this.armyBtn, army);
    }
    let idle = 0;
    for (const u of w.units) if (u.playerId === 'player' && !u.isDead && isWorkerType(u.type) && !u.isGathering && !u.currentCommand) idle++;
    const txt = idle ? String(idle) : '';
    if (this.idleCount.textContent !== txt) this.idleCount.textContent = txt;
    this.idleBtn.classList.toggle('none', idle === 0);
  }

  private setIcon(b: HTMLButtonElement, name: string) {
    let img = b.querySelector('img');
    if (!img) { img = document.createElement('img'); img.alt = ''; img.draggable = false; b.prepend(img); }
    img.src = `/icons/btn-${name}.svg`;
  }
}
