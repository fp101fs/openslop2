import * as THREE from 'three';
import { LAYOUT, MAP_LAYOUT_OF } from './maps';
import { ensureBootSlopmapReady } from './levels/SlopmapLoader';
import { AutoQuality } from './graphics/AutoQuality';
import { Renderer } from './graphics/Renderer';
import { FogOfWar } from './graphics/FogOfWar';
import { ParticleSystem } from './graphics/ParticleSystem';
import { Decals } from './graphics/Decals';
import { SoundSystem } from './audio/SoundSystem';
import { loadMatchRigged, loadRigged, hasRigDef, setRiggedProgressListener, whenRiggedReady } from './graphics/RiggedModels';
import { GameWorld } from './simulation/GameWorld';
import { UIManager } from './ui/UIManager';
import { Minimap } from './ui/Minimap';
import { IntroCutscene } from './ui/IntroCutscene';
import { SmithCinematic } from './cinematic/SmithCinematic';
import { InputHandler } from './input/InputHandler';
import { TouchControls, isTouchDevice } from './ui/TouchControls';
import { QuickSelect } from './ui/QuickSelect';
import { UnitType, BuildingType, UpgradeType, MatchConfig } from './types';
import { missionOf, campaignById } from './campaign/registry';
import { markDone, nextMission } from './campaign/progress';
import type { MapId } from './types';
import { UNIT_CONFIGS, CAMPAIGN_MISSIONS, FACTION_TECH, researchHost } from './config';
import { cursorCss } from './input/Cursors';
import { MainMenu } from './ui/MainMenu';
import { NetTransport } from './net/NetClient';
import { NetSync } from './net/NetSync';
import { Chat } from './net/Chat';
import { startPresence } from './net/Presence';
import { Loading } from './ui/LoadingOverlay';
import { Unit } from './simulation/Unit';
import { ABILITIES, castAbility, abilityBlocked, CastTarget } from './simulation/Mechanics';
import { Building } from './simulation/Building';
import { unloadAll, unloadUnit, startSalvage, cancelSalvage } from './simulation/Bunker';
import { PerformanceProfiler } from './utils/PerformanceProfiler';
import { gameSpeedMult } from './settings';
import { captureGame, restoreGame, SAVE_VERSION, type SaveData } from './save/SaveState';
import { GAME_VERSION } from './version';
import { readSave, writeSave } from './save/SaveFiles';

/**
 * Simulation speed multiplier. Unit/building stats in config.ts are already StarCraft II "Faster" values, so 1.0 is SC2-exact
 * ladder pace. Single-player uses the Options > Gameplay > Game Speed setting; multiplayer always runs at Faster.
 */
export function simSpeed(world: { net: unknown }): number {
  return world.net ? 1 : gameSpeedMult();
}

export class StarCraftApp {
  public renderer: Renderer;
  public autoQuality!: AutoQuality;
  public sound: SoundSystem;
  public fog: FogOfWar;
  public particles: ParticleSystem;
  public decals: Decals;
  public world: GameWorld;
  public ui: UIManager;
  public minimap: Minimap;
  public intro: IntroCutscene;
  /** Data missions' in-game UI (dialogue cards, tutorials, cutscenes): loaded on demand, null in skirmish / multiplayer. */
  private missionUI: import('./ui/mission/MissionUI').MissionUI | null = null;
  private missionUIModule: typeof import('./ui/mission/MissionUI') | null = null;
  public cinematic = new SmithCinematic();
  public input: InputHandler;
  public menu!: MainMenu;
  public menuOpen: boolean = true;
  private lastConfig: Partial<MatchConfig> | null = null;
  private netClient: NetTransport | null = null;
  private victoryRecorded = false;
  private matchActive = false;

  private lastTime: number = 0;
  private lastProduceTime: number = 0;

