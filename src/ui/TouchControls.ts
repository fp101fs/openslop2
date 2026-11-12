import { InputHandler } from '../input/InputHandler';
import { Renderer } from '../graphics/Renderer';
import { Building } from '../simulation/Building';
import { BUILDING_CONFIGS } from '../config';

/**
 * On-screen controls for touch devices (iPad): RTS tool strip (army / idle / base / cancel / add-to-selection / control groups)
 * and a possessed-unit overlay (virtual stick, fire, alt-fire, boost, climb/dive, view, exit).
 * Everything routes through the existing hotkey / input code, so no keyboard is ever needed.
 * Gestures themselves (tap, drag-box, two-finger pan, pinch, long-press) live in InputHandler.
 */
export function isTouchDevice(): boolean {
  try {
    if (new URLSearchParams(location.search).has('touch')) return true;
    return window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && /Macintosh|iPad/.test(navigator.userAgent));
  } catch { return false; }
}

export class TouchControls {
  private rts: HTMLDivElement;
  private fps: HTMLDivElement;
  private setMode = false;
  private setBtn!: HTMLButtonElement;
  private addBtn!: HTMLButtonElement;

  constructor(private input: InputHandler, private renderer: Renderer) {
    document.documentElement.classList.add('touch-device');
    // phones get the compact HUD; tablets (iPad) have room for the full desktop bottom bar
    const compact = Math.min(screen.width, screen.height) < 600;
    document.documentElement.classList.toggle('touch-compact', compact);
    this.rts = this.build('touch-ui touch-rts');
    this.fps = this.build('touch-ui touch-fps');
    this.buildRts();
    this.buildFps();
    document.body.append(this.rts, this.fps);
    setInterval(() => this.refresh(), 200);
    this.refresh();
  }

  private build(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    d.addEventListener('contextmenu', e => e.preventDefault());
    return d;
  }

  /** A button that fires on touch-down (instant response, no 300ms click delay) and still works with a mouse. */
  private btn(parent: HTMLElement, label: string, cls: string, onDown: () => void, onUp?: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'touch-btn ' + cls;
    b.innerHTML = label;
    let active = false;
    const down = (e: Event) => { e.preventDefault(); e.stopPropagation(); if (active) return; active = true; b.classList.add('down'); onDown(); };
    const up = (e: Event) => { e.preventDefault(); e.stopPropagation(); if (!active) return; active = false; b.classList.remove('down'); onUp?.(); };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    b.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    parent.appendChild(b);
    return b;
  }

  /** RTS controls: one contextual dock (bottom right) + one small Groups button above the minimap. The full command card is a pop-up. */
  private dock!: HTMLDivElement;
  private tools!: HTMLDivElement;
  private dockSig = '';
  private selSig = '';

  private get app(): any { return (window as any).gameApp; }
  private setCard(open: boolean) { document.body.classList.toggle('cmd-open', open); this.dock.querySelector('.more')?.classList.toggle('on', open); }
  private cardOpen() { return document.body.classList.contains('cmd-open'); }
  private setTools(open: boolean) { this.tools.classList.toggle('open', open); }

  /** Tablet layout: a Deselect / Cancel button (the phone dock, which holds Cancel there, is hidden on tablets). */
  private deselectBtn!: HTMLButtonElement;

