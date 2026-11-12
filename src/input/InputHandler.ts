import { isLarvaKind, larvaMorphs, setLarvaRally } from '../simulation/Larva';
import { usesLarva } from '../simulation/Mechanics';
import { LAYOUT } from '../maps';
import * as THREE from 'three';
import { ABILITIES, abilitiesOf } from '../simulation/Mechanics';
import { GameWorld } from '../simulation/GameWorld';
import { ModelFactory } from '../graphics/ModelFactory';
import { Renderer } from '../graphics/Renderer';
import { UIManager } from '../ui/UIManager';
import { Unit, canRepairTarget } from '../simulation/Unit';
import { BUNKER_LOADABLE, loadBlockReason } from '../simulation/Bunker';
import { Building } from '../simulation/Building';
import { BuildingType, Vector2D } from '../types';
import { BUILDING_CONFIGS, UNIT_CONFIGS, FACTION_TECH, RESEARCH, isWorkerType, isTownHallType } from '../config';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { SwapReticle } from '../ui/SwapReticle';
import { MarineAnimator } from '../graphics/MarineAnimator';
import { WraithAnimator } from '../graphics/WraithAnimator';
import { cursorCss, CursorKind } from './Cursors';
import { Outline } from '../graphics/Outline';
import { muzzleWorldPos } from '../graphics/Muzzles';

export class InputHandler {
  private world: GameWorld;
  private renderer: Renderer;
  private ui: UIManager;

  // Raycaster & Ground Plane
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVec: THREE.Vector2 = new THREE.Vector2();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Marquee Selection Box
  private isBoxSelecting: boolean = false;
  private boxStartScreen: { x: number; y: number } = { x: 0, y: 0 };
  private boxCurrentScreen: { x: number; y: number } = { x: 0, y: 0 };
  private selectBoxEl: HTMLElement;

  // Middle Click Pan
  private isMiddlePanning: boolean = false;
  private middleStart: { x: number; y: number } = { x: 0, y: 0 };

  // Trackpad gesture state tracking (ensures two-finger scrolls strictly pan with 0 accidental zooming)
  private isTrackpadActive: boolean = false;
  private trackpadResetTimer: number | null = null;

  // Building Placement Mode
  public placingBuildingType: BuildingType | null = null;
  public placementPos: Vector2D = { x: 0, y: 0 };
  public isPlacementValid: boolean = false;

  // Attack-move Targeting Mode
  /** Click-to-target command armed from the command card / hotkey (A, P, R, C): the next left click executes it. */
  public targetMode: 'attack' | 'patrol' | 'repair' | 'load' | 'rally' | null = null;
  public get isAttackMoveMode(): boolean { return this.targetMode === 'attack'; }
  public set isAttackMoveMode(v: boolean) { this.targetMode = v ? 'attack' : (this.targetMode === 'attack' ? null : this.targetMode); }

  public beginTargetMode(mode: 'attack' | 'patrol' | 'repair' | 'load' | 'rally') {
    this.targetMode = mode;
    this.abilityTargetId = null;
    document.body.style.cursor = cursorCss(mode === 'attack' ? 'attack' : mode === 'patrol' ? 'patrol' : mode === 'repair' ? 'repair' : 'ally');
    this.ui.showToast(mode === 'rally' ? 'Set Rally Point: tap / click the ground or a mineral field (Esc cancels)'
      : mode === 'attack' ? 'Attack Move: click target or ground'
      : mode === 'patrol' ? 'Patrol: click the point to patrol to (right-click / Esc cancels)'
      : mode === 'repair' ? 'Repair: click a damaged Terran structure or mechanical unit'
      : 'Load: click a Marine or Marauder to load into the Bunker');
  }

  public cancelTargetMode() { this.targetMode = null; document.body.style.cursor = ''; }
  /** Ability waiting for a ground / unit / mineral target click (see Mechanics.ts) */
  public abilityTargetId: string | null = null;

  // Control Groups 1..9
  /** Ctrl+number groups (public: saves and multiplayer keyframes keep them by id). */
  public controlGroups: Map<number, (Unit | Building)[]> = new Map();
  private exposeGroups = (() => { (window as any).__ctrlGroups = () => this.controlGroups; })();
  private lastGroupPressTime: number = 0;
  private lastGroupPressed: number = -1;

  // Key States
  private keysPressed: Set<string> = new Set();
  /** Touch-first devices (iPad): Safari's synthetic mouse events must never trigger edge scrolling. */
  private coarsePointer: boolean = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  private edgeMouse: { x: number; y: number } | null = null;

  // Ace Combat & IL-2 Possession Combat Telemetry
  public multiLockedTargetIds: string[] = [];
  public targetedComponentIndex: number = 0; // 0 = Auto Weakpoint, 1..N = Specific IL-2 component
  public lastRangeEstimate: number = 0;
  public directionalThreatAngle: number | null = null;
  private dashCooldown: number = 0;

  constructor(world: GameWorld, renderer: Renderer, ui: UIManager) {
    this.world = world;
    this.renderer = renderer;
    this.ui = ui;

    // Selection marquee element
    this.selectBoxEl = document.createElement('div');
    this.selectBoxEl.className = 'sc2-selection-marquee';
    this.selectBoxEl.style.display = 'none';
    document.body.appendChild(this.selectBoxEl);

    this.setupListeners();
  }

  private setupListeners() {
    document.body.style.cursor = cursorCss('default');
    window.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    // Edge scrolling (SC2-style): track whether the pointer is inside the window
    window.addEventListener('mousemove', (ev) => {
      // no edge scrolling while the cursor is over the HUD (command card, minimap, selection panel, top-right buttons)
      const over = (ev.target as HTMLElement | null)?.closest?.('.console-command-card, .console-minimap-slot, .console-selection-panel, .sc2-system-controls, #game-menu-modal');
      this.edgeMouse = over ? null : { x: ev.clientX, y: ev.clientY };
    });
    document.documentElement.addEventListener('mouseleave', () => { this.edgeMouse = null; });
    window.addEventListener('blur', () => { this.edgeMouse = null; });
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    window.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupTouch();
  }

  // ======================= TOUCH (iPad) =======================
  /** Multi-select ("add") mode toggled by the on-screen toolbar: taps / boxes behave as if Shift were held. */
  public touchAddMode = false;
  private touch: {
    mode: 'none' | 'pending' | 'drag' | 'ghost' | 'box2' | 'look' | 'minimap';
    id: number; sx: number; sy: number; lx: number; ly: number; t0: number;
    pcx: number; pcy: number; pdist: number; timer: number | null; longFired: boolean;
  } = { mode: 'none', id: -1, sx: 0, sy: 0, lx: 0, ly: 0, t0: 0, pcx: 0, pcy: 0, pdist: 0, timer: null, longFired: false };

  /** Minimal MouseEvent stand-in so the existing mouse handlers can be driven by touches. */
  private fakeMouse(x: number, y: number, button = 0, shift = false, extra: Record<string, unknown> = {}): MouseEvent {
    return {
      clientX: x, clientY: y, button, shiftKey: shift || this.touchAddMode, ctrlKey: false, metaKey: false, altKey: false,
      movementX: 0, movementY: 0, detail: 1, target: this.renderer.webglRenderer.domElement,
      preventDefault() {}, stopPropagation() {}, ...extra
    } as unknown as MouseEvent;
  }

  /** True when a touch started on the bare 3D view (not on a button / panel / minimap). */
  private isGameSurface(el: EventTarget | null): boolean {
    const n = el as HTMLElement | null;
    if (!n) return false;
    return n === this.renderer.webglRenderer.domElement || n === this.renderer.container || n.id === 'app' || n.id === 'ui-container' || n === document.body;
  }