  constructor() {
    const canvasContainer = document.getElementById('canvas-container')!;
    const uiContainer = document.getElementById('ui-container')!;

    // 1. Initialize Graphics Engine (Direct Metal / WebGL2 backend)
    this.renderer = new Renderer(canvasContainer);
    this.autoQuality = new AutoQuality(this.renderer);
    this.autoQuality.onChange = (from, to) => console.info(`[auto quality] ${from} -> ${to}`);
    this.sound = new SoundSystem();
    this.fog = new FogOfWar(this.renderer.scene);
    this.renderer.setFogTexture(this.fog.texture);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.decals = new Decals(this.renderer.scene);

    // 2. Initialize Game Simulation
    this.world = new GameWorld(
      this.renderer.scene,
      this.fog,
      this.particles,
      this.decals,
      this.sound
    );

    this.decals.camera = this.renderer.camera;
    this.particles.voidBeams.camera = this.renderer.camera;
    this.decals.zoomScale = () => this.renderer.minZoom / Math.max(1, this.renderer.cameraDistance);
    { const sz = new THREE.Vector2(); this.decals.viewport = () => { this.renderer.webglRenderer.getDrawingBufferSize(sz); return { w: sz.x, h: sz.y, pr: this.renderer.webglRenderer.getPixelRatio() }; }; }

    // 3. Initialize HUD & Minimap
    this.ui = new UIManager(uiContainer, this.world);
    this.world.onMessage = (m, err) => this.ui.showToast(m, !!err);
    const minimapSlot = document.getElementById('minimap-slot')!;
    this.minimap = new Minimap(minimapSlot, this.world, this.renderer);
    this.addMinimapZoomButtons(minimapSlot);

    // 4. Initialize Input Controller & Opening Semi-Cinematic Scene
    this.input = new InputHandler(this.world, this.renderer, this.ui);
    if (isTouchDevice()) new TouchControls(this.input, this.renderer);
    new QuickSelect(this.input);
    this.intro = new IntroCutscene(this, uiContainer);

    // Register globally for UI event callbacks
    (window as any).gameApp = this;

    // Front-end menu: campaign / skirmish / multiplayer. The intro cutscene plays when Mission 1 launches.
    this.menu = new MainMenu(this, document.body);
    if (this.menuOpen) this.sound.startMenuMusic(); // the menu is up at load

    // "Playing now" counter on the landing page: a tab counts while a match is on screen (not in the menu, not after game over)
    startPresence(() => this.menu.isOpen || this.world.isGameOver ? null : (this.world.matchConfig.mode.startsWith('multiplayer') ? 'multi' : 'single'));

    document.addEventListener('visibilitychange', this.onReturnToTab);
    window.addEventListener('pageshow', this.onReturnToTab);
    // Start Main Loop
    requestAnimationFrame(this.gameLoop.bind(this));

    // Resume a match (or a saved-game load) that triggered a map-size reload
    try {
      const pendingLoad = sessionStorage.getItem('sc2_pending_load');
      if (pendingLoad) {
        sessionStorage.removeItem('sc2_pending_load');
        setTimeout(() => this.loadSavedGame(pendingLoad), 50);
      }
      const pending = sessionStorage.getItem('sc2_pending_match');
      if (pending) {
        sessionStorage.removeItem('sc2_pending_match');
        setTimeout(() => this.startMatch(JSON.parse(pending)), 50);
      }
      // Mission Builder links: ?mission=<campaign>/<key>[&diff=normal][&preview=1] starts that mission at once (Playtest / 3D preview).
      // After a map-size reload the pending match above carries on instead.
      const mq = new URLSearchParams(location.search).get('mission');
      if (mq && !pending && !pendingLoad) {
        const [c, k] = mq.split('/');
        const diff = new URLSearchParams(location.search).get('diff') as MatchConfig['difficulty'] | null;
        if (c && k && missionOf(c, k)) setTimeout(() => this.startPathMission(c, k, diff ?? undefined), 50);
      }
    } catch { /* ignore */ }

    console.log(`OpenSlop II Web v${GAME_VERSION} initialized`);
  }

  // UI Event Handlers
  public startPlacement(type: BuildingType) {
    this.input.startBuildingPlacement(type);
  }

  public setSubmenu(menu: 'none' | 'build_basic' | 'build_advanced') {
    this.ui.setSubmenu(menu);
  }

  public issueCommand(cmdType: string) {
    if (cmdType === 'attack' || cmdType === 'patrol' || cmdType === 'repair' || cmdType === 'load' || cmdType === 'rally') {
      this.input.beginTargetMode(cmdType);
    } else {
      const playerUnits = this.world.selectedEntities.filter(
        ent => ent instanceof Unit && ent.playerId === 'player'
      ) as Unit[];
      playerUnits.forEach(ent => {
        ent.setCommand({ type: cmdType as any });
      });
      if (playerUnits.length > 0) {
        this.sound.playUnitOrder(playerUnits[0]!.type);
      } else {
        this.sound.playCommandConfirm();
      }
    }
  }

  /** Command-card / hotkey entry point for abilities (see Mechanics.ts). Targeted ones arm the click-to-cast cursor. */
  public useAbility(id: string) {
    const def = ABILITIES[id];
    if (!def) return;
    const casters = this.world.selectedEntities.filter(
      (e): e is Unit | Building => (e instanceof Unit || e instanceof Building) && e.playerId === 'player' && def.casters.includes(e.type as string)
    );
    if (casters.length === 0) return;
    if (def.target === 'none') {
      let ok = 0, err: string | null = null;
      casters.forEach(c => { const r = castAbility(this.world, c, id); if (r) err = r; else ok++; });
      if (!ok && err) this.ui.showToast(err, true);
      else this.sound.playCommandConfirm();
      return;
    }
    // Pre-flight: at least one caster must be able to cast it, otherwise tell the player why right away
    const free = casters.find(c => !abilityBlocked(this.world, c, def));
    if (!free) { this.ui.showToast(abilityBlocked(this.world, casters[0]!, def) ?? 'Cannot cast', true); return; }
    this.input.beginAbilityTarget(id);
  }

  public castAbilityAt(id: string, target: CastTarget) {
    const def = ABILITIES[id];
    if (!def) return;
    const casters = this.world.selectedEntities.filter(
      (e): e is Unit | Building => (e instanceof Unit || e instanceof Building) && e.playerId === 'player' && def.casters.includes(e.type as string)
    ).filter(c => !abilityBlocked(this.world, c, def));
    if (casters.length === 0) { this.ui.showToast('No caster available', true); return; }
    // Blink: everyone jumps. Everything else: the caster with the most energy (nearest for ranged casts) acts once.
    const pool = id === 'blink' || id === 'burrow' ? casters : [
      [...casters].sort((a, b) => {
        const tp = target.entity?.pos ?? target.pos;
        const da = tp ? Math.hypot(a.pos.x - tp.x, a.pos.y - tp.y) : 0, db = tp ? Math.hypot(b.pos.x - tp.x, b.pos.y - tp.y) : 0;
        return def.range > 0 ? da - db : b.energy - a.energy;
      })[0]!
    ];
    let err: string | null = null, ok = 0;
    pool.forEach(c => { const r = castAbility(this.world, c, id, target); if (r) err = r; else ok++; });
    if (!ok && err) this.ui.showToast(err, true); else this.sound.playCommandConfirm();
  }

