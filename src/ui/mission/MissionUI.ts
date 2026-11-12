import * as THREE from 'three';
import type { GameWorld } from '../../simulation/GameWorld';
import { entityPortrait } from '../EntityPortrait';
import { ProceduralGrassSystem } from '../../graphics/ProceduralGrass';
import './missionUI.css';

/**
 * In-game UI for data missions (src/campaign/data): the speaker card under the objectives (beep, then the voice line), tutorial
 * popups, cutscene letterbox, drop-pod landings and autosave. Loaded with a dynamic import only when a data mission starts, so
 * skirmish and multiplayer never download it. All hooks are optional properties on GameWorld; headless worlds have none.
 */
export interface MissionUIHost {
  world: GameWorld;
  canSaveGame(): boolean;
  saveGame(name: string): Promise<string>;
  ui: { showToast(msg: string, err?: boolean): void };
}

type Line = { text: string; sec: number; key: string; at: number; speaker: { id: string; name: string; portrait?: string; unit?: string; team?: string } | null };
/** A line that waited longer than this (game seconds) behind others is dropped, like SC2's stale chatter. */
const STALE = 8;

const BEEP_LEAD = 0.35; // seconds between the card's beep and the voice

export class MissionUI {
  private root = document.createElement('div');
  private card: HTMLDivElement;
  private tutorials: HTMLDivElement;
  private bars: HTMLDivElement;
  private shield: HTMLDivElement;
  private raf = 0;
  private cardUntil = 0;
  private pods: { mesh: THREE.Mesh; t: number; x: number; y: number }[] = [];
  private last = performance.now();
  private blocked = new Map<string, number[]>();

  constructor(private host: MissionUIHost) {
    this.root.className = 'mui';
    this.root.innerHTML = `
      <div class="mui-card" hidden><div class="mui-portrait"><img alt=""></div><div class="mui-body"><div class="mui-name"></div><div class="mui-text"></div></div></div>
      <div class="mui-tuts"></div>
      <div class="mui-bars" hidden><div class="mui-bar top"></div><div class="mui-bar bottom"></div><div class="mui-skip">Esc to skip</div></div>
      <div class="mui-shield" hidden></div>`;
    document.body.appendChild(this.root);
    this.card = this.root.querySelector('.mui-card')!;
    this.tutorials = this.root.querySelector('.mui-tuts')!;
    this.bars = this.root.querySelector('.mui-bars')!;
    this.shield = this.root.querySelector('.mui-shield')!;
    this.install();
    this.raf = requestAnimationFrame(this.frame);
  }

  private get w(): any { return this.host.world; }