  private buildRts() {
    this.dock = document.createElement('div'); this.dock.className = 'touch-dock';
    this.rts.append(this.dock);

    const desel = document.createElement('div'); desel.className = 'touch-deselect';
    this.deselectBtn = this.btn(desel, '✖<span>Deselect</span>', 'cancel', () => { this.setCard(false); this.app?.setSubmenu?.('none'); this.input.touchCancel(); });
    this.rts.append(desel);

    // Groups + Add-to-selection: tucked behind one small button
    const grpBtnWrap = document.createElement('div'); grpBtnWrap.className = 'touch-grpwrap';
    this.btn(grpBtnWrap, '<img class="bare-ico" src="/ui/hud/group.svg" alt="Groups" draggable="false">', 'grptoggle bare', () => this.setTools(!this.tools.classList.contains('open')));
    this.tools = document.createElement('div'); this.tools.className = 'touch-tools';
    for (let n = 1; n <= 5; n++) {
      this.btn(this.tools, String(n), 'grp', () => {
        if (this.setMode) { this.input.assignGroup(n); this.setMode = false; this.setBtn.classList.remove('on'); }
        else this.input.recallGroup(n);
      });
    }
    this.setBtn = this.btn(this.tools, 'Set', 'toggle grp', () => { this.setMode = !this.setMode; this.setBtn.classList.toggle('on', this.setMode); });
    this.addBtn = this.btn(this.tools, 'Add', 'toggle grp', () => {
      this.input.touchAddMode = !this.input.touchAddMode;
      this.addBtn.classList.toggle('on', this.input.touchAddMode);
    });
    grpBtnWrap.appendChild(this.tools);
    this.rts.append(grpBtnWrap);

    // the command card pops up instead of living in the corner: close it after an action (unless it opened a sub-menu), on a new selection, or a tap outside
    const card = document.getElementById('command-card');
    card?.addEventListener('click', () => setTimeout(() => { if (this.app?.ui?.activeSubmenu === 'none') this.setCard(false); }, 0), true);
    window.addEventListener('touchstart', e => {
      const n = e.target as HTMLElement | null;
      if (n?.closest?.('#command-card, .touch-dock, .touch-grpwrap')) return;
      if (this.cardOpen()) { this.setCard(false); this.app?.setSubmenu?.('none'); }
      this.setTools(false);
    }, { passive: true });
  }

  /** SVG button icons for the dock (public/icons); faction picks the Protoss / Terran / Zerg build icons. */
  private ico(name: string, label: string): string {
    return `<img class="touch-ico" src="/icons/btn-${name}.svg" alt="" draggable="false"><span>${label}</span>`;
  }
  private buildIco(advanced: boolean, label: string): string {
    const race = this.app?.world?.localFaction ?? 'terran';
    const name = race === 'zerg' ? (advanced ? 'building-zerg-hive' : 'building-zerg-hatchery')
      : `command-${race}-build${advanced ? 'advanced' : ''}structure`;
    return this.ico(name, label);
  }

  /** The 1-3 buttons that matter for what is selected, plus Cancel and More. */
  private dockSpec(): { key: string; label: string; cls?: string; run: () => void }[] {
    const app = this.app, w = app?.world;
    const out: { key: string; label: string; cls?: string; run: () => void }[] = [];
    const more = (label: string) => out.push({ key: 'more' + label, label: `⋯<span>${label}</span>`, cls: 'more', run: () => { this.setCard(!this.cardOpen()); } });
    const cancel = () => out.unshift({ key: 'x', label: this.ico('command-cancel', 'Cancel'), cls: 'cancel', run: () => { this.setCard(false); app.setSubmenu('none'); this.input.touchCancel(); } });
    if (this.input.placingBuildingType || this.input.targetMode) { cancel(); return out; }
    const sel = (w?.selectedEntities ?? []) as any[];
    const mine = sel.filter(e => e.playerId === 'player');
    if (!sel.length) {
      // (Idle worker / Army live next to the Groups button: QuickSelect.ts)
      out.push({ key: 'base', label: '<img class="bare-ico" src="/ui/hud/home.svg" alt="Home" draggable="false">', cls: 'bare', run: () => this.input.pressKey(' ') });
      return out;
    }
    if (mine.length) {
      const f = mine[0];
      if (f instanceof Building) {
        // the structure's own command-card buttons, straight in the dock (Nexus: Probe / Mothership / Chrono / Rally);
        // whatever doesn't fit stays behind a More button
        const quick = this.cardButtons();
        const room = Math.max(1, this.dockSlots() - 1); // minus Cancel
        const fitsAll = quick.length <= room;
        const shown = fitsAll ? quick : quick.slice(0, Math.max(0, room - 1));
        for (const q of shown) out.push(q);
        if (!fitsAll || !quick.length) {
          const trains = (BUILDING_CONFIGS[f.type]?.produces?.length ?? 0) > 0;
          out.push({ key: 'train' + trains, label: `⋯<span>${quick.length ? 'More' : trains ? 'Train' : 'Actions'}</span>`, cls: 'more', run: () => this.setCard(!this.cardOpen()) });
        }
      } else if (['scv', 'probe', 'drone'].includes(f.type)) {
        out.push({ key: 'build', label: this.buildIco(false, 'Build'), cls: 'main', run: () => { app.setSubmenu('build_basic'); this.setCard(true); } });
        out.push({ key: 'adv', label: this.buildIco(true, 'Advanced'), cls: 'main', run: () => { app.setSubmenu('build_advanced'); this.setCard(true); } });
        more('More');
      } else {
        out.push({ key: 'atk', label: this.ico('command-attack', 'Attack'), cls: 'main', run: () => app.issueCommand('attack') });
        out.push({ key: 'stop', label: this.ico('command-stop', 'Stop'), run: () => app.issueCommand('stop') });
        more('More');
      }
    }
    cancel();
    return out;
  }