  public triggerStimpack() {
    let triggered = false;
    this.world.selectedEntities.forEach(ent => {
      if (ent instanceof Unit && ent.playerId === 'player') {
        if (ent.activateStimpack(this.world)) {
          triggered = true;
        }
      }
    });
    if (!triggered) {
      this.ui.showToast('Units have insufficient health for stimpack!', true);
    }
  }

  /** SC2 mode-switch hotkey (E / D) for every selected Siege Tank, Thor and Viking. */
  public transformMode(key: 'E' | 'D') {
    this.world.selectedEntities.forEach(ent => {
      if (ent instanceof Unit && ent.playerId === 'player') ent.transformMode(this.world, key);
    });
  }

  public toggleSiege() {
    this.world.selectedEntities.forEach(ent => {
      if (ent instanceof Unit && ent.playerId === 'player') {
        ent.toggleSiegeMode(this.world);
      }
    });
  }

  public triggerAfterburner() {
    let triggered = false;
    this.world.selectedEntities.forEach(ent => {
      if (ent instanceof Unit && ent.playerId === 'player' && ent.isFlying) {
        if (ent.activateAfterburner(this.world)) {
          triggered = true;
        }
      }
    });
    if (!triggered) {
      this.ui.showToast('Afterburner on cooldown or engines damaged!', true);
    }
  }

  public setMusicVolume(percent: number) {
    this.sound.setMusicVolumePercent(percent);
  }

  public setMusicMode(mode: string) {
    this.sound.setMusicMode(mode);
    const track = this.sound.getCurrentTrackInfo();
    if (track) {
      this.ui.showToast(`🎵 Playing: ${track.title} — ${track.composer}`);
    }
  }

  public nextMusicTrack() {
    this.sound.skipToNextTrack();
    const track = this.sound.getCurrentTrackInfo();
    this.ui.showToast(`🎵 Next Track: ${track.title} — ${track.composer}`);
  }

  /** Bunker command card: Unload All (D). */
  public bunkerUnloadAll() {
    this.world.selectedEntities.forEach(ent => {
      if (!(ent instanceof Building && (ent.type === 'bunker' || ent.type === 'nydus_network' || ent.type === 'nydus_worm') && ent.playerId === 'player' && ent.cargo.length)) return;
      if (this.world.shouldRoute(ent)) this.world.net.sendStructureAction(ent.id, 'unload_all'); else unloadAll(this.world, ent);
    });
    this.sound.playCommandConfirm();
  }

  /** Clicking a loaded unit's icon in the selection panel takes that unit out of the Bunker. */
  public bunkerUnloadOne(bunkerId: string, unitId: string) {
    const b = this.world.buildings.find(x => x.id === bunkerId);
    const u = b?.cargo.find(c => c.id === unitId);
    if (!b || !u || b.playerId !== 'player') return;
    if (this.world.shouldRoute(b)) this.world.net.sendStructureAction(b.id, 'unload', { u: u.id }); else unloadUnit(this.world, b, u);
    this.sound.playCommandConfirm();
  }

  /** Bunker command card: Salvage (V) toggles; pressing it again cancels. */
  public bunkerSalvage() {
    this.world.selectedEntities.forEach(ent => {
      if (!(ent instanceof Building) || ent.type !== 'bunker' || ent.playerId !== 'player') return;
      if (ent.salvaging) {
        if (this.world.shouldRoute(ent)) this.world.net.sendStructureAction(ent.id, 'salvage_cancel'); else cancelSalvage(ent);
        this.ui.showToast('Salvage cancelled'); return;
      }
      if (this.world.shouldRoute(ent)) { this.world.net.sendStructureAction(ent.id, 'salvage'); this.ui.showToast('Salvaging Bunker...'); return; }
      const err = startSalvage(this.world, ent);
      if (err) this.ui.showToast(err, true); else this.ui.showToast('Salvaging Bunker...');
    });
  }

  public toggleDepot() {
    this.world.selectedEntities.forEach(ent => {
      if (ent instanceof Building && ent.playerId === 'player') {
        ent.toggleDepot(this.world);
      }
    });
  }

  public cancelResearch(buildingId: string) {
    const b = this.world.buildings.find(x => x.id === buildingId && x.playerId === 'player');
    if (b) { this.world.cancelResearch(b); this.ui.showToast('Research cancelled (refunded)'); }
  }

  public researchUpgrade(type: UpgradeType) {
    const need = researchHost(type, this.world.localFaction);
    if (!this.world.hasConstructed('player', need)) {
      this.ui.showToast(`Requires a completed ${need.replace(/_/g, ' ')}`, true);
      return;
    }
    const res = this.world.researchUpgrade(type);
    if (res.ok) {
      this.sound.playCommandConfirm();
      this.ui.showToast(res.msg);
    } else {
      this.ui.showToast(res.msg, true);
    }
  }