  private install() {
    const w = this.w;
    w.dialogueCards = true;
    w.sound?.preloadSfx?.('confirm_beep');
    w.missionTutorial = (id: string, title: string, text: string) => this.tutorial(id, title, text);
    w.missionCutscene = (on: boolean, at?: [number, number]) => this.cutscene(on, at);
    w.dropPod = (x: number, y: number) => this.dropPod(x, y);
    w.missionAutosave = () => this.autosave();
    window.addEventListener('keydown', this.onKey, true);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    const w = this.w;
    for (const k of ['dialogueCards', 'missionTutorial', 'missionCutscene', 'dropPod', 'missionAutosave']) delete w[k];
    for (const p of this.pods) p.mesh.removeFromParent();
    for (const g of this.pallets?.values() ?? []) g.removeFromParent();
    this.root.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !this.bars.hidden) { this.cutscene(false); e.stopPropagation(); e.preventDefault(); }
  };

  // ---- per frame: dialogue queue, drop pods ----
  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const rt = this.w.mission;
    if (rt && !this.w.isGameOver) {
      if (this.cardUntil && now > this.cardUntil) { this.card.hidden = true; this.cardUntil = 0; }
      if (!this.cardUntil) {
        while (rt.lineQueue.length && rt.elapsed - rt.lineQueue[0].at > STALE) rt.lineQueue.shift();
        if (rt.lineQueue.length) this.showLine(rt.lineQueue.shift());
      }
    } else if (this.cardUntil) { this.card.hidden = true; this.cardUntil = 0; }
    this.updatePods(dt);
    this.syncPallets();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Card appears under the objectives, the beep plays, then the voice; the card stays for the line's length. */
  private showLine(l: Line) {
    const anchor = document.getElementById('mission-objective-widget');
    const r = anchor && anchor.style.display !== 'none' ? anchor.getBoundingClientRect() : null;
    this.card.style.top = `${r ? r.bottom + 10 : 120}px`;
    this.card.style.left = `${r ? r.left : 12}px`;
    const img = this.card.querySelector('img')!;
    const sp = l.speaker;
    const src = sp?.portrait ? `/${sp.portrait}` : sp?.unit ? entityPortrait(sp.unit, false, sp.team !== 'enemy') : '';
    img.src = src || ''; img.style.visibility = src ? 'visible' : 'hidden';
    this.card.querySelector('.mui-name')!.textContent = sp?.name ?? '';
    this.card.classList.toggle('enemy', sp?.team === 'enemy');
    this.card.querySelector('.mui-text')!.textContent = l.text;
    this.card.hidden = false;
    this.card.classList.remove('in'); void this.card.offsetWidth; this.card.classList.add('in');
    const s = this.w.sound;
    s?.playSfx?.('confirm_beep', 0.7, 1, 0);
    setTimeout(() => s?.playMissionLine?.(l.key, l.text), BEEP_LEAD * 1000);
    this.cardUntil = performance.now() + (BEEP_LEAD + l.sec + 0.6) * 1000;
  }

  private tutorial(id: string, title: string, text: string) {
    if (this.w.mission?.restoring || this.tutorials.querySelector(`[data-id="${CSS.escape(id)}"]`)) return;
    const el = document.createElement('div');
    el.className = 'mui-tut'; el.dataset.id = id;
    el.innerHTML = `<div class="mui-tut-head"><span>TUTORIAL</span><button aria-label="Close">×</button></div><div class="mui-tut-title"></div><div class="mui-tut-text"></div>`;
    el.querySelector('.mui-tut-title')!.textContent = title;
    el.querySelector('.mui-tut-text')!.textContent = text;
    el.querySelector('button')!.addEventListener('click', () => el.remove());
    this.tutorials.appendChild(el);
    while (this.tutorials.children.length > 3) this.tutorials.firstElementChild!.remove();
    setTimeout(() => el.remove(), 25000);
  }

  /** Vision where the cutscene camera looks, so its actors are visible: a scan entry, which the world's vision rebuild keeps
   *  lit (revealing the fog directly would be wiped on the next rebuild and make units flicker). */
  private cutScan: { x: number; y: number; r: number; t: number; owner: 'player' } | null = null;
  private cutscene(on: boolean, at?: [number, number]) {
    if (this.w.mission?.restoring) return;
    this.bars.hidden = !on; this.shield.hidden = !on;
    this.bars.classList.toggle('in', on);
    if (this.cutScan && (!on || at)) { this.cutScan.t = 0; this.cutScan = null; }
    if (on && at) { this.cutScan = { x: at[0], y: at[1], r: 13, t: 60, owner: 'player' }; this.w.scans?.push(this.cutScan); }
  }

  private dropPod(x: number, y: number) {
    if (this.w.mission?.restoring) return;
    const scene: THREE.Scene | undefined = this.w.scene;
    if (!scene) return;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6, roughness: 0.4, emissive: 0xff7a1a, emissiveIntensity: 0.6 }));
    mesh.position.set(x, 40, y); mesh.castShadow = true;
    scene.add(mesh);
    this.pods.push({ mesh, t: 0, x, y });
  }

  private updatePods(dt: number) {
    for (const p of [...this.pods]) {
      p.t += dt;
      const k = Math.min(1, p.t / 1.1), g = ProceduralGrassSystem.getTerrainHeight(p.x, p.y);
      p.mesh.position.y = g + 0.8 + (1 - k * k) * 40;
      (p.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 * (1 - k) + 0.1;
      if (k >= 1 && !p.mesh.userData.landed) {
        p.mesh.userData.landed = true;
        this.w.particles?.spawnExplosionPuff?.(new THREE.Vector3(p.x, g + 0.4, p.y), 1.3);
        this.w.sound?.playDeepBoom?.(0.5);
      }
      if (p.t > 6) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); this.pods.splice(this.pods.indexOf(p), 1); }
    }
  }

  /** Resource pallets (data missions' `pickups`): a crate per pallet, hidden once taken (read from the mission state, so a loaded
   *  save shows the right ones). Built on the first frame the mission exists. */
  private pallets: Map<string, THREE.Object3D> | null = null;
  private syncPallets() {
    const rt = this.w.mission, list = rt?.def.data?.pickups;
    if (!list?.length || !this.w.scene) return;
    if (!this.pallets) {
      this.pallets = new Map();
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
      const band = new THREE.MeshStandardMaterial({ color: 0x3a8ad8, emissive: 0x0a3a6a, emissiveIntensity: 0.6, roughness: 0.5 });
      for (const p of list) {
        const g = new THREE.Group();
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), wood); crate.position.y = 0.35; crate.castShadow = true;
        const strap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.16, 1.14), band); strap.position.y = 0.45;
        g.add(crate, strap);
        g.position.set(p.at[0], ProceduralGrassSystem.getTerrainHeight(p.at[0], p.at[1]), p.at[1]);
        this.w.scene.add(g); this.pallets.set(p.id, g);
      }
    }
    const taken = rt.state.dm?.taken ?? {};
    for (const [id, g] of this.pallets) g.visible = !taken[id];
  }

  private autosave() {
    if (!this.host.canSaveGame()) return;
    const key = this.w.matchConfig?.missionKey ?? 'mission';
    this.host.saveGame(`autosave_${key}`).then(() => this.host.ui.showToast('Autosaved')).catch(() => {});
  }
}
