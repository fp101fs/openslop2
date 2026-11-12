import { WorkerBadges } from './WorkerBadges';
import { GAME_SPEEDS, getSpeedRatio, setSpeedRatio, speedPresetFor, SPEED_MIN, SPEED_MAX, SPEED_STEP, DEFAULT_SPEED_RATIO, getBrightness, setBrightness, DEFAULT_BRIGHTNESS } from '../settings';

import { larvaCount, larvaMorphs, larvaYield, larvaSupply } from '../simulation/Larva';
import { upgradeIcons } from './Icons';
import { applyIconImages, researchIcon } from './IconImages';
import { entityPortrait } from './EntityPortrait';
import { usedCredits, hasOwnWork } from '../credits/ModelCredits';
import { parityHtml } from './parityMd';
import { ABILITIES, abilitiesOf, abilityBlocked, usesLarva } from '../simulation/Mechanics';
import { Renderer } from '../graphics/Renderer';
import * as THREE from 'three';
import { GameWorld } from '../simulation/GameWorld';
import { Entity } from '../simulation/Entity';
import { Unit } from '../simulation/Unit';
import { Building } from '../simulation/Building';
import { UnitType, BuildingType } from '../types';
import { campaignById, missionOf } from '../campaign/registry';
import { nextMission } from '../campaign/progress';
import { riggedModelsReady } from '../graphics/RiggedModels';
import { wireIcon, hpTint } from './SelectionBar';
import { UNIT_CONFIGS, BUILDING_CONFIGS, FACTION_TECH, RESEARCH, CAMPAIGN_MISSIONS, TECHLAB_UNITS, isWorkerType } from '../config';
import { CLASSICAL_SOUNDTRACK } from '../audio/SoundSystem';
import { PerformanceProfiler } from '../utils/PerformanceProfiler';
import { SaveLoadDialog } from './SaveLoadDialog';
import { GAME_VERSION } from '../version';

applyIconImages(); // swap emoji icons for SVG button icons before any HUD renders

/** Values of the Options screen inputs (snapshot for Cancel / Restore Defaults). */
interface OptValues { vol: string; track: string; quality: string; bright?: string; speed?: string }

export class UIManager {
  private world: GameWorld;
  private container: HTMLElement;
  public activeSubmenu: 'none' | 'build_basic' | 'build_advanced' = 'none';
  public isMinimalUnitInfo: boolean = false;
  private lastCommandCardKey: string = '';
  private lastCardEntityId = '';
  private lastSelectionKey: string = '';
  private lastMineralsVal: number = -1;
  private lastGasVal: number = -1;
  private lastSupplyKey: string = '';
  private lastTimerKey: string = '';
  private lastFpsVal: number = -1;
  private lastMusicBadgeKey: string = '';
  private lastObjProgressKey: string = '';
  private lastObjVersion = 0;

  // Elements
  private mineralsEl!: HTMLElement;
  private gasEl!: HTMLElement;
  private supplyEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private topMusicBadgeEl!: HTMLElement;
  private profilerOverlayEl!: HTMLElement;
  public isProfilerOpen: boolean = false;
  private lastProfilerUpdate: number = 0;
  private selectionPanelEl!: HTMLElement;
  private commandCardEl!: HTMLElement;
  /** True while a pointer is held down on the command card: re-rendering then would replace the button before `click` fires. */
  private cardPressed = false;
  private toastContainerEl!: HTMLElement;
  private victoryModalEl!: HTMLElement;
  public gameMenuModalEl!: HTMLElement;
  private saveLoad: SaveLoadDialog | null = null;
  public isMenuOpen: boolean = false;

  // Mission objectives list (top left)
  private missionObjectiveWidgetEl!: HTMLElement;
  private missionObjectiveProgressEl!: HTMLElement;
  /** Fallback objective line for matches without a scripted mission (skirmish). */
  private objectiveText = '';
  /** Player folded the list away by tapping its header. */
  private objectivesCollapsed = false;

  // Possessed Unit (3rd-Person Crimson Skies / 1st-Person Ace Combat + IL-2) HUD Elements
  private fpsOverlayEl!: HTMLElement;
  private fpsModeTagEl!: HTMLElement;
  private fpsUnitNameEl!: HTMLElement;
  private fpsUnitHpEl!: HTMLElement;
  private fpsOwnTelemetryEl!: HTMLElement;
  private fpsTargetTelemetryEl!: HTMLElement;
  private fpsCrosshairEl!: HTMLElement;
  private aceLockReticleEl!: HTMLElement;
  private fpsThreatWarningEl!: HTMLElement;
  private fpsBottomHintsEl!: HTMLElement;

  // Callback when player clicks a building to place
  public onStartPlacement: ((buildingType: BuildingType) => void) | null = null;
  public onIssueCommand: ((cmdType: string) => void) | null = null;

  constructor(container: HTMLElement, world: GameWorld) {
    this.container = container;
    this.world = world;

    this.createLayout();
    this.workerBadges = new WorkerBadges(container, world);
  }