  /** Larva card: morph one of the selected larva into `unitType` (SC2: one unit per press, from the first selected larva that can). */
  public morphLarva(unitType: UnitType) {
    const now = Date.now();
    if (now - this.lastProduceTime < 120) return;
    this.lastProduceTime = now;
    const larvae = this.world.selectedEntities.filter(e => e instanceof Unit && e.type === 'larva' && e.playerId === 'player' && !e.isDead) as Unit[];
    if (!larvae.length) return;
    let last = { ok: false, msg: 'No larva selected' };
    for (const l of larvae) {
      const r = this.world.produceFor('player', l.hatcheryId, unitType, l.id);
      last = r;
      if (r.ok) {
        // the morphed larva is now an egg: drop it from the selection like SC2 does
        l.isSelected = false;
        this.world.selectedEntities = this.world.selectedEntities.filter(e => e !== l);
        this.sound.playCommandConfirm();
        this.ui.showToast(r.msg);
        return;
      }
      if (!/larva/i.test(r.msg)) break; // a cost / tech / supply problem is the same for every larva
    }
    this.ui.showToast(last.msg, true);
  }

  /** Hatchery card: select every larva of the selected Hatchery(ies). */
  public selectLarva() {
    const hatch = this.world.selectedEntities.filter(e => e instanceof Building && e.type === 'hatchery' && e.playerId === 'player') as Building[];
    const ids = new Set(hatch.map(h => h.id));
    const larvae = this.world.units.filter(u => u.type === 'larva' && !u.isDead && ids.has(u.hatcheryId));
    if (!larvae.length) { this.ui.showToast('No larva available', true); return; }
    this.world.selectedEntities.forEach(ent => ent.isSelected = false);
    larvae.forEach(l => l.isSelected = true);
    this.world.selectedEntities = larvae;
    this.sound.playCommandConfirm();
  }

  /** Egg card: cancel the selected eggs (full refund, larva returns). */
  public cancelEgg() {
    const eggs = this.world.selectedEntities.filter(e => e instanceof Unit && e.type === 'egg' && e.playerId === 'player') as Unit[];
    for (const egg of eggs) {
      if (this.world.shouldRoute(egg)) this.world.net?.sendCancelEgg(egg.id);
      else this.world.cancelEgg('player', egg.id);
    }
    this.world.selectedEntities.forEach(e => e.isSelected = false);
    this.world.selectedEntities = [];
    if (eggs.length) this.sound.playCommandConfirm();
  }

  public produceUnit(unitType: UnitType) {
    const selectedBuilding = this.world.selectedEntities.find(
      ent => ent instanceof Building && ent.playerId === 'player'
    ) as Building | undefined;

    if (!selectedBuilding) {
      console.warn('produceUnit called but no player building is selected');
      return;
    }

    const result = this.world.produceFor('player', selectedBuilding.id, unitType);
    if (result.ok) {
      this.sound.playCommandConfirm();
      this.sound.speak('Training', true);
      this.ui.showToast(result.msg);
    } else {
      this.ui.showToast(result.msg, true);
    }
  }

  /** Cancel an in-progress Orbital / Planetary upgrade of the selected structure. */
  public cancelMorph() {
    const b = this.world.selectedEntities.find(e => e instanceof Building && e.playerId === 'player') as Building | undefined;
    if (!b) return;
    if (this.world.shouldRoute(b)) this.world.net.sendStructureAction(b.id, 'cancel_morph'); else b.cancelMorph(this.world);
    this.ui.showToast('Upgrade cancelled');
  }
  /** Cancel the selected structure / add-on under construction (75% refund). */
  public cancelConstruction() {
    const b = this.world.selectedEntities.find(e => e instanceof Building && e.playerId === 'player') as Building | undefined;
    if (b) { if (this.world.shouldRoute(b)) this.world.net.sendStructureAction(b.id, 'cancel_build'); else b.cancelConstruction(this.world); this.world.selectedEntities = this.world.selectedEntities.filter(e => e !== b); this.ui.showToast('Construction cancelled'); }
  }

  public cancelQueueItem(index: number) {
    const selectedBuilding = this.world.selectedEntities.find(
      ent => ent instanceof Building && ent.playerId === 'player'
    ) as Building | undefined;

    if (selectedBuilding) {
      selectedBuilding.cancelQueueItem(index, this.world);
    }
  }

  public enterFpsMode(unit?: Unit) {
    this.input.enterFpsMode(unit);
  }

  public enterThirdPersonMode(unit?: Unit) {
    this.input.enterThirdPersonMode(unit);
  }

  public toggleFpsTps() {
    this.input.toggleFpsTps();
  }

  public exitFpsMode() {
    this.input.exitFpsMode();
  }

  public skipIntro() {
    if (this.intro && this.intro.isActive) {
      this.intro.finish();
    }
  }

  public isPaused: boolean = false;

  public togglePauseMenu() {
    this.isPaused = this.ui.togglePauseMenu() && !this.world.net;
    this.input.resetTouch();
    if (this.isPaused) {
      this.sound.playCommandConfirm();
      try {
        document.exitPointerLock?.();
      } catch {}
    } else {
      this.sound.playCommandConfirm();
    }
  }

  public toggleProfiler(force?: boolean): boolean {
    return this.ui.toggleProfiler(force);
  }

  public toggleUnitInfoMode() {
    this.ui.toggleUnitInfoMode();
  }

  // ---------------------------------------------------------------------
  // Match lifecycle (campaign / skirmish / multiplayer)
  // ---------------------------------------------------------------------
  public hasActiveMatch(): boolean {
    return this.matchActive && !this.world.isGameOver;
  }

  public onMenuOpened() {
    this.menuOpen = true;
  }

  public resumeFromMenu() {
    this.menuOpen = false;
  }