  /** How many dock buttons fit: beside the minimap + a minimal selection panel (landscape), or across the screen (portrait). */
  private dockSlots(): number {
    const landscape = matchMedia('(orientation: landscape)').matches;
    const mm = document.getElementById('minimap-slot')?.getBoundingClientRect().width ?? 150;
    const free = landscape ? innerWidth - mm - 24 - 200 : innerWidth - 16;
    return Math.max(3, Math.min(7, Math.floor((free + 6) / 66)));
  }

  /** The selected structure's command-card buttons (in card order: production first, then abilities / research, then Rally),
   *  as dock buttons that press the real card button, so costs, locks and cooldowns stay exact. */
  private cardButtons(): { key: string; label: string; cls?: string; run: () => void }[] {
    const card = document.getElementById('command-card');
    if (!card) return [];
    const out: { key: string; label: string; cls?: string; run: () => void }[] = [];
    for (const b of Array.from(card.querySelectorAll<HTMLElement>('.cmd-grid > .cmd-btn'))) {
      const act = b.getAttribute('onclick');
      if (!act) continue; // read-outs (Larva count) are not actions
      const name = (b.querySelector('.name')?.textContent ?? '').trim().replace(/^(Build|Train|Research|Morph to|Warp In|Set) /, '').replace(/ Level (\d)$/, ' $1');
      const icon = b.querySelector('.icon')?.innerHTML ?? '';
      const state = b.classList.contains('locked') ? 'locked' : b.classList.contains('active') ? 'active' : '';
      const cost = (b.querySelector('.cost')?.textContent ?? '').trim();
      out.push({
        key: `q:${act}:${state}:${name}:${state === 'active' ? cost : ''}`,
        label: `<span class="dq-ico">${icon}</span><span>${name}</span>${cost && state !== 'locked' ? `<i class="dq-cost">${cost}</i>` : ''}`,
        cls: `quick ${state}${name.length > 9 ? ' long' : ''}`,
        run: () => {
          // press whatever the card shows for this action right now (it may have redrawn since the dock was built)
          const live = Array.from(document.querySelectorAll<HTMLElement>('#command-card .cmd-grid > .cmd-btn')).find(x => x.getAttribute('onclick') === act);
          live?.click();
        },
      });
    }
    return out;
  }