  private createLayout() {
    const trackOptionsHtml = [
      `<option value="auto">Auto (Dynamic RTS Situation Crossfade)</option>`,
      ...CLASSICAL_SOUNDTRACK.map(
        (t, idx) => `<option value="${t.id}">${idx + 1}. ${t.title} – ${t.composer} (${t.situation})</option>`
      )
    ].join('');

    this.container.innerHTML = `
      <!-- TOP RESOURCE & STATUS BAR -->
      <div class="sc2-top-bar">
        <div class="sc2-system-controls">
          <div class="sc2-stat-row">
            <div id="game-fps" class="game-fps-badge" title="Realtime FPS (Click to toggle Resource Profiler)">60 FPS</div>
            <div id="game-timer" class="game-timer">00:00</div>
          </div>
          <button id="btn-music-menu" class="sc2-btn-icon bare" title="Options & BG Music Settings (ESC)"><img class="hud-ico" src="/ui/hud/settings.svg" alt="Settings" draggable="false"></button>
          <button id="btn-profiler" class="sc2-btn-icon" title="Toggle Realtime Resource Profiler (F3)">📊</button>
          <button id="btn-audio" class="sc2-btn-icon bare" title="Toggle Sound Mute (M)"><img class="hud-ico" src="/ui/hud/speaker.svg" alt="Sound" draggable="false"></button>
        </div>

        <div class="sc2-center-status">
        </div>

        <div class="sc2-res-group">
          <div class="sc2-res-item minerals">
            <img class="res-ico" src="/ui/hud/minerals.svg" alt="Minerals" draggable="false">
            <span id="res-minerals" class="value">200</span>
          </div>
          <div class="sc2-res-item gas">
            <img class="res-ico" src="/ui/hud/vespene.svg" alt="Vespene" draggable="false">
            <span id="res-gas" class="value">0</span>
          </div>
          <div class="sc2-res-item supply">
            <img class="res-ico" src="/ui/hud/supply.svg" alt="Supply" draggable="false">
            <span id="res-supply" class="value">8 / 15</span>
          </div>
        </div>
      </div>

      <!-- TOAST NOTIFICATION CONTAINER -->
      <div id="toast-container" class="toast-container"></div>

      <!-- MISSION OBJECTIVES (TOP LEFT, BELOW THE SYSTEM CONTROLS): SC2-style list, the "Main Objectives" header collapses it -->
      <div id="mission-objective-widget" class="sc2-objectives" style="display: none;">
        <div id="mission-objective-progress" class="sc2-obj-list"></div>
      </div>

      <!-- BOTTOM CONTROL CONSOLE -->
      <div class="sc2-bottom-console">
        <!-- MINIMAP SLOT (LEFT) -->
        <div id="minimap-slot" class="console-minimap-slot"></div>

        <!-- SELECTION & STATS PANEL (CENTER) -->
        <div id="selection-panel" class="console-selection-panel">
          <div class="empty-selection-hint">No units selected. Drag left-click to select units.</div>
        </div>

        <!-- COMMAND CARD (RIGHT) -->
        <div id="command-card" class="console-command-card">
          <!-- 3x3 Grid Buttons will be dynamically populated -->
        </div>
      </div>

      <!-- POSSESSED UNIT (CRIMSON SKIES 3RD-PERSON / ACE COMBAT + IL-2 1ST-PERSON) HUD OVERLAY -->
      <div id="fps-hud-overlay" class="fps-hud-overlay" style="display: none;">
        <div class="fps-top-bar">
          <div class="fps-unit-info">
            <span id="fps-mode-tag" style="color: #38bdf8; font-weight: 800;">[3RD PERSON: CRIMSON SKIES + ACE COMBAT]</span>
            <span id="fps-unit-name" class="name">UNIT</span>
            <span id="fps-unit-hp" class="hp" style="color: #22c55e;">HP: 100/100</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="btn-toggle-view" class="fps-btn-toggle" onclick="event.stopPropagation(); window.gameApp.toggleFpsTps()">SWITCH VIEW (V/F)</button>
            <button id="btn-exit-fps" class="fps-btn-exit" onclick="event.stopPropagation(); window.gameApp.exitFpsMode()">EXIT VIEW (ESC)</button>
          </div>
        </div>

        <!-- DIRECTIONAL THREAT WARNING BANNER -->
        <div id="fps-threat-warning" class="fps-threat-warning" style="display: none;">
          ⚠️ WARNING: HOSTILE FIRE / MISSILE THREAT DETECTED — EVADE [Q / E]
        </div>

        <!-- SIDE TELEMETRY PANELS (IL-2 COMPONENT DAMAGE & ACE COMBAT TARGETING) -->
        <div class="fps-side-panels">
          <div id="fps-own-telemetry" class="fps-telemetry-card"></div>
          <div id="fps-target-telemetry" class="fps-telemetry-card right"></div>
        </div>

        <!-- CENTER CROSSHAIR / COCKPIT GUNSIGHT -->
        <div id="fps-crosshair" class="fps-crosshair">
          <div class="fps-crosshair-brackets"></div>
          <div class="fps-pitch-ladder"></div>
        </div>

        <!-- ACE COMBAT 3D TARGET LOCK BOX -->
        <div id="ace-lock-reticle" class="ace-lock-reticle" style="display: none;">
          <div class="ace-lock-diamond"></div>
          <div id="ace-lock-label" class="ace-lock-label">LOCK</div>
        </div>

        <div id="fps-bottom-hints" class="fps-bottom-hints">
          <span>[W,A,S,D]</span> Maneuver | <span>[SPACE]</span> Afterburner/Dash | <span>[Q/E]</span> Barrel Roll | <span>[L-CLICK]</span> Primary | <span>[R-CLICK]</span> Missiles | <span>[X]</span> Aim Sub-Component | <span>[V/F]</span> 3rd/1st View
        </div>
      </div>

      <!-- VICTORY / DEFEAT MODAL -->
      <div id="game-over-modal" class="sc2-modal-overlay" style="display: none;">
        <div class="sc2-modal-box">
          <h1 id="modal-title" class="sc2-modal-title">VICTORY</h1>
          <p id="modal-desc" class="sc2-modal-desc">Sector Vanguard secured.</p>
          <div class="sc2-modal-actions">
            <button id="btn-next-mission" class="sc2-btn primary" style="display:none;">NEXT MISSION ▶</button>
            <button id="btn-play-again" class="sc2-btn primary">PLAY AGAIN</button>
            <button id="btn-to-menu" class="sc2-btn">MAIN MENU</button>
          </div>
        </div>
      </div>

      <!-- GAME MENU: SC2-style dialog (MENU / OPTIONS / HELP / TUTORIAL / CREDITS panels) -->
      <div id="game-menu-modal" class="sc2-modal-overlay" style="display: none;">
        <div id="sc2m-main" class="sc2m">
          <div class="globe" title="Language">🌐</div>
          <h2>Menu</h2>
          <button class="mb" id="mb-save" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('save')">Save Game</button>
          <button class="mb" id="mb-load" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('load')">Load Game</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('options')">Options</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('help')">Help</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('tutorial')">Tutorial</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('credits')">Credits</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.restartMission()">Restart Mission</button>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.returnToMainMenu()">Quit Game</button>
          <button class="mb gap" onclick="event.stopPropagation(); window.gameApp.togglePauseMenu()">Return to Game</button>
        </div>

        <div id="sc2m-options" class="sc2o" style="display: none;">
          <div class="oh">Options</div>
          <div class="obody">
            <div class="otabs">
              <button class="otab on" data-ot="graphics" onclick="event.stopPropagation(); window.gameApp.ui.optTab('graphics')">Graphics</button>
              <button class="otab" data-ot="sound" onclick="event.stopPropagation(); window.gameApp.ui.optTab('sound')">Sound</button>
              <button class="otab" data-ot="gameplay" onclick="event.stopPropagation(); window.gameApp.ui.optTab('gameplay')">Gameplay</button>
              <span class="otab-sp"></span>
              <button class="otab" data-ot="hotkeys" onclick="event.stopPropagation(); window.gameApp.ui.optTab('hotkeys')">Hotkeys</button>
            </div>
            <div class="opanel">
              <button class="odef" onclick="event.stopPropagation(); window.gameApp.ui.optDefaults()">Restore Defaults</button>
              <div class="opage on" data-op="graphics">
                <h4>Display</h4>
                <div class="ogrid">
                  <label for="quality-select">Render Resolution:</label>
                  <div class="osel"><select id="quality-select">${Renderer.QUALITY_PRESETS.map(q => `<option value="${q.id}">${q.label}</option>`).join('')}</select></div>
                </div>
                <div class="ogrid" style="margin-top: 4px;">
                  <label for="auto-quality">Auto Quality:</label>
                  <label class="ochk"><input id="auto-quality" type="checkbox" checked onchange="window.gameApp.autoQuality.enabled = this.checked" /> Lower quality automatically if the frame rate drops</label>
                </div>
                <div class="ogrid" style="margin-top: 4px;">
                  <label for="brightness-slider">Brightness: <b id="brightness-label">${getBrightness()}%</b></label>
                  <input id="brightness-slider" type="range" min="50" max="150" step="5" value="${getBrightness()}" class="music-slider" />
                </div>
                <div class="oinfo"><span id="quality-info"></span></div>
              </div>
              <div class="opage" data-op="sound">
                <h4>Sound</h4>
                <div class="ogrid">
                  <label for="music-volume-slider">Music Volume: <b id="music-volume-label">35%</b></label>
                  <input id="music-volume-slider" type="range" min="0" max="100" value="35" class="music-slider" />
                  <label for="music-track-select">Soundtrack:</label>
                  <div class="osel"><select id="music-track-select" class="music-select">${trackOptionsHtml}</select></div>
                  <label></label>
                  <div class="orow"><button id="btn-next-track" class="obtn" title="Crossfade to Next Track">Next Track ⏭</button><button id="btn-menu-mute" class="obtn" onclick="event.stopPropagation(); window.gameApp.toggleAudioMute()">Mute / Unmute All</button></div>
                </div>
                <div id="music-now-playing" class="oinfo">Now Playing</div>
              </div>
              <div class="opage" data-op="gameplay">
                <h4>Game</h4>
                <div class="ogrid">
                  <label for="game-speed-select">Game Speed:</label>
                  <div class="osel"><select id="game-speed-select">${GAME_SPEEDS.map(g => `<option value="${g.ratio}"${g.ratio === getSpeedRatio() ? ' selected' : ''}>${g.label} (${g.ratio.toFixed(2)}x)</option>`).join('')}<option value="custom"${speedPresetFor(getSpeedRatio()) ? '' : ' selected'}>Custom</option></select></div>
                  <label for="game-speed-slider">Speed: <b id="game-speed-label">${getSpeedRatio().toFixed(2)}x</b></label>
                  <input id="game-speed-slider" type="range" min="${SPEED_MIN}" max="${SPEED_MAX}" step="${SPEED_STEP}" value="${getSpeedRatio()}" class="music-slider" />
                </div>
                <div class="oinfo">SC2 scale: Normal is 1.0x, Faster (1.4x) is real ladder speed. Multiplayer games always run at Faster.</div>
                <h4>Tools</h4>
                <div class="ogrid">
                  <label>Resource Profiler:</label>
                  <div class="orow"><button id="btn-menu-profiler" class="obtn" onclick="event.stopPropagation(); window.gameApp.toggleProfiler(true); window.gameApp.ui.menuBack(true);">Show Profiler (F3)</button></div>
                </div>
              </div>
              <div class="opage" data-op="hotkeys">
                <h4>Command Your Army</h4>
                <div class="hrow"><span>Select / box-select</span><kbd>Left-Click / Drag</kbd></div>
                <div class="hrow"><span>Move / Attack / Harvest</span><kbd>Right-Click</kbd></div>
                <div class="hrow"><span>Attack-move · Stop · Hold · Patrol</span><kbd>A · S · H · P</kbd></div>
                <div class="hrow"><span>Control groups</span><kbd>Ctrl+1..9 / 1..9</kbd></div>
                <div class="hrow"><span>Camera · Zoom</span><kbd>Arrows / Edges · Wheel</kbd></div>
                <div class="hrow"><span>Center on base</span><kbd>Space</kbd></div>
                <h4>Hybrid RTS / Action</h4>
                <div class="hrow"><span>3rd-Person Possession</span><kbd>V</kbd></div>
                <div class="hrow"><span>1st-Person Cockpit / Optics</span><kbd>F</kbd></div>
                <div class="hrow"><span>Afterburner / Arena Dash</span><kbd>Space / Shift</kbd></div>
                <div class="hrow"><span>Aircraft Barrel Roll</span><kbd>Q / E</kbd></div>
                <div class="hrow"><span>Homing Missiles / APCR Shell</span><kbd>Right-Click / G</kbd></div>
                <div class="hrow"><span>Cycle Target Sub-Component</span><kbd>X / Tab</kbd></div>
                <div class="hrow"><span>Resource Profiler</span><kbd>F3</kbd></div>
              </div>
            </div>
          </div>
          <div class="ofoot">
            <button class="obig gold" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Accept</button>
            <button class="obig" onclick="event.stopPropagation(); window.gameApp.ui.optCancel()">Cancel</button>
          </div>
        </div>

        <div id="sc2m-help" class="sc2m wide" style="display: none;">
          <h2>Help</h2>
          <div class="sec">
            <div class="st"><span>Command Your Army</span></div>
            <div class="hrow"><span>Select / box-select</span><kbd>Left-Click / Drag</kbd></div>
            <div class="hrow"><span>Move / Attack / Harvest</span><kbd>Right-Click</kbd></div>
            <div class="hrow"><span>Attack-move · Stop · Hold · Patrol</span><kbd>A · S · H · P</kbd></div>
            <div class="hrow"><span>Control groups</span><kbd>Ctrl+1..9 / 1..9</kbd></div>
            <div class="hrow"><span>Camera · Zoom</span><kbd>Arrows / Edges · Wheel</kbd></div>
            <div class="hrow"><span>Center on base</span><kbd>Space</kbd></div>
          </div>
          <div class="sec">
            <div class="st"><span>Hybrid RTS / Action Controls</span></div>
            <div class="hrow"><span>3rd-Person Possession</span><kbd>V</kbd></div>
            <div class="hrow"><span>1st-Person Cockpit / Optics</span><kbd>F</kbd></div>
            <div class="hrow"><span>Afterburner / Arena Dash</span><kbd>Space / Shift</kbd></div>
            <div class="hrow"><span>Aircraft Evasive Barrel Roll</span><kbd>Q / E</kbd></div>
            <div class="hrow"><span>Homing Missiles / APCR Shell</span><kbd>Right-Click / G</kbd></div>
            <div class="hrow"><span>Cycle Target Sub-Component</span><kbd>X / Tab</kbd></div>
            <div class="hrow"><span>Resource Profiler Overlay</span><kbd>F3</kbd></div>
          </div>
          <button class="mb back" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Back</button>
        </div>

        <div id="sc2m-tutorial" class="sc2m wide" style="display: none;">
          <h2>Tutorial</h2>
          <div class="sec">
            <p><b>1. Gather.</b> Select SCVs / Drones / Probes and right-click a mineral patch. Workers return cargo to your town hall automatically.</p>
            <p><b>2. Build.</b> Select a worker, open the build menu, place a Supply Depot before you hit the supply cap, then Barracks and a Refinery (the builder starts harvesting gas on its own).</p>
            <p><b>3. Train.</b> Select a production building and train units. Right-click the ground to set a rally point.</p>
            <p><b>4. Fight.</b> Box-select your army and right-click an enemy, or press A and click to attack-move. Take the high ground via your ramp.</p>
            <p><b>5. Win.</b> Destroy every enemy structure. Possess a unit with V or F for an action-game view.</p>
          </div>
          <button class="mb back" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Back</button>
        </div>

        <div id="sc2m-attributions" class="sc2m wide" style="display: none;">
          <h2>Attributions</h2>
          <div class="sec"><p style="margin:0">3D models used in this game, by their creators. Tap a name to open the author's page.</p></div>
          <div id="attrib-list"></div>
          <button class="mb back" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Back</button>
        </div>

        <div id="sc2m-parity" class="sc2m wide parity" style="display: none;">
          <h2>How Close Are We?</h2>
          <div id="parity-body"></div>
          <button class="mb back" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Back</button>
        </div>

        <div id="sc2m-credits" class="sc2m wide" style="display: none;">
          <h2>Credits</h2>
          <div class="sec">
            <p><b>OpenSlop II Web</b> v${GAME_VERSION} - an unofficial, fan-made StarCraft II inspired RTS built with Three.js, Bun and Vite.</p>
            <p>Soundtrack: classical masterpieces (Holst, Dvorak, Grieg, Beethoven, Wagner, Verdi, Mussorgsky, Orff, Mozart, Tchaikovsky...).</p>
            <div id="credits-models"></div>
            <p>StarCraft is a trademark of Blizzard Entertainment. This project is an unofficial tribute and is not affiliated with Blizzard.</p>
          </div>
          <button class="mb" onclick="event.stopPropagation(); window.gameApp.ui.showMenuPanel('attributions')">3D Model Attributions</button>
          <button class="mb back" onclick="event.stopPropagation(); window.gameApp.ui.menuBack()">Back</button>
        </div>
      </div>

      <!-- REALTIME RESOURCE PROFILER OVERLAY (COLOR CODED) -->
      <div id="profiler-overlay" class="profiler-overlay" style="display: none;">
        <div class="profiler-header">
          <div class="profiler-title-row">
            <span class="profiler-icon">📊</span>
            <span class="profiler-title">SUBSYSTEM RESOURCE USAGE</span>
            <span class="profiler-live-tag">LIVE</span>
          </div>
          <div class="profiler-header-actions">
            <span class="profiler-hint">[F3 to Toggle]</span>
            <button id="btn-profiler-close" class="profiler-close-btn" title="Close Profiler Overlay (F3)">✕</button>
          </div>
        </div>

        <div class="profiler-summary-grid">
          <div class="profiler-stat-card">
            <span class="stat-label">FRAMERATE</span>
            <span id="prof-fps" class="stat-val stat-green">60 FPS</span>
          </div>
          <div class="profiler-stat-card">
            <span class="stat-label">ENGINE CPU TIME</span>
            <span id="prof-cpu" class="stat-val">2.8 ms (17%)</span>
          </div>
          <div class="profiler-stat-card">
            <span class="stat-label">GPU DRAW CALLS</span>
            <span id="prof-drawcalls" class="stat-val">38 calls</span>
          </div>
          <div class="profiler-stat-card">
            <span class="stat-label">TRIANGLES RENDERED</span>
            <span id="prof-triangles" class="stat-val">24.2k</span>
          </div>
          <div class="profiler-stat-card">
            <span class="stat-label">JS HEAP MEMORY</span>
            <span id="prof-ram" class="stat-val">--</span>
          </div>
          <div class="profiler-stat-card">
            <span class="stat-label">60 FPS TARGET</span>
            <span class="stat-val" style="color: #38bdf8;">16.67 ms</span>
          </div>
        </div>

        <div class="profiler-breakdown-title">FPS OVER TIME</div>
        <canvas id="prof-fps-graph" class="profiler-fps-graph" width="520" height="110"></canvas>

        <div class="profiler-breakdown-title">MODULE RESOURCE BREAKDOWN & BUDGET</div>
        <div id="profiler-module-list" class="profiler-module-list">
          <!-- Populated in real time -->
        </div>
      </div>
    `;

    // Cache elements
    this.mineralsEl = document.getElementById('res-minerals')!;
    this.gasEl = document.getElementById('res-gas')!;
    this.supplyEl = document.getElementById('res-supply')!;
    this.timerEl = document.getElementById('game-timer')!;
    this.fpsEl = document.getElementById('game-fps')!;
    this.topMusicBadgeEl = document.getElementById('top-music-badge')!;
    this.profilerOverlayEl = document.getElementById('profiler-overlay')!;
    (window as any).__selPick = (id: any, ev?: MouseEvent) => {
      const w = this.world; const ent = w.selectedEntities.find(e => String(e.id) === String(id)); if (!ent) return;
      let next = [ent];
      if (ev?.shiftKey) next = w.selectedEntities.filter(e => e !== ent);
      else if (ev?.ctrlKey || ev?.metaKey) next = w.selectedEntities.filter(e => e.type === ent.type);
      w.selectedEntities.forEach(e => e.isSelected = false); next.forEach(e => e.isSelected = true); w.selectedEntities = next;
    };
    this.selectionPanelEl = document.getElementById('selection-panel')!;
    this.commandCardEl = document.getElementById('command-card')!;
    this.commandCardEl.addEventListener('pointerdown', () => { this.cardPressed = true; }, true);
    // Mouse, touch and pen: fire buttons on press, like SC2. A full click / tap needs press and release on the same element,
    // so a card re-render, the :active nudge or a small finger drift during the press would drop the command
    // (on iPad a Probe took several taps). The native click that follows is swallowed so the action runs once.
    let firedOnPress: HTMLElement | null = null;
    this.commandCardEl.addEventListener('pointerdown', (e) => {
      firedOnPress = null;
      if (e.button !== 0 || !e.isPrimary) return;
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.cmd-btn');
      if (!btn) return;
      e.preventDefault(); // no text-selection drag starting from the button
      firedOnPress = btn;
      btn.click();
    });
    this.commandCardEl.addEventListener('click', (e) => {
      if (!e.isTrusted || !firedOnPress) return;
      firedOnPress = null;
      e.stopPropagation(); e.preventDefault();
    }, true);
    window.addEventListener('pointerdown', (e) => { if (!this.commandCardEl.contains(e.target as Node)) firedOnPress = null; }, true);
    const releaseCard = () => { if (this.cardPressed) setTimeout(() => { this.cardPressed = false; }, 0); };
    window.addEventListener('pointerup', releaseCard, true);
    window.addEventListener('pointercancel', releaseCard, true);
    this.toastContainerEl = document.getElementById('toast-container')!;
    this.missionObjectiveWidgetEl = document.getElementById('mission-objective-widget')!;
    this.missionObjectiveProgressEl = document.getElementById('mission-objective-progress')!;
    this.victoryModalEl = document.getElementById('game-over-modal')!;
    this.gameMenuModalEl = document.getElementById('game-menu-modal')!;
    this.saveLoad = new SaveLoadDialog(this.gameMenuModalEl, () => (window as any).gameApp, () => this.menuBack());
    document.body.appendChild(this.gameMenuModalEl); // lives on <body> (fixed, above the front-end screens too)
    this.fpsOverlayEl = document.getElementById('fps-hud-overlay')!;
    this.fpsModeTagEl = document.getElementById('fps-mode-tag')!;
    this.fpsUnitNameEl = document.getElementById('fps-unit-name')!;
    this.fpsUnitHpEl = document.getElementById('fps-unit-hp')!;
    this.fpsOwnTelemetryEl = document.getElementById('fps-own-telemetry')!;
    this.fpsTargetTelemetryEl = document.getElementById('fps-target-telemetry')!;
    this.fpsCrosshairEl = document.getElementById('fps-crosshair')!;
    this.aceLockReticleEl = document.getElementById('ace-lock-reticle')!;
    this.fpsThreatWarningEl = document.getElementById('fps-threat-warning')!;
    this.fpsBottomHintsEl = document.getElementById('fps-bottom-hints')!;

    // Event listeners
    document.getElementById('btn-profiler')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleProfiler();
    });

    this.fpsEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleProfiler();
    });

    document.getElementById('btn-profiler-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleProfiler(false);
    });

    const qualitySel = document.getElementById('quality-select') as HTMLSelectElement | null;
    const qualityInfo = document.getElementById('quality-info');
    if (qualitySel) {
      qualitySel.value = Renderer.loadQuality();
      const refreshInfo = () => { const app = (window as any).gameApp; if (qualityInfo && app) qualityInfo.textContent = app.renderer.getRenderInfo(); };
      qualitySel.addEventListener('change', () => {
        const app = (window as any).gameApp;
        if (app) app.renderer.setQuality(qualitySel.value);
        refreshInfo();
      });
      document.getElementById('btn-music-menu')?.addEventListener('click', () => setTimeout(refreshInfo, 50));
    }

    // Game speed: the slider is the setting; the dropdown presets just move the slider (and read "Custom" in between)
    const speedSel = document.getElementById('game-speed-select') as HTMLSelectElement | null;
    const speedSl = document.getElementById('game-speed-slider') as HTMLInputElement | null;
    const showSpeed = () => {
      const r = getSpeedRatio();
      const lbl = document.getElementById('game-speed-label');
      if (lbl) lbl.textContent = `${r.toFixed(2)}x`;
      if (speedSl && Number(speedSl.value) !== r) speedSl.value = String(r);
      if (speedSel) speedSel.value = speedPresetFor(r) ? String(GAME_SPEEDS.find(g => g.id === speedPresetFor(r))!.ratio) : 'custom';
    };
    speedSl?.addEventListener('input', () => { setSpeedRatio(Number(speedSl.value)); showSpeed(); });
    speedSel?.addEventListener('change', () => { if (speedSel.value !== 'custom') { setSpeedRatio(Number(speedSel.value)); } showSpeed(); });
    const brightSl = document.getElementById('brightness-slider') as HTMLInputElement | null;
    brightSl?.addEventListener('input', () => {
      setBrightness(Number(brightSl.value));
      const lbl = document.getElementById('brightness-label');
      if (lbl) lbl.textContent = `${getBrightness()}%`;
      (window as any).gameApp?.renderer?.setBrightness(getBrightness());
    });

    // Menu button: also answers touchend directly, so an iPad tap opens the menu even if the synthesized click gets lost
    const menuBtn = document.getElementById('btn-music-menu');
    if (menuBtn) {
      const openMenu = () => { const app = (window as any).gameApp; if (app) { app.input?.resetTouch?.(); app.togglePauseMenu(); } };
      menuBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); openMenu(); }, { passive: false });
      menuBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(); });
    }

    this.topMusicBadgeEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const app = (window as any).gameApp;
      if (app) app.togglePauseMenu();
    });

    // the list is re-rendered as HTML, so the header click is delegated
    this.missionObjectiveWidgetEl?.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.o-head')) return;
      e.stopPropagation();
      this.objectivesCollapsed = !this.objectivesCollapsed;
      this.missionObjectiveWidgetEl.classList.toggle('collapsed', this.objectivesCollapsed);
    });

    // Music Volume Slider & Track Selector
    const volSlider = document.getElementById('music-volume-slider') as HTMLInputElement | null;
    const volLabel = document.getElementById('music-volume-label');
    if (volSlider) {
      volSlider.value = String(this.world.sound.getMusicVolumePercent());
      if (volLabel) volLabel.innerText = `${volSlider.value}%`;
      volSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        const val = Number(volSlider.value);
        if (volLabel) volLabel.innerText = `${val}%`;
        this.world.sound.setMusicVolumePercent(val);
      });
    }

    const trackSelect = document.getElementById('music-track-select') as HTMLSelectElement | null;
    if (trackSelect) {
      trackSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        const app = (window as any).gameApp;
        if (app) app.setMusicMode(trackSelect.value);
      });
    }

    document.getElementById('btn-next-track')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const app = (window as any).gameApp;
      if (app) app.nextMusicTrack();
      if (trackSelect) {
        trackSelect.value = this.world.sound.musicMode;
      }
    });

    const audioBtn = document.getElementById('btn-audio');
    const syncAudioIcon = (muted: boolean) => { const img = audioBtn?.querySelector('img'); if (img) img.src = muted ? '/ui/hud/mute.svg' : '/ui/hud/speaker.svg'; };
    this.world.sound.onMuteChange = syncAudioIcon; // keeps the icon right even when muted via the M hotkey
    syncAudioIcon(this.world.sound.isAudioMuted());
    audioBtn?.addEventListener('click', () => { this.world.sound.toggleMute(); });

    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      (window as any).gameApp.restartMission();
    });
    document.getElementById('btn-to-menu')?.addEventListener('click', () => {
      (window as any).gameApp.returnToMainMenu();
    });
    document.getElementById('btn-next-mission')?.addEventListener('click', () => {
      (window as any).gameApp.nextCampaignMission();
    });
  }

  // Triggered right after the opening cutscene switches from 3rd-person to RTS view: the objective list fades in
  public triggerMissionObjectiveIntro() {
    window.setTimeout(() => {
      if (!this.missionObjectiveWidgetEl) return;
      this.showObjectives();
      this.world.sound.playCommandConfirm();
    }, 450);
  }

  /** Show the objective list (fades in the first time). */
  public showObjectives() {
    const el = this.missionObjectiveWidgetEl;
    if (el.style.display !== 'none') return;
    el.style.display = 'block';
    el.classList.remove('intro'); void el.offsetWidth; el.classList.add('intro');
  }

  public showToast(message: string, isError: boolean = false) {
    const toast = document.createElement('div');
    toast.className = `sc2-toast ${isError ? 'error' : 'info'}`;
    toast.innerText = message;
    this.toastContainerEl.appendChild(toast);

    if (isError) {
      this.world.sound.playError();
      this.world.sound.adjutantForMessage(message);
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  private workerBadges: WorkerBadges;

  public update() {
    const app = (window as any).gameApp;
    if (app?.renderer?.camera) this.workerBadges.update(app.renderer.camera);
    // 1. Resources (diffed to avoid 60Hz redundant DOM text layout reflows)
    const pRes = this.world.resources['player'];
    const minVal = Math.floor(pRes.minerals);
    if (minVal !== this.lastMineralsVal) {
      this.lastMineralsVal = minVal;
      this.mineralsEl.innerText = minVal.toString();
    }
    const gasVal = Math.floor(pRes.gas);
    if (gasVal !== this.lastGasVal) {
      this.lastGasVal = gasVal;
      this.gasEl.innerText = gasVal.toString();
    }
    const supKey = `${pRes.supply}/${pRes.maxSupply}`;
    if (supKey !== this.lastSupplyKey) {
      this.lastSupplyKey = supKey;
      this.supplyEl.innerText = `${Math.floor(pRes.supply)} / ${pRes.maxSupply}`;
      this.supplyEl.style.color = pRes.supply >= pRes.maxSupply ? '#ff4444' : '#00ff88';
    }

    // 2. Timer, Realtime FPS & Classical Music Status
    const mins = Math.floor(this.world.gameTime / 60);
    const secs = Math.floor(this.world.gameTime % 60);
    const timerKey = `${mins}:${secs}`;
    if (timerKey !== this.lastTimerKey) {
      this.lastTimerKey = timerKey;
      this.timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    const curTrack = this.world.sound.getCurrentTrackInfo();
    const volPct = this.world.sound.getMusicVolumePercent();
    if (this.topMusicBadgeEl && curTrack) {
      const musicKey = `${this.isMinimalUnitInfo ? 'min' : 'std'}_${curTrack.id}_${volPct}`;
      if (musicKey !== this.lastMusicBadgeKey) {
        this.lastMusicBadgeKey = musicKey;
        if (this.isMinimalUnitInfo) {
          this.topMusicBadgeEl.classList.add('minimal-music-btn');
          this.topMusicBadgeEl.innerText = '🎵';
          this.topMusicBadgeEl.title = `🎵 ${curTrack.title} (${volPct}%) — Click to open Music Settings (ESC)`;
        } else {
          this.topMusicBadgeEl.classList.remove('minimal-music-btn');
          this.topMusicBadgeEl.innerText = `🎵 ${curTrack.title} (${volPct}%)`;
          this.topMusicBadgeEl.title = 'Click to open Soundtrack & Game Options (ESC)';
        }
      }
    }

    if (this.isMenuOpen && curTrack) {
      const nowPlayingEl = document.getElementById('music-now-playing');
      if (nowPlayingEl) {
        nowPlayingEl.innerText = `Now Playing: ${curTrack.title} – ${curTrack.composer} [${curTrack.situation}]`;
      }
      const volSlider = document.getElementById('music-volume-slider') as HTMLInputElement | null;
      const volLabel = document.getElementById('music-volume-label');
      if (volSlider && document.activeElement !== volSlider) {
        volSlider.value = String(volPct);
      }
      if (volLabel) {
        volLabel.innerText = `${volPct}%`;
      }
    }

    const profiler = PerformanceProfiler.get();
    const fps = profiler.currentFps;
    if (this.fpsEl && fps !== this.lastFpsVal) {
      this.lastFpsVal = fps;
      this.fpsEl.innerText = `${fps} FPS`;
      if (fps >= 55) {
        this.fpsEl.style.color = '#22c55e';
      } else if (fps >= 30) {
        this.fpsEl.style.color = '#eab308';
      } else {
        this.fpsEl.style.color = '#ef4444';
      }
    }

    // Refresh profiler overlay if open (~5Hz update rate to prevent DOM overhead)
    const now = performance.now();
    if (this.isProfilerOpen && now - this.lastProfilerUpdate > 180) {
      this.lastProfilerUpdate = now;
      this.renderProfilerOverlay();
    }

    // Campaign objective change: pop the panel open, toast completions, then settle on the next objective
    const rt = this.world.mission;
    if (rt && rt.version !== this.lastObjVersion) {
      this.lastObjVersion = rt.version;
      this.showObjectives();
      this.lastObjProgressKey = '';
      for (const ev of rt.log.splice(0)) {
        const o = rt.objectives.get(ev.id);
        if (!o || o.def.passive) continue;
        if (ev.kind === 'complete') this.showToast(`✔ ${o.def.kind === 'bonus' ? 'Bonus objective' : 'Objective'} complete: ${o.def.text}`);
        else if (ev.kind === 'reveal') this.showToast(`New objective: ${o.def.text}`);
      }
    }
    // Objective list: re-rendered only when its text changes
    if (this.missionObjectiveProgressEl && this.missionObjectiveWidgetEl.style.display !== 'none') {
      let html: string;
      if (rt) html = rt.hudHtml();
      else {
        let enemyBlds = 0;
        for (let i = 0; i < this.world.buildings.length; i++) {
          const b = this.world.buildings[i]!;
          if (b.playerId === 'enemy' && !b.isDead) enemyBlds++;
        }
        const esc = this.objectiveText.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        html = `<div class="o-head"><span class="o-tri"></span>Main Objectives</div>`
          + `<div class="o-row"><span class="o-box"></span><span class="o-text">${esc}<span class="o-cnt">(${enemyBlds} Structures Remaining)</span></span></div>`;
      }
      if (html !== this.lastObjProgressKey) { this.lastObjProgressKey = html; this.missionObjectiveProgressEl.innerHTML = html; }
    }

    // 3. Selection & Command Card update
    this.renderSelectionPanel();
    this.renderCommandCard();

    // 4. Update Possessed Unit (3rd-Person Crimson Skies / 1st-Person Ace Combat + IL-2) Overlay
    this.updatePossessedHud();

    // 5. Game over modal
    if (this.world.isGameOver && this.victoryModalEl.style.display === 'none') {
      this.victoryModalEl.style.display = 'flex';
      const title = document.getElementById('modal-title')!;
      const desc = document.getElementById('modal-desc')!;
      const nextBtn = document.getElementById('btn-next-mission')!;
      const cfg = this.world.matchConfig;
      const enemyName = FACTION_TECH[cfg.enemyFaction].name;
      const isVictory = this.world.gameResult === 'victory';
      const isMulti = cfg.mode === 'multiplayer_pvp' || cfg.mode === 'multiplayer_coop';

      if (isVictory) {
        title.innerText = 'VICTORY';
        title.className = 'sc2-modal-title victory';
        desc.innerText = isMulti
          ? 'The opposing forces have been eliminated. Well played, Commander!'
          : this.world.mission ? `Mission accomplished: ${this.world.mission.def.title}.` : `All ${enemyName} forces destroyed. The sector has been reclaimed!`;
        // data missions' end-screen counters (e.g. "Civilians lost: 7 / 61")
        const rt = this.world.mission;
        for (const st of rt?.def.data?.stats ?? []) if (st.showOnVictory) desc.innerText += `\n${st.label}: ${rt!.stat(st.id)}${st.of ? ` / ${st.of}` : ''}`;
      } else {
        title.innerText = 'DEFEAT';
        title.className = 'sc2-modal-title defeat';
        desc.innerText = isMulti
          ? 'Your forces were eliminated. Better luck next match!'
          : this.world.mission ? (this.world.mission.message || `Mission failed: ${this.world.mission.def.title}.`) : `Your forces were overwhelmed by the ${enemyName}.`;
      }
      const pc = campaignById(cfg.campaignId ?? ''), pm = missionOf(cfg.campaignId, cfg.missionKey);
      const hasNext = cfg.mode === 'campaign' && isVictory && (pc && pm
        ? !!nextMission(pc, pm)
        : CAMPAIGN_MISSIONS.some(m => m.id === (cfg.campaignMissionId ?? 0) + 1));
      nextBtn.style.display = hasNext ? '' : 'none';
      document.getElementById('btn-play-again')!.style.display = isMulti ? 'none' : '';
    }
  }

  /** Set the fallback objective line (matches without a scripted mission). */
  public setObjective(text: string) {
    this.objectiveText = text;
    this.lastObjProgressKey = '';
  }

  /** Reset transient HUD state when a new match is configured. */
  public resetForNewMatch() {
    this.victoryModalEl.style.display = 'none';
    this.activeSubmenu = 'none';
    this.lastCommandCardKey = '';
    this.lastSelectionKey = '';
    this.lastObjProgressKey = '';
    this.lastObjVersion = 0;
    if (this.missionObjectiveWidgetEl) this.missionObjectiveWidgetEl.style.display = 'none';
    this.lastMineralsVal = -1;
    this.lastGasVal = -1;
    this.lastSupplyKey = '';
    if (this.isMenuOpen) this.togglePauseMenu();
  }

  private formatIl2ComponentRow(name: string, hp: number): string {
    const pct = Math.round(Math.max(0, Math.min(100, hp)));
    const ascii = Entity.formatAsciiBar(pct);
    const color = pct >= 65 ? '#22c55e' : pct >= 30 ? '#eab308' : '#ef4444';
    return `
      <div class="il2-comp-row" data-comp="${name}">
        <span class="il2-comp-name">${name}</span>
        <span class="il2-comp-pct" style="color: ${color};">${pct}%</span>
        <span class="il2-comp-bar" style="color: ${color};">${ascii}</span>
      </div>
    `;
  }

  public toggleUnitInfoMode() {
    this.isMinimalUnitInfo = !this.isMinimalUnitInfo;
    this.lastSelectionKey = '';
    this.renderSelectionPanel();
  }

  private updatePossessedHud() {
    const app = (window as any).gameApp;
    if (!app || !app.renderer.isFpsMode || !app.renderer.fpsUnit || app.intro?.isActive) {
      this.fpsOverlayEl.style.display = 'none';
      return;
    }

    this.fpsOverlayEl.style.display = 'flex';
    const u = app.renderer.fpsUnit as Unit;
    const uCfg = UNIT_CONFIGS[u.type as UnitType];
    const isTps = app.renderer.viewMode === 'tps';
    const isTank = u.type.includes('tank') || u.type === 'scv';

    // 1. Mode Header Tag
    if (app.intro?.isActive) {
      this.fpsModeTagEl.innerText = '[3RD PERSON RECON: WRAITH-1 // SECTOR VANGUARD]';
      this.fpsModeTagEl.style.color = '#38bdf8';
      this.fpsBottomHintsEl.style.display = 'none';
    } else {
      this.fpsBottomHintsEl.style.display = 'block';
      if (u.isFlying) {
        this.fpsModeTagEl.innerText = isTps
          ? '[3RD PERSON: CRIMSON SKIES + ACE COMBAT]'
          : '[1ST PERSON: ACE COMBAT + IL-2 COCKPIT]';
        this.fpsModeTagEl.style.color = isTps ? '#a855f7' : '#22c55e';
      } else if (isTank) {
        this.fpsModeTagEl.innerText = isTps
          ? '[3RD PERSON: CRIMSON SKIES ARMOR]'
          : '[1ST PERSON: IL-2 GUNNER OPTICS]';
        this.fpsModeTagEl.style.color = isTps ? '#a855f7' : '#38bdf8';
      } else {
        this.fpsModeTagEl.innerText = isTps
          ? '[3RD PERSON: UT / QUAKE 3 / GTA 5]'
          : '[1ST PERSON: QUAKE 3 / UT / GTA 5]';
        this.fpsModeTagEl.style.color = isTps ? '#a855f7' : '#38bdf8';
      }
    }

    this.fpsUnitNameEl.innerText = uCfg ? uCfg.name : u.type;
    this.fpsUnitHpEl.innerText = `HULL: ${Math.floor(u.health)} / ${u.maxHealth} (Armor: ${u.armor})`;

    // 2. Crosshair style (Ace Combat HUD green in 1st-person aircraft)
    if (!isTps && u.isFlying) {
      this.fpsCrosshairEl.classList.add('cockpit-mode');
    } else {
      this.fpsCrosshairEl.classList.remove('cockpit-mode');
    }

    // 3. Directional Threat Warning
    const nearbyThreats = this.world.units.filter(
      e => e.playerId !== u.playerId && !e.isDead && Math.hypot(e.pos.x - u.pos.x, e.pos.y - u.pos.y) <= e.attackRange + 3.5
    );
    if (nearbyThreats.length > 0 || u.hasCriticalDamage()) {
      this.fpsThreatWarningEl.style.display = 'block';
      this.fpsThreatWarningEl.innerText = u.hasCriticalDamage()
        ? '⚠️ CRITICAL COMPONENT DAMAGE — SYSTEM PERFORMANCE DEGRADED'
        : `⚠️ WARNING: ${nearbyThreats.length} HOSTILE THREAT(S) IN FIRING ENVELOPE — EVADE [Q / E / SPACE]`;
    } else {
      this.fpsThreatWarningEl.style.display = 'none';
    }

    // 4. Left Panel: Own Unit Flight / Tactical Telemetry + IL-2 Component Status
    let ownFlightStats = '';
    if (u.isFlying) {
      const kts = Math.round(u.flightSpeed * 58);
      const altFt = Math.round(u.height * 280);
      const abText = u.isAfterburning
        ? `<span style="color:#38bdf8;font-weight:900;">ACTIVE (${u.afterburnerTimer.toFixed(1)}s)</span>`
        : u.afterburnerCooldown > 0
          ? `<span style="color:#eab308;">COOLING (${u.afterburnerCooldown.toFixed(1)}s)</span>`
          : `<span style="color:#22c55e;">READY [SPACE]</span>`;
      ownFlightStats = `
        <div class="telemetry-kv"><span>SPD / ALT:</span><span>${kts} KTS | ${altFt} FT</span></div>
        <div class="telemetry-kv"><span>MISSILES:</span><span style="color:#38bdf8;">${u.missileAmmo} / ${u.maxMissiles} [R-CLICK]</span></div>
        <div class="telemetry-kv"><span>AFTERBURNER:</span>${abText}</div>
      `;
    } else {
      const targetComp = app.input?.precisionTargetComponent?.toUpperCase() || 'AUTO';
      ownFlightStats = `
        <div class="telemetry-kv"><span>MOVE SPEED:</span><span>${(u.speed * u.getSpeedMultiplier()).toFixed(1)} m/s</span></div>
        <div class="telemetry-kv"><span>FIRE RATE:</span><span>${Math.round(u.getFireRateMultiplier() * 100)}%</span></div>
        <div class="telemetry-kv"><span>AIM SUB-TARGET:</span><span style="color:#38bdf8;">[${targetComp}] (X)</span></div>
      `;
    }

    const ownCompHtml = u.components.map(c => this.formatIl2ComponentRow(c.name, c.hp)).join('');
    this.fpsOwnTelemetryEl.innerHTML = `
      <div class="telemetry-title">FLIGHT TELEMETRY</div>
      ${ownFlightStats}
      <div class="il2-comp-list">${ownCompHtml}</div>
    `;

    // 5. Right Panel & 3D Screen Lock Box: Ace Combat Target Acquisition
    const lockedTarget = this.world.findEntityById(u.lockedTargetId);
    if (lockedTarget && !lockedTarget.isDead) {
      const dist = Math.hypot(lockedTarget.pos.x - u.pos.x, lockedTarget.pos.y - u.pos.y);
      const isLocked = u.lockProgress >= 1.0;
      const lockBadge = isLocked
        ? `<span style="color:#ef4444;font-weight:900;">[LOCKED — FIRE MSL]</span>`
        : `<span style="color:#eab308;font-weight:800;">[LOCKING ${Math.round(u.lockProgress * 100)}%]</span>`;
      const tCfg = lockedTarget instanceof Unit
        ? UNIT_CONFIGS[lockedTarget.type]
        : BUILDING_CONFIGS[(lockedTarget as Building).type];
      const targetCompHtml = lockedTarget.components
        .map(c => this.formatIl2ComponentRow(c.name, c.hp))
        .join('');

      this.fpsTargetTelemetryEl.innerHTML = `
        <div class="telemetry-title">ACE COMBAT TARGET TELEMETRY</div>
        <div class="telemetry-kv"><span>TARGET:</span><span style="color:#f8fafc;">${tCfg.name}</span></div>
        <div class="telemetry-kv"><span>RANGE / LOCK:</span><span>${dist.toFixed(1)}m ${lockBadge}</span></div>
        <div class="telemetry-kv"><span>TARGET HULL:</span><span>${Math.floor(lockedTarget.health)} / ${lockedTarget.maxHealth}</span></div>
        <div class="il2-comp-list">${targetCompHtml}</div>
      `;

      // Project 3D target onto screen for Ace Combat diamond reticle
      const rawPos = lockedTarget.getPosition3D();
      const worldPos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
      worldPos.y += lockedTarget instanceof Unit && lockedTarget.isFlying ? 0.2 : 0.8;
      worldPos.project(app.renderer.camera);

      if (worldPos.z < 1.0 && worldPos.z > -1.0) {
        const screenX = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-worldPos.y * 0.5 + 0.5) * window.innerHeight;
        this.aceLockReticleEl.style.display = 'flex';
        this.aceLockReticleEl.style.left = `${screenX}px`;
        this.aceLockReticleEl.style.top = `${screenY}px`;
        this.aceLockReticleEl.className = `ace-lock-reticle ${isLocked ? 'locked' : 'acquiring'}`;
        const lbl = document.getElementById('ace-lock-label');
        if (lbl) {
          lbl.innerText = isLocked
            ? `LOCKED • ${tCfg.name.toUpperCase()} (${dist.toFixed(0)}m)`
            : `TRACKING ${Math.round(u.lockProgress * 100)}%`;
        }
      } else {
        this.aceLockReticleEl.style.display = 'none';
      }
    } else {
      this.aceLockReticleEl.style.display = 'none';
      this.fpsTargetTelemetryEl.innerHTML = `
        <div class="telemetry-title">ACE COMBAT RADAR & OPTICS</div>
        <div class="telemetry-kv"><span>STATUS:</span><span style="color:#94a3b8;">SCANNING SECTOR...</span></div>
        <div class="telemetry-kv"><span>1ST PERSON BONUS:</span><span style="color:#22c55e;">+25% DMG / 2.8x COMPONENT</span></div>
        <div class="telemetry-kv"><span>3RD PERSON MODE:</span><span style="color:#a855f7;">ASSISTED LOCK-ON</span></div>
      `;
    }
  }

  // Render Selection Wireframe / Stats / Queue / IL-2 Component Telemetry
  private renderSelectionPanel() {
    const selected = this.world.selectedEntities;
    this.selectionPanelEl.classList.remove('minimal-mode');

    if (selected.length === 0) {
      const emptyKey = 'empty';
      if (this.lastSelectionKey !== emptyKey) {
        // SC2 clears the middle panel when nothing is selected; keep its space so the command card stays put
        this.selectionPanelEl.className = 'console-selection-panel sb-wrap sel-empty';
        this.selectionPanelEl.innerHTML = '';
        this.lastSelectionKey = emptyKey;
        return;
      }
      if (this.lastSelectionKey !== emptyKey) {
        this.selectionPanelEl.innerHTML = this.isMinimalUnitInfo
          ? `<div class="minimal-empty-row">
               <span class="empty-selection-hint">No units selected</span>
               <button class="unit-info-toggle-btn" onclick="event.stopPropagation(); window.gameApp.toggleUnitInfoMode()" title="Switch to Standard Unit Info View">▲ Standard Info</button>
             </div>`
          : `<div class="standard-empty-row">
               <div class="empty-selection-hint">No units selected. Drag left-click to select units.</div>
               <button class="unit-info-toggle-btn" onclick="event.stopPropagation(); window.gameApp.toggleUnitInfoMode()" title="Switch to Minimal Unit Info View">▼ Minimal Info</button>
             </div>`;
        this.lastSelectionKey = emptyKey;
      }
      return;
    }

    const first = selected[0]!;
    const isResource = 'amount' in first && !('health' in first);
    const isUnit = !isResource && first instanceof Unit;
    const queueSig = !isUnit && !isResource && (first as Building).queue ? (first as Building).queue.map(q => q.type).join(',') + ((first as Building).morphT > 0 ? '|morph' + (first as Building).morphTo : '') : '';
    const isConstructed = !isUnit && !isResource ? (first as Building).isConstructed : true;
    const amountVal = isResource ? (first as any).amount : '';
    const cargoSig = !isUnit && !isResource && ['bunker', 'nydus_network', 'nydus_worm'].includes((first as Building).type)
      ? `${(first as Building).cargo.map(c => c.id).join('+')}|${(first as Building).salvaging ? Math.ceil((first as Building).salvageLeft) : ''}` : '';
    const hpSig = isResource ? '' : selected.length === 1
      ? `${Math.ceil((first as any).health)}_${(first as any).energy !== undefined ? Math.floor((first as any).energy) : ''}_${!isUnit && (first as Building).isConstructed === false ? Math.floor((first as Building).buildProgress * 50) : (first as Building).queue?.[0] ? Math.floor((first as Building).queue[0]!.progress * 50) : ''}`
      : selected.map(e => hpTint((e as any).health / (e as any).maxHealth)[0]).join('');
    const rs = !isUnit && !isResource ? (first as Building).research : null;
    const researchSig = rs ? `${rs.type}:${Math.floor((1 - rs.t / Math.max(0.01, rs.total)) * 50)}` : '';
    const selKey = `sb_${researchSig}_${riggedModelsReady()}_${selected.map(e => e.id).join(',')}_${isConstructed}_${queueSig}_${amountVal}_${cargoSig}_${hpSig}_${this.ctrlGroupSig()}`;

    if (selKey !== this.lastSelectionKey) {
      this.lastSelectionKey = selKey;
      this.rebuildSelectionPanel(first, isUnit, selected);
    } else {
      this.updateSelectionBars(first, isUnit);
    }
  }

  /** Bunker garrison: 4 slots, each loaded unit is an icon - click it to unload that unit (SC2). */
  private bunkerCargoHtml(b: Building, compact = false): string {
    const slots = [0, 1, 2, 3].map(i => {
      const u = b.cargo[i];
      if (!u) return `<div class="queue-slot cargo-slot empty" title="Empty slot"></div>`;
      const cfg = UNIT_CONFIGS[u.type];
      const hp = Math.round((u.health / u.maxHealth) * 100);
      return `<div class="queue-slot cargo-slot active" title="${cfg.name} (${hp}% HP) - click to unload" onclick="event.stopPropagation(); window.gameApp.bunkerUnloadOne('${b.id}','${u.id}')">
          <span>${cfg.icon}</span><span class="cancel-x">×</span>
          <i class="cargo-hp"><b style="width:${hp}%"></b></i>
        </div>`;
    }).join('');
    const salv = b.salvaging
      ? `<div class="progress-bar" title="Salvaging"><div class="fill" style="width:${Math.floor((1 - b.salvageLeft / 5) * 100)}%; background:#f59e0b"></div></div>` : '';
    if (compact) return `<span class="queue-slots cargo-compact">${slots}</span>`;
    return `<div class="queue-display"><div class="queue-slots">${slots}</div>${salv}</div>`;
  }

  private updateSelectionBars(first: any, isUnit: boolean) {
    if ('amount' in first && !('health' in first)) {
      const res = first as any;
      const resFill = this.selectionPanelEl.querySelector('.stat-bar.health .fill') as HTMLElement | null;
      const resText = this.selectionPanelEl.querySelector('.stat-bar.health span') as HTMLElement | null;
      if (resFill && resText) {
        resFill.style.width = `${(res.amount / res.maxAmount) * 100}%`;
        resText.innerText = `Resources: ${res.amount} / ${res.maxAmount}`;
      }
      return;
    }

    // Smoothly update fill bars without touching DOM buttons
    const hpBar = this.selectionPanelEl.querySelector('.stat-bar.health .fill') as HTMLElement | null;
    const hpText = this.selectionPanelEl.querySelector('.stat-bar.health span') as HTMLElement | null;
    if (hpBar && hpText) {
      const pct = Math.max(0, Math.min(100, (first.health / first.maxHealth) * 100));
      hpBar.style.width = `${pct}%`;
      hpText.innerText = `HP: ${Math.floor(first.health)} / ${first.maxHealth}`;
    }

    // Live-update IL-2 Component-Based Damage Telemetry bars & Minimal summary badge
    if (first instanceof Entity && first.components) {
      let lowestComp = first.components[0];
      first.components.forEach(c => {
        if (lowestComp && c.hp < lowestComp.hp) lowestComp = c;
        const row = this.selectionPanelEl.querySelector(`.il2-comp-row[data-comp="${c.name}"]`);
        if (row) {
          const pct = Math.round(Math.max(0, Math.min(100, c.hp)));
          const color = pct >= 65 ? '#22c55e' : pct >= 30 ? '#eab308' : '#ef4444';
          const pctEl = row.querySelector('.il2-comp-pct') as HTMLElement | null;
          const barEl = row.querySelector('.il2-comp-bar') as HTMLElement | null;
          if (pctEl) {
            pctEl.innerText = `${pct}%`;
            pctEl.style.color = color;
          }
          if (barEl) {
            barEl.innerText = Entity.formatAsciiBar(pct);
            barEl.style.color = color;
          }
        }
      });

      const minCompEl = this.selectionPanelEl.querySelector('.minimal-comp-badge') as HTMLElement | null;
      if (minCompEl && lowestComp) {
        const minPct = Math.round(Math.max(0, Math.min(100, lowestComp.hp)));
        const col = minPct >= 65 ? '#22c55e' : minPct >= 30 ? '#eab308' : '#ef4444';
        minCompEl.style.color = col;
        minCompEl.innerText = minPct < 99 ? `⚙️ ${lowestComp.name}: ${minPct}%` : `⚙️ Sys: 100%`;
      }
    }

    if (!isUnit) {
      const b = first as Building;
      if (!b.isConstructed) {
        const pct = Math.floor(b.buildProgress * 100);
        const progFill = this.selectionPanelEl.querySelector('.progress-bar .fill') as HTMLElement | null;
        const progLabel = this.selectionPanelEl.querySelector('.progress-label') as HTMLElement | null;
        if (progFill) progFill.style.width = `${pct}%`;
        if (progLabel) progLabel.innerText = `Under Construction (${pct}%)`;
      } else if (b.morphT > 0) {
        const progFill = this.selectionPanelEl.querySelector('.progress-bar .fill') as HTMLElement | null;
        if (progFill) progFill.style.width = `${Math.floor((1 - b.morphT / Math.max(1, b.morphTotal)) * 100)}%`;
      } else if (b.queue.length > 0) {
        const active = b.queue[0]!;
        const pct = Math.floor(active.progress * 100);
        const progFill = this.selectionPanelEl.querySelector('.progress-bar .fill') as HTMLElement | null;
        if (progFill) progFill.style.width = `${pct}%`;
      }
    } else {
      const u = first as Unit;
      if (u.maxEnergy > 0) {
        const nrgBar = this.selectionPanelEl.querySelector('.stat-bar.energy .fill') as HTMLElement | null;
        const nrgText = this.selectionPanelEl.querySelector('.stat-bar.energy span') as HTMLElement | null;
        if (nrgBar && nrgText) {
          nrgBar.style.width = `${(u.energy / u.maxEnergy) * 100}%`;
          nrgText.innerText = `Energy: ${Math.floor(u.energy)} / ${u.maxEnergy}`;
        }
      }
    }
  }

  private ctrlGroupSig(): string {
    const g = (window as any).__ctrlGroups?.() as Map<number, any[]> | undefined;
    if (!g) return '';
    return [...g.entries()].map(([n, l]) => `${n}:${l.filter((e: any) => !e.isDead).length}`).join(',');
  }

  /** SC2-style bottom-middle bar: single unit, structure (with queue) or many-unit grid with control-group tags. */
  private sc2Bar(first: any, isUnit: boolean, selected: any[]): string {
    const cfgOf = (e: any) => e instanceof Unit ? UNIT_CONFIGS[e.type as UnitType] : BUILDING_CONFIGS[e.type as BuildingType];
    const race = ((cfgOf(first) as any)?.race ?? 'terran') as string;
    const wrapCls = `console-selection-panel sb-wrap`;
    this.selectionPanelEl.className = wrapCls;
    const groups = (window as any).__ctrlGroups?.() as Map<number, any[]> | undefined;
    const inGroup = (e: any) => [...(groups?.entries() ?? [])].filter(([, l]) => l.includes(e)).map(([n]) => n);
    const tabs = groups ? [...groups.entries()].filter(([, l]) => l.some((e: any) => !e.isDead)).sort((a, b) => a[0] - b[0])
      .map(([n, l]) => `<span class="sb-tab ${selected.length && selected.every(e => l.includes(e)) ? 'on' : ''}">${n}</span>`).join('') : '';
    const portrait = (() => { const pu = entityPortrait(first.type, !isUnit, first.playerId === 'player'); return pu ? `<img src="${pu}" alt="">` : ''; })();
    const frame = (inner: string, cls = '') => `<div class="sb sb-${race} ${cls}"><div class="sb-tabs">${tabs}</div>${inner}<div class="sb-portrait">${portrait}</div></div>`;
    const icn = (type: string, b: boolean, t: any) => { const u = wireIcon(type, b, t); return u ? `<img class="sb-wire" src="${u}" alt="">` : `<span class="sb-emoji">${(b ? BUILDING_CONFIGS[type as BuildingType] : UNIT_CONFIGS[type as UnitType]).icon}</span>`; };
    const colorIcon = (type: string) => { const u = entityPortrait(type, false, true); return u ? `<img src="${u}" alt="">` : `<span class="sb-emoji">${UNIT_CONFIGS[type as UnitType].icon}</span>`; };
    const attrs = (c: any) => (c.attributes ?? (c.armorType ? [c.armorType] : ['armored'])).map((a: string) => a[0]!.toUpperCase() + a.slice(1)).join(' - ');

    if (selected.length === 1) {
      const c: any = cfgOf(first);
      const frac = first.health / first.maxHealth;
      const hpTxt = `${Math.ceil(first.health)} / ${first.maxHealth}`;
      let mid = `<div class="sb-name">${c.name}</div>`;
      if (isUnit) {
        const u = first as Unit;
        const up = this.world.upgrades;
        const own = u.playerId === 'player';
        const box = (svg: string, lv: number) => `<span class="sb-up" title="Upgrade level">${svg}<i>${lv}</i></span>`;
        const swordSvg = '<svg viewBox="0 0 24 24"><path d="M5 19 L16 8 M14 6 L18 10 L20 4 Z M4 20 L7 17" stroke="#cfe" stroke-width="2.4" fill="#cfe" stroke-linecap="round"/></svg>';
        const armorSvg = '<svg viewBox="0 0 24 24"><path d="M12 3 L20 6 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 V6 Z" fill="#cfe" opacity=".85"/></svg>';
        const passive = u.type === 'larva' || u.type === 'egg';
        if (!passive) mid += `<div class="sb-line">Kills: <b>${(u as any).kills ?? 0}</b></div><div class="sb-line">Rank: <b>Recruit</b></div>
          <div class="sb-ups">${box(swordSvg, own ? up.weaponsLevel : 0)}${box(armorSvg, own ? up.armorLevel : 0)}</div>`;
        if (u.type === 'egg') {
          const p = u.egg ? u.egg.t / u.egg.total : u.eggProgress;
          const what = u.egg ? UNIT_CONFIGS[u.egg.type].name : 'unit';
          mid += `<div class="sb-train">Hatching ${what}</div><div class="sb-bar"><i style="width:${Math.round(p * 100)}%"></i></div>`;
        }
        if (u.maxEnergy > 0) mid += `<div class="sb-line sb-en">Energy: <b>${Math.floor(u.energy)} / ${u.maxEnergy}</b></div>`;
        if (u.maxMissiles > 0 && u.type !== 'scv' && !passive) mid += `<div class="sb-line sb-en">Missiles: <b>${u.missileAmmo} / ${u.maxMissiles}</b></div>`;
        mid += `<div class="sb-attr">${attrs(c)}</div>`;
      } else {
        const b = first as Building;
        if (!b.isConstructed) {
          const pct = Math.floor(b.buildProgress * 100);
          mid += `<div class="sb-train">Under Construction (${pct}%)</div><div class="sb-bar"><i style="width:${pct}%"></i></div>
            <div class="sb-slots"><button class="sb-slot" title="Cancel construction (75% refund)" onclick="window.gameApp.cancelConstruction()">${colorBuilding(b.type)}<u>×</u></button></div>`;
        } else if (['bunker', 'nydus_network', 'nydus_worm'].includes(b.type)) {
          mid += `<div class="sb-cargo">${this.bunkerCargoHtml(b)}</div>`;
        } else if (b.morphT > 0) {
          const mp = Math.floor((1 - b.morphT / Math.max(1, b.morphTotal)) * 100);
          mid += `<div class="sb-train">Upgrading</div><div class="sb-bar"><i style="width:${mp}%"></i></div>
            <div class="sb-slots"><button class="sb-slot" title="Cancel upgrade (full refund)" onclick="window.gameApp.cancelMorph()">${colorBuilding(b.morphTo ?? 'orbital_command')}<u>×</u></button></div>`;
        } else if (b.queue.length > 0) {
          const pct = Math.floor(b.queue[0]!.progress * 100);
          const slots = [0, 1, 2, 3, 4].map(i => b.queue[i]
            ? `<button class="sb-slot" title="Click to cancel" onclick="window.gameApp.cancelQueueItem(${i})">${colorIcon(b.queue[i]!.type)}</button>`
            : `<span class="sb-slot empty">${i + 1}</span>`).join('');
          mid = `<div class="sb-name">${c.name}</div><div class="sb-qtop"><button class="sb-slot big" title="Click to cancel" onclick="window.gameApp.cancelQueueItem(0)">${colorIcon(b.queue[0]!.type)}</button>
            <div class="sb-qinfo"><div class="sb-train">Training</div><div class="sb-bar"><i style="width:${pct}%"></i></div></div></div><div class="sb-slots">${slots}</div>`;
        } else if (b.research) {
          const r = b.research, rp = Math.floor((1 - r.t / Math.max(0.01, r.total)) * 100);
          mid += `<div class="sb-qtop"><button class="sb-slot big" title="Cancel research (full refund)" onclick="window.gameApp.cancelResearch('${b.id}')">${researchIcon(r.type, this.world.localFaction, '🔬')}<u>×</u></button>
            <div class="sb-qinfo"><div class="sb-train">Researching ${r.name}</div><div class="sb-bar"><i style="width:${rp}%"></i></div><div class="sb-line">${Math.ceil(r.t)}s</div></div></div>`;
        } else {
          mid += `<div class="sb-attr">${attrs(c)} - Structure</div>`;
        }
        void colorBuilding;
      }
      function colorBuilding(t: string) { const pu = entityPortrait(t, true, true); return pu ? `<img src="${pu}" alt="">` : ''; }
      return frame(`<div class="sb-single"><div class="sb-icon">${icn(first.type, !isUnit, hpTint(frac))}<div class="sb-hp sb-${hpTint(frac)}">${hpTxt}</div></div><div class="sb-mid">${mid}</div></div>`);
    }

    // many units: grid, grouped by type, 8 per row (12 when dense)
    const order = [...selected].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
    const dense = order.length > 24;
    const cols = dense ? 12 : 8;
    const shown = order.slice(0, 48);
    const tiles = shown.map(e => {
      const isU = e instanceof Unit;
      const t = hpTint(e.health / e.maxHealth);
      return `<button class="sb-tile" data-id="${e.id}" onpointerdown="event.stopPropagation(); event.preventDefault(); window.__selPick(this.dataset.id, event)" title="${(isU ? UNIT_CONFIGS[e.type as UnitType] : BUILDING_CONFIGS[e.type as BuildingType]).name}">${icn(e.type, !isU, t)}</button>`;
    });
    const rows = Math.ceil(shown.length / cols);
    const tagFor = new Map<number, number>();
    if (groups) for (const [n, l] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const idx = shown.findIndex(e => l.includes(e));
      if (idx >= 0 && !tagFor.has(Math.floor(idx / cols))) tagFor.set(Math.floor(idx / cols), n);
    }
    void inGroup;
    const cells: string[] = [];
    for (let r = 0; r < rows; r++) { cells.push(`<span class="sb-rtag">${tagFor.get(r) ?? ''}</span>`); cells.push(...tiles.slice(r * cols, (r + 1) * cols)); }
    return frame(`<div class="sb-multi ${dense ? 'dense' : ''}"><div class="sb-grid" style="--cols:${cols};--rows:${rows}">${cells.join('')}</div></div>`);
  }

  private rebuildSelectionPanel(first: any, isUnit: boolean, selected: any[]) {
    const toggleBtnHtml = this.isMinimalUnitInfo
      ? `<button class="unit-info-toggle-btn" onclick="event.stopPropagation(); window.gameApp.toggleUnitInfoMode()" title="Expand to Standard Detailed Info View">▲ Standard</button>`
      : `<button class="unit-info-toggle-btn" onclick="event.stopPropagation(); window.gameApp.toggleUnitInfoMode()" title="Collapse to Minimal Compact Info View">▼ Minimal</button>`;

    // Single Selection: Resource Node (Minerals or Gas)
    if (selected.length === 1 && 'amount' in first && !('health' in first)) {
      const res = first as any;
      const isMinerals = res.type === 'minerals';
      const name = isMinerals ? 'Mineral Field' : 'Vespene Geyser';
      const icon = isMinerals ? '💎' : '🟢';
      const color = isMinerals ? '#00d2ff' : '#00ff88';

      if (this.isMinimalUnitInfo) {
        this.selectionPanelEl.innerHTML = `
          <div class="minimal-entity-view">
            <span class="min-icon">${icon}</span>
            <span class="min-name" style="color: ${color};">${name}</span>
            <div class="stat-bar health min-hp-bar">
              <div class="fill" style="width: ${(res.amount / res.maxAmount) * 100}%; background: ${color};"></div>
              <span>Resources: ${res.amount} / ${res.maxAmount}</span>
            </div>
            ${toggleBtnHtml}
          </div>
        `;
      } else {
        this.selectionPanelEl.innerHTML = `
          <div class="unit-stat-header">
            <div class="unit-avatar" style="font-size: 28px;">${icon}</div>
            <div class="unit-info" style="flex:1;">
              <div class="unit-name" style="color: ${color};">${name}</div>
              <div class="unit-role">Natural Resource</div>
            </div>
            ${toggleBtnHtml}
          </div>
          <div class="stat-bars">
            <div class="stat-bar health">
              <div class="fill" style="width: ${(res.amount / res.maxAmount) * 100}%; background: ${color};"></div>
              <span>Resources: ${res.amount} / ${res.maxAmount}</span>
            </div>
          </div>
        `;
      }
      this.commandCardEl.innerHTML = `
        <div class="empty-selection-hint">Send SCVs or Drones to harvest this resource.</div>
      `;
      return;
    }

    if (true) { this.selectionPanelEl.innerHTML = this.sc2Bar(first, isUnit, selected); return; }

    // Single Selection: Unit or Building
    if (selected.length === 1) {
      const config = isUnit ? UNIT_CONFIGS[first.type as UnitType] : BUILDING_CONFIGS[first.type as BuildingType];

      // A. MINIMAL UNIT INFO VIEW (Default — low-profile compact strip that never covers the 3rd-person unit)
      if (this.isMinimalUnitInfo) {

        let minQueueHtml = '';
        if (!isUnit) {
          const b = first as Building;
          if (!b.isConstructed) {
            minQueueHtml = `<span class="min-stat-pill" title="Cancel construction (75% refund)" style="color:#38bdf8;cursor:pointer;" onclick="window.gameApp.cancelConstruction()">🏗️ Cancel ✕</span>`;
          } else if (['bunker', 'nydus_network', 'nydus_worm'].includes(b.type)) {
            minQueueHtml = this.bunkerCargoHtml(b, true);
          } else if (b.morphT > 0) {
            minQueueHtml = `<span class="min-stat-pill" title="Cancel upgrade (full refund)" style="cursor:pointer;" onclick="window.gameApp.cancelMorph()">${BUILDING_CONFIGS[b.morphTo ?? 'orbital_command'].icon} ✕</span>`;
          } else if (b.queue.length > 0) {
            // every queued item is its own clickable icon (like SC2's queue); click one to cancel it
            minQueueHtml = b.queue.map((q, idx) => `<span class="min-stat-pill" title="Click to cancel" style="cursor:pointer;${idx === 0 ? 'outline:1px solid #38bdf8;' : ''}" onclick="window.gameApp.cancelQueueItem(${idx})">${UNIT_CONFIGS[q.type].icon}</span>`).join('');
          }
        } else if ((first as Unit).maxMissiles > 0) {
          minQueueHtml = `<span class="min-stat-pill" style="color:#38bdf8;">🚀 ${(first as Unit).missileAmmo}/${(first as Unit).maxMissiles}</span>`;
        }

        const upgW = this.world.upgrades.weaponsLevel;
        const upgA = this.world.upgrades.armorLevel;
        const upgBadge = first.playerId === 'player' && (upgW > 0 || upgA > 0)
          ? `<span class="min-stat-pill" style="color:#a855f7;">+${upgW}W/+${upgA}A</span>`
          : '';

        this.selectionPanelEl.innerHTML = `
          <div class="minimal-entity-view">
            <span class="min-icon">${config.icon}</span>
            <span class="min-name">${config.name}</span>
            <div class="stat-bar health min-hp-bar">
              <div class="fill" style="width: ${(first.health / first.maxHealth) * 100}%"></div>
              <span>HP: ${Math.floor(first.health)} / ${first.maxHealth}</span>
            </div>
            ${upgBadge}
            ${minQueueHtml}
            ${toggleBtnHtml}
          </div>
        `;
        return;
      }

      // B. STANDARD DETAILED UNIT INFO VIEW
      let extraContent = '';
      if (!isUnit) {
        const b = first as Building;
        if (!b.isConstructed) {
          const pct = Math.floor(b.buildProgress * 100);
          extraContent = `
            <div class="progress-wrap">
              <div class="progress-label">Under Construction (${pct}%)</div>
              <div class="progress-bar"><div class="fill" style="width: ${pct}%"></div></div>
              <div class="queue-slots"><div class="queue-slot active" title="Cancel construction (75% refund)" onclick="window.gameApp.cancelConstruction()"><span>${BUILDING_CONFIGS[b.type].icon}</span><span class="cancel-x">×</span></div></div>
            </div>
          `;
        } else if (['bunker', 'nydus_network', 'nydus_worm'].includes(b.type)) {
          extraContent = this.bunkerCargoHtml(b);
        } else if (b.morphT > 0) {
          const mp = Math.floor((1 - b.morphT / Math.max(1, b.morphTotal)) * 100);
          extraContent = `
            <div class="queue-display">
              <div class="queue-slots"><div class="queue-slot active" title="Cancel upgrade (full refund)" onclick="window.gameApp.cancelMorph()"><span>${BUILDING_CONFIGS[b.morphTo ?? 'orbital_command'].icon}</span><span class="cancel-x">×</span></div></div>
              <div class="progress-bar"><div class="fill" style="width: ${mp}%"></div></div>
            </div>`;
        } else if (b.queue.length > 0) {
          const active = b.queue[0]!;
          const pct = Math.floor(active.progress * 100);
          const queueIcons = b.queue.map((item, idx) => `
            <div class="queue-slot ${idx === 0 ? 'active' : ''}" onclick="window.gameApp.cancelQueueItem(${idx})">
              <span>${UNIT_CONFIGS[item.type].icon}</span>
              <span class="cancel-x">×</span>
            </div>
          `).join('');

          extraContent = `
            <div class="queue-display">
              <div class="queue-slots">${queueIcons}</div>
              <div class="progress-bar"><div class="fill" style="width: ${pct}%"></div></div>
            </div>
          `;
        }
      } else {
        const u = first as Unit;
        if (u.maxEnergy > 0) {
          extraContent = `
            <div class="stat-bar energy">
              <div class="fill" style="width: ${(u.energy / u.maxEnergy) * 100}%"></div>
              <span>Energy: ${Math.floor(u.energy)} / ${u.maxEnergy}</span>
            </div>
          `;
        }
      }

      const compGridHtml = first instanceof Entity && first.components.length > 0
        ? `<div class="il2-selection-grid">${first.components.map((c: any) => this.formatIl2ComponentRow(c.name, c.hp)).join('')}</div>`
        : '';

      this.selectionPanelEl.innerHTML = `
        <div class="single-entity-view">
          <div class="portrait-box">
            ${(() => { const pu = entityPortrait(first.type, !isUnit, first.playerId === 'player'); return pu ? `<img class="portrait-img" src="${pu}" alt="">` : `<span class="portrait-emoji">${config.icon}</span>`; })()}
          </div>
          <div class="details-box">
            <div class="entity-header-row">
              <span class="entity-name">${config.name}</span>
              <div class="stats-row">
                ${isUnit ? `<span>⚔️ ${(first as Unit).damage}</span>` : ''}
                <span>🛡️ ${first.armor}</span>
                ${isUnit && (first as Unit).maxMissiles > 0 ? `<span style="color:#38bdf8;">🚀 ${(first as Unit).missileAmmo}/${(first as Unit).maxMissiles}</span>` : ''}
                ${toggleBtnHtml}
              </div>
            </div>
            <div class="stat-bar health">
              <div class="fill" style="width: ${(first.health / first.maxHealth) * 100}%"></div>
              <span>HP: ${Math.floor(first.health)} / ${first.maxHealth}</span>
            </div>
            ${extraContent}
            ${compGridHtml}
          </div>
        </div>
      `;
    } else {
      // Multi-unit selection
      if (this.isMinimalUnitInfo) {
        const miniIcons = selected.slice(0, 10).map(ent => {
          const uFlag = ent instanceof Unit;
          const cfg = uFlag ? UNIT_CONFIGS[ent.type as UnitType] : BUILDING_CONFIGS[ent.type as BuildingType];
          return `<span class="min-multi-emoji">${cfg.icon}</span>`;
        }).join('');

        this.selectionPanelEl.innerHTML = `
          <div class="minimal-entity-view">
            <span class="min-name">${selected.length} Selected</span>
            <div class="min-multi-strip">${miniIcons}</div>
            ${toggleBtnHtml}
          </div>
        `;
        return;
      }

      const icons = selected.map(ent => {
        const uFlag = ent instanceof Unit;
        const cfg = uFlag ? UNIT_CONFIGS[ent.type as UnitType] : BUILDING_CONFIGS[ent.type as BuildingType];
        const hpPct = Math.floor((ent.health / ent.maxHealth) * 100);
        return `
          <div class="multi-select-icon">
            <span class="icon">${cfg.icon}</span>
            <div class="mini-hp-bar"><div class="fill" style="width: ${hpPct}%"></div></div>
          </div>
        `;
      }).slice(0, 18).join('');

      this.selectionPanelEl.innerHTML = `
        <div class="multi-selection-view">
          <div class="entity-header-row" style="margin-bottom: 6px;">
            <div class="multi-header" style="margin-bottom:0;">${selected.length} Units Selected</div>
            ${toggleBtnHtml}
          </div>
          <div class="multi-grid">${icons}</div>
        </div>
      `;
    }
  }

  // Render 3x3 Command Card Grid (Stable DOM, no recreation unless state changes)
  private renderCommandCard() {
    const selected = this.world.selectedEntities;
    const first = selected.length > 0 ? selected[0] : null;
    const isPlayer = first && 'playerId' in first && first.playerId === 'player';
    // a different unit / structure was selected: leave the Basic / Advanced Build sub-menu and show that selection's own card
    const firstId = first ? first.id : '';
    if (firstId !== this.lastCardEntityId) { this.lastCardEntityId = firstId; this.activeSubmenu = 'none'; }
    const upgSig = `${this.world.upgrades.weaponsLevel}:${this.world.upgrades.armorLevel}:${this.world.upgrades.combatShields}`;
    const techSig = this.world.buildings.reduce((n, bb) => n + (bb.playerId === 'player' && bb.isConstructed ? 1 : 0), 0);
    // Live ability state (energy / cooldowns / toggles / larva / injects) must re-render the card when it changes
    const abilSig = first && (first instanceof Unit || first instanceof Building) && first.playerId === 'player'
      ? `${first.maxEnergy ? Math.floor(first.energy / 5) : ''}|${Object.keys(first.abilityCd).join(',')}|${first.cloaked ? 1 : 0}${first.burrowed ? 1 : 0}|${first instanceof Building ? larvaCount(this.world, first.id) + ':' + first.injects.length + ':' + first.cargo.length + (first.salvaging ? 's' : '') : ''}|${this.world.upgrades.vehicleWeaponsLevel}${this.world.upgrades.vehicleArmorLevel}${this.world.upgrades.shipWeaponsLevel}${this.world.upgrades.shipArmorLevel}${this.world.upgrades.shieldLevel}|${abilitiesOf(first).map(a => (abilityBlocked(this.world, first, a) ? 1 : 0)).join('')}`
      : '';
    const fr = first instanceof Building && first.playerId === 'player' ? first.research : null;
    const researchSig = `${fr ? fr.type + ':' + Math.ceil(fr.t) : ''}|${this.world.buildings.reduce((n, bb) => n + (bb.playerId === 'player' && bb.research ? 1 : 0), 0)}`;
    const cardKey = `${researchSig}_${abilSig}_${techSig}_${this.activeSubmenu}_${first ? first.id + ':' + first.type + ':' + (first instanceof Building ? first.isLowered + first.liftState + Math.ceil(first.morphT) + (first.addonBuildingId ?? '') + (first.addon(this.world)?.type ?? '') : '') + ':' + (first instanceof Unit ? first.isAfterburning + (first.isTransforming ? 'T' + first.transformToType + Math.ceil(first.transformTimer * 10) : '') : '') : 'none'}_${selected.length}_${isPlayer}_${upgSig}`;

    if (cardKey === this.lastCommandCardKey) {
      return;
    }
    if (this.cardPressed) return; // re-render after release so the pressed button's click isn't lost
    this.lastCommandCardKey = cardKey;

    if (selected.length === 0) {
      this.commandCardEl.innerHTML = '';
      return;
    }

    if (!isPlayer) {
      this.commandCardEl.innerHTML = `<div class="enemy-target-label">Enemy Telemetry Active</div>`;
      return;
    }

    let buttonsHtml = '';

    // Submenu: faction-specific worker build menus
    if (this.activeSubmenu === 'build_basic' || this.activeSubmenu === 'build_advanced') {
      const tech = FACTION_TECH[this.world.localFaction];
      const list = this.activeSubmenu === 'build_basic' ? tech.basicBuild : tech.advancedBuild;
      buttonsHtml = list.map(t => {
        const c = BUILDING_CONFIGS[t];
        const lock = this.world.buildingLockReason('player', t);
        const cost = `${c.costMinerals}${c.costGas > 0 ? ` / ${c.costGas}` : ''}`;
        return `
        <button class="cmd-btn ${lock ? 'locked' : ''}" title="${lock ? lock : c.description}" onclick="event.stopPropagation(); window.gameApp.startPlacement('${t}')">
          <span class="icon">${c.icon}</span><span class="name">${c.name}</span><span class="cost">${lock ? '🔒' : cost}</span><span class="hotkey">${c.hotkey}</span>
        </button>`;
      }).join('') + `
        <button class="cmd-btn cancel" data-slot="14" onclick="event.stopPropagation(); window.gameApp.setSubmenu('none')">
          <span class="icon">§X</span><span class="name">Cancel</span><span class="hotkey">Esc</span>
        </button>
      `;
      this.commandCardEl.innerHTML = upgradeIcons(this.cardHtml(buttonsHtml, 0), this.world.localFaction);
      return;
    }

    // Larva: the Zerg unit-morph card. Egg: cancel.
    if (first instanceof Unit && (first.type === 'larva' || first.type === 'egg')) {
      let btns = '';
      if (first.type === 'larva') {
        btns = larvaMorphs(BUILDING_CONFIGS.hatchery.produces).map((t, slot) => {
          const c = UNIT_CONFIGS[t];
          const lock = this.world.unitLockReason('player', t);
          const n = larvaYield(t);
          return `<button class="cmd-btn ${lock ? 'locked' : ''}" data-slot="${slot}" title="${lock ? lock : c.description}" onclick="event.stopPropagation(); window.gameApp.morphLarva('${t}')">
            <span class="icon">${c.icon}</span><span class="name">${c.name}${n > 1 ? ' x' + n : ''}</span>
            <span class="cost">${lock ? '🔒' : `${c.costMinerals}${c.costGas > 0 ? ` / ${c.costGas}` : ''}${larvaSupply(t) ? ` · ${larvaSupply(t)}⚡` : ''}`}</span><span class="hotkey">${c.hotkey}</span></button>`;
        }).join('');
      } else {
        btns = `<button class="cmd-btn" data-slot="14" title="Cancel: full refund, the larva comes back" onclick="event.stopPropagation(); window.gameApp.cancelEgg()">
          <span class="icon">§X</span><span class="name">Cancel</span><span class="hotkey">Esc</span></button>`;
      }
      this.commandCardEl.innerHTML = upgradeIcons(this.cardHtml(btns, 0), this.world.localFaction);
      return;
    }

    // Standard Unit / Building Commands
    if (first instanceof Unit) {
      const u = first as Unit;

      let unitSpecific = '';
      if (isWorkerType(u.type)) {
        unitSpecific = `
          <button class="cmd-btn" data-slot="5" title="Gather" onclick="event.stopPropagation(); window.gameApp.issueCommand('gather')">
            <span class="icon">§G</span><span class="name">Gather</span><span class="hotkey">G</span>
          </button>
          <button class="cmd-btn" data-slot="10" onclick="event.stopPropagation(); window.gameApp.setSubmenu('build_basic')">
            <span class="icon">§B</span><span class="name">Build Structure</span><span class="hotkey">B</span>
          </button>
          <button class="cmd-btn" data-slot="11" onclick="event.stopPropagation(); window.gameApp.setSubmenu('build_advanced')">
            <span class="icon">§V</span><span class="name">Build Advanced Structure</span><span class="hotkey">V</span>
          </button>
          ${u.type === 'scv' ? `<button class="cmd-btn" data-slot="12" title="Repair a damaged Terran structure or mechanical unit (25% of its cost)" onclick="event.stopPropagation(); window.gameApp.issueCommand('repair')">
            <span class="icon">§R</span><span class="name">Repair</span><span class="hotkey">R</span>
          </button>` : ''}
          <button class="cmd-btn" data-slot="14" title="Cancel" onclick="event.stopPropagation(); window.gameApp.issueCommand('stop')">
            <span class="icon">§X</span><span class="name">Cancel</span><span class="hotkey">T</span>
          </button>
        `;
      } else if (u.type === 'marine' || u.type === 'marauder') {
        unitSpecific = `
          <button class="cmd-btn ${u.isStimmed ? 'active' : ''}" onclick="event.stopPropagation(); window.gameApp.triggerStimpack()">
            <span class="icon">💉</span><span class="name">Stimpack</span><span class="hotkey">T</span>
          </button>
        `;
      } else if (u.type === 'siege_tank') {
        unitSpecific = `
          <button class="cmd-btn" onclick="event.stopPropagation(); window.gameApp.toggleSiege()">
            <span class="icon">💥</span><span class="name">Siege Mode</span><span class="hotkey">E</span>
          </button>
        `;
      } else if (u.type === 'siege_tank_sieged') {
        unitSpecific = `
          <button class="cmd-btn active" onclick="event.stopPropagation(); window.gameApp.toggleSiege()">
            <span class="icon">🚜</span><span class="name">Tank Mode</span><span class="hotkey">D</span>
          </button>
        `;
      } else if (u.type === 'thor' || u.type === 'thor_ap' || u.type === 'viking' || u.type === 'viking_assault') {
        // SC2 mode pairs: E / D. The current mode is lit; a switch in progress shows its countdown on the target mode.
        const thor = u.type === 'thor' || u.type === 'thor_ap';
        const modes = thor
          ? [{ key: 'E', type: 'thor_ap', icon: '🎯', name: 'High Impact Payload', tip: '250mm Punisher Cannons: 25 (+10 vs Massive) single-target anti-air, range 11' },
             { key: 'D', type: 'thor', icon: '🎆', name: 'Explosive Payload', tip: 'Javelin Missiles: 6 (+6 vs Light) x4 splash anti-air, range 10' }]
          : [{ key: 'E', type: 'viking', icon: '🛩️', name: 'Fighter Mode', tip: 'Take off: air unit, Lanzer Torpedoes 10 (+4 vs Armored) x2 anti-air, range 9' },
             { key: 'D', type: 'viking_assault', icon: '🦿', name: 'Assault Mode', tip: 'Land: ground unit, Twin Gatling Cannon 12 (+8 vs Mechanical), range 6' }];
        unitSpecific = modes.map(m => {
          const current = u.type === m.type && !u.isTransforming;
          const pending = u.isTransforming && u.transformToType === m.type;
          return `<button class="cmd-btn ${current || pending ? 'active' : ''}" title="${m.tip}" onclick="event.stopPropagation(); window.gameApp.transformMode('${m.key}')">
            <span class="icon">${m.icon}</span><span class="name">${m.name}</span>${pending ? `<span class="cost">${Math.max(0, u.transformTimer).toFixed(1)}s</span>` : ''}<span class="hotkey">${m.key}</span>
          </button>`;
        }).join('');
      } else if (u.isFlying) {
        unitSpecific = `
          <button class="cmd-btn ${u.isAfterburning ? 'active' : ''}" onclick="event.stopPropagation(); window.gameApp.triggerAfterburner()">
            <span class="icon">🔥</span><span class="name">Afterburner</span><span class="hotkey">B</span>
          </button>
        `;
      }

      unitSpecific += this.abilityButtonsHtml(u);


      const viewBtns = isWorkerType(u.type) ? '' : `
        <button class="cmd-btn" data-slot="13" style="border-color: #a855f7;" onclick="event.stopPropagation(); window.gameApp.enterThirdPersonMode()">
          <span class="icon">🎥</span><span class="name">3rd Person</span><span class="hotkey">V</span>
        </button>
        <button class="cmd-btn" data-slot="14" style="border-color: #38bdf8;" onclick="event.stopPropagation(); window.gameApp.enterFpsMode()">
          <span class="icon">🎯</span><span class="name">1st Person</span><span class="hotkey">F</span>
        </button>`;
      buttonsHtml = `
        <button class="cmd-btn" data-slot="0" onclick="event.stopPropagation(); window.gameApp.issueCommand('move')">
          <span class="icon">§M</span><span class="name">Move</span><span class="hotkey">M</span>
        </button>
        <button class="cmd-btn" data-slot="1" onclick="event.stopPropagation(); window.gameApp.issueCommand('stop')">
          <span class="icon">§S</span><span class="name">Stop</span><span class="hotkey">S</span>
        </button>
        <button class="cmd-btn" data-slot="2" onclick="event.stopPropagation(); window.gameApp.issueCommand('hold')">
          <span class="icon">§H</span><span class="name">Hold Position</span><span class="hotkey">H</span>
        </button>
        <button class="cmd-btn" data-slot="3" onclick="event.stopPropagation(); window.gameApp.issueCommand('patrol')">
          <span class="icon">§P</span><span class="name">Patrol</span><span class="hotkey">P</span>
        </button>
        <button class="cmd-btn" data-slot="4" onclick="event.stopPropagation(); window.gameApp.issueCommand('attack')">
          <span class="icon">§A</span><span class="name">Attack</span><span class="hotkey">A</span>
        </button>
        ${viewBtns}
        ${unitSpecific}
      `;
    } else if (first instanceof Building) {
      const b = first as Building;
      const bConfig = BUILDING_CONFIGS[b.type];

      let prodButtons = '';
      bConfig.produces.filter(t => this.world.unitAvailable(t)).forEach((unitType, slot) => {
        if (b.type === 'hatchery' && usesLarva(unitType)) return; // Zerg units morph from larva: select a larva (S)
        const uCfg = UNIT_CONFIGS[unitType];
        const lock = this.world.unitLockReason('player', unitType)
          ?? (TECHLAB_UNITS.has(unitType) && ['barracks', 'factory', 'starport'].includes(b.type) && !b.hasTechLab(this.world) ? 'Requires an attached Tech Lab' : null);
        prodButtons += `
          <button class="cmd-btn ${lock ? 'locked' : ''}" data-slot="${slot}" title="${lock ? lock : uCfg.description}" onclick="event.stopPropagation(); window.gameApp.produceUnit('${unitType}')">
            <span class="icon">${uCfg.icon}</span>
            <span class="name">Build ${uCfg.name}</span>
            <span class="cost">${lock ? '🔒' : `${uCfg.costMinerals}${uCfg.costGas > 0 ? ` / ${uCfg.costGas}` : ''}`}</span>
            <span class="hotkey">${uCfg.hotkey}</span>
          </button>
        `;
      });

      if (b.type === 'gateway' && b.warpGate) prodButtons = ''; // Warp Gates warp units in (ability buttons below)
      if (b.canRally && b.isConstructed && !b.isAirborne) {
        prodButtons += `<button class="cmd-btn" data-slot="12" title="Set the rally point: units from this structure walk there (or right-click the ground / a mineral field)" onclick="event.stopPropagation(); window.gameApp.issueCommand('rally')">
          <span class="icon">§Y</span><span class="name">Set Rally</span><span class="hotkey">Y</span></button>`;
      }
      let abilityButton = '';
      if (b.type === 'bunker' && b.isConstructed) {
        abilityButton = `
          <button class="cmd-btn ${b.cargo.length >= 4 || b.salvaging ? 'locked' : ''}" title="Load a Marine or Marauder (or right-click the Bunker with them selected)" onclick="event.stopPropagation(); window.gameApp.issueCommand('load')">
            <span class="icon">📥</span><span class="name">Load</span><span class="hotkey">C</span>
          </button>
          <button class="cmd-btn ${b.cargo.length ? '' : 'locked'}" title="Unload all units" onclick="event.stopPropagation(); window.gameApp.bunkerUnloadAll()">
            <span class="icon">📤</span><span class="name">Unload All</span><span class="hotkey">D</span>
          </button>
          <button class="cmd-btn ${b.salvaging ? 'active' : ''}" title="${b.salvaging ? 'Cancel salvage' : 'Salvage: unloads the Bunker and refunds 75% (75 minerals) after 5s'}" onclick="event.stopPropagation(); window.gameApp.bunkerSalvage()">
            <span class="icon">${b.salvaging ? '⛔' : '♻️'}</span><span class="name">${b.salvaging ? 'Cancel' : 'Salvage'}</span><span class="hotkey">V</span>
          </button>
        `;
      } else if ((b.type === 'nydus_network' || b.type === 'nydus_worm') && b.isConstructed) {
        abilityButton = `
          <button class="cmd-btn ${b.cargo.length ? '' : 'locked'}" title="Unload every unit inside at this ${b.type === 'nydus_worm' ? 'Worm' : 'Network'}" onclick="event.stopPropagation(); window.gameApp.bunkerUnloadAll()">
            <span class="icon">📤</span><span class="name">Unload All (${b.cargo.length})</span><span class="hotkey">D</span>
          </button>
        `;
      } else if (b.type === 'supply_depot' || b.type === 'supply_depot_lowered') {
        abilityButton = `
          <button class="cmd-btn" onclick="event.stopPropagation(); window.gameApp.toggleDepot()">
            <span class="icon">${b.isLowered ? '⬆️' : '⬇️'}</span>
            <span class="name">${b.isLowered ? 'Raise' : 'Lower'}</span>
            <span class="hotkey">R</span>
          </button>
        `;
      } else if (b.type === FACTION_TECH[this.world.localFaction].upgradeBuilding) {
        const fac = this.world.localFaction;

        abilityButton = `
          ${fac === 'zerg' ? this.researchBtn('melee_attacks', '⚔️', 'Melee', 'W') + this.researchBtn('missile_attacks', '🏹', 'Missile', 'E') : this.researchBtn('weapons', '⚔️', 'Weapons', 'W')}
          ${this.researchBtn('armor', '🛡️', fac === 'zerg' ? 'Carapace' : 'Armor', 'A')}
        `;
      }

      // SC2 mechanics: structure abilities (Scan / MULE / Chrono), Hatchery larva readout, Armory / Forge upgrades
      abilityButton += this.abilityButtonsHtml(b);
      if (b.morphT > 0) {
        abilityButton += `<button class="cmd-btn active"><span class="icon">🛰️</span><span class="name">Upgrading</span><span class="cost">${Math.ceil(b.morphT)}s</span></button>`;
      }
      if (b.type === 'hatchery') {
        abilityButton += `<button class="cmd-btn" data-slot="13" title="Select all larva of this Hatchery" onclick="event.stopPropagation(); window.gameApp.selectLarva()"><span class="icon">🐛</span><span class="name">Select Larva</span><span class="hotkey">S</span></button>`;
        abilityButton += `<button class="cmd-btn" title="Zerg units cost one Larva. Queens Inject Larva for +3 every 29s."><span class="icon">🥚</span><span class="name">Larva ${larvaCount(this.world, b.id)}</span><span class="cost">${b.injects.length ? 'Inject ' + Math.ceil(Math.min(...b.injects)) + 's' : ''}</span></button>`;
      }
      if (b.type === 'armory') {
        abilityButton += this.researchBtn('vehicle_weapons', '🔫', 'Veh Weapons') + this.researchBtn('vehicle_armor', '🛡️', 'Veh Plating')
          + this.researchBtn('ship_weapons', '🚀', 'Ship Weapons') + this.researchBtn('ship_armor', '🪖', 'Ship Plating');
      }
      {
        // One-shot techs hosted by this structure (Metabolic Boost, Charge, Blink, ...)
        const parentType = b.type === 'techlab' ? b.addonParent(this.world)?.type : undefined;
        for (const r of RESEARCH.filter(x => x.building === b.type && (!x.parent || x.parent === parentType))) abilityButton += this.researchBtn(r.id, r.icon, r.name, r.hotkey);
        if (parentType === 'barracks') abilityButton += this.researchBtn('combat_shields', '🔰', 'Combat Shield', 'C');
        if (b.type === 'spire' || b.type === 'greater_spire' || b.type === 'cybernetics_core') {
          abilityButton += this.researchBtn('ship_weapons', b.type === 'cybernetics_core' ? '🚀' : '🦅', 'Air Attack') + this.researchBtn('ship_armor', b.type === 'cybernetics_core' ? '🪖' : '🪽', 'Air Armor');
        }
        if (b.type === 'evolution_chamber') {
          // (ground attack / carapace buttons are on the upgrade-building branch above)
        }
        if (b.research) {
          const r = b.research;
          abilityButton += `<button class="cmd-btn active" title="Click to cancel (100% refund)" onclick="event.stopPropagation(); window.gameApp.cancelResearch('${b.id}')"><span class="icon">🔬</span><span class="name">${r.name}</span><span class="cost">${Math.ceil(r.t)}s ✖</span></button>`;
        }
      }
      if (b.type === 'forge') abilityButton += this.researchBtn('shield_upgrade', '🔷', 'Shields');

      buttonsHtml = `${prodButtons}${abilityButton}`;
    }

    this.commandCardEl.innerHTML = upgradeIcons(this.cardHtml(buttonsHtml, 5), this.world.localFaction);
  }

  /** Command-card button for a research: live cost / time from the world, locked / done / in-progress states. */
  private researchBtn(id: string, icon: string, label: string, hotkey = ''): string {
    const w = this.world;
    const info: any = w.researchInfo(id as any, 'player');
    const busy = w.isResearching('player', id as any);
    const prog = busy ? w.buildings.find(x => x.playerId === 'player' && x.research?.type === id)?.research : null;
    let cls = '', cost = '', title = '', name = label;
    if (prog) { cls = 'active'; cost = `${Math.ceil(prog.t)}s`; name = prog.name; title = `Researching: ${Math.ceil(prog.t)}s left`; }
    else if (info.err) {
      const done = /already/.test(info.err);
      cls = done ? 'active' : 'locked'; cost = done ? (/maximum/.test(info.err) ? 'MAX' : 'DONE') : '🔒'; title = info.err;
    } else { name = info.name; cost = `${info.minerals}${info.gas ? '/' + info.gas : ''}`; title = `${info.name}: ${info.minerals} minerals${info.gas ? ', ' + info.gas + ' gas' : ''}, ${info.time}s`; }
    return `<button class="cmd-btn ${cls}" title="${title}" onclick="event.stopPropagation(); window.gameApp.researchUpgrade('${id}')">
      <span class="icon">${researchIcon(id, this.world.localFaction, icon)}</span><span class="name">${name}</span><span class="cost">${cost}</span>${hotkey ? `<span class="hotkey">${hotkey}</span>` : ''}</button>`;
  }

  /**
   * Lay buttons out on the SC2 5x3 command card. A button with `data-slot` (0-14, row-major) goes in that cell; the rest fill
   * the free cells from `from`, wrapping to the start if needed. Names and costs move into the hover tooltip like the real card.
   */
  private cardHtml(buttons: string, from: number): string {
    const tpl = document.createElement('template');
    tpl.innerHTML = buttons.trim();
    const slots: (HTMLElement | null)[] = new Array(15).fill(null);
    const loose: HTMLElement[] = [];
    for (const el of Array.from(tpl.content.children) as HTMLElement[]) {
      const n = el.dataset.slot !== undefined ? Number(el.dataset.slot) : -1;
      if (n >= 0 && n < 15 && !slots[n]) slots[n] = el; else loose.push(el);
    }
    const free = [...Array(15).keys()].filter(i => !slots[i]);
    const order = [...free.filter(i => i >= from), ...free.filter(i => i < from)];
    loose.forEach((el, i) => { if (i < order.length) slots[order[i]!] = el; });
    for (const el of slots) {
      if (!el) continue;
      const name = el.querySelector('.name')?.textContent?.trim() ?? '';
      const cost = el.querySelector('.cost')?.textContent?.trim() ?? '';
      const key = el.querySelector('.hotkey')?.textContent?.trim() ?? '';
      const desc = el.getAttribute('title') ?? '';
      el.setAttribute('title', `${name}${key ? ` (${key})` : ''}${cost ? ` - ${cost}` : ''}${desc && desc !== name ? `\n${desc}` : ''}`);
    }
    return `<div class="cmd-grid">${slots.map(el => el ? el.outerHTML : '<div class="cmd-empty"></div>').join('')}</div>`;
  }

  /** Command-card buttons for every active ability of an entity (cost = energy, greyed while unavailable). */
  private abilityButtonsHtml(e: Unit | Building): string {
    return abilitiesOf(e).map(a => {
      const toggledOn = (a.id === 'burrow' && e.burrowed) || (a.id === 'cloak' && e.cloaked);
      const blocked = toggledOn ? null : abilityBlocked(this.world, e, a);
      const name = a.id === 'burrow' && e.burrowed ? 'Unburrow' : a.id === 'cloak' && e.cloaked ? 'Decloak' : a.name;
      const cost = toggledOn ? 'ON' : a.minerals ? `${a.minerals}${a.gas ? '/' + a.gas : ''}` : a.energy > 0 ? `${a.energy}⚡` : a.cd > 2 ? `${a.cd}s` : '';
      const slot = ({ reactor: 10, techlab: 11, lift: 13, land: 13 } as Record<string, number>)[a.id];
      return `
        <button class="cmd-btn ${blocked ? 'locked' : ''} ${toggledOn ? 'active' : ''}" ${slot !== undefined ? `data-slot="${slot}"` : ''} title="${blocked ?? a.desc}" onclick="event.stopPropagation(); window.gameApp.useAbility('${a.id}')">
          <span class="icon">${a.icon}</span><span class="name">${name}</span><span class="cost">${cost}</span><span class="hotkey">${a.hotkey}</span>
        </button>`;
    }).join('');
  }

  public setSubmenu(menu: 'none' | 'build_basic' | 'build_advanced') {
    this.activeSubmenu = menu;
    this.lastCommandCardKey = ''; // Force re-render on submenu navigation
  }

  public togglePauseMenu(): boolean {
    this.isMenuOpen = !this.isMenuOpen;
    this.menuStandalone = false;
    if (this.gameMenuModalEl) {
      this.gameMenuModalEl.style.display = this.isMenuOpen ? 'flex' : 'none';
      if (this.isMenuOpen) this.showMenuPanel('main');
    }
    return this.isMenuOpen;
  }

  /** True while the dialog is shown from the front-end screens (no match behind it, so no pausing logic). */
  private menuStandalone = false;

  private optSnap: OptValues | null = null;
  private optInputs() {
    return {
      vol: document.getElementById('music-volume-slider') as HTMLInputElement | null,
      track: document.getElementById('music-track-select') as HTMLSelectElement | null,
      quality: document.getElementById('quality-select') as HTMLSelectElement | null,
      bright: document.getElementById('brightness-slider') as HTMLInputElement | null,
      speed: document.getElementById('game-speed-slider') as HTMLInputElement | null
    };
  }
  public optTab(name: string) {
    document.querySelectorAll('#sc2m-options .otab').forEach(e => e.classList.toggle('on', (e as HTMLElement).dataset.ot === name));
    document.querySelectorAll('#sc2m-options .opage').forEach(e => e.classList.toggle('on', (e as HTMLElement).dataset.op === name));
    const d = document.querySelector('#sc2m-options .odef') as HTMLElement | null;
    if (d) d.style.visibility = name === 'graphics' || name === 'sound' || name === 'gameplay' ? 'visible' : 'hidden';
  }
  private optApply(v: OptValues) {
    const i = this.optInputs();
    if (i.vol) { i.vol.value = v.vol; i.vol.dispatchEvent(new Event('input')); }
    if (i.track) { i.track.value = v.track; i.track.dispatchEvent(new Event('change')); }
    if (i.quality) { i.quality.value = v.quality; i.quality.dispatchEvent(new Event('change')); }
    if (i.bright && v.bright !== undefined) { i.bright.value = v.bright; i.bright.dispatchEvent(new Event('input')); }
    if (i.speed && v.speed !== undefined) { i.speed.value = v.speed; i.speed.dispatchEvent(new Event('input')); }
  }
  /** CANCEL: put back what the options looked like when the screen opened. */
  public optCancel() { if (this.optSnap) this.optApply(this.optSnap); this.menuBack(); }
  public optDefaults() {
    const i = this.optInputs();
    this.optApply({ vol: '35', track: i.track?.options[0]?.value ?? 'auto', quality: 'balanced', bright: String(DEFAULT_BRIGHTNESS), speed: String(DEFAULT_SPEED_RATIO) });
  }

  public showMenuPanel(name: 'main' | 'options' | 'help' | 'tutorial' | 'credits' | 'attributions' | 'parity' | 'save' | 'load') {
    if (name === 'main') {
      // SC2: Save / Load exist only in single-player games; Save is greyed out when the game cannot be saved (ended, cutscene)
      const app = (window as any).gameApp;
      const online = !!this.world.net || this.world.matchConfig.mode.startsWith('multiplayer');
      const sv = document.getElementById('mb-save') as HTMLButtonElement | null, ld = document.getElementById('mb-load') as HTMLButtonElement | null;
      if (sv) { sv.style.display = online ? 'none' : ''; sv.disabled = !app?.canSaveGame?.(); }
      if (ld) ld.style.display = online ? 'none' : '';
    }
    if (name === 'save' || name === 'load') {
      for (const n of ['main', 'options', 'help', 'tutorial', 'credits', 'attributions', 'parity']) {
        const el = document.getElementById('sc2m-' + n);
        if (el) el.style.display = 'none';
      }
      if (this.saveLoad) { this.saveLoad.el.style.display = 'block'; this.saveLoad.open(name); }
      return;
    }
    if (this.saveLoad) this.saveLoad.el.style.display = 'none';
    if (name === 'attributions') this.renderAttributions();
    if (name === 'credits') this.renderCreditsModels();
    if (name === 'parity') { const el = document.getElementById('parity-body'); if (el && !el.firstChild) el.innerHTML = parityHtml(); }
    if (name === 'options') {
      const i = this.optInputs();
      this.optSnap = { vol: i.vol?.value ?? '35', track: i.track?.value ?? '', quality: i.quality?.value ?? 'balanced', bright: i.bright?.value, speed: i.speed?.value };
      this.optTab('graphics');
      const aq = document.getElementById('auto-quality') as HTMLInputElement | null;
      const app = (window as any).gameApp;
      if (aq && app?.autoQuality) aq.checked = app.autoQuality.enabled;
      document.getElementById('quality-select')?.dispatchEvent(new Event('change'));
    }
    for (const n of ['main', 'options', 'help', 'tutorial', 'credits', 'attributions', 'parity']) {
      const el = document.getElementById('sc2m-' + n);
      if (el) el.style.display = n === name ? 'block' : 'none';
    }
  }

  /** Credits panel: the 3D model artists (one line per author, linked), full detail lives in Attributions. */
  private renderCreditsModels() {
    const el = document.getElementById('credits-models');
    if (!el) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const by = new Map<string, { url?: string; license: string; n: number }>();
    for (const c of usedCredits()) { const e = by.get(c.author) ?? { url: c.authorUrl, license: c.license, n: 0 }; e.n++; by.set(c.author, e); }
    const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n).map(([a, e]) =>
      `<div class="crow"><span>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(a)}</a>` : esc(a)}</span><span>${e.n} model${e.n > 1 ? 's' : ''} · ${esc(e.license)}</span></div>`).join('');
    el.innerHTML = `<p><b>3D models</b> - made by these Sketchfab artists:</p>${rows}${hasOwnWork() ? '<div class="crow"><span>Project owner</span><span>Supply Depot models · own work</span></div>' : ''}`;
  }

  /** Fill the Attributions panel: every model the game actually loads, with its author (link), source model, licence and files. */
  private renderAttributions() {
    const el = document.getElementById('attrib-list');
    if (!el) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const nice = (f: string) => f.replace(/^models\//, '').replace(/\.glb$/, '').replace(/[_/]+/g, ' ');
    el.innerHTML = usedCredits().map(c => `
      <div class="sec arow">
        <div class="st"><span>${c.authorUrl ? `<a href="${esc(c.authorUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.author)}</a>` : esc(c.author)}</span><span>${esc(c.license)}</span></div>
        <div class="at"><a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a></div>
        <div class="af">${c.files.map(nice).map(esc).join(' · ')}</div>
      </div>`).join('') + (hasOwnWork() ? '<div class="sec arow"><div class="st"><span>Project owner</span><span>Own work</span></div><div class="at">Supply Depot models</div></div>' : '');
  }

  /** Open one panel of the SC2-style menu from the home screen (Options / Help). */
  public openMenuOverlay(name: 'options' | 'help' | 'attributions' | 'parity' | 'load') {
    this.menuStandalone = true;
    if (this.gameMenuModalEl) this.gameMenuModalEl.style.display = 'flex';
    this.showMenuPanel(name);
  }

  public closeMenuOverlay() {
    if (!this.menuStandalone) return;
    this.menuStandalone = false;
    if (this.gameMenuModalEl) this.gameMenuModalEl.style.display = 'none';
  }

  public isMenuOverlayStandalone(): boolean { return this.menuStandalone; }

  /** BACK button inside a sub-panel: return to MENU in-game, or close the overlay on the home screen. */
  public menuBack(closeAll = false) {
    if (this.menuStandalone) { this.closeMenuOverlay(); return; }
    if (closeAll && this.isMenuOpen) { (window as any).gameApp.togglePauseMenu(); return; }
    this.showMenuPanel('main');
  }

  public toggleProfiler(force?: boolean): boolean {
    if (force !== undefined) {
      this.isProfilerOpen = force;
    } else {
      this.isProfilerOpen = !this.isProfilerOpen;
    }
    if (this.profilerOverlayEl) {
      this.profilerOverlayEl.style.display = this.isProfilerOpen ? 'flex' : 'none';
      if (this.isProfilerOpen) {
        this.renderProfilerOverlay();
      }
    }
    return this.isProfilerOpen;
  }

  private renderProfilerOverlay() {
    if (!this.profilerOverlayEl) return;
    const snap = PerformanceProfiler.get().getSnapshot();

    const fpsEl = document.getElementById('prof-fps');
    if (fpsEl) {
      fpsEl.innerText = `${snap.fps} FPS`;
      fpsEl.className = `stat-val ${snap.fps >= 50 ? 'stat-green' : snap.fps >= 30 ? 'stat-yellow' : 'stat-red'}`;
    }

    const cpuEl = document.getElementById('prof-cpu');
    if (cpuEl) {
      cpuEl.innerText = `${snap.frameTimeMs} ms (${snap.cpuBudgetPercent}%)`;
      cpuEl.className = `stat-val ${snap.cpuBudgetPercent <= 60 ? 'stat-green' : snap.cpuBudgetPercent <= 90 ? 'stat-yellow' : 'stat-red'}`;
    }

    const dcEl = document.getElementById('prof-drawcalls');
    if (dcEl) dcEl.innerText = `${snap.drawCalls} calls`;

    const triEl = document.getElementById('prof-triangles');
    if (triEl) triEl.innerText = `${(snap.triangles / 1000).toFixed(1)}k`;

    const ramEl = document.getElementById('prof-ram');
    if (ramEl) {
      ramEl.innerText = snap.memoryMb !== null ? `${snap.memoryMb} MB` : `${snap.textures} tex / ${snap.geometries} geom`;
    }

    this.drawFpsGraph();

    const listEl = document.getElementById('profiler-module-list');
    if (listEl) {
      listEl.innerHTML = snap.modules.map(m => `
        <div class="profiler-row">
          <div class="module-info">
            <span class="module-dot" style="background: ${m.color}; box-shadow: 0 0 8px ${m.color}88;"></span>
            <span class="module-name">${m.name}</span>
            <span class="module-time">${m.timeMs.toFixed(2)} ms</span>
            <span class="module-pct">${m.percentage}%</span>
          </div>
          <div class="profiler-track">
            <div class="profiler-bar-fill" style="width: ${Math.min(100, Math.max(3, m.percentage))}%; background: ${m.color};"></div>
          </div>
        </div>
      `).join('');
    }
  }

  /** Minimal FPS-over-time line: one sample per second since the match began, 30 / 60 guide lines, time along the bottom. */
  private drawFpsGraph() {
    const cv = document.getElementById('prof-fps-graph') as HTMLCanvasElement | null;
    if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = cv.width, H = cv.height, padL = 26, padB = 14, padT = 6, padR = 6;
    const hist = PerformanceProfiler.get().fpsHistory;
    ctx.clearRect(0, 0, W, H);
    const top = Math.max(60, Math.ceil(Math.max(...hist, 60) / 30) * 30);
    const y = (f: number) => padT + (1 - Math.min(f, top) / top) * (H - padT - padB);
    ctx.font = '9px monospace'; ctx.textBaseline = 'middle';
    for (const g of [30, 60, ...(top > 60 ? [top] : [])]) {
      ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y(g)); ctx.lineTo(W - padR, y(g)); ctx.stroke();
      ctx.fillStyle = '#94a3b8'; ctx.fillText(String(g), 2, y(g));
    }
    if (hist.length < 2) { ctx.fillStyle = '#64748b'; ctx.fillText('collecting…', padL + 6, H / 2); return; }
    const n = hist.length, x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
    // colour by level: green >= 50, amber >= 30, red below
    for (let i = 1; i < n; i++) {
      const f = hist[i]!;
      ctx.strokeStyle = f >= 50 ? '#4ade80' : f >= 30 ? '#facc15' : '#f87171';
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x(i - 1), y(hist[i - 1]!)); ctx.lineTo(x(i), y(f)); ctx.stroke();
    }
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    ctx.fillStyle = '#94a3b8'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('0:00', padL, H - 3); ctx.textAlign = 'right'; ctx.fillText(mmss(n), W - padR, H - 3); ctx.textAlign = 'left';
  }
}