  private prepareForNewMatch() {
    PerformanceProfiler.get().resetFpsHistory();
    if (this.input.placingBuildingType) this.input.cancelBuildingPlacement();
    if (this.renderer.isFpsMode) this.input.exitFpsMode();
    if (this.intro.isActive) this.intro.finish();
    if (this.cinematic.isActive) this.cinematic.finish();
    this.input.isAttackMoveMode = false;
    document.body.style.cursor = '';
    this.input.resetTouch();
    this.isPaused = false;
    this.menuOpen = false;
    this.victoryRecorded = false;
    this.world.selectedEntities.forEach(e => (e.isSelected = false));
  }

  private finishMatchSetup(cfg: MatchConfig, objective: string) {
    this.matchActive = true;
    this.ui.resetForNewMatch();
    this.ui.setObjective(objective);
    const slot = cfg.localPlayerSlot === 'enemy' ? LAYOUT.enemyBase : LAYOUT.playerBase;
    this.renderer.cameraTarget.set(slot.x + 2.5, 0, slot.y + 2.5);
    this.renderer.savedRtsTarget.set(slot.x + 2.5, 0, slot.y + 2.5);
  }

  private objectiveFor(cfg: MatchConfig): string {
    const pm = missionOf(cfg.campaignId, cfg.missionKey);
    if (pm) return pm.objectives.filter(o => o.kind === 'primary').map(o => o.text).join(' · ');
    const mission = cfg.mode === 'campaign' ? CAMPAIGN_MISSIONS.find(m => m.id === cfg.campaignMissionId) : undefined;
    if (mission) return mission.objectiveText;
    if (cfg.mode === 'multiplayer_pvp') return 'Destroy every enemy structure and unit — last commander standing wins';
    if (cfg.mode === 'multiplayer_coop') return `Work together to destroy the ${FACTION_TECH[cfg.enemyFaction].name} AI`;
    return `Destroy all ${FACTION_TECH[cfg.enemyFaction].name} forces`;
  }