  private setupTouch() {
    const opts = { passive: false } as AddEventListenerOptions;
    // iPad Safari: stop pinch-zoom / double-tap-zoom / rubber-banding from stealing gestures
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    window.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    window.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);
  }

  private clearTouchTimer() {
    if (this.touch.timer !== null) { clearTimeout(this.touch.timer); this.touch.timer = null; }
  }

  /** Forget any in-flight touch gesture (menu opened, tab hidden, new match): a lost touchend must not leave the next tap misread. */
  public resetTouch() {
    this.clearTouchTimer();
    this.touch.mode = 'none'; this.touch.longFired = false;
    this.cancelTouchBox();
  }

  private cancelTouchBox() {
    if (this.isBoxSelecting) { this.isBoxSelecting = false; this.selectBoxEl.style.display = 'none'; }
  }

  private onTouchStart(e: TouchEvent) {
    this.world.sound.resume();
    const T = this.touch;
    const target = e.target as HTMLElement | null;
    // Minimap: forward as mouse events (jump camera / issue move orders by dragging)
    const mm = target?.closest?.('#minimap-slot canvas') as HTMLElement | null;
    if (mm && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0]!;
      T.mode = 'minimap'; T.id = t.identifier;
      mm.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY, button: 0, bubbles: true }));
      return;
    }
    if (!this.isGameSurface(target)) {
      // buttons / panels keep their normal touch -> click behaviour. A lone finger on the HUD also clears any gesture left
      // over from a lost touchend (iPad), so that stale state can never preventDefault() this tap and swallow the click.
      if (e.touches.length === 1) this.resetTouch();
      return;
    }
    e.preventDefault();

    // --- Possessed (1st/3rd person): drag = look, tap = fire ---
    if (this.renderer.isFpsMode) {
      const t = e.changedTouches[0]!;
      if (T.mode !== 'look') {
        T.mode = 'look'; T.id = t.identifier; T.sx = T.lx = t.clientX; T.sy = T.ly = t.clientY; T.t0 = performance.now();
      }
      return;
    }

    if (e.touches.length >= 2 && !this.placingBuildingType) { // two fingers: they are opposite corners of the selection rectangle
      this.clearTouchTimer();
      const a = e.touches[0]!, b = e.touches[1]!;
      T.mode = 'box2';
      this.boxStartScreen = { x: a.clientX, y: a.clientY };
      this.boxCurrentScreen = { x: b.clientX, y: b.clientY };
      this.isBoxSelecting = true;
      this.updateSelectionBoxUI();
      return;
    }
    const t = e.touches[0]!;
    T.mode = 'pending'; T.id = t.identifier; T.sx = T.lx = t.clientX; T.sy = T.ly = t.clientY; T.t0 = performance.now(); T.longFired = false;
    this.clearTouchTimer();
    T.timer = window.setTimeout(() => { // long-press = add to / toggle in selection (Shift-click)
      T.timer = null;
      if (T.mode !== 'pending') return;
      T.longFired = true;
      this.touchFuzzyPick = true;
      try {
        const pk = this.pickEntity(T.sx, T.sy);
        if (!pk.unit && !pk.building && !this.placingBuildingType && !this.targetMode) {
          this.touchCancel(); // long-press on empty ground = deselect (a quick tap there is the move order)
        } else {
          this.onMouseDown(this.fakeMouse(T.sx, T.sy, 0, true));
          this.onMouseUp(this.fakeMouse(T.sx, T.sy, 0, true));
        }
      } finally { this.touchFuzzyPick = false; }
      if (navigator.vibrate) navigator.vibrate(15);
    }, 480);
  }

  private onTouchMove(e: TouchEvent) {
    const T = this.touch;
    if (T.mode === 'none') return;
    const target = e.target as HTMLElement | null;
    // only follow the finger that started the gesture (a finger on a HUD button must never be treated as part of it)
    if (T.mode !== 'box2' && !Array.from(e.changedTouches).some(q => q.identifier === T.id)) return;
    if (T.mode === 'minimap') {
      e.preventDefault();
      const t = Array.from(e.touches).find(q => q.identifier === T.id) ?? e.touches[0];
      if (t) window.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY, bubbles: true }));
      return;
    }
    if (!this.isGameSurface(target) && T.mode !== 'look' && T.mode !== 'box2' && T.mode !== 'drag' && T.mode !== 'ghost' && T.mode !== 'pending') return;
    e.preventDefault();

    if (T.mode === 'look') {
      const t = Array.from(e.touches).find(q => q.identifier === T.id);
      if (!t) return;
      const dx = (t.clientX - T.lx) * 1.5, dy = (t.clientY - T.ly) * 1.5;
      T.lx = t.clientX; T.ly = t.clientY;
      this.onMouseMove(this.fakeMouse(t.clientX, t.clientY, 0, false, { movementX: dx, movementY: dy }));
      return;
    }
    if (T.mode === 'box2') {
      if (e.touches.length < 2) return;
      const a = e.touches[0]!, b = e.touches[1]!;
      this.boxStartScreen = { x: a.clientX, y: a.clientY };
      this.boxCurrentScreen = { x: b.clientX, y: b.clientY };
      this.updateSelectionBoxUI();
      return;
    }
    const t = Array.from(e.touches).find(q => q.identifier === T.id) ?? e.touches[0];
    if (!t) return;
    if (T.mode === 'pending') {
      if (Math.hypot(t.clientX - T.sx, t.clientY - T.sy) < 12) return;
      this.clearTouchTimer();
      T.mode = this.placingBuildingType ? 'ghost' : 'drag';
    }
    if (T.mode === 'ghost') this.onMouseMove(this.fakeMouse(t.clientX, t.clientY));
    else if (T.mode === 'drag') {
      // One finger drags the map: the ground follows the finger
      const cam = this.renderer.camera;
      const kx = (2 * this.renderer.cameraDistance * Math.tan((cam.fov * Math.PI) / 360)) / window.innerHeight;
      const ky = kx / Math.max(0.4, Math.sin(this.renderer.cameraAngle));
      this.renderer.panCamera(-(t.clientX - T.lx) * kx, -(t.clientY - T.ly) * ky);
    }
    T.lx = t.clientX; T.ly = t.clientY;
  }

  private onTouchEnd(e: TouchEvent) {
    const T = this.touch;
    if (T.mode === 'none') return;
    if (T.mode !== 'box2' && !Array.from(e.changedTouches).some(q => q.identifier === T.id)) return; // another finger lifted
    if (T.mode === 'minimap') {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: T.lx, clientY: T.ly, button: 0, bubbles: true }));
      T.mode = 'none';
      return;
    }
    this.world.sound.resume();
    if (T.mode === 'box2') {
      // finishing the two-finger rectangle as soon as either finger lifts
      const a = e.changedTouches[0];
      if (a && e.touches.length === 1) {
        const rest = e.touches[0]!;
        this.boxStartScreen = { x: a.clientX, y: a.clientY };
        this.boxCurrentScreen = { x: rest.clientX, y: rest.clientY };
      }
      this.onMouseUp(this.fakeMouse(this.boxCurrentScreen.x, this.boxCurrentScreen.y, 0));
      this.cancelTouchBox();
      T.mode = e.touches.length === 0 ? 'none' : 'drag';
      if (T.mode === 'drag') { T.lx = e.touches[0]!.clientX; T.ly = e.touches[0]!.clientY; T.mode = 'none'; }
      return;
    }
    const t = e.changedTouches[0];
    const x = t?.clientX ?? T.lx, y = t?.clientY ?? T.ly;
    this.clearTouchTimer();
    if (T.mode === 'look') {
      const moved = Math.hypot(x - T.sx, y - T.sy);
      if (e.touches.length === 0) {
        if (moved < 12 && performance.now() - T.t0 < 350) this.onMouseDown(this.fakeMouse(x, y, 0)); // tap = fire
        T.mode = 'none';
      }
      return;
    }
    if (T.mode === 'drag') {
      // finger-drag pan: nothing to finish
    } else if (T.mode === 'ghost') {
      this.onMouseMove(this.fakeMouse(x, y));
      this.onMouseDown(this.fakeMouse(x, y, 0)); // confirm building placement where the finger lifted
    } else if (T.mode === 'pending' && !T.longFired) {
      this.touchTap(x, y);
    }
    if (e.touches.length === 0) T.mode = 'none';
  }

  /** A quick tap: place / attack-move / select / or issue the right-click order depending on context. */
  private touchTap(x: number, y: number) {
    this.touchFuzzyPick = true;
    try { this.touchTapInner(x, y); } finally { this.touchFuzzyPick = false; }
  }
  private touchTapInner(x: number, y: number) {
    if (this.placingBuildingType) {
      this.onMouseMove(this.fakeMouse(x, y));
      this.onMouseDown(this.fakeMouse(x, y, 0));
      return;
    }
    if (this.targetMode) { this.onMouseDown(this.fakeMouse(x, y, 0)); return; }
    const pk = this.pickEntity(x, y);
    const own = (!!pk.unit && pk.unit.playerId === 'player') || (!!pk.building && pk.building.playerId === 'player');
    const haveSel = this.world.selectedEntities.some(en => (en instanceof Unit || en instanceof Building) && en.playerId === 'player');
    if (haveSel && !this.touchAddMode && (!own || this.touchOwnBuildingOrder(pk.building))) {
      this.onMouseDown(this.fakeMouse(x, y, 2)); // move / attack / harvest / set rally / enter / repair
    } else {
      this.onMouseDown(this.fakeMouse(x, y, 0));
      this.onMouseUp(this.fakeMouse(x, y, 0));
    }
  }

  /** Tapping an own structure with units selected: true when at least one selected unit has an order for it
   *  (gather gas, enter bunker / Nydus, repair / finish, return cargo) so the tap should be a command, not a select. */
  private touchOwnBuildingOrder(b: Building | null): boolean {
    if (!b || b.playerId !== 'player') return false;
    const units = this.world.selectedEntities.filter((e): e is Unit => e instanceof Unit && e.playerId === 'player' && !isLarvaKind(e.type));
    if (!units.length) return false;
    const gas = b.type === 'refinery' || b.type === 'extractor' || b.type === 'assimilator';
    return units.some(u => {
      const worker = isWorkerType(u.type);
      if (gas && worker && b.isConstructed) return true;
      if (b.type === 'bunker' && b.isConstructed && BUNKER_LOADABLE.has(u.type)) return true;
      if ((b.type === 'nydus_network' || b.type === 'nydus_worm') && b.isConstructed && !u.isFlying) return true;
      if (worker && (!b.isConstructed || (b.health < b.maxHealth && canRepairTarget(u, b)))) return true;
      if (worker && isTownHallType(b.type) && u.carriedAmount > 0) return true;
      return false;
    });
  }

  /** Select every friendly combat unit (touch toolbar "Army"). */
  public selectAllArmy() {
    this.world.selectedEntities.forEach(en => en.isSelected = false);
    const army = this.world.units.filter(u => u.playerId === 'player' && !u.isDead && !isWorkerType(u.type));
    army.forEach(u => u.isSelected = true);
    this.world.selectedEntities = army;
    if (army.length) this.world.sound.playUnitGreeting(army[0]!.type); else this.ui.showToast('No army units', true);
  }

  /** Select the next idle worker (touch toolbar "Idle"). */
  public selectIdleWorker() {
    const idle = this.world.units.filter(u => u.playerId === 'player' && !u.isDead && isWorkerType(u.type) && !u.isGathering && !u.currentCommand);
    if (!idle.length) { this.ui.showToast('No idle workers', true); return; }
    const u = idle[(this.idleCycle++) % idle.length]!;
    this.world.selectedEntities.forEach(en => en.isSelected = false);
    u.isSelected = true; this.world.selectedEntities = [u];
    this.renderer.setCameraTarget(u.pos.x, u.pos.y);
    this.world.sound.playUnitGreeting(u.type);
  }
  private idleCycle = 0;

  /** Deselect everything / cancel placement or targeting (touch toolbar "Cancel"). */
  public touchCancel() {
    if (this.placingBuildingType) { this.cancelBuildingPlacement(); return; }
    if (this.targetMode) { this.cancelTargetMode(); return; }
    this.world.selectedEntities.forEach(en => en.isSelected = false);
    this.world.selectedEntities = [];
  }

  /** Synthesize a key press so on-screen buttons reuse every existing hotkey. */
  public pressKey(key: string, opts: { ctrl?: boolean; hold?: boolean } = {}) {
    const code = key.length === 1 && key >= '0' && key <= '9' ? 'Digit' + key : key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key;
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, ctrlKey: !!opts.ctrl, bubbles: true }));
    if (!opts.hold) window.dispatchEvent(new KeyboardEvent('keyup', { key, code, ctrlKey: !!opts.ctrl, bubbles: true }));
  }
  public releaseKey(key: string) {
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  /** Control-group helpers used by the touch toolbar. */
  public assignGroup(n: number) { this.pressKey(String(n), { ctrl: true }); }
  public recallGroup(n: number) { this.pressKey(String(n)); }

  /**
   * Pick the unit / building under the cursor by raycasting against its visible model
   * (the real silhouette), not its ground footprint. Nearest hit wins; units beat buildings on ties.
   */
  private pickEntity(clientX: number, clientY: number): { unit: Unit | null; building: Building | null } {
    this.mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec, this.renderer.camera);
    const ray = this.raycaster.ray;
    const tmp = new THREE.Vector3();
    let bestU: Unit | null = null, bestUd = Infinity;
    let bestB: Building | null = null, bestBd = Infinity;
    const test = (mesh: THREE.Object3D | null, cx: number, cy: number, cz: number, r: number): number => {
      if (!mesh || !mesh.visible) return Infinity;
      tmp.set(cx, cy, cz);
      if (ray.distanceToPoint(tmp) > r) return Infinity; // coarse cull
      // skinned models: the cached bind-time bounding sphere can be nowhere near the animated pose (e.g. a rolling Baneling), which made
      // some units impossible to click; refresh it from the current skeleton before raycasting
      mesh.traverse(o => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh && !o.userData.isOutlineHull) { sm.skeleton?.update(); sm.computeBoundingSphere(); (sm as any).boundingBox = null; /* a stale cached box (from Box3.setFromObject) would cull every ray */ } });
      const hits = this.raycaster.intersectObject(mesh, true);
      for (const h of hits) { const ud = h.object.userData; if (!ud.isOutlineHull && !ud.noPick && !ud.contactShadow) return h.distance; } // ground decals (Pylon power field, contact shadow) aren't the model
      return Infinity;
    };
    for (const u of this.world.units) {
      if (u.isDead) continue;
      const d = test(u.mesh, u.pos.x, u.height + 1.0, u.pos.y, u.radius + 2.5);
      if (d < bestUd) { bestUd = d; bestU = u; }
    }
    for (const b of this.world.buildings) {
      if (b.isDead) continue;
      const d = test(b.mesh, b.pos.x, b.height + 1.5, b.pos.y, b.radius + 3.0);
      if (d < bestBd) { bestBd = d; bestB = b; }
    }
    // A building only wins if it is clearly nearer the camera than the unit
    if (bestU && bestB && bestBd < bestUd - 0.5) bestU = null; else if (bestU) bestB = null;
    // Fingers are imprecise: a tap that misses every model (or lands on a building) snaps to the nearest unit on screen
    if (this.touchFuzzyPick && !bestU && !this.tapOnResource(clientX, clientY)) {
      const near = this.nearestUnitOnScreen(clientX, clientY, bestB ? 18 : 32);
      if (near) return { unit: near, building: null };
    }
    return { unit: bestU, building: bestB };
  }

  /** A tap on a mineral patch / geyser keeps meaning "harvest that", never snaps to a nearby worker. */
  private tapOnResource(clientX: number, clientY: number): boolean {
    const g = this.getGroundIntersection(clientX, clientY);
    if (!g) return false;
    return this.world.resourceNodes.some(r => Math.hypot(r.pos.x - g.x, r.pos.y - g.z) <= r.radius + 0.2);
  }

  /** True while a touch tap / long-press is being resolved, so pickEntity uses the fuzzy fallback. */
  private touchFuzzyPick = false;

  /** Nearest visible unit whose on-screen centre is within maxPx of the point; the player's own units get a small head start. */
  private nearestUnitOnScreen(clientX: number, clientY: number, maxPx: number): Unit | null {
    const v = new THREE.Vector3();
    const cam = this.renderer.camera;
    let best: Unit | null = null, bestD = Infinity;
    for (const u of this.world.units) {
      if (u.isDead || !u.mesh || !u.mesh.visible) continue;
      v.set(u.pos.x, u.height + 0.6, u.pos.y).project(cam);
      if (v.z > 1) continue; // behind the camera
      const sx = (v.x + 1) / 2 * window.innerWidth, sy = (1 - v.y) / 2 * window.innerHeight;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d > maxPx) continue;
      const score = d - (u.playerId === 'player' ? 8 : 0);
      if (score < bestD) { bestD = score; best = u; }
    }
    return best;
  }

  // Get 3D intersection on terrain surface (including high-ground plateaus at y = 2.25) from screen mouse coordinates
  private getGroundIntersection(clientX: number, clientY: number): THREE.Vector3 | null {
    this.mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec, this.renderer.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    if (!hit) return null;

    // 2-step terrain elevation refinement so clicking on high-ground plateaus (y = 2.25) is 100% cursor-accurate
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) > 0.05) {
      const h1 = ProceduralGrassSystem.getTerrainHeight(hit.x, hit.z);
      const t1 = (h1 - ray.origin.y) / ray.direction.y;
      if (t1 > 0) {
        const x1 = ray.origin.x + ray.direction.x * t1;
        const z1 = ray.origin.z + ray.direction.z * t1;
        const h2 = ProceduralGrassSystem.getTerrainHeight(x1, z1);
        const t2 = (h2 - ray.origin.y) / ray.direction.y;
        if (t2 > 0) {
          hit.set(
            ray.origin.x + ray.direction.x * t2,
            h2,
            ray.origin.z + ray.direction.z * t2
          );
        }
      }
    }
    return hit;
  }

  private swapReticle = new SwapReticle();
  private swapTarget: Unit | null = null;
  private swapCooldown = 0;
  private swapAccum = 0;

  /** 3rd-person only: find the friendly unit under the crosshair (screen centre) and drive the reticle. */
  private updateSwapTarget(me: Unit, dt: number) {
    if (this.renderer.viewMode !== 'tps' || this.world.routesOrders) {
      this.swapTarget = null;
      this.swapReticle.hide();
      return;
    }
    this.swapCooldown = Math.max(0, this.swapCooldown - dt);
    this.swapAccum += dt;
    if (this.swapAccum >= 0.08 || !this.swapTarget) {
      this.swapAccum = 0;
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      let best: Unit | null = null;
      let bestD = 64; // px pick radius around the crosshair
      let bsx = 0, bsy = 0;
      const v = new THREE.Vector3();
      const tp = new THREE.Vector3();
      const cam = this.renderer.camera.position;
      for (const u of this.world.units) {
        if (u === me || u.isDead || u.playerId !== 'player') continue;
        tp.set(u.pos.x, u.height + (u.isFlying ? Unit.CRUISE_ALTITUDE * 0.5 : 0.6), u.pos.y);
        v.copy(tp).project(this.renderer.camera);
        if (v.z >= 1 || v.z < -1) continue;
        const sx = ((v.x + 1) * window.innerWidth) / 2;
        const sy = ((1 - v.y) * window.innerHeight) / 2;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestD && this.hasSwapLineOfSight(cam, tp)) { bestD = d; best = u; bsx = sx; bsy = sy; }
      }
      this.swapTarget = best;
      this.swapSx = bsx; this.swapSy = bsy;
    }
    if (this.swapTarget && !this.swapTarget.isDead) {
      this.swapReticle.showSwap(this.swapTarget.type.replace(/_/g, ' ').toUpperCase(), this.swapSx, this.swapSy);
    } else {
      this.swapTarget = null;
      this.swapReticle.showCross();
    }
  }
  /** Ray from the camera to the target: blocked by terrain/cliffs or by standing buildings. */
  private hasSwapLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 3) return true;
    const steps = Math.min(60, Math.ceil(len / 0.8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t, y = from.y + dy * t, z = from.z + dz * t;
      const remaining = len * (1 - t);
      if (t * len < 2.0) continue; // ignore the camera's immediate surroundings
      if (remaining < 0.7) break; // don't let the target's own ground/footprint block it
      {
        if (y < ProceduralGrassSystem.getTerrainHeight(x, z) - 0.05) return false;
        for (const b of this.world.buildings) {
          if (b.walkable || b.isDead) continue;
          if (y < b.height + 2.0 && Math.hypot(x - b.pos.x, z - b.pos.y) < b.radius * 0.85) {
            if (Math.hypot(to.x - b.pos.x, to.z - b.pos.y) < b.radius * 0.85) continue; // target stands at this building
            return false;
          }
        }
      }
    }
    return true;
  }
  private swapSx = 0;
  private swapSy = 0;

  /** Possess `target` instead of the current unit; the old unit goes back to idle AI control. */
  private hotSwap(target: Unit) {
    const old = this.renderer.fpsUnit as Unit | null;
    if (!target || target.isDead || target === old || this.swapCooldown > 0) return;
    this.swapCooldown = 0.3;
    if (old && !old.isDead) {
      old.setCommand({ type: 'stop' } as any);
    }
    target.isGathering = false;
    target.targetNodeId = null;
    this.world.selectedEntities.forEach(ent => ent.isSelected = false);
    target.isSelected = true;
    this.world.selectedEntities = [target];
    this.renderer.swapViewUnit(target);
    this.world.sound.playCommandConfirm();
    this.ui.showToast(`Swapped to ${target.type.replace(/_/g, ' ').toUpperCase()}`);
  }

  /** Cycle possession to the next friendly unit (Tab). */
  private cycleSwap(dir: number) {
    const me = this.renderer.fpsUnit as Unit | null;
    const pool = this.world.units.filter(u => u.playerId === 'player' && !u.isDead);
    if (!me || pool.length < 2) return;
    const i = pool.indexOf(me);
    this.hotSwap(pool[(i + dir + pool.length) % pool.length]!);
  }

  private onMouseDown(e: MouseEvent) {
    // Check if clicking inside UI elements (except FPS exit button)
    if (!this.renderer.isFpsMode && ((e.target as HTMLElement).closest('.sc2-bottom-console') || (e.target as HTMLElement).closest('.sc2-top-bar'))) {
      return;
    }

    this.world.sound.resume();

    // 0. First-Person (FPS) & Third-Person (TPS) Mode Controls
    if (this.renderer.isFpsMode && this.renderer.fpsUnit) {
      if (e.button === 0) {
        if (this.swapTarget && this.renderer.viewMode === 'tps') {
          this.hotSwap(this.swapTarget);
          return;
        }
        this.fireFpsWeapon();
        return;
      } else if (e.button === 2) {
        e.preventDefault();
        this.fireSecondaryFpsWeapon();
        return;
      }
    }

    // Middle click pan
    if (e.button === 1) {
      e.preventDefault();
      this.isMiddlePanning = true;
      this.middleStart = { x: e.clientX, y: e.clientY };
      return;
    }

    // Left click
    if (e.button === 0) {
      const groundHit = this.getGroundIntersection(e.clientX, e.clientY);
      if (!groundHit) return;

      // 1. Placement Mode click
      if (this.placingBuildingType) {
        if (this.isPlacementValid) {
          this.confirmBuildingPlacement();
        } else {
          this.ui.showToast('Invalid building location!', true);
        }
        return;
      }

      // 1b. Targeted ability click
      if (this.abilityTargetId) {
        const id = this.abilityTargetId;
        this.abilityTargetId = null;
        this.world.decals.clearPlacementGhost();
        document.body.style.cursor = '';
        const pk = this.pickEntity(e.clientX, e.clientY);
        const gp = { x: groundHit.x, y: groundHit.z };
        const node = this.world.resourceNodes.find(r => Math.hypot(r.pos.x - gp.x, r.pos.y - gp.y) <= r.radius + 0.6) ?? null;
        (window as any).gameApp.castAbilityAt(id, { pos: gp, entity: pk.unit ?? pk.building ?? null, nodeId: node?.id ?? null });
        return;
      }

      // 2a. Set Rally Point (command card Rally button / Y): same as right-clicking with the structure(s) selected
      if (this.targetMode === 'rally') {
        this.cancelTargetMode();
        this.handleRightClickOrder(groundHit, this.pickEntity(e.clientX, e.clientY));
        return;
      }

      // 2b. Patrol / Repair / Load targeting clicks
      if (this.targetMode === 'patrol' || this.targetMode === 'repair' || this.targetMode === 'load') {
        const mode = this.targetMode;
        this.cancelTargetMode();
        this.handleTargetClick(mode, groundHit, this.pickEntity(e.clientX, e.clientY));
        return;
      }

      // 2. Attack-Move click
      if (this.isAttackMoveMode) {
        this.isAttackMoveMode = false;
        document.body.style.cursor = '';
        const playerUnits = this.world.selectedEntities.filter(
          ent => ent instanceof Unit && ent.playerId === 'player'
        ) as Unit[];
        playerUnits.forEach(ent => {
          ent.setCommand({ type: 'attack_move', targetPos: { x: groundHit.x, y: groundHit.z }, queued: this.shiftHeld() });
        });
        if (playerUnits.length > 0) {
          this.world.sound.playUnitOrder(playerUnits[0]!.type, 'attack');
        } else {
          this.world.sound.playCommandConfirm();
        }
        return;
      }

      // 3. Start Marquee drag box
      this.isBoxSelecting = true;
      this.boxStartScreen = { x: e.clientX, y: e.clientY };
      this.boxCurrentScreen = { x: e.clientX, y: e.clientY };
      this.updateSelectionBoxUI();
    }

    // Right click: Context action (Move / Attack / Harvest / Repair / Set Rally)
    if (e.button === 2) {
      e.preventDefault();

      // Cancel placement or attack-move if active
      if (this.placingBuildingType) {
        this.cancelBuildingPlacement();
        return;
      }
      if (this.abilityTargetId) { this.cancelAbilityTarget(); return; }
      if (this.targetMode) { this.cancelTargetMode(); return; }

      const groundHit = this.getGroundIntersection(e.clientX, e.clientY);
      if (!groundHit) return;

      this.handleRightClickOrder(groundHit, this.pickEntity(e.clientX, e.clientY));
    }
  }

  private lastCursorUpdate = 0;

  /** SC2-style context-aware cursor: ally = green, enemy = red, resource = gold, repair = green +. */
  private hoverMesh: THREE.Object3D | null = null;
  /** Show the hover silhouette on exactly one thing (or nothing). */
  private setHoverTarget(mesh: THREE.Object3D | null, kind: string | null) {
    if (this.hoverMesh && this.hoverMesh !== mesh) Outline.setHover(this.hoverMesh, null);
    this.hoverMesh = mesh;
    if (mesh && kind) Outline.setHover(mesh, kind);
  }

  private updateContextCursor(e: MouseEvent) {
    const now = performance.now();
    if (now - this.lastCursorUpdate < 30) return;
    this.lastCursorUpdate = now;

    const el = e.target as HTMLElement | null;
    if (el && (el.closest('.sc2-bottom-console') || el.closest('.sc2-top-bar') || el.closest('.main-menu') || el.closest('.sc2-modal-overlay'))) {
      this.setHoverTarget(null, null);
      const dc = cursorCss('default');
      if (document.body.style.cursor !== dc) document.body.style.cursor = dc;
      return;
    }

    let kind: CursorKind = 'default';
    let hoverMesh: THREE.Object3D | null = null, hoverKind: string | null = null, hoverUnit: Unit | null = null;
    if (this.targetMode) {
      kind = this.targetMode === 'attack' ? 'attack' : this.targetMode === 'patrol' ? 'patrol' : this.targetMode === 'repair' ? 'repair' : 'ally';
    }
    if (!this.placingBuildingType) {
      const g = this.getGroundIntersection(e.clientX, e.clientY);
      if (g) {
        const px = g.x, py = g.z;
        const hasWorker = this.world.selectedEntities.some(s => s instanceof Unit && s.playerId === 'player' && isWorkerType(s.type));
        const hasScv = this.world.selectedEntities.some(s => s instanceof Unit && s.playerId === 'player' && s.type === 'scv');
        const pk = this.pickEntity(e.clientX, e.clientY);
        const u = pk.unit;
        const setKind = (k: CursorKind) => { if (!this.targetMode) kind = k; };
        if (u) {
          setKind(u.playerId !== 'player' ? 'enemy' : hasScv && u.health < u.maxHealth && canRepairTarget({ type: 'scv', id: '', playerId: 'player' }, u) ? 'repair' : 'ally');
          hoverMesh = u.mesh; hoverKind = u.playerId === 'player' ? 'ally' : 'enemy'; hoverUnit = u;
        } else {
          const b = pk.building;
          if (b) {
            if (b.playerId !== 'player') setKind('enemy');
            else setKind((hasScv && b.health < b.maxHealth && canRepairTarget({ type: 'scv', id: '', playerId: 'player' }, b)) || (hasWorker && !b.isConstructed) ? 'repair' : 'ally');
            hoverMesh = b.mesh; hoverKind = b.playerId === 'player' ? 'ally' : 'enemy';
          } else {
            const r = this.world.resourceNodes.find(
              q => q.mesh?.visible !== false && Math.hypot(q.pos.x - px, q.pos.y - py) <= q.radius + 0.2
            );
            if (r) { setKind('resource'); hoverMesh = r.mesh; hoverKind = 'resource'; }
          }
        }
      }
    }
    // Snipe targeting: green reticle over a unit it can hit (enemy, not a structure), otherwise the red reticle with the X
    if (this.abilityTargetId === 'snipe' || this.abilityTargetId === 'steady_targeting') {
      const ok = !!hoverUnit && hoverUnit.playerId !== 'player' && !hoverUnit.isDead;
      kind = ok ? 'snipeOk' : 'enemy';
    }
    this.setHoverTarget(hoverMesh, hoverKind);
    const css = cursorCss(kind);
    if (document.body.style.cursor !== css) document.body.style.cursor = css;
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.renderer.isFpsMode && !this.isMiddlePanning) this.updateContextCursor(e);
    else this.setHoverTarget(null, null);
    // 0. FPS & TPS Aiming (Horizontal trackpad inverted as requested)
    if (this.renderer.isFpsMode && this.renderer.fpsUnit) {
      const dx = (e.movementX || 0) * 0.0035;
      const dy = (e.movementY || 0) * 0.0035;
      // Invert horizontal trackpad/mouse
      this.renderer.fpsYaw -= dx;
      this.renderer.fpsPitch = Math.max(-0.85, Math.min(0.85, this.renderer.fpsPitch - dy));
      if (this.renderer.viewMode === 'fps') {
        this.renderer.fpsUnit.rotation = this.renderer.fpsYaw;
      }
      return;
    }

    // Middle pan
    if (this.isMiddlePanning) {
      const dx = (e.clientX - this.middleStart.x) * 0.08;
      const dz = (e.clientY - this.middleStart.y) * 0.08;
      this.renderer.panCamera(-dx, -dz);
      this.middleStart = { x: e.clientX, y: e.clientY };
      return;
    }

    // Box select drag
    if (this.isBoxSelecting) {
      this.boxCurrentScreen = { x: e.clientX, y: e.clientY };
      this.updateSelectionBoxUI();
      return;
    }

    this.lastCursor = { x: e.clientX, y: e.clientY };
    this.refreshPlacementGhost();
  }

  private lastCursor: { x: number; y: number } | null = null;

  /** Recompute the placement / landing ghost at the last cursor position (also called every frame so it tracks creep spread). */
  private refreshPlacementGhost() {
    if (!this.lastCursor) return;
    const cx = this.lastCursor.x, cy = this.lastCursor.y;
    // Landing a flying structure: show the same green / red ghost as placing a new building, snapped like the real landing
    if (this.abilityTargetId === 'land') {
      const lb = this.world.selectedEntities.find(en => en instanceof Building && en.playerId === 'player' && en.isAirborne) as Building | undefined;
      const gh = lb ? this.getGroundIntersection(cx, cy) : null;
      if (lb && gh) {
        const cfg = BUILDING_CONFIGS[lb.type];
        const res = this.world.resolvePlacement(lb.type, { x: gh.x, y: gh.z });
        this.world.decals.setPlacementGhost(res.pos, cfg.footprint.width, cfg.footprint.height, res.ok, ModelFactory.yawFor(lb.type), lb.type);
      }
    }

    // Building Placement Ghost update
    if (this.placingBuildingType) {
      const groundHit = this.getGroundIntersection(cx, cy);
      if (groundHit) {
        const config = BUILDING_CONFIGS[this.placingBuildingType];
        // SC2 rules: grid snap, geyser snap for gas buildings, town-hall resource spacing (see GameWorld.resolvePlacement)
        const res = this.world.resolvePlacement(this.placingBuildingType, { x: groundHit.x, y: groundHit.z });
        this.placementPos = res.pos;
        this.isPlacementValid = res.ok;
        this.world.decals.setPlacementGhost(
          this.placementPos,
          config.footprint.width,
          config.footprint.height,
          res.ok,
          ModelFactory.yawFor(this.placingBuildingType),
          this.placingBuildingType
        );
      }
    }
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 1) {
      this.isMiddlePanning = false;
    }

    if (e.button === 0 && this.isBoxSelecting) {
      this.isBoxSelecting = false;
      this.selectBoxEl.style.display = 'none';

      const dx = Math.abs(e.clientX - this.boxStartScreen.x);
      const dy = Math.abs(e.clientY - this.boxStartScreen.y);

      if (dx < 6 && dy < 6) {
        // Single point click
        this.handleSingleClickSelect(e);
      } else {
        // Drag box select
        this.handleBoxSelection(e.shiftKey);
      }
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();

    // 1. In FPS or TPS mode, handle trackpad gestures & view adjustments
    if (this.renderer.isFpsMode) {
      if (e.ctrlKey) {
        // Pinch-to-zoom on trackpad adjusts 3rd person follow distance
        if (this.renderer.viewMode === 'tps') {
          this.renderer.tpsFollowDist = Math.max(3.0, Math.min(10.0, this.renderer.tpsFollowDist + e.deltaY * 0.04));
        }
        return;
      }

      // Discrete mouse wheel in TPS mode adjusts camera distance
      if (this.renderer.viewMode === 'tps' && (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50)) {
        this.renderer.tpsFollowDist = Math.max(3.0, Math.min(10.0, this.renderer.tpsFollowDist + Math.sign(e.deltaY) * 0.5));
      }

      // Two-finger swipe on trackpad horizontally turns camera (inverted)
      if (Math.abs(e.deltaX) > 0) {
        this.renderer.fpsYaw -= e.deltaX * 0.003;
        if (this.renderer.fpsUnit && this.renderer.viewMode === 'fps') {
          this.renderer.fpsUnit.rotation = this.renderer.fpsYaw;
        }
      }
      return;
    }

    // 2. Pinch-to-zoom gesture on trackpad (macOS fires e.ctrlKey = true)
    if (e.ctrlKey) {
      const zoomDelta = e.deltaY * 0.06;
      this.renderer.zoomCamera(zoomDelta);
      return;
    }

    // 3. Trackpad vs Physical Mouse Wheel Disambiguation (SC2 Mac Trackpad Standard)
    // Check for distinct trackpad characteristics:
    // - Subpixel/non-integer deltas (trackpads emit fractional values like 1.5, 3.25)
    // - Horizontal motion (deltaX != 0)
    // - Low initial deltas (< 45) indicative of smooth acceleration curves
    const hasTrackpadSignature =
      Math.abs(e.deltaX) > 0 ||
      !Number.isInteger(e.deltaY) ||
      !Number.isInteger(e.deltaX) ||
      Math.abs(e.deltaY) < 45;

    if (hasTrackpadSignature) {
      this.isTrackpadActive = true;
      if (this.trackpadResetTimer !== null) {
        clearTimeout(this.trackpadResetTimer);
      }
      this.trackpadResetTimer = window.setTimeout(() => {
        this.isTrackpadActive = false;
        this.trackpadResetTimer = null;
      }, 250);
    }

    // If an active trackpad gesture is underway, STRICTLY pan the camera (NEVER zoom)
    if (this.isTrackpadActive) {
      const panSpeed = 0.045;
      this.renderer.panCamera(e.deltaX * panSpeed, e.deltaY * panSpeed);
      return;
    }

    // Discrete physical mouse wheel notch:
    // When deltaMode is non-pixel, or large integer wheel step with 0 deltaX and no active trackpad stream
    const isPhysicalMouseWheel =
      e.deltaMode !== 0 ||
      (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));

    if (isPhysicalMouseWheel) {
      const zoomDelta = Math.sign(e.deltaY) * 3.0;
      this.renderer.zoomCamera(zoomDelta);
      return;
    }

    // Fallback: Default to smooth pan to prevent any accidental zooming on Mac
    const panSpeed = 0.045;
    this.renderer.panCamera(e.deltaX * panSpeed, e.deltaY * panSpeed);
  }

  private handleSingleClickSelect(e: MouseEvent) {
    const groundHit = this.getGroundIntersection(e.clientX, e.clientY);
    if (!groundHit) return;

    // Check if clicked an entity
    const clickPos = { x: groundHit.x, y: groundHit.z };

    // 1. Check friendly / enemy units
    const picked = this.pickEntity(e.clientX, e.clientY);
    const clickedUnit = picked.unit && !picked.unit.scripted ? picked.unit : undefined; // mission-scripted allies can't be selected

    // 2. Check buildings
    const clickedBuilding = picked.building ?? undefined;

    // 3. Check natural resource nodes (minerals / gas)
    const clickedResource = this.world.resourceNodes.find(
      r => Math.hypot(r.pos.x - clickPos.x, r.pos.y - clickPos.y) <= r.radius + 0.2
    );

    if (clickedUnit) {
      if (!e.shiftKey) {
        this.world.selectedEntities.forEach(ent => ent.isSelected = false);
        this.world.selectedEntities = [clickedUnit];
      } else {
        if (clickedUnit.isSelected) {
          clickedUnit.isSelected = false;
          this.world.selectedEntities = this.world.selectedEntities.filter(ent => ent !== clickedUnit);
        } else {
          this.world.selectedEntities.push(clickedUnit);
        }
      }
      clickedUnit.isSelected = true;
      // Ctrl+click or double-click: select every on-screen friendly unit of the same type
      const now = performance.now();
      if (clickedUnit.playerId === 'player' && (e.ctrlKey || e.metaKey)) {
        this.selectAllOnScreenOfType(clickedUnit);
      } else if (clickedUnit.playerId === 'player' && !e.shiftKey && this.lastClickEnt === clickedUnit && now - this.lastClickTime < 400) {
        this.selectAllOnScreenOfType(clickedUnit);
      }
      this.lastClickEnt = clickedUnit;
      this.lastClickTime = now;
      if (clickedUnit.playerId === 'player') {
        this.world.sound.playUnitGreeting(clickedUnit.type);
      } else {
        this.world.sound.playCommandConfirm();
      }
    } else if (clickedBuilding) {
      this.world.selectedEntities.forEach(ent => ent.isSelected = false);
      clickedBuilding.isSelected = true;
      this.world.selectedEntities = [clickedBuilding];
      const nowB = performance.now();
      if (clickedBuilding.playerId === 'player' && this.lastClickEnt === clickedBuilding && nowB - this.lastClickTime < 400) {
        this.selectAllOnScreenOfType(clickedBuilding);
      }
      this.lastClickEnt = clickedBuilding;
      this.lastClickTime = nowB;
      if (clickedBuilding.playerId === 'player' && GameWorld.buildingRaceOf(clickedBuilding.type) === 'zerg') this.world.sound.playZergStructureSelect(clickedBuilding.type);
      else this.world.sound.playCommandConfirm();
    } else if (clickedResource) {
      this.world.selectedEntities.forEach(ent => ent.isSelected = false);
      clickedResource.isSelected = true;
      this.world.selectedEntities = [clickedResource as any];
      this.world.sound.playCommandConfirm();
    } else {
      // Clicked empty ground: clear selection
      if (!e.shiftKey) {
        this.world.selectedEntities.forEach(ent => ent.isSelected = false);
        this.world.selectedEntities = [];
      }
    }
  }

  private lastClickEnt: any = null;
  private lastClickTime = 0;

  /** Select all of the player's on-screen units (or buildings) matching the clicked entity's type. */
  private selectAllOnScreenOfType(ref: Unit | Building) {
    const onScreen = (x: number, y: number, h: number) => {
      const p = new THREE.Vector3(x, h, y).project(this.renderer.camera);
      return p.z < 1 && p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1;
    };
    const pool: (Unit | Building)[] = ref instanceof Building ? this.world.buildings : this.world.units;
    const matches = pool.filter(e =>
      e.playerId === 'player' && e.type === ref.type && !(e as any).isDead && onScreen(e.pos.x, e.pos.y, e.height)
    );
    this.world.selectedEntities.forEach(ent => ent.isSelected = false);
    this.world.selectedEntities = matches;
    matches.forEach(e => e.isSelected = true);
  }

  private handleBoxSelection(isShift: boolean) {
    const minX = Math.min(this.boxStartScreen.x, this.boxCurrentScreen.x);
    const maxX = Math.max(this.boxStartScreen.x, this.boxCurrentScreen.x);
    const minY = Math.min(this.boxStartScreen.y, this.boxCurrentScreen.y);
    const maxY = Math.max(this.boxStartScreen.y, this.boxCurrentScreen.y);

    if (!isShift) {
      this.world.selectedEntities.forEach(ent => ent.isSelected = false);
      this.world.selectedEntities = [];
    }

    const foundUnits: Unit[] = [];

    this.world.units.forEach(u => {
      if (u.playerId !== 'player' || u.isDead || u.scripted) return;

      // Project unit world 3D position to 2D screen coordinate
      const screenPos = new THREE.Vector3(u.pos.x, u.height, u.pos.y).project(this.renderer.camera);
      const sx = ((screenPos.x + 1) * window.innerWidth) / 2;
      const sy = ((-screenPos.y + 1) * window.innerHeight) / 2;

      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        foundUnits.push(u);
      }
    });

    // If military combat units exist in selection, filter out workers (classic SC2 military priority)
    // (larva and eggs are only picked up by a box when there is nothing else in it)
    const real = foundUnits.filter(u => !isLarvaKind(u.type));
    const pool = real.length > 0 ? real : foundUnits;
    const combatUnits = pool.filter(u => !isWorkerType(u.type));
    const finalUnits = combatUnits.length > 0 ? combatUnits : pool;

    finalUnits.forEach(u => {
      u.isSelected = true;
      if (!this.world.selectedEntities.includes(u)) {
        this.world.selectedEntities.push(u);
      }
    });

    if (finalUnits.length > 0) {
      this.world.sound.playUnitGreeting(finalUnits[0]!.type);
    }
  }

  /** Enter targeting mode for a targeted ability; the next left click casts it, right click / Esc cancels. */
  public beginAbilityTarget(id: string) {
    this.abilityTargetId = id;
    this.targetMode = null;
    document.body.style.cursor = id === 'land' ? '' : cursorCss('attack'); // Land shows the structure's placement ghost instead
    this.ui.showToast(`${ABILITIES[id]?.name ?? id}: click a target (right-click / Esc cancels)`);
  }

  public cancelAbilityTarget() {
    this.abilityTargetId = null;
    this.world.decals.clearPlacementGhost();
    document.body.style.cursor = '';
  }

  /** Tab / Shift+Tab: make the next unit type in a mixed selection the active subgroup (command card + abilities). */
  private cycleSubgroup(dir: number) {
    const sel = this.world.selectedEntities;
    const order: string[] = [];
    sel.forEach(e => { if (!order.includes(e.type as string)) order.push(e.type as string); });
    if (order.length < 2) return;
    const next = order[(dir > 0 ? 1 : order.length - 1) % order.length]!;
    this.world.selectedEntities = [...sel.filter(e => e.type === next), ...sel.filter(e => e.type !== next)];
    this.ui.showToast(`Active subgroup: ${next.replace(/_/g, ' ')}`);
  }

  private shiftHeld(): boolean { return this.keysPressed.has('SHIFT') || this.touchAddMode; }

  /** Resolve a Patrol / Repair / Load targeting click. */
  private handleTargetClick(mode: 'patrol' | 'repair' | 'load', groundHit: THREE.Vector3, pk: { unit: Unit | null; building: Building | null }) {
    const sel = this.world.selectedEntities;
    const units = sel.filter((e): e is Unit => e instanceof Unit && e.playerId === 'player');
    const queued = this.shiftHeld();
    if (mode === 'patrol') {
      // SC2: units patrol between where they stand now and the clicked point
      const pos = { x: groundHit.x, y: groundHit.z };
      this.world.particles.spawnCommandPing(pos.x, pos.y, 0x38bdf8);
      units.forEach(u => u.setCommand({ type: 'patrol', targetPos: { ...pos }, queued }));
      if (units.length) this.world.sound.playUnitOrder(units[0]!.type, 'move'); else this.world.sound.playCommandConfirm();
      return;
    }
    if (mode === 'repair') {
      const target = (pk.building && pk.building.playerId === 'player' ? pk.building : null) ?? (pk.unit && pk.unit.playerId === 'player' ? pk.unit : null);
      const scvs = units.filter(u => u.type === 'scv');
      if (!scvs.length) { this.ui.showToast('Select an SCV to repair', true); return; }
      if (!target) { this.ui.showToast('Invalid repair target', true); return; }
      const ok = scvs.filter(u => canRepairTarget(u, target));
      if (!ok.length) { this.ui.showToast('Can only repair Terran structures and mechanical units', true); return; }
      if (target.health >= target.maxHealth && ('isConstructed' in target ? target.isConstructed : true)) { this.ui.showToast('Target is already fully repaired', true); return; }
      this.world.particles.spawnCommandPing(target.pos.x, target.pos.y, 0x4ade80);
      ok.forEach(u => u.setCommand({ type: 'repair', targetEntityId: target.id, queued }));
      this.world.sound.playUnitOrder(ok[0]!.type, 'move');
      return;
    }
    // load: Bunker selected, click a friendly Marine / Marauder
    const bunker = sel.find((e): e is Building => e instanceof Building && e.type === 'bunker' && e.playerId === 'player');
    const u = pk.unit;
    if (!bunker || !u || u.playerId !== 'player') { this.ui.showToast('Click a friendly Marine or Marauder', true); return; }
    const why = loadBlockReason(bunker, u);
    if (why) { this.ui.showToast(why, true); return; }
    u.setCommand({ type: 'load', targetEntityId: bunker.id });
    this.world.sound.playUnitOrder(u.type, 'move');
  }

  private handleRightClickOrder(groundHit: THREE.Vector3, picked?: { unit: Unit | null; building: Building | null }) {
    const clickPos = { x: groundHit.x, y: groundHit.z };
    {
      const pe = picked?.unit ?? picked?.building ?? null;
      const hostile = (pe && pe.playerId !== 'player') || this.world.findNearestHostile(clickPos, 'player', 0.8);
      const res = this.world.resourceNodes.some(r => Math.hypot(r.pos.x - clickPos.x, r.pos.y - clickPos.y) <= r.radius + 0.6);
      this.world.particles.spawnCommandPing(clickPos.x, clickPos.y, hostile ? 0xff3b3b : res ? 0xfacc15 : 0x4ade80);
    }

    // Check if clicked on a mineral patch or geyser
    let clickedResource = this.world.resourceNodes.find(
      r => Math.hypot(r.pos.x - clickPos.x, r.pos.y - clickPos.y) <= r.radius + 0.6
    );
    // Picking a gas building directly (tall model: the ground hit can land off the geyser) still means "harvest it"
    if (!clickedResource && picked?.building && picked.building.playerId === 'player'
        && (picked.building.type === 'refinery' || picked.building.type === 'extractor' || picked.building.type === 'assimilator')) {
      const gb = picked.building;
      clickedResource = this.world.resourceNodes.filter(r => r.type === 'vespene')
        .sort((a, b) => Math.hypot(a.pos.x - gb.pos.x, a.pos.y - gb.pos.y) - Math.hypot(b.pos.x - gb.pos.x, b.pos.y - gb.pos.y))[0];
    }

    // Check if clicked an enemy
    const pickedEnt = picked?.unit ?? picked?.building ?? null;
    const clickedEnemy = (pickedEnt && pickedEnt.playerId !== 'player' ? pickedEnt : null)
      ?? this.world.findNearestHostile(clickPos, 'player', 0.8);

    // Check if clicked a friendly building
    const clickedFriendlyBuilding = (picked?.building && picked.building.playerId === 'player' ? picked.building : null)
      ?? this.world.buildings.find(
      b => b.playerId === 'player' && Math.hypot(b.pos.x - clickPos.x, b.pos.y - clickPos.y) <= b.radius * 0.6
    );

    const clickedFriendlyUnit = picked?.unit && picked.unit.playerId === 'player' ? picked.unit : null;

    // Only structures selected: right click (or the Rally button) sets the rally point of every selected production structure
    const selB = this.world.selectedEntities;
    if (selB.length > 0 && selB.every(en => en instanceof Building)) {
      const b0 = selB[0] as Building;
      if (selB.length === 1 && b0.isAirborne && b0.playerId === 'player') {
        // flying structure: right-click = fly there (use Land to set down)
        if (this.world.shouldRoute(b0)) this.world.net.sendStructureAction(b0.id, 'fly', { pos: { x: clickPos.x, y: clickPos.y } });
        else b0.flyTo({ x: clickPos.x, y: clickPos.y }, false);
        this.world.sound.playCommandConfirm();
        return;
      }
      const rallied = (selB as Building[]).filter(b => b.playerId === 'player' && b.canRally && !b.isAirborne);
      if (!rallied.length) return; // utility / add-on structures have no waypoint
      for (const b of rallied) {
        const target = clickedResource ? clickedResource.id : (clickedFriendlyBuilding && clickedFriendlyBuilding.type === 'bunker' && clickedFriendlyBuilding !== b ? clickedFriendlyBuilding.id : null);
        const point = target && !clickedResource && clickedFriendlyBuilding ? { x: clickedFriendlyBuilding.pos.x, y: clickedFriendlyBuilding.pos.y } : { x: clickPos.x, y: clickPos.y };
        if (this.world.shouldRoute(b)) this.world.net.sendRally(b.id, point, target);
        else { b.rallyPoint = point; b.rallyTargetId = target; }
        this.world.decals.updateRallyLine(b.id, b.getPosition3D(), point);
      }
      this.world.sound.playCommandConfirm();
      return;
    }

    // Destructible rocks: right-click with combat units to attack them
    const clickedRock = clickedEnemy ? null : this.world.rocks.find(
      r => Math.hypot(r.pos.x - clickPos.x, r.pos.y - clickPos.y) <= r.size * 0.75 + 0.4
    ) ?? null;

    // Group moves fan out into a formation around the click point instead of stacking on one tile
    const movers = this.world.selectedEntities.filter(
      (e): e is Unit => e instanceof Unit && e.playerId === 'player' && !isLarvaKind(e.type) && !clickedEnemy && !clickedResource && !clickedRock && !clickedFriendlyBuilding
    );
    const formationOffset = new Map<string, { x: number; y: number }>();
    if (movers.length > 1) {
      // SC2-style formation: rows face the direction of travel; short-range / tanky / slow units lead, long-range and support trail,
      // and units in a row are matched left-to-right by where they currently stand so paths don't cross.
      let gx = 0, gy = 0;
      movers.forEach(m => { gx += m.pos.x; gy += m.pos.y; });
      gx /= movers.length; gy /= movers.length;
      let dx = clickPos.x - gx, dy = clickPos.y - gy;
      const dl = Math.hypot(dx, dy);
      if (dl < 0.5) { dx = 0; dy = 1; } else { dx /= dl; dy /= dl; }
      const px = -dy, py = dx; // perpendicular (lateral) axis
      const rank = (u: Unit) => (u.type === 'medic' || u.type === 'medivac' ? 100 : 0) + u.attackRange * 6 + u.speed * 1.5 - u.maxHealth * 0.004;
      const sorted = [...movers].sort((a, b) => rank(a) - rank(b)); // front first
      const maxR = Math.max(...movers.map(m => m.radius));
      const spacing = Math.max(1.0, maxR * 2 + 0.25);
      const cols = Math.max(2, Math.round(Math.sqrt(movers.length * 1.7)));
      const rows = Math.ceil(movers.length / cols);
      for (let r = 0; r < rows; r++) {
        const rowUnits = sorted.slice(r * cols, (r + 1) * cols)
          .sort((a, b) => ((a.pos.x - gx) * px + (a.pos.y - gy) * py) - ((b.pos.x - gx) * px + (b.pos.y - gy) * py));
        const fwd = ((rows - 1) / 2 - r) * spacing;
        rowUnits.forEach((m, i) => {
          const lat = (i - (rowUnits.length - 1) / 2) * spacing;
          formationOffset.set(m.id, { x: dx * fwd + px * lat, y: dy * fwd + py * lat });
        });
      }
    }

    // Orders for selected player units
    // Larva and Eggs don't move: right-click sets their waypoint (everything selected gets the same one)
    const rallied = this.world.selectedEntities.filter((e): e is Unit => e instanceof Unit && e.playerId === 'player' && isLarvaKind(e.type));
    if (rallied.length) {
      const dest = clickedFriendlyBuilding && !clickedResource ? clickedFriendlyBuilding.pos : clickPos;
      if (this.world.shouldRoute()) this.world.net.sendLarvaRally(rallied.map(u => u.id), dest, clickedResource ? clickedResource.id : null);
      else for (const u of rallied) setLarvaRally(u, dest, clickedResource ? clickedResource.id : null);
    }

    this.world.selectedEntities.forEach(ent => {
      if (!(ent instanceof Unit) || ent.playerId !== 'player' || isLarvaKind(ent.type)) return;

      if (clickedRock && ent.damage > 0) {
        ent.setCommand({ type: 'attack', targetEntityId: clickedRock.id, queued: this.shiftHeld() });
      } else if (clickedEnemy) {
        // Attack Order
        ent.setCommand({ type: 'attack', targetEntityId: clickedEnemy.id, queued: this.shiftHeld() });
      } else if (clickedResource && isWorkerType(ent.type)) {
        // Gather Minerals / Gas
        ent.setCommand({ type: 'gather', targetEntityId: clickedResource.id, queued: this.shiftHeld() });
      } else if (clickedFriendlyBuilding && clickedFriendlyBuilding.type === 'bunker' && clickedFriendlyBuilding.isConstructed && BUNKER_LOADABLE.has(ent.type)) {
        // Marines / Marauders climb into the Bunker (right-click it, like SC2)
        ent.setCommand({ type: 'load', targetEntityId: clickedFriendlyBuilding.id, queued: this.shiftHeld() });
      } else if (clickedFriendlyBuilding && (clickedFriendlyBuilding.type === 'nydus_network' || clickedFriendlyBuilding.type === 'nydus_worm') && clickedFriendlyBuilding.isConstructed && !ent.isFlying) {
        // ground units walk into a Nydus structure; unload at whichever Nydus you choose
        ent.setCommand({ type: 'load', targetEntityId: clickedFriendlyBuilding.id, queued: this.shiftHeld() });
      } else if (clickedFriendlyBuilding && isWorkerType(ent.type) && (!clickedFriendlyBuilding.isConstructed || (clickedFriendlyBuilding.health < clickedFriendlyBuilding.maxHealth && canRepairTarget(ent, clickedFriendlyBuilding)))) {
        // Repair or construct building
        ent.setCommand({ type: 'repair', targetEntityId: clickedFriendlyBuilding.id });
      } else if (!clickedFriendlyBuilding && clickedFriendlyUnit && clickedFriendlyUnit !== ent && ent.type === 'scv' && clickedFriendlyUnit.health < clickedFriendlyUnit.maxHealth && canRepairTarget(ent, clickedFriendlyUnit)) {
        // SCVs repair damaged mechanical units
        ent.setCommand({ type: 'repair', targetEntityId: clickedFriendlyUnit.id, queued: this.shiftHeld() });
      } else if (clickedFriendlyBuilding && isWorkerType(ent.type) && isTownHallType(clickedFriendlyBuilding.type) && ent.carriedAmount > 0) {
        // Return cargo to Command Center
        ent.setCommand({ type: 'gather' });
      } else {
        // Move Order (with formation offset for groups; falls back to the click if the slot is blocked)
        const off = formationOffset.get(ent.id);
        let tp = { x: clickPos.x + (off?.x ?? 0), y: clickPos.y + (off?.y ?? 0) };
        if (off && !this.world.pathfinding.isWalkable(tp.x, tp.y)) tp = { x: clickPos.x, y: clickPos.y };
        ent.setCommand({ type: 'move', targetPos: tp, queued: this.shiftHeld() });
      }
    });

    const playerUnits = this.world.selectedEntities.filter(
      ent => ent instanceof Unit && ent.playerId === 'player'
    ) as Unit[];
    if (playerUnits.length > 0) {
      this.world.sound.playUnitOrder(playerUnits[0]!.type, (clickedEnemy || (clickedRock && playerUnits[0]!.damage > 0)) ? 'attack' : 'move');
    } else {
      this.world.sound.playCommandConfirm();
    }
  }

  // Keyboard controls & hotkeys
  private onKeyDown(e: KeyboardEvent) {
    const key = e.key.toUpperCase();
    this.keysPressed.add(key);

    // Allow skipping opening semi-cinematic intro with Space or Escape
    const app = (window as any).gameApp;
    if (app?.intro?.isActive && (e.key === 'Escape' || e.code === 'Space')) {
      e.preventDefault();
      app.skipIntro();
      return;
    }

    // Control Groups 1..9
    if (e.key >= '1' && e.key <= '9') {
      const groupNum = parseInt(e.key);
      const now = Date.now();

      if (e.ctrlKey || e.metaKey) {
        // Assign Control Group
        const controllable = this.world.selectedEntities.filter(
          (ent): ent is Unit | Building => ent instanceof Unit || ent instanceof Building
        );
        this.controlGroups.set(groupNum, controllable);
        this.ui.showToast(`Control Group ${groupNum} assigned (${controllable.length} units)`);
        this.world.sound.playCommandConfirm();
      } else {
        // Recall Control Group
        const group = this.controlGroups.get(groupNum);
        if (group && group.length > 0) {
          // Filter alive units
          const alive = group.filter(ent => !ent.isDead && !(ent as any).loadedIn);
          this.world.selectedEntities.forEach(ent => ent.isSelected = false);
          alive.forEach(ent => ent.isSelected = true);
          this.world.selectedEntities = alive;

          // Double tap centers camera on group!
          if (this.lastGroupPressed === groupNum && now - this.lastGroupTime < 350) {
            const first = alive[0]!;
            this.renderer.setCameraTarget(first.pos.x, first.pos.y);
          }
          this.lastGroupPressed = groupNum;
          this.lastGroupTime = now;
          if (alive.length > 0 && alive[0] instanceof Unit && alive[0].playerId === 'player') {
            this.world.sound.playUnitGreeting(alive[0].type);
          } else {
            this.world.sound.playCommandConfirm();
          }
        }
      }
      return;
    }

    // Spacebar: In FPS/TPS mode, triggers Afterburner (Air) or Quake/UT Dash (Infantry); in RTS, centers on Command Center
    if (e.code === 'Space') {
      e.preventDefault();
      if (this.renderer.isFpsMode && this.renderer.fpsUnit) {
        this.triggerPossessedSpecialAbility();
        return;
      }
      const cc = this.world.findNearestTownHall({ ...LAYOUT.playerBase }, 'player');
      if (cc) {
        this.renderer.setCameraTarget(cc.pos.x, cc.pos.y);
      }
      return;
    }

    // PageUp / PageDown or Keypad +/-: Zoom camera in/out (SC2 keyboard camera zoom)
    if (e.key === 'PageUp' || e.key === '=' || e.key === '+') {
      e.preventDefault();
      this.renderer.zoomCamera(-3.0);
      return;
    }
    if (e.key === 'PageDown' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.renderer.zoomCamera(3.0);
      return;
    }

    // F3: Toggle Realtime Resource Profiler Overlay
    if (e.key === 'F3') {
      e.preventDefault();
      (window as any).gameApp.toggleProfiler();
      return;
    }

    // Larva / Egg selected: morph hotkeys (Zerg unit hotkeys) and Esc to cancel an egg
    {
      const f = this.world.selectedEntities[0];
      if (f instanceof Unit && f.playerId === 'player' && !e.ctrlKey && !e.metaKey && !e.altKey && (f.type === 'larva' || f.type === 'egg')) {
        if (f.type === 'egg' && e.key === 'Escape') { (window as any).gameApp.cancelEgg(); return; }
        if (f.type === 'larva') {
          const t = larvaMorphs(BUILDING_CONFIGS.hatchery.produces).find(x => UNIT_CONFIGS[x].hotkey === key);
          if (t) { (window as any).gameApp.morphLarva(t); return; }
        }
      }
    }

    // Escape: Opens/closes game menu & pauses game, or cancels placement/submenus
    if (e.key === 'Escape') {
      // 0. Front-end screens: Esc only closes the standalone options/help dialog
      if ((window as any).gameApp?.menuOpen) { this.ui.closeMenuOverlay(); return; }
      // 1. If game menu is open, Esc closes menu and resumes gameplay
      if (this.ui.isMenuOpen) {
        (window as any).gameApp.togglePauseMenu();
        return;
      }
      // 2. If placing a building, cancel placement
      if (this.placingBuildingType) {
        this.cancelBuildingPlacement();
        return;
      }
      // 3. If in a construction submenu, close submenu
      if (this.ui.activeSubmenu !== 'none') {
        this.ui.setSubmenu('none');
        return;
      }
      if (this.abilityTargetId) { this.cancelAbilityTarget(); return; }
      // 4. If in attack-move targeting mode, cancel attack-move
      if (this.targetMode) { this.cancelTargetMode(); return; }
      // 5. Otherwise during gameplay (RTS, FPS, or TPS), toggle game menu & pause game!
      (window as any).gameApp.togglePauseMenu();
      return;
    }

    // --- Submenu Hotkey Chains for Worker Construction (faction-driven) ---
    if (this.ui.activeSubmenu === 'build_basic' || this.ui.activeSubmenu === 'build_advanced') {
      const tech = FACTION_TECH[this.world.localFaction];
      const list = this.ui.activeSubmenu === 'build_basic' ? tech.basicBuild : tech.advancedBuild;
      const match = list.find(t => BUILDING_CONFIGS[t].hotkey === key);
      if (match) {
        this.startBuildingPlacement(match);
        return;
      }
    }

    // --- Bunker hotkeys (SC2): C Load, D Unload All, V Salvage ---
    {
      const bk = this.world.selectedEntities.find(e => e instanceof Building && e.type === 'bunker' && e.playerId === 'player' && e.isConstructed);
      if (bk && !this.world.selectedEntities.some(e => e instanceof Unit)) {
        if (key === 'C') { this.beginTargetMode('load'); return; }
        if (key === 'D') { (window as any).gameApp.bunkerUnloadAll(); return; }
        if (key === 'V') { (window as any).gameApp.bunkerSalvage(); return; }
      }
    }

    // --- Generic production hotkeys for the selected player production building ---
    {
      const prodBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player' && e.isConstructed
      ) as Building | undefined;
      if (prodBuilding && this.world.selectedEntities.length >= 1 && !this.world.selectedEntities.some(e => e instanceof Unit)) {
        if (prodBuilding.type === 'hatchery' && key === 'S') { (window as any).gameApp.selectLarva(); return; }
        if (key === 'Y' && prodBuilding.canRally && !prodBuilding.isAirborne) { this.beginTargetMode('rally'); return; }
        // Zerg units morph from larva, not from the Hatchery itself
        const unitType = BUILDING_CONFIGS[prodBuilding.type].produces.find(t => UNIT_CONFIGS[t].hotkey === key && this.world.unitAvailable(t) && !(prodBuilding.type === 'hatchery' && usesLarva(t)));
        if (unitType) {
          (window as any).gameApp.produceUnit(unitType);
          return;
        }
      }
    }

    // Hotkey: F (First-Person Mode)
    if (key === 'F') {
      if (this.renderer.viewMode === 'fps') {
        this.exitFpsMode();
        return;
      } else if (this.renderer.viewMode === 'tps') {
        this.enterFpsMode(this.renderer.fpsUnit);
        return;
      } else {
        const u = this.world.selectedEntities.find(
          ent => ent instanceof Unit && ent.playerId === 'player'
        ) as Unit | undefined;
        if (u) {
          this.enterFpsMode(u);
          return;
        }
      }
    }

    // Hotkey: V (Third-Person Mode / Advanced Build for SCV in RTS)
    if (key === 'V') {
      if (this.renderer.viewMode === 'tps') {
        this.exitFpsMode();
        return;
      } else if (this.renderer.viewMode === 'fps') {
        this.enterThirdPersonMode(this.renderer.fpsUnit);
        return;
      } else {
        const u = this.world.selectedEntities.find(
          ent => ent instanceof Unit && ent.playerId === 'player'
        ) as Unit | undefined;
        if (u && !isWorkerType(u.type)) {
          this.enterThirdPersonMode(u);
          return;
        } else if (u && isWorkerType(u.type) && this.ui.activeSubmenu === 'none') {
          (window as any).gameApp.setSubmenu('build_advanced');
          return;
        }
      }
    }

    // When in First-Person (FPS) or Third-Person (TPS) view, handle possessed combat hotkeys
    if (this.renderer.isFpsMode && this.renderer.fpsUnit) {
      if (e.key === 'Tab' && !this.world.routesOrders) {
        e.preventDefault();
        this.cycleSwap(e.shiftKey ? -1 : 1);
        return;
      }
      const u = this.renderer.fpsUnit as Unit;
      if (key === 'Q') {
        if (u.isFlying && u.triggerBarrelRoll(-1, this.world)) {
          this.ui.showToast('Crimson Skies Evasive Barrel Roll (Left)!');
        }
        return;
      }
      if (key === 'E') {
        if (u.isFlying && u.triggerBarrelRoll(1, this.world)) {
          this.ui.showToast('Crimson Skies Evasive Barrel Roll (Right)!');
        } else if (u.type.includes('tank') || u.type.startsWith('thor')) {
          u.transformMode(this.world, Unit.MODE_SWITCH[u.type]?.E ? 'E' : 'D');
        }
        return;
      }
      if (key === 'SHIFT') {
        this.triggerPossessedSpecialAbility();
        return;
      }
      if (key === 'G') {
        this.fireSecondaryFpsWeapon();
        return;
      }
      if (key === 'X' || key === 'TAB') {
        e.preventDefault();
        this.targetedComponentIndex = (this.targetedComponentIndex + 1) % 6;
        const labels = ['AUTO WEAKPOINT', 'ENGINE / TRACKS', 'LEFT WING / TURRET', 'RIGHT WING / OPTICS', 'TAIL / AMMO', 'WEAPONS / ARMOR'];
        this.ui.showToast(`IL-2 Precision Target: ${labels[this.targetedComponentIndex]}`);
        return;
      }
      if (key === 'T') {
        u.activateStimpack(this.world);
        return;
      }
      return;
    }

    // Tab: cycle the active subgroup of a mixed selection
    if (e.key === 'Tab') { e.preventDefault(); this.cycleSubgroup(e.shiftKey ? -1 : 1); return; }

    // Ability hotkeys for casters (Cloak, Burrow, Blink, Inject, Transfuse, Scan, MULE, Chrono, Guardian Shield)
    if (!e.ctrlKey && !e.metaKey) {
      const caster = this.world.selectedEntities.find(en => (en instanceof Unit || en instanceof Building) && en.playerId === 'player' && abilitiesOf(en).length > 0) as Unit | Building | undefined;
      if (caster) {
        const def = abilitiesOf(caster).find(a => a.hotkey === key);
        if (def) { (window as any).gameApp.useAbility(def.id); return; }
      }
    }

    // One-shot research hotkeys (Metabolic Boost, Charge, Blink, ...) on the selected structure
    {
      const host = this.world.selectedEntities.find(en => en instanceof Building && en.playerId === 'player' && en.isConstructed && (RESEARCH.some(r => r.building === en.type) || en.type === 'techlab')) as Building | undefined;
      const parentType = host?.type === 'techlab' ? host.addonParent(this.world)?.type : undefined;
      const r = host && RESEARCH.find(x => x.building === host.type && x.hotkey === key && (!x.parent || x.parent === parentType));
      if (r) { (window as any).gameApp.researchUpgrade(r.id); return; }
      if (parentType === 'barracks' && key === 'C') { (window as any).gameApp.researchUpgrade('combat_shields'); return; }
    }

    if (this.world.selectedEntities.some(ent => ent instanceof Building && ent.playerId === 'player' && ent.type === 'evolution_chamber')) {
      if (key === 'W') { (window as any).gameApp.researchUpgrade('melee_attacks'); return; }
      if (key === 'E') { (window as any).gameApp.researchUpgrade('missile_attacks'); return; }
      if (key === 'A') { (window as any).gameApp.researchUpgrade('armor'); return; }
    }
    // Engineering Bay research hotkeys
    const selectedEngBay = this.world.selectedEntities.find(
      ent => ent instanceof Building && ent.playerId === 'player' && ent.type === 'engineering_bay'
    ) as Building | undefined;
    if (selectedEngBay) {
      if (key === 'W') { (window as any).gameApp.researchUpgrade('weapons'); return; }
      if (key === 'A') { (window as any).gameApp.researchUpgrade('armor'); return; }
    }

    // Hotkey: W (Train Wraith Fighter at Starport)
    if (key === 'W') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding && selectedBuilding.type === 'starport' && this.world.unitAvailable('wraith')) {
        (window as any).gameApp.produceUnit('wraith');
        return;
      }
    }

    // Hotkey: B (Train Banshee Gunship at Starport, Afterburner on Air Units, or Basic Build Menu for SCV)
    if (key === 'B') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding && selectedBuilding.type === 'starport') {
        (window as any).gameApp.produceUnit('banshee');
        return;
      }
      const airUnits = this.world.selectedEntities.filter(
        ent => ent instanceof Unit && ent.playerId === 'player' && ent.isFlying
      ) as Unit[];
      if (airUnits.length > 0) {
        airUnits.forEach(au => au.activateAfterburner(this.world));
        this.ui.showToast('Afterburner Engaged!');
        return;
      }
    }

    // Hotkey: A (Attack-move or Train Marine at Barracks)
    if (key === 'A') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding && selectedBuilding.type === 'barracks') {
        (window as any).gameApp.produceUnit('marine');
        return;
      }
      this.isAttackMoveMode = true;
      document.body.style.cursor = cursorCss('attack');
      this.ui.showToast('Attack Move: Left-click target location');
      return;
    }

    // Hotkey: S (Stop or Train SCV at Command Center / Siege Tank at Factory)
    if (key === 'S') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding) {
        if (selectedBuilding.type === 'command_center' || selectedBuilding.type === 'orbital_command') {
          (window as any).gameApp.produceUnit('scv');
          return;
        } else if (selectedBuilding.type === 'factory') {
          (window as any).gameApp.produceUnit('siege_tank');
          return;
        }
      }
      const playerUnits = this.world.selectedEntities.filter(
        ent => ent instanceof Unit && ent.playerId === 'player'
      ) as Unit[];
      playerUnits.forEach(ent => {
        ent.setCommand({ type: 'stop' });
      });
      if (playerUnits.length > 0) {
        this.world.sound.playUnitOrder(playerUnits[0]!.type);
      }
      return;
    }

    // Hotkey: D (Train Marauder at Barracks or Tank Mode)
    if (key === 'D') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding && selectedBuilding.type === 'barracks') {
        (window as any).gameApp.produceUnit('marauder');
        return;
      }
    }

    // Hotkey: M (Train Medivac at Starport or Move order)
    if (key === 'M') {
      const selectedBuilding = this.world.selectedEntities.find(
        e => e instanceof Building && e.playerId === 'player'
      ) as Building | undefined;
      if (selectedBuilding && selectedBuilding.type === 'starport') {
        (window as any).gameApp.produceUnit('medivac');
        return;
      }
    }

    // Hotkey: P (Patrol) - then click the point to patrol to
    if (key === 'P' && this.world.selectedEntities.some(e => e instanceof Unit && e.playerId === 'player')) {
      this.beginTargetMode('patrol');
      return;
    }

    // Hotkey: R (SCV Repair) - then click a damaged Terran structure / mechanical unit
    if (key === 'R' && this.world.selectedEntities.some(e => e instanceof Unit && e.playerId === 'player' && e.type === 'scv')) {
      this.beginTargetMode('repair');
      return;
    }

    // Hotkey: H (Hold position)
    if (key === 'H') {
      const playerUnits = this.world.selectedEntities.filter(
        ent => ent instanceof Unit && ent.playerId === 'player'
      ) as Unit[];
      playerUnits.forEach(ent => {
        ent.setCommand({ type: 'hold' });
      });
      if (playerUnits.length > 0) {
        this.world.sound.playUnitOrder(playerUnits[0]!.type);
      }
      return;
    }

    // Worker command card: G gathers, T cancels the current order (SC2 SCV card)
    if ((key === 'G' || key === 'T') && this.world.selectedEntities.some(e => e instanceof Unit && e.playerId === 'player' && isWorkerType(e.type))) {
      (window as any).gameApp.issueCommand(key === 'G' ? 'gather' : 'stop');
      return;
    }

    // Hotkey: T (Stimpack)
    if (key === 'T') {
      this.world.selectedEntities.forEach(ent => {
        if (ent instanceof Unit && ent.playerId === 'player') {
          ent.activateStimpack(this.world);
        }
      });
      return;
    }

    // Hotkey: E / D mode switches (Siege / Tank Mode, High Impact / Explosive Payload, Fighter / Assault Mode)
    if (key === 'E' || key === 'D') {
      (window as any).gameApp.transformMode(key);
      return;
    }

    // Hotkey: B (Basic Build Menu)
    if (key === 'B' && this.world.selectedEntities.some(e => isWorkerType(e.type))) {
      this.ui.setSubmenu('build_basic');
      return;
    }

    // Hotkey: V (Advanced Build Menu)
    if (key === 'V' && this.world.selectedEntities.some(e => isWorkerType(e.type))) {
      this.ui.setSubmenu('build_advanced');
      return;
    }
  }

  private lastGroupTime: number = 0;

  private onKeyUp(e: KeyboardEvent) {
    this.keysPressed.delete(e.key.toUpperCase());
  }

  // Camera continuous keyboard / edge panning in update loop
  public update(dt: number) {
    this.dropStaleOrders();
    if (this.placingBuildingType || this.abilityTargetId === 'land') this.refreshPlacementGhost();
    // Pylon power fields: all of yours while placing a Protoss structure or aiming a Warp-In; otherwise only a selected Pylon's
    this.world.updatePowerFields(
      (!!this.placingBuildingType && GameWorld.buildingRaceOf(this.placingBuildingType) === 'protoss') ||
      !!this.abilityTargetId?.startsWith('warp_'));
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    if (!(this.renderer.isFpsMode && this.renderer.fpsUnit)) {
      this.swapTarget = null;
      this.swapReticle.hide();
    }

    // 0. If in First-Person or Third-Person Mode, control the unit directly!
    if (this.renderer.isFpsMode && this.renderer.fpsUnit) {
      const u = this.renderer.fpsUnit as Unit;
      if (u.isDead) {
        this.exitFpsMode();
        return;
      }

      this.updateSwapTarget(u, dt);

      // Update Ace Combat Target Lock-On & Directional Threat Warnings
      this.updateAceCombatTargeting(u, dt);

      const isAircraft = u.isFlying;
      const isInfantry = u.type === 'marine' || u.type === 'marauder' || u.type === 'zergling' || u.type === 'roach' || u.type === 'hydralisk';

      // =========================================================
      // A. AIRCRAFT FLIGHT CONTROL
      // - Third-Person: Crimson Skies + Ace Combat (Responsive arcade flight, banking, boost, barrel roll)
      // - First-Person: IL-2 Sturmovik + Ace Combat (Physical inertia, wing-damage roll, precision sights)
      // =========================================================
      if (isAircraft) {
        const isFirstPerson = this.renderer.viewMode === 'fps';
        let throttleInput = 0.35; // Cruise forward thrust
        if (this.keysPressed.has('W') || this.keysPressed.has('ARROWUP')) {
          throttleInput = 1.25;
        } else if (this.keysPressed.has('S') || this.keysPressed.has('ARROWDOWN')) {
          throttleInput = -0.35;
        }

        let turnInput = 0;
        if (this.keysPressed.has('A') || this.keysPressed.has('ARROWLEFT')) {
          turnInput += 1.0; // Bank & turn left
        }
        if (this.keysPressed.has('D') || this.keysPressed.has('ARROWRIGHT')) {
          turnInput -= 1.0; // Bank & turn right
        }

        // Altitude climb / dive (R / C or Pitch in FPS)
        if (this.keysPressed.has('R')) {
          u.flightAltitude = Math.min(11.0, u.flightAltitude + 4.5 * dt);
        } else if (this.keysPressed.has('C')) {
          u.flightAltitude = Math.max(1.8, u.flightAltitude - 4.5 * dt);
        } else if (isFirstPerson && Math.abs(this.renderer.fpsPitch) > 0.08) {
          u.flightAltitude = Math.max(1.8, Math.min(11.0, u.flightAltitude + Math.sin(this.renderer.fpsPitch) * u.speed * 0.45 * dt));
        }

        // IL-2 Wing & Tail component damage affects turning authority
        const turnDir = turnInput >= 0 ? 'left' : 'right';
        const turnMult = u.getTurnMultiplier(turnDir);
        const baseTurnRate = isFirstPerson ? 2.4 : 3.3; // TPS Crimson Skies is extra snappy; FPS IL-2 has heavier feel
        if (turnInput !== 0) {
          u.rotation += turnInput * baseTurnRate * turnMult * dt;
          if (isFirstPerson) {
            this.renderer.fpsYaw = u.rotation;
          }
        } else if (isFirstPerson) {
          // In FPS, aircraft smoothly banks toward mouse look yaw with IL-2 inertia
          const yawDiff = Math.atan2(Math.sin(this.renderer.fpsYaw - u.rotation), Math.cos(this.renderer.fpsYaw - u.rotation));
          u.rotation += yawDiff * Math.min(1, dt * 3.8 * turnMult);
        }

        // Normalize rotation
        while (u.rotation > Math.PI) u.rotation -= Math.PI * 2;
        while (u.rotation < -Math.PI) u.rotation += Math.PI * 2;

        // Smooth Crimson Skies / IL-2 Banking & Pitching attitude
        if (u.barrelRollTimer <= 0) {
          const targetRoll = -turnInput * 0.58;
          u.roll += (targetRoll - u.roll) * Math.min(1.0, dt * (isFirstPerson ? 5.5 : 8.5));
        }
        const targetPitch = isFirstPerson ? -this.renderer.fpsPitch * 0.5 : (throttleInput > 0.8 ? -0.1 : throttleInput < 0 ? 0.12 : 0);
        u.pitch += (targetPitch - u.pitch) * Math.min(1.0, dt * 6.5);

        // Airspeed & IL-2 Physical Momentum
        const targetSpeed = u.speed * throttleInput;
        const inertiaLerp = isFirstPerson ? 3.2 : 7.5; // IL-2 heavier physical inertia in FPS; Crimson Skies arcade response in TPS
        u.flightSpeed += (targetSpeed - u.flightSpeed) * Math.min(1.0, dt * inertiaLerp);

        const forwardX = Math.sin(u.rotation);
        const forwardY = Math.cos(u.rotation);
        const desiredVelX = forwardX * u.flightSpeed;
        const desiredVelY = forwardY * u.flightSpeed;

        u.velX += (desiredVelX - u.velX) * Math.min(1.0, dt * inertiaLerp);
        u.velY += (desiredVelY - u.velY) * Math.min(1.0, dt * inertiaLerp);

        u.pos.x = Math.max(4, Math.min(116, u.pos.x + u.velX * dt));
        u.pos.y = Math.max(4, Math.min(116, u.pos.y + u.velY * dt));
        const groundY = (this.world as any).units ? u.height - u.flightAltitude : 0;
        u.height = Math.max(0, groundY) + u.flightAltitude;
        u.updateMeshTransform();
        if (u.type === 'wraith') {
          WraithAnimator.updateWraithAnimation(u, dt, this.world);
        }

        if (!isFirstPerson) {
          // Crimson Skies Chase Camera smoothly tracks aircraft heading
          const angleDiff = Math.atan2(
            Math.sin(u.rotation - this.renderer.fpsYaw),
            Math.cos(u.rotation - this.renderer.fpsYaw)
          );
          this.renderer.fpsYaw += angleDiff * Math.min(1.0, dt * 6.2);
        }
        this.renderer.cameraTarget.set(u.pos.x, u.height, u.pos.y);
        return;
      }

      // =========================================================
      // B. INFANTRY 1ST-PERSON CONTROL (Marine, Marauder):
      // Quake 3 / Unreal Tournament / GTA 5 1st-Person Visor Movement
      // (3rd-person humanoids fall through to C below to preserve GTA 5 + UT/Q3 3rd-person steering!)
      // =========================================================
      if (isInfantry && this.renderer.viewMode === 'fps') {
        const arenaSpeed = u.speed * 1.22 * dt; // Fast Quake 3 / UT / GTA 5 responsive pace
        const forwardX = Math.sin(this.renderer.fpsYaw);
        const forwardY = Math.cos(this.renderer.fpsYaw);
        const rightX = forwardY;
        const rightY = -forwardX;

        let moveX = 0;
        let moveY = 0;

        if (this.keysPressed.has('W') || this.keysPressed.has('ARROWUP')) {
          moveX += forwardX * arenaSpeed;
          moveY += forwardY * arenaSpeed;
        }
        if (this.keysPressed.has('S') || this.keysPressed.has('ARROWDOWN')) {
          moveX -= forwardX * arenaSpeed;
          moveY -= forwardY * arenaSpeed;
        }
        if (this.keysPressed.has('A')) {
          moveX -= rightX * arenaSpeed;
          moveY -= rightY * arenaSpeed;
        }
        if (this.keysPressed.has('D')) {
          moveX += rightX * arenaSpeed;
          moveY += rightY * arenaSpeed;
        }
        if (this.keysPressed.has('ARROWLEFT')) {
          this.renderer.fpsYaw += 3.0 * dt;
        }
        if (this.keysPressed.has('ARROWRIGHT')) {
          this.renderer.fpsYaw -= 3.0 * dt;
        }

        if (moveX !== 0 || moveY !== 0) {
          const nextX = u.pos.x + moveX;
          const nextY = u.pos.y + moveY;
          if (this.world.pathfinding.isWalkable(nextX, nextY)) {
            u.pos.x = nextX;
            u.pos.y = nextY;
          } else if (this.world.pathfinding.isWalkable(nextX, u.pos.y)) {
            u.pos.x = nextX;
          } else if (this.world.pathfinding.isWalkable(u.pos.x, nextY)) {
            u.pos.y = nextY;
          }
        }

        u.rotation = this.renderer.fpsYaw;
        u.updateMeshTransform();
        if (u.type === 'marine') {
          MarineAnimator.updateMarineAnimation(u, dt, this.world);
        }
        this.renderer.cameraTarget.set(u.pos.x, u.height, u.pos.y);
        return;
      }

      // =========================================================
      // C. TANKS & ARMORED VEHICLES (Siege Tank, SCV):
      // - Third-Person: Crimson Skies / Responsive chassis maneuvering
      // - First-Person: Gunner Optics, Turret Traverse & Rangefinder
      // =========================================================
      if (this.renderer.viewMode === 'tps') {
        // Gas pedal (Up arrow or W key)
        let throttle = 0;
        if (this.keysPressed.has('W') || this.keysPressed.has('ARROWUP')) {
          throttle += 1.0;
        }
        // Brake / Reverse (Down arrow or S key)
        if (this.keysPressed.has('S') || this.keysPressed.has('ARROWDOWN')) {
          throttle -= 0.65;
        }

        // Turning the wheel: Left / Right arrow keys & A / D keys
        let steer = 0;
        if (this.keysPressed.has('A') || this.keysPressed.has('ARROWLEFT')) {
          steer += 1.0;
        }
        if (this.keysPressed.has('D') || this.keysPressed.has('ARROWRIGHT')) {
          steer -= 1.0;
        }

        const turnDir = steer >= 0 ? 'left' : 'right';
        const turnSpeed = 3.5 * u.getTurnMultiplier(turnDir);

        if (steer !== 0) {
          if (throttle < 0) {
            u.rotation -= steer * turnSpeed * dt;
          } else {
            u.rotation += steer * turnSpeed * dt;
          }
          while (u.rotation > Math.PI) u.rotation -= Math.PI * 2;
          while (u.rotation < -Math.PI) u.rotation += Math.PI * 2;
        }

        if (throttle !== 0) {
          const driveSpeed = u.speed * (throttle > 0 ? 1.15 : 0.65);
          const moveDist = driveSpeed * dt;
          const forwardX = Math.sin(u.rotation);
          const forwardY = Math.cos(u.rotation);

          const moveX = forwardX * moveDist * (throttle > 0 ? 1 : -1);
          const moveY = forwardY * moveDist * (throttle > 0 ? 1 : -1);

          const nextX = u.pos.x + moveX;
          const nextY = u.pos.y + moveY;

          if (this.world.pathfinding.isWalkable(nextX, nextY)) {
            u.pos.x = nextX;
            u.pos.y = nextY;
          } else if (this.world.pathfinding.isWalkable(nextX, u.pos.y)) {
            u.pos.x = nextX;
          } else if (this.world.pathfinding.isWalkable(u.pos.x, nextY)) {
            u.pos.y = nextY;
          }
        }

        u.updateMeshTransform();
        if (u.type === 'marine') {
          MarineAnimator.updateMarineAnimation(u, dt, this.world);
        }

        if (u.mesh) {
          const targetRoll = -steer * (throttle !== 0 ? 0.05 : 0.02);
          u.mesh.rotation.z += (targetRoll - u.mesh.rotation.z) * Math.min(1.0, dt * 10);
        }

        const angleDiff = Math.atan2(
          Math.sin(u.rotation - this.renderer.fpsYaw),
          Math.cos(u.rotation - this.renderer.fpsYaw)
        );
        const camFollowRate = (throttle !== 0 || steer !== 0) ? 5.5 : 2.5;
        this.renderer.fpsYaw += angleDiff * Math.min(1.0, dt * camFollowRate);
        this.renderer.cameraTarget.set(u.pos.x, u.height, u.pos.y);
        return;
      }

      // First-Person Tank Gunner Optics Mode
      const speed = u.speed * dt;
      const forwardX = Math.sin(this.renderer.fpsYaw);
      const forwardY = Math.cos(this.renderer.fpsYaw);
      const rightX = forwardY;
      const rightY = -forwardX;

      let moveX = 0;
      let moveY = 0;

      if (this.keysPressed.has('W') || this.keysPressed.has('ARROWUP')) {
        moveX += forwardX * speed;
        moveY += forwardY * speed;
      }
      if (this.keysPressed.has('S') || this.keysPressed.has('ARROWDOWN')) {
        moveX -= forwardX * speed;
        moveY -= forwardY * speed;
      }
      if (this.keysPressed.has('A')) {
        moveX -= rightX * speed;
        moveY -= rightY * speed;
      }
      if (this.keysPressed.has('D')) {
        moveX += rightX * speed;
        moveY += rightY * speed;
      }

      const turretMult = u.getFireRateMultiplier();
      if (this.keysPressed.has('ARROWLEFT')) {
        this.renderer.fpsYaw += 2.6 * turretMult * dt;
      }
      if (this.keysPressed.has('ARROWRIGHT')) {
        this.renderer.fpsYaw -= 2.6 * turretMult * dt;
      }

      if (moveX !== 0 || moveY !== 0) {
        const nextX = u.pos.x + moveX;
        const nextY = u.pos.y + moveY;
        if (this.world.pathfinding.isWalkable(nextX, nextY)) {
          u.pos.x = nextX;
          u.pos.y = nextY;
        } else if (this.world.pathfinding.isWalkable(nextX, u.pos.y)) {
          u.pos.x = nextX;
        } else if (this.world.pathfinding.isWalkable(u.pos.x, nextY)) {
          u.pos.y = nextY;
        }
      }

      u.rotation = this.renderer.fpsYaw;
      u.updateMeshTransform();
      this.renderer.cameraTarget.set(u.pos.x, u.height, u.pos.y);
      return;
    }

    let panX = 0;
    let panZ = 0;
    const speed = 40 * dt;

    // Up / Down (Z axis in 3D isometric)
    // RTS view: camera pans with the ARROW KEYS only - W/A/S/D are command hotkeys (Build SCV, Attack, Stop...)
    if (this.keysPressed.has('ARROWUP')) panZ -= speed;
    if (this.keysPressed.has('ARROWDOWN')) panZ += speed;

    // Left / Right (X axis)
    if (this.keysPressed.has('ARROWLEFT')) panX -= speed;
    if (this.keysPressed.has('ARROWRIGHT')) panX += speed;

    // Mouse-at-screen-edge scrolling (faster the closer to the edge); not while middle-drag panning
    if (this.edgeMouse && !this.isMiddlePanning && !document.hidden && !this.coarsePointer) {
      const m = 80, { x, y } = this.edgeMouse; // 80px edge zone
      const w = window.innerWidth, h = window.innerHeight;
      const ramp = (d: number) => Math.min(1, Math.max(0, (m - d) / m)) * 0.6 + (d <= 2 ? 0.4 : 0);
      if (x < m) panX -= speed * ramp(x);
      else if (x > w - m) panX += speed * ramp(w - x);
      if (y < m) panZ -= speed * ramp(y);
      else if (y > h - m) panZ += speed * ramp(h - y);
    }

    if (panX !== 0 || panZ !== 0) {
      this.renderer.panCamera(panX, panZ);
    }
  }

  // --- First-Person (FPS) & Third-Person (TPS) Controls ---
  public enterFpsMode(unit?: Unit) {
    if (this.world.routesOrders) {
      // direct control moves a unit on this computer only: it would desync lockstep and can't reach a snapshot host
      this.ui.showToast('Possessed 1st-person view is off in online matches', true);
      return;
    }
    const targetUnit = unit || (this.world.selectedEntities.find(
      ent => ent instanceof Unit && ent.playerId === 'player'
    ) as Unit | undefined);

    if (!targetUnit) {
      this.ui.showToast('Select a friendly unit first to enter FPS Mode!', true);
      return;
    }

    targetUnit.isGathering = false;
    targetUnit.targetNodeId = null;

    this.renderer.enterFpsMode(targetUnit);
    this.world.sound.playCommandConfirm();
    this.ui.showToast(`Entered 1st-Person Cockpit: ${targetUnit.type.toUpperCase()}`);

    // Request pointer lock for immersive look controls if supported
    try {
      Promise.resolve(this.renderer.container.requestPointerLock?.()).catch(() => {});
    } catch {
      // Ignored if browser permission denies
    }
  }

  public enterThirdPersonMode(unit?: Unit) {
    if (this.world.routesOrders) {
      this.ui.showToast('Possessed 3rd-person view is off in online matches', true);
      return;
    }
    const targetUnit = unit || (this.world.selectedEntities.find(
      ent => ent instanceof Unit && ent.playerId === 'player'
    ) as Unit | undefined);

    if (!targetUnit) {
      this.ui.showToast('Select a friendly unit first to enter 3rd Person View!', true);
      return;
    }

    targetUnit.isGathering = false;
    targetUnit.targetNodeId = null;

    this.renderer.enterThirdPersonMode(targetUnit);
    this.world.sound.playCommandConfirm();
    this.ui.showToast(`Entered 3rd-Person Follow View: ${targetUnit.type.toUpperCase()}`);

    try {
      Promise.resolve(this.renderer.container.requestPointerLock?.()).catch(() => {});
    } catch {}
  }

  public toggleFpsTps() {
    if (!this.renderer.isFpsMode || !this.renderer.fpsUnit) return;
    this.renderer.toggleFpsTps();
    this.world.sound.playCommandConfirm();
    this.ui.showToast(`Switched to ${this.renderer.viewMode === 'tps' ? '3rd Person Follow' : '1st Person Visor'}`);
  }

  public exitFpsMode() {
    this.swapTarget = null;
    this.swapReticle.hide();
    this.renderer.exitFpsMode();
    this.world.sound.playCommandConfirm();
    try {
      document.exitPointerLock?.();
    } catch {}
  }

  // Trigger Possessed Unit Special Ability (Crimson Skies Afterburner / Quake 3 Dash / Siege Toggle)
  public triggerPossessedSpecialAbility() {
    const u = this.renderer.fpsUnit as Unit | null;
    if (!u || u.isDead) return;

    if (u.isFlying) {
      if (u.activateAfterburner(this.world)) {
        this.ui.showToast('Crimson Skies Afterburner Boost Engaged!');
      } else {
        this.ui.showToast('Afterburner recharging...', true);
      }
      return;
    }

    const isInfantry = u.type === 'marine' || u.type === 'marauder';
    if (isInfantry) {
      if (this.dashCooldown <= 0 && u.getComponentHp('mobility') > 20) {
        this.dashCooldown = 1.6;
        const dashDist = 2.6 * u.getSpeedMultiplier();
        const fx = Math.sin(this.renderer.fpsYaw) * dashDist;
        const fy = Math.cos(this.renderer.fpsYaw) * dashDist;
        if (this.world.pathfinding.isWalkable(u.pos.x + fx, u.pos.y + fy)) {
          u.pos.x += fx;
          u.pos.y += fy;
          u.updateMeshTransform();
          this.world.sound.playRocketWhoosh();
          this.ui.showToast('Quake / UT Tactical Dash!');
        }
      }
      return;
    }

    if (u.type.includes('tank')) {
      u.toggleSiegeMode(this.world);
    }
  }

  // Ace Combat Target Acquisition, Multi-Target Lock-On & Directional Threat Warning
  private updateAceCombatTargeting(u: Unit, dt: number) {
    const cosPitch = Math.cos(this.renderer.fpsPitch);
    const lookDir = new THREE.Vector3(
      Math.sin(this.renderer.fpsYaw) * cosPitch,
      Math.sin(this.renderer.fpsPitch),
      Math.cos(this.renderer.fpsYaw) * cosPitch
    ).normalize();

    const origin = new THREE.Vector3(u.pos.x, u.height + 1.2, u.pos.y);
    const maxLockRange = u.attackRange * 2.4;

    const hostiles = [...this.world.units, ...this.world.buildings].filter(
      e => e.playerId !== u.playerId && !e.isDead
    );

    // Find best forward cone target + up to 4 multi-lock targets
    let bestTarget: any = null;
    let bestScore = Infinity;
    const coneCandidates: { id: string; dist: number }[] = [];
    let nearestThreatAngle: number | null = null;
    let nearestThreatDist = 16;

    for (const h of hostiles) {
      const hPos = h.getPosition3D();
      const toH = new THREE.Vector3(hPos.x - origin.x, hPos.y + 0.8 - origin.y, hPos.z - origin.z);
      const dist = toH.length();

      // Check directional threat warning (hostiles within 16m aiming/near player)
      if (dist < nearestThreatDist) {
        nearestThreatDist = dist;
        nearestThreatAngle = Math.atan2(toH.x, toH.z) - this.renderer.fpsYaw;
      }

      if (dist > maxLockRange || dist < 0.5) continue;
      const dirToH = toH.clone().normalize();
      const dot = dirToH.dot(lookDir);
      const minDot = this.renderer.viewMode === 'tps' ? 0.68 : 0.78;
      if (dot >= minDot) {
        coneCandidates.push({ id: h.id, dist });
        const anglePenalty = (1.0 - dot) * 40;
        const score = dist + anglePenalty;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = h;
        }
      }
    }

    this.directionalThreatAngle = nearestThreatAngle;
    coneCandidates.sort((a, b) => a.dist - b.dist);
    this.multiLockedTargetIds = coneCandidates.slice(0, 4).map(c => c.id);

    if (bestTarget) {
      this.lastRangeEstimate = Math.round(origin.distanceTo(new THREE.Vector3(bestTarget.pos.x, bestTarget.height, bestTarget.pos.y)) * 10);
      if (u.lockedTargetId === bestTarget.id) {
        const lockRate = 1.15 * u.getFireRateMultiplier();
        u.lockProgress = Math.min(1.0, u.lockProgress + dt * lockRate);
      } else {
        u.lockedTargetId = bestTarget.id;
        u.lockProgress = 0.2;
      }
      if (u.isFlying || u.type.includes('tank')) {
        this.world.sound.playLockOnTone(u.lockProgress >= 1.0);
      }
    } else {
      u.lockedTargetId = null;
      u.lockProgress = Math.max(0, u.lockProgress - dt * 2.0);
      this.lastRangeEstimate = 0;
    }
  }

  private resolveTargetComponentId(hitEntity: any): string | undefined {
    if (!hitEntity || !hitEntity.components || hitEntity.components.length === 0) return undefined;
    if (this.targetedComponentIndex > 0) {
      const idx = (this.targetedComponentIndex - 1) % hitEntity.components.length;
      return hitEntity.components[idx]?.id;
    }
    // In 1st-person mode, vertical pitch selects component naturally (high = turret/tail/weapons, low = tracks/engine)
    if (this.renderer.viewMode === 'fps') {
      if (this.renderer.fpsPitch > 0.08 && hitEntity.components.length > 1) {
        return hitEntity.components[1]?.id;
      } else if (this.renderer.fpsPitch < -0.08) {
        return hitEntity.components[0]?.id;
      }
    }
    return undefined;
  }

  public fireFpsWeapon() {
    const u = this.renderer.fpsUnit as Unit | null;
    if (!u || u.isDead) return;

    if (u.attackCooldown > 0) return;
    const effectiveAtkSpd = (u.isStimmed ? u.attackSpeed * 1.5 : u.attackSpeed) * u.getFireRateMultiplier();
    u.attackCooldown = 1.0 / effectiveAtkSpd;

    const isPrecisionFps = this.renderer.viewMode === 'fps';
    const cosPitch = Math.cos(this.renderer.fpsPitch);
    const lookDir = new THREE.Vector3(
      Math.sin(this.renderer.fpsYaw) * cosPitch,
      Math.sin(this.renderer.fpsPitch),
      Math.cos(this.renderer.fpsYaw) * cosPitch
    ).normalize();

    const rightX = Math.cos(this.renderer.fpsYaw);
    const rightZ = -Math.sin(this.renderer.fpsYaw);
    const sinYaw = Math.sin(this.renderer.fpsYaw);
    const cosYaw = Math.cos(this.renderer.fpsYaw);

    const eyeHeight = u.isFlying ? 1.05 : u.type.includes('tank') ? 1.5 : 1.35;
    const origin = new THREE.Vector3(u.pos.x, u.height + eyeHeight, u.pos.y);
    const maxRange = u.attackRange * 2.1;
    const targetPos = origin.clone().addScaledVector(lookDir, maxRange);

    // Compute visible weapon muzzle position in front of camera (FPS) or on model (TPS)
    let muzzlePos: THREE.Vector3;
    if (isPrecisionFps) {
      muzzlePos = this.renderer.camera.position.clone()
        .addScaledVector(lookDir, 0.75)
        .add(new THREE.Vector3(rightX * 0.22, -0.2, rightZ * 0.22));
    } else {
      const gunSide = (u.type === 'scv' ? -0.55 : 0.35);
      const gunForward = 0.85;
      const gunHeight = u.height + (u.isFlying ? 0.95 : u.type.includes('tank') ? 1.4 : 0.85);
      // Fire from the model's real muzzle (wing cannons, rifle tip, barrels) just like the RTS view does
      const mz = muzzleWorldPos(u);
      muzzlePos = mz ? new THREE.Vector3(mz.x, mz.y, mz.z) : new THREE.Vector3(
        u.pos.x + rightX * gunSide + sinYaw * gunForward,
        gunHeight,
        u.pos.y + rightZ * gunSide + cosYaw * gunForward
      );
    }

    // In 3rd-Person (Crimson Skies), provide assisted aiming convergence onto locked target if no direct crosshair hit
    let hit = this.findFpsCrosshairHit(origin, lookDir, maxRange);
    if (!hit && !isPrecisionFps && u.lockedTargetId) {
      const locked = this.world.findEntityById(u.lockedTargetId);
      if (locked && !locked.isDead) {
        hit = locked;
      }
    }

    const hitPos = hit
      ? { x: hit.pos.x, y: hit.height + (hit instanceof Unit && hit.isFlying ? 0.95 : 0.8), z: hit.pos.y }
      : targetPos;
    const targetCompId = this.resolveTargetComponentId(hit);
    const dmgOut = Math.max(1, Math.round(u.damage * u.getDamageOutputMultiplier()));

    if (u.type === 'wraith') {
      WraithAnimator.triggerShootAnimation(u);
      this.world.sound.playWraithFire(!!(hit instanceof Unit && hit.isFlying));
      this.world.particles.spawnWraithLaser(muzzlePos, hitPos, () => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
      });
    } else if (u.type === 'banshee') {
      this.world.sound.playBansheeAttack();
      this.world.particles.spawnBansheeRocket(muzzlePos, hitPos, (pos) => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
      });
    } else if (u.type === 'medivac') {
      this.world.sound.playHealBeam();
      this.world.particles.spawnWraithLaser(muzzlePos, hitPos, () => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
      });
    } else if (u.type === 'marine') {
      MarineAnimator.triggerShootAnimation(u);
      this.world.sound.playMarineAttack();
      this.world.particles.spawnBulletFlash(muzzlePos, hitPos, () => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
      });
    } else if (u.type === 'marauder') {
      this.world.sound.playMarauderAttack();
      this.world.particles.spawnMarauderShell(muzzlePos, hitPos, hit?.id, () => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
      });
    } else if (u.type.includes('tank')) {
      this.world.sound.playTankAttack(u.type === 'siege_tank_sieged');
      this.world.particles.spawnTankShot(muzzlePos, hitPos, u.type === 'siege_tank_sieged', (pos) => {
        if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
        const tw = u.weaponVs(hit);
        this.world.applyAreaDamage(pos.x, pos.z, tw.splash || 1.25, tw.damage, 'player', hit, u.type === 'siege_tank_sieged' ? [0.4687, 0.7812, 1.25] : undefined, undefined, u);
      });
    } else if (u.type === 'scv') {
      this.world.sound.playWelding();
      this.world.particles.spawnMuzzleFlash(muzzlePos, 0x00f0ff, 0.4);
      this.world.particles.spawnWeldingSparks(hitPos);
      if (hit) u.fpsHit(hit, targetCompId, isPrecisionFps, this.world);
    }
  }

  // Secondary Possessed Weapon (Right-Click or G):
  // - Aircraft: Launches Ace Combat Multi-Target Homing Missile Salvo!
  // - Tanks: Fires High-Velocity Armor-Piercing Component-Breaker Shell!
  // - Infantry: Fires Quake/UT Secondary Concussive Plasma Burst!
  public fireSecondaryFpsWeapon() {
    const u = this.renderer.fpsUnit as Unit | null;
    if (!u || u.isDead) return;

    const isPrecisionFps = this.renderer.viewMode === 'fps';
    const cosPitch = Math.cos(this.renderer.fpsPitch);
    const lookDir = new THREE.Vector3(
      Math.sin(this.renderer.fpsYaw) * cosPitch,
      Math.sin(this.renderer.fpsPitch),
      Math.cos(this.renderer.fpsYaw) * cosPitch
    ).normalize();

    const origin = new THREE.Vector3(u.pos.x, u.height + 1.15, u.pos.y);
    const maxRange = u.attackRange * 2.3;
    const defaultTargetPos = origin.clone().addScaledVector(lookDir, maxRange);

    if (u.isFlying) {
      if (u.missileAmmo <= 0 || u.missileCooldown > 0) {
        this.ui.showToast('Homing Missiles reloading...', true);
        return;
      }
      u.missileCooldown = 0.65;

      // Launch homing missiles at up to 2 simultaneous locked targets (Ace Combat multi-target!)
      const targetsToHit = this.multiLockedTargetIds
        .map(id => this.world.findEntityById(id))
        .filter((e): e is Unit | Building => !!e && !e.isDead)
        .slice(0, Math.min(2, u.missileAmmo));

      if (targetsToHit.length > 0) {
        targetsToHit.forEach(tgt => {
          u.missileAmmo = Math.max(0, u.missileAmmo - 1);
          const tgtPos3D = { x: tgt.pos.x, y: tgt.height + 0.9, z: tgt.pos.y };
          const compId = this.resolveTargetComponentId(tgt);
          this.world.particles.spawnHomingMissile(origin, tgtPos3D, tgt, () => {
            u.fpsHit(tgt, compId, true, this.world);
          });
        });
        this.ui.showToast(`Fox Two! Homing Missile Locked (${targetsToHit.length}x)`);
      } else {
        u.missileAmmo = Math.max(0, u.missileAmmo - 1);
        const crossHit = this.findFpsCrosshairHit(origin, lookDir, maxRange);
        const hitPos = crossHit ? crossHit.getPosition3D() : defaultTargetPos;
        const compId = this.resolveTargetComponentId(crossHit);
        this.world.particles.spawnHomingMissile(origin, hitPos, crossHit, (pos) => {
          if (crossHit) u.fpsHit(crossHit, compId, isPrecisionFps, this.world);
        });
      }
      return;
    }

    // Ground unit secondary fire (High-Velocity APCR / Concussive Burst)
    if (u.attackCooldown > 0) return;
    u.attackCooldown = 1.1;
    const hit = this.findFpsCrosshairHit(origin, lookDir, maxRange);
    const hitPos = hit ? hit.getPosition3D() : defaultTargetPos;
    const compId = this.resolveTargetComponentId(hit);

    this.world.sound.playMarauderAttack();
    this.world.particles.spawnMarauderShell(origin, hitPos, hit?.id, (pos) => {
      if (hit) u.fpsHit(hit, compId, true, this.world);
    });
  }

  private findFpsCrosshairHit(origin: THREE.Vector3, direction: THREE.Vector3, maxRange: number) {
    let closestEnt: any = null;
    let closestDist = maxRange;

    const enemies = [...this.world.units, ...this.world.buildings].filter(
      e => e.playerId === 'enemy' && !e.isDead
    );

    enemies.forEach(e => {
      const ePos = e.getPosition3D();
      const toEnt = new THREE.Vector3(ePos.x - origin.x, ePos.y - origin.y, ePos.z - origin.z);
      const proj = toEnt.dot(direction);
      if (proj > 0 && proj < maxRange) {
        const perp = toEnt.clone().sub(direction.clone().multiplyScalar(proj)).length();
        if (perp <= e.radius + 0.4 && proj < closestDist) {
          closestDist = proj;
          closestEnt = e;
        }
      }
    });

    return closestEnt;
  }

  // Start Building Placement Hologram
  public startBuildingPlacement(type: BuildingType) {
    const config = BUILDING_CONFIGS[type];
    const pRes = this.world.resources['player'];

    const lock = this.world.buildingLockReason('player', type);
    if (lock) {
      this.ui.showToast(lock, true);
      return;
    }
    if (pRes.minerals < config.costMinerals) {
      this.ui.showToast('Not enough minerals!', true);
      return;
    }
    if (pRes.gas < config.costGas) {
      this.ui.showToast('Not enough Vespene gas!', true);
      return;
    }

    this.placingBuildingType = type;
    this.ui.setSubmenu('none');
  }

  private confirmBuildingPlacement() {
    if (!this.placingBuildingType) return;
    const type = this.placingBuildingType;
    const worker = (this.world.selectedEntities.find(e => e instanceof Unit && e.playerId === 'player' && !e.isDead && isWorkerType(e.type)) as Unit | undefined) ?? null;
    if (!worker) {
      // the builder died (or was deselected) while the placement ghost was up
      this.ui.showToast('Select a worker to build', true);
      this.cancelBuildingPlacement();
      return;
    }
    const queued = this.shiftHeld();

    if (this.world.shouldRoute(worker)) {
      this.world.net.sendPlace(type, this.placementPos, worker.id, queued);
    } else {
      const res = this.world.placeBuilding('player', type, this.placementPos, worker.id, queued);
      if (!res.ok) {
        this.ui.showToast(res.msg, true);
        return;
      }
    }

    this.world.sound.playBuildPlace(GameWorld.buildingRaceOf(type));
    this.world.sound.speak('Building', true);
    // SC2: holding Shift keeps the placement ghost up to queue more structures for the same worker
    if (queued && !this.world.buildingLockReason('player', type)) return;
    this.cancelBuildingPlacement();
  }

  /** The selected worker died (or every selected unit did) while a placement ghost / targeting cursor was up: cancel it. */
  private dropStaleOrders() {
    this.world.pruneDeadSelection();
    const mine = this.world.selectedEntities.filter(e => (e instanceof Unit || e instanceof Building) && e.playerId === 'player');
    if (this.placingBuildingType && !mine.some(e => e instanceof Unit && isWorkerType(e.type))) {
      this.cancelBuildingPlacement();
      this.ui.setSubmenu('none');
    }
    if (!mine.length) {
      if (this.targetMode) this.cancelTargetMode();
      if (this.abilityTargetId) { this.abilityTargetId = null; this.world.decals.clearPlacementGhost(); document.body.style.cursor = ''; }
    }
  }

  public cancelBuildingPlacement() {
    this.placingBuildingType = null;
    this.world.decals.clearPlacementGhost();
  }

  private updateSelectionBoxUI() {
    const minX = Math.min(this.boxStartScreen.x, this.boxCurrentScreen.x);
    const maxX = Math.max(this.boxStartScreen.x, this.boxCurrentScreen.x);
    const minY = Math.min(this.boxStartScreen.y, this.boxCurrentScreen.y);
    const maxY = Math.max(this.boxStartScreen.y, this.boxCurrentScreen.y);

    this.selectBoxEl.style.display = 'block';
    this.selectBoxEl.style.left = `${minX}px`;
    this.selectBoxEl.style.top = `${minY}px`;
    this.selectBoxEl.style.width = `${maxX - minX}px`;
    this.selectBoxEl.style.height = `${maxY - minY}px`;
  }
}