  private buildFps() {
    // virtual stick (left)
    const stick = document.createElement('div'); stick.className = 'touch-stick';
    const knob = document.createElement('div'); knob.className = 'touch-knob';
    stick.appendChild(knob);
    const held = new Set<string>();
    const setKeys = (want: Set<string>) => {
      for (const k of [...held]) if (!want.has(k)) { this.input.releaseKey(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { this.input.pressKey(k, { hold: true }); held.add(k); }
    };
    let id = -1;
    const move = (t: Touch) => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
      const len = Math.hypot(dx, dy), lim = R * 0.62;
      if (len > lim) { dx *= lim / len; dy *= lim / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / lim, ny = dy / lim, want = new Set<string>();
      if (ny < -0.35) want.add('w'); else if (ny > 0.35) want.add('s');
      if (nx < -0.35) want.add('a'); else if (nx > 0.35) want.add('d');
      setKeys(want);
    };
    const end = () => { id = -1; knob.style.transform = ''; setKeys(new Set()); };
    stick.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); const t = e.changedTouches[0]!; id = t.identifier; move(t); }, { passive: false });
    stick.addEventListener('touchmove', e => { e.preventDefault(); e.stopPropagation(); for (const t of Array.from(e.changedTouches)) if (t.identifier === id) move(t); }, { passive: false });
    stick.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); end(); }, { passive: false });
    stick.addEventListener('touchcancel', end, { passive: false });

    const right = document.createElement('div'); right.className = 'touch-actions';
    let fireTimer: number | null = null;
    const stopFire = () => { if (fireTimer !== null) { clearInterval(fireTimer); fireTimer = null; } };
    this.btn(right, '🔥<span>FIRE</span>', 'fire', () => { this.input.fireFpsWeapon(); stopFire(); fireTimer = window.setInterval(() => this.input.fireFpsWeapon(), 140); }, stopFire);
    this.btn(right, '🚀<span>ALT</span>', 'alt', () => this.input.fireSecondaryFpsWeapon());
    this.btn(right, '⚡<span>BOOST</span>', 'boost', () => this.input.triggerPossessedSpecialAbility());
    this.btn(right, '▲', 'climb', () => this.input.pressKey('r', { hold: true }), () => this.input.releaseKey('r'));
    this.btn(right, '▼', 'dive', () => this.input.pressKey('c', { hold: true }), () => this.input.releaseKey('c'));
    this.btn(right, '👁<span>VIEW</span>', 'view', () => this.input.toggleFpsTps());
    this.btn(right, '⏏<span>EXIT</span>', 'exit', () => this.input.exitFpsMode());
    this.fps.append(stick, right);
  }

  private refresh() {
    const app = (window as any).gameApp;
    const inMenu = !!app?.menuOpen;
    const intro = !!app?.intro?.isActive;
    const possessed = this.renderer.isFpsMode;
    this.rts.style.display = !inMenu && !intro && !possessed ? 'block' : 'none';
    if (inMenu || intro || possessed) { this.setCard(false); return this.fpsRefresh(inMenu, possessed); }
    this.refreshDock();
    this.fps.style.display = !inMenu && possessed ? 'block' : 'none';
  }

  private fpsRefresh(inMenu: boolean, possessed: boolean) { this.fps.style.display = !inMenu && possessed ? 'block' : 'none'; }

  private refreshDock() {
    const w = this.app?.world;
    // a new selection closes the pop-up card
    const ids = ((w?.selectedEntities ?? []) as any[]).map(e => e.id).join(',');
    if (ids !== this.selSig) { this.selSig = ids; this.setCard(false); }
    const spec = this.dockSpec();
    const sig = spec.map(x => x.key).join('|');
    if (sig !== this.dockSig) {
      this.dockSig = sig;
      this.dock.innerHTML = '';
      for (const sp of spec) this.btn(this.dock, sp.label, 'dockbtn ' + (sp.cls ?? ''), sp.run);
      const landscape = matchMedia('(orientation: landscape)').matches;
      document.documentElement.style.setProperty('--dockw', landscape ? `${spec.length * 66 + 8}px` : '0px');
    }
    this.dock.querySelector('.more')?.classList.toggle('on', this.cardOpen());
    const busy = !!this.input.placingBuildingType || !!this.input.targetMode;
    const label = busy ? '✖<span>Cancel</span>' : '✖<span>Deselect</span>';
    if (this.deselectBtn.innerHTML !== label) this.deselectBtn.innerHTML = label;
    this.deselectBtn.style.display = busy || (w?.selectedEntities?.length ?? 0) > 0 ? '' : 'none';
  }
}