  /** Start a single-player match (skirmish or campaign). */
  /** "+" / "-" buttons in the minimap's top-right corner (visible on hover, RTS view only) with a brief zoom read-out. */
  private addMinimapZoomButtons(slot: HTMLElement) {
    const wrap = document.createElement('div'); wrap.className = 'mm-zoom';
    const label = document.createElement('div'); label.className = 'zoom-readout';
    document.body.appendChild(label);
    let hide = 0;
    const press = (dir: 1 | -1) => {
      if (this.renderer.viewMode !== 'rts') return;
      this.renderer.zoomCamera(-dir * this.renderer.cameraDistance * 0.18); // + zooms in, - zooms out
      show();
    };
    const show = () => { label.textContent = `Zoom ${Math.round(Renderer.ZOOM_REF / this.renderer.cameraDistance * 100)}%`; label.classList.add('on'); clearTimeout(hide); hide = window.setTimeout(() => label.classList.remove('on'), 900); };
    const reset = () => { if (this.renderer.viewMode !== 'rts') return; this.renderer.cameraDistance = Renderer.DEFAULT_DISTANCE; this.renderer.zoomCamera(0); show(); };
    const rb = document.createElement('button'); rb.type = 'button'; rb.title = 'Reset zoom'; rb.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3v5h-5"/></svg>';
    rb.addEventListener('mousedown', e => e.stopPropagation()); rb.addEventListener('click', e => { e.stopPropagation(); reset(); }); wrap.appendChild(rb);
    for (const [txt, dir] of [['\u2212', -1], ['+', 1]] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = dir > 0 ? 'Zoom in' : 'Zoom out';
      b.addEventListener('mousedown', e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); press(dir); });
      wrap.appendChild(b);
    }
    slot.appendChild(wrap);
  }

  /** Shows the "Preparing battlefield" card first (so the tap is acknowledged at once), then builds the match behind it. */
  public startMatch(partial: Partial<MatchConfig>) {
    void Loading.show('Preparing battlefield', 'Loading units').then(async () => {
      try {
        // A map-size change reloads the page: decide that BEFORE loading models, or they would be downloaded and parsed twice
        if (this.reloadForMapLayout(partial)) return;
        await this.prepareMatchAssets({ ...this.world.matchConfig, ...partial });
        this.startMatchNow(partial);
      } catch (e) { Loading.hide(); throw e; }
    });
  }

  /** Both races' models load up front behind the loading card, then the shaders warm up; nothing streams in mid-match (that lagged iPads). */
  private async prepareMatchAssets(cfg: MatchConfig) {
    setRiggedProgressListener((d, t) => { Loading.progress(d / t); Loading.sub(`Loading units ${d}/${t}`); });
    await loadMatchRigged([cfg.playerFaction, cfg.enemyFaction], cfg.mode === 'campaign' && !isTouchDevice());
    // data missions (src/campaign/data): their own models (e.g. the Dominion transport) and the mission UI, only when one is played
    const dm = cfg.mode === 'campaign' ? missionOf(cfg.campaignId, cfg.missionKey)?.data : undefined;
    if (dm) {
      const kinds = [...new Set(dm.groups.flatMap(g => g.units.map(u => u.type as string)))].filter(hasRigDef);
      await Promise.all([loadRigged(kinds as any), import('./ui/mission/MissionUI').then(m => { this.missionUIModule = m; })]);
    }
    setRiggedProgressListener(null); Loading.progress(null); Loading.sub('');
    // Shader warm-up (a ~3 s main-thread freeze) happens here, behind the loading card, never during play. Desktop only: iPads skip it.
    if (!isTouchDevice()) {
      Loading.sub('Preparing graphics');
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      await this.renderer.warmUp();
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      Loading.sub('');
    }
  }

  // ---------------------------------------------------------------------
  // Save / Load (single-player only, like SC2)
  // ---------------------------------------------------------------------
  /** Saving is allowed in a running single-player match (not online, not after it ended, not during a cutscene). */
  public canSaveGame(): boolean {
    return this.matchActive && !this.world.net && !this.world.isGameOver && !this.intro.isActive && !this.cinematic.isActive
      && !this.world.matchConfig.mode.startsWith('multiplayer');
  }

  public async saveGame(name: string): Promise<string> {
    if (!this.canSaveGame()) throw new Error('The game cannot be saved right now');
    const data = captureGame(this, name);
    await writeSave(data);
    return data.meta.name;
  }

  /** Load a saved game by name (replaces the current match). */
  public loadSavedGame(name: string) {
    void Loading.show('Loading saved game', name).then(async () => {
      try {
        const data = await readSave(name);
        if (data.v !== SAVE_VERSION) throw new Error('This saved game is from an incompatible version');
        if (MAP_LAYOUT_OF[data.config.mapId] && MAP_LAYOUT_OF[data.config.mapId] !== LAYOUT.id) {
          // the map has another size: reload into it and continue the load on boot
          sessionStorage.setItem('sc2_boot_map', data.config.mapId);
          sessionStorage.setItem('sc2_pending_load', name);
          location.reload();
          return;
        }
        await this.prepareMatchAssets(data.config);
        this.startMatchNow(data.config, data);
      } catch (e) {
        Loading.hide();
        (window as any).__hideSplash?.();
        console.error('[load]', e);
        this.ui.showToast(`Could not load the saved game: ${(e as Error).message}`, true);
      }
    });
  }

  /** Reloads the page into the map's layout (auto-starting this match on boot). True if a reload was triggered. */
  private reloadForMapLayout(partial: Partial<MatchConfig>): boolean {
    const wantMap = partial.mapId ?? this.world.matchConfig.mapId;
    if (MAP_LAYOUT_OF[wantMap] && MAP_LAYOUT_OF[wantMap] !== LAYOUT.id) {
      try {
        sessionStorage.setItem('sc2_boot_map', wantMap);
        sessionStorage.setItem('sc2_pending_match', JSON.stringify(partial));
        location.reload();
        return true;
      } catch { /* storage blocked: fall through and play on the current map */ }
    }
    return false;
  }

  private startMatchNow(partial: Partial<MatchConfig>, restore?: SaveData) {
    this.world.onCameraFocus = (x, y) => { this.renderer.cameraTarget.set(x, 0, y); this.renderer.savedRtsTarget.set(x, 0, y); };
    // The terrain, fog, creep and minimap are built once per page load at the map's size: switching to a map with a
    // different layout (e.g. the 2x Lost Temple) reloads the page into it and auto-starts this match on boot.
    if (this.reloadForMapLayout(partial)) return;
    this.leaveNet();
    this.prepareForNewMatch();
    const cfg: Partial<MatchConfig> = { localPlayerSlot: 'player', isMultiplayerHost: undefined, roomCode: undefined, ...partial };
    this.lastConfig = { ...cfg };
    this.missionUI?.dispose(); this.missionUI = null;
    // data missions' own UI hooks must exist before the mission script runs (configureMatch builds the mission)
    const dm = cfg.mode === 'campaign' ? missionOf(cfg.campaignId, cfg.missionKey)?.data : undefined;
    if (dm && this.missionUIModule) this.missionUI = new this.missionUIModule.MissionUI(this);
    this.world.configureMatch(cfg);
    this.menu.close();
    this.finishMatchSetup(this.world.matchConfig, this.objectiveFor(this.world.matchConfig));

    if (new URLSearchParams(location.search).get('preview') === '1' && this.world.mission) this.enterPreviewMode();

    if (restore) {
      // a saved game picks up where it left off: no intro or cinematic, the objective list is just there
      restoreGame(this, restore);
      this.ui.showObjectives();
      Loading.hide();
      (window as any).__hideSplash?.();
      return;
    }

    const mission = this.world.matchConfig.mode === 'campaign' ? CAMPAIGN_MISSIONS.find(m => m.id === this.world.matchConfig.campaignMissionId) : undefined;
    if (mission?.cinematic === 'smith_outpost') {
      // full-screen cinematic over a frozen match; the mission objective card shows once it ends
      this.isPaused = true;
      this.cinematic.play(() => { this.isPaused = false; this.ui.triggerMissionObjectiveIntro(); });
    } else if (mission?.intro === 'banshee') {
      this.intro.start();
    } else {
      this.ui.triggerMissionObjectiveIntro();
    }
    Loading.hide();
    (window as any).__hideSplash?.();
  }

  /** Mission Builder's 3D preview (?preview=1): lowest graphics preset (not saved), no fog, game paused, so editing stays smooth. */
  private enterPreviewMode() {
    document.body.classList.add('mb-preview'); // hides dialogue cards / tutorials (ui/mission/missionUI.css)
    this.world.sound.setMuted(true); // not persisted: only this preview tab
    this.renderer.setQuality('low', false);
    if (this.world.fog.isFogEnabled) this.world.fog.toggleFog();
    setTimeout(() => { this.isPaused = true; }, 400);
  }

  public startCampaignMission(id: number, difficultyOverride?: MatchConfig['difficulty']) {
    const m = CAMPAIGN_MISSIONS.find(x => x.id === id);
    if (!m) return;
    this.startMatch({
      mode: 'campaign',
      campaignMissionId: m.id,
      playerFaction: m.playerFaction,
      enemyFaction: m.enemyFaction,
      mapId: m.mapId,
      difficulty: difficultyOverride ?? m.difficulty
    });
  }

  /** Start a mission of a pathway campaign (src/campaign). */
  public startPathMission(campaignId: string, key: string, difficultyOverride?: MatchConfig['difficulty']) {
    const m = missionOf(campaignId, key);
    if (!m) return;
    this.startMatch({ mode: 'campaign', campaignId, missionKey: key, campaignMissionId: 0, playerFaction: m.playerFaction, enemyFaction: m.enemyFaction, mapId: m.mapId as MapId, difficulty: difficultyOverride ?? m.difficulty });
  }

  public nextCampaignMission() {
    const cfg = this.world.matchConfig;
    if (cfg.campaignId) {
      const c = campaignById(cfg.campaignId), m = missionOf(cfg.campaignId, cfg.missionKey);
      const n = c && m ? nextMission(c, m) : undefined;
      if (c && n) this.startPathMission(c.id, n.key);
      return;
    }
    const cur = this.world.matchConfig.campaignMissionId ?? 0;
    this.startCampaignMission(cur + 1);
  }

  /** One frame of simulation: online, the sync layer runs the clock (fixed lockstep ticks); otherwise one variable step. */
  private waitingSince = 0;
  private lastSimAt = 0;
  private stepSimulation(dt: number) {
    this.lastSimAt = performance.now();
    const net = this.world.net as NetSync | null;
    if (!net) { this.world.update(dt * simSpeed(this.world)); return; }
    net.advance(dt, step => this.world.update(step));
    // a short "waiting" toast when the other player's orders are late (lag spike, background tab)
    const now = performance.now();
    if (!net.waiting) this.waitingSince = 0;
    else if (!this.waitingSince) this.waitingSince = now;
    else if (now - this.waitingSince > 1500) { this.ui.showToast('Waiting for the other player…'); this.waitingSince = now + 3000; }
  }

  /**
   * Begin an online match. The host picks the sync mode (lockstep unless `?sync=snapshot`) and it travels to the guest in the
   * match config, so both always agree.
   */
  public startMultiplayer(role: 'host' | 'guest', partial: Partial<MatchConfig>, client: NetTransport) {
    const f = { ...this.world.matchConfig, ...partial };
    void loadMatchRigged([f.playerFaction, f.enemyFaction]).then(() => this.startMultiplayerNow(role, partial, client));
  }

  private startMultiplayerNow(role: 'host' | 'guest', partial: Partial<MatchConfig>, client: NetTransport) {
    this.leaveNet();
    this.prepareForNewMatch();
    this.netClient = client;
    Chat.attach(client);
    const cfg: Partial<MatchConfig> = { ...partial, campaignMissionId: undefined };
    this.lastConfig = null;
    this.world.configureMatch(cfg);
    const sync = new NetSync(this.world, client, role, partial.syncMode ?? 'snapshot');
    sync.onPeerLost = () => this.onPeerLost(role);
    sync.onNotice = (msg, err) => this.ui.showToast(msg, err);
    sync.controlGroups = this.input.controlGroups;
    sync.onRemoteTurn = () => this.pumpHidden();
    this.world.net = sync;
    this.startHiddenPump();
    this.menu.close();
    this.finishMatchSetup(this.world.matchConfig, this.objectiveFor(this.world.matchConfig));
    this.ui.triggerMissionObjectiveIntro();
    this.ui.showToast(role === 'host' ? 'Match started — you are the host' : 'Connected to host — good luck, Commander!');
  }

  /**
   * The other player left. PvP: the match ends (the host wins, as before). Co-op: whoever is left keeps playing against the AI
   * (host migration). A lockstep guest already runs the full game; a snapshot guest continues from the host's latest keyframe.
   */
  private onPeerLost(role: 'host' | 'guest') {
    const sync = this.world.net as NetSync | null;
    if (!sync || this.world.isGameOver) return;
    const pvp = this.world.matchConfig.mode === 'multiplayer_pvp';
    if (pvp) {
      this.ui.showToast(role === 'host' ? 'Your opponent disconnected' : 'Lost connection to the host', true);
      this.world.isGameOver = true;
      this.world.gameResult = role === 'host' ? 'victory' : 'defeat';
      return;
    }
    if (role === 'guest' && sync.puppet && !sync.restoreLastKeyframe()) {
      this.ui.showToast('Lost connection to the host', true);
      this.world.isGameOver = true;
      this.world.gameResult = 'defeat';
      return;
    }
    this.continueSolo();
    this.ui.showToast(role === 'host' ? 'Your partner disconnected — carry on, Commander' : 'The host left — you have taken over the match', true);
  }

  /**
   * Browsers stop requestAnimationFrame in hidden tabs. In lockstep the other player would freeze waiting for us, so while
   * the tab is hidden the simulation steps whenever their turn packet arrives (and on a slow timer as a backup).
   */
  private hiddenTimer = 0;
  private startHiddenPump() {
    if (!this.hiddenTimer) this.hiddenTimer = window.setInterval(() => this.pumpHidden(), 250);
  }
  private pumpHidden() {
    if (!document.hidden || !this.world.net || this.world.isGameOver || this.isPaused) return;
    const now = performance.now();
    if (now - this.lastSimAt < 30) return;
    this.stepSimulation(Math.min(0.25, (now - (this.lastSimAt || now)) / 1000));
  }

  /** Host migration: drop the network and keep the running match as a single-player game against the AI. */
  private continueSolo() {
    this.leaveNet();
    this.world.matchConfig = { ...this.world.matchConfig, isMultiplayerHost: true };
  }

  private leaveNet() {
    Chat.detach();
    if (this.hiddenTimer) { window.clearInterval(this.hiddenTimer); this.hiddenTimer = 0; }
    if (this.world.net) {
      (this.world.net as NetSync).dispose();
      this.world.net = null;
    }
    Unit.commandHook = null;
    if (this.netClient) {
      this.netClient.leave();
      this.netClient.close();
      this.netClient = null;
    }
    this.world.matchConfig = { ...this.world.matchConfig, localPlayerSlot: 'player', isMultiplayerHost: undefined };
  }

  public returnToMainMenu() {
    if (this.ui.isMenuOpen) this.ui.togglePauseMenu();
    this.isPaused = false;
    if (this.world.net) {
      // Leaving an online match ends it for this player
      this.leaveNet();
      this.matchActive = false;
      this.world.isGameOver = true;
    }
    if (this.intro.isActive) this.intro.finish();
    this.menu.open();
  }

  public restartMission() {
    if (this.world.net) {
      this.ui.showToast('Restart is unavailable during an online match', true);
      return;
    }
    if (this.lastConfig) {
      this.startMatch(this.lastConfig);
    } else {
      this.menu.open();
    }
  }

  public toggleAudioMute() {
    const isMuted = this.sound.toggleMute();
    this.ui.showToast(isMuted ? 'Audio Muted' : 'Audio Unmuted');
  }

  // 60-120 FPS Main Game Loop
  private loopErrAt = 0;
  /** The next frame is always scheduled first and a frame that throws is logged, never fatal: one bad frame used to stop the loop for good (frozen scene, sounds still firing on taps). */
  private gameLoop(time: number) {
    requestAnimationFrame(this.gameLoop.bind(this));
    try { this.tick(time); } catch (e) {
      const now = performance.now();
      if (now - this.loopErrAt > 2000) { this.loopErrAt = now; console.error('[frame error]', e); }
    }
  }

  /** Back from another tab/app: don't integrate the time spent away, wake audio, drop half-finished touch gestures. */
  private onReturnToTab = () => {
    if (document.hidden) { this.input.resetTouch(); return; }
    this.lastTime = 0;
    this.input.resetTouch();
    this.sound.resume();
  };

  private tick(time: number) {
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;

    PerformanceProfiler.get().tick();

    if (this.menuOpen) {
      // Front-end menu is up: keep the scene rendered but freeze the simulation
      this.autoQuality.reset();
      this.renderer.updateCameraPosition(dt);
      this.renderer.render(0);
      return;
    }

    if (!this.isPaused) {
      // Simulation Tick
      this.world.zoomBoost = this.renderer.isFpsMode ? 1 : Math.min(1.7, Math.max(1, this.renderer.cameraDistance / 46));
      this.sound.setListener(this.renderer.cameraTarget.x, this.renderer.cameraTarget.z, this.renderer.isFpsMode ? 20 : this.renderer.cameraDistance);
      this.stepSimulation(dt);

      // Opening Wraith 3rd-Person Semi-Cinematic Scene or Continuous Player Controls
      if (this.intro && this.intro.isActive) {
        this.intro.update(dt);
      } else {
        this.input.update(dt);
      }

      // Camera Smooth Transitions (including smooth FPS/TPS <-> RTS zoom)
      this.renderer.updateCameraPosition(dt);

      // UI Updates
      this.ui.update();

      // Render Minimap
      this.minimap.render();

      // Persist campaign progress
      if (this.world.isGameOver && !this.victoryRecorded) {
        this.victoryRecorded = true;
        const cfg = this.world.matchConfig;
        if (cfg.campaignId && cfg.missionKey && this.world.gameResult === 'victory') markDone(cfg.campaignId, cfg.missionKey);
        if (cfg.mode === 'campaign' && this.world.gameResult === 'victory' && cfg.campaignMissionId) {
          if (!this.world.completedCampaignMissions.includes(cfg.campaignMissionId)) {
            this.world.completedCampaignMissions.push(cfg.campaignMissionId);
            try {
              localStorage.setItem('sc2_campaign_progress', JSON.stringify(this.world.completedCampaignMissions));
            } catch {}
          }
        }
      }
    } else {
      // Still refresh UI, profiler overlay, and menu music when paused
      this.sound.updateDynamicMusic(dt, this.world);
      this.ui.update();
    }

    if (this.isPaused || document.hidden) this.autoQuality.reset(); else this.autoQuality.tick(time);

    // Render 3D Scene (runs even when paused so scene remains visible behind glass menu)
    this.renderer.render(this.isPaused ? 0 : dt);

  }
}

// Bootstrap once DOM (and any active .slopmap binary) is ready
const bootGame = async () => {
  await ensureBootSlopmapReady();
  new StarCraftApp();
  // boot splash (index.html): leaves as soon as the title screen has painted, or, when a match resumes after a map-size reload, once that match is running
  const hideSplash = () => {
    const sp = document.getElementById('splash');
    if (!sp || sp.classList.contains('out')) return;
    sp.classList.add('out');
    setTimeout(() => sp.remove(), 800);
  };
  (window as any).__hideSplash = hideSplash;
  let resuming = false;
  try { resuming = !!sessionStorage.getItem('sc2_pending_match') || !!sessionStorage.getItem('sc2_pending_load'); } catch { /* ignore */ }
  if (resuming) setTimeout(hideSplash, 15000); // safety net
  else requestAnimationFrame(() => requestAnimationFrame(hideSplash));
};
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => void bootGame());
else void bootGame();
