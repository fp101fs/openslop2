import { StarCraftApp } from '../main';
import { Unit } from '../simulation/Unit';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';

interface IntroDialogueLine {
  startTime: number;
  endTime: number;
  phaseTag: string;
  text: string;
  voiceText: string;
}

const INTRO_SCRIPT: IntroDialogueLine[] = [
  {
    startTime: 0.3,
    endTime: 6.2,
    phaseTag: 'INBOUND // 1 OF 3',
    text: '"Command, Banshee-1 inbound! Bringing her in low and fast. Hold on to your lunch!"',
    voiceText: 'Command, Banshee One inbound. Bringing her in low and fast. Hold on to your lunch.'
  },
  {
    startTime: 6.3,
    endTime: 12.6,
    phaseTag: 'APPROACH // 2 OF 3',
    text: '"We\'re in the pipe, five by five... Movement all over the grid—it\'s a bug hunt, Commander. Stay frosty!"',
    voiceText: "We're in the pipe, five by five. Movement all over the grid. It's a bug hunt, Commander. Stay frosty!"
  },
  {
    startTime: 12.7,
    endTime: 15.8,
    phaseTag: 'STATION // 3 OF 3',
    text: '"Holding station off the Command Center, nose pointed southeast. Express elevator to hell—let\'s rock!"',
    voiceText: 'Holding station off the Command Center, facing southeast. Let us rock!'
  }
];

export class IntroCutscene {
  private app: StarCraftApp;
  private wraith: Unit | null = null;
  public isActive: boolean = false;
  private elapsed: number = 0;
  private totalDuration: number = 16.0;
  private lastSpokenLineIdx: number = -1;
  private blipTimer: number = 0;
  private dAlt = 0;
  private switchedToTps = false;

  // StarFox Comms DOM Elements (Vertical Card just below Minerals/Gas/Supply in far Top-Left Corner)
  private containerEl!: HTMLElement;
  private canvasEl!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private phaseTagEl!: HTMLElement;
  private dialogueTextEl!: HTMLElement;
  private waveformBars: HTMLElement[] = [];

  // Waypoints:
  // Start JUST outside the southeast enemy base (95, 95) at (86.0, 86.0),
  // swoop smoothly along a long organic sine wave all the way back to the Command Center perimeter (33.8, 33.8),
  // then approach Command Center (25, 25) and settle at (30.5, 30.5) facing SE (95, 95)
  private readonly startPos = { x: 68.0, y: 68.0 };
  private readonly midTurnPos = { x: 33.8, y: 33.8 };
  private readonly restPos = { x: 30.5, y: 30.5 };
  private readonly commandCenterPos = { x: 25.0, y: 25.0 };

  constructor(app: StarCraftApp, uiContainer: HTMLElement) {
    this.app = app;
    this.createCommsDOM(uiContainer);
  }

  private createCommsDOM(uiContainer: HTMLElement) {
    const wrapper = document.createElement('div');
    wrapper.id = 'starfox-comms-overlay';
    wrapper.className = 'starfox-comms-overlay';
    wrapper.style.display = 'none';

    wrapper.innerHTML = `
      <div class="starfox-comms-card">
        <div class="starfox-card-top">
          <div class="starfox-title-row">
            <span class="starfox-live-dot"></span>
            <span class="starfox-channel-title">COMMS // BANSHEE-1</span>
          </div>
          <span id="starfox-phase-tag" class="starfox-phase-tag">RECON // 1 OF 3</span>
        </div>

        <div class="starfox-portrait-frame">
          <canvas id="starfox-pilot-canvas" width="144" height="144"></canvas>
          <div class="starfox-crt-scanlines"></div>
          <div class="starfox-pilot-callsign">LT. VANCE "HAWK"</div>
        </div>

        <div class="starfox-waveform-row">
          <span class="freq-label">142.8 MHz</span>
          <div class="starfox-waveform" id="starfox-waveform">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>

        <div id="starfox-dialogue-text" class="starfox-dialogue-text"></div>

        <button class="starfox-skip-btn" onclick="event.stopPropagation(); window.gameApp.skipIntro()">
          SKIP INTRO [SPACE / ESC]
        </button>
      </div>
    `;

    uiContainer.appendChild(wrapper);
    this.containerEl = wrapper;
    this.canvasEl = wrapper.querySelector('#starfox-pilot-canvas') as HTMLCanvasElement;
    this.ctx = this.canvasEl.getContext('2d')!;
    this.phaseTagEl = wrapper.querySelector('#starfox-phase-tag') as HTMLElement;
    this.dialogueTextEl = wrapper.querySelector('#starfox-dialogue-text') as HTMLElement;
    this.waveformBars = Array.from(wrapper.querySelectorAll('#starfox-waveform span'));
  }

  public start() {
    const wraith = this.app.world.units.find(u => u.type === 'banshee' && u.playerId === 'player');
    if (!wraith) return;

    this.wraith = wraith;
    this.isActive = true;
    this.elapsed = 0;
    this.lastSpokenLineIdx = -1;
    this.blipTimer = 0;
    this.switchedToTps = false;
    this.dAlt = 0;

    // 1. Reveal the outer edge of the enemy base at (90, 90) so the player sees the scouted enemy perimeter
    this.app.fog.revealCircle(90.0, 90.0, 11.0);

    // 2. Position Wraith JUST outside the enemy base at (86, 86) heading northwest toward Command Center
    wraith.pos.x = this.startPos.x;
    wraith.pos.y = this.startPos.y;
    wraith.rotation = -3 * Math.PI / 4;
    wraith.flightAltitude = 2.0;
    wraith.isAfterburning = true;
    wraith.afterburnerTimer = 10.5;
    wraith.updateMeshTransform();

    this.app.fog.revealCircle(wraith.pos.x, wraith.pos.y, wraith.sightRange);
    this.app.fog.updateTexture(1.0);

    // 3. Select the Banshee and immediately enter First-Person View (using existing view mode mechanics)
    this.app.world.selectedEntities.forEach(e => (e.isSelected = false));
    wraith.isSelected = true;
    this.app.world.selectedEntities = [wraith];

    // Start in the cockpit (first-person); the camera glides out to the chase view part-way through the flight
    this.app.renderer.enterFpsMode(wraith);
    this.app.renderer.fpsTransition = 1.0;
    this.app.renderer.targetFpsTransition = 1.0;
    this.app.renderer.fpsYaw = wraith.rotation;
    this.app.renderer.fpsPitch = -0.05;
    this.app.renderer.updateCameraPosition(0.016);

    // 4. Show Vertical StarFox Comms Card just below Minerals/Gas/Supply in Top-Left Corner
    this.containerEl.style.display = 'flex';
    this.app.sound.playStarFoxCommsOpen();
    this.renderPilotAvatar(0, false);
  }

  public update(dt: number) {
    if (!this.isActive || !this.wraith || this.wraith.isDead) {
      if (this.isActive) this.finish();
      return;
    }

    this.elapsed += dt;
    const t = this.elapsed;
    const u = this.wraith;

    // Keep Wraith pristine during the opening cinematic & prevent enemy base guards from chasing it across the map
    u.health = u.maxHealth;
    for (const enemy of this.app.world.units) {
      if (
        enemy.playerId === 'enemy' &&
        (enemy.currentCommand?.targetEntityId === u.id || enemy.targetEntityId === u.id)
      ) {
        enemy.targetEntityId = null;
        enemy.setCommand({ type: 'stop' });
      }
    }

    // =========================================================================
    // 1. LONG SINE-WAVE FLIGHT FROM ENEMY BASE (86, 86) ALL THE WAY TO CC
    // =========================================================================
    if (t < 10.4) {
      // PHASE 1 (0.0s – 10.4s): Long, swooping sine-wave slalom from just outside the enemy base (86, 86)
      // all the way across the rolling hills back to the Command Center approach (33.8, 33.8)
      const p = t / 10.4;
      // Smooth sine envelope so entry and exit into the long curve are 100% seamless
      const envelope = Math.sin(p * Math.PI);

      // 1.5 wide, graceful sine-wave cycles across 74 diagonal tiles (very gradual, sweeping S-curves)
      const wavePhase = p * Math.PI * 4.0;
      const slalomWave = Math.sin(wavePhase) * 9.5 * envelope;

      // Spine interpolation from (86, 86) all the way to (33.8, 33.8)
      const spineX = this.startPos.x + (this.midTurnPos.x - this.startPos.x) * p;
      const spineY = this.startPos.y + (this.midTurnPos.y - this.startPos.y) * p;

      // Perpendicular unit vector (+0.7071, -0.7071)
      const perpX = 0.70710678;
      const perpY = -0.70710678;

      const prevX = u.pos.x;
      const prevY = u.pos.y;
      const prevAlt = u.flightAltitude;

      u.pos.x = spineX + perpX * slalomWave;
      u.pos.y = spineY + perpY * slalomWave;

      // Gentle vertical altitude swoop over the rolling hills and valleys
      u.flightAltitude = 2.1 + Math.sin(p * Math.PI * 5.0 + 0.7) * 0.85 * envelope;
      u.isAfterburning = p < 0.88;
      u.afterburnerTimer = p < 0.88 ? 1.5 : 0;

      // Smoothly align nose with tangent vector of the sine wave
      const dx = u.pos.x - prevX;
      const dy = u.pos.y - prevY;
      if (Math.hypot(dx, dy) > 0.0001) {
        const targetYaw = Math.atan2(dx, dy);
        const yawDiff = Math.atan2(Math.sin(targetYaw - u.rotation), Math.cos(targetYaw - u.rotation));
        u.rotation += yawDiff * Math.min(1.0, dt * 3.6);

        // Smooth, organic fighter banking into each wide curve (capped at ~19 deg = 0.34 rad)
        const targetRoll = Math.max(-0.5, Math.min(0.5, -yawDiff * 5.5));
        u.roll += (targetRoll - u.roll) * Math.min(1.0, dt * 3.4);
      }

      const dAlt = (u.flightAltitude - prevAlt) / Math.max(0.001, dt);
      const targetPitch = Math.max(-0.2, Math.min(0.2, -dAlt * 0.08));
      this.dAlt = dAlt;
      u.pitch += (targetPitch - u.pitch) * Math.min(1.0, dt * 4.0);
      u.flightSpeed = 7.2;
    } else if (t < 13.6) {
      // PHASE 2 (10.4s – 13.6s): Turn directly toward Command Center (25, 25) and slowly approach
      const p = (t - 10.4) / 3.2;
      // Smooth deceleration curve (easeOutCubic)
      const ease = 1.0 - Math.pow(1.0 - p, 2.4);

      u.pos.x = this.midTurnPos.x + (this.restPos.x - this.midTurnPos.x) * ease;
      u.pos.y = this.midTurnPos.y + (this.restPos.y - this.midTurnPos.y) * ease;

      // Point directly toward the Command Center at (25, 25) during the final approach
      const toCcX = this.commandCenterPos.x - u.pos.x;
      const toCcY = this.commandCenterPos.y - u.pos.y;
      const targetYaw = Math.atan2(toCcX, toCcY);
      const yawDiff = Math.atan2(Math.sin(targetYaw - u.rotation), Math.cos(targetYaw - u.rotation));
      u.rotation += yawDiff * Math.min(1.0, dt * 4.2);

      // Smoothly level wings and settle altitude as Wraith slows down
      u.isAfterburning = false;
      u.afterburnerTimer = 0;
      const targetRoll = Math.max(-0.22, Math.min(0.22, -yawDiff * 3.0));
      u.roll += (targetRoll - u.roll) * Math.min(1.0, dt * 4.0);
      u.flightAltitude += (1.65 - u.flightAltitude) * Math.min(1.0, dt * 3.5);
      u.pitch += (0.03 * (1.0 - p) - u.pitch) * Math.min(1.0, dt * 4.0);
      u.flightSpeed = Math.max(0.5, 4.8 * (1.0 - p * 0.9));
    } else if (t < this.totalDuration) {
      // PHASE 3 (13.6s – 16.0s): Settle at resting location (30.5, 30.5) several squares from CC,
      // and smoothly pivot to face the Southeast corner of the map (95, 95 -> rotation = +PI/4)
      const p = Math.min(1.0, (t - 13.6) / 2.2);
      const smoothP = p * p * (3.0 - 2.0 * p);

      u.pos.x = this.restPos.x;
      u.pos.y = this.restPos.y;
      u.velX = 0;
      u.velY = 0;
      u.flightSpeed = 0;
      u.isAfterburning = false;

      // Turn smoothly from facing Command Center (-3*PI/4) to facing Southeast (+PI/4)
      const seYaw = Math.PI / 4;
      const yawDiff = Math.atan2(Math.sin(seYaw - u.rotation), Math.cos(seYaw - u.rotation));
      u.rotation += yawDiff * Math.min(1.0, dt * (2.6 + smoothP * 3.2));

      u.roll += (0 - u.roll) * Math.min(1.0, dt * 5.0);
      u.pitch += (0 - u.pitch) * Math.min(1.0, dt * 5.0);
      u.flightAltitude += (1.65 - u.flightAltitude) * Math.min(1.0, dt * 5.0);
    } else {
      // PHASE 4: Seamlessly shift from 3rd-Person View to Normal RTS View!
      this.finish();
      return;
    }

    // Update Wraith 3D elevation & transform
    const groundY = ProceduralGrassSystem.getTerrainHeight(u.pos.x, u.pos.y);
    u.height = groundY + u.flightAltitude;
    u.updateMeshTransform();

    // Camera: cockpit view first (tight yaw follow + looks up / down with the swoops), then a smooth glide out to the chase view
    const r = this.app.renderer;
    if (!this.switchedToTps && t >= 5.4) { this.switchedToTps = true; r.viewMode = 'tps'; }
    const camYawDiff = Math.atan2(Math.sin(u.rotation - r.fpsYaw), Math.cos(u.rotation - r.fpsYaw));
    r.fpsYaw += camYawDiff * Math.min(1.0, dt * (this.switchedToTps ? 4.5 : 9.0));
    const pitchGoal = this.switchedToTps ? -0.05 : Math.max(-0.28, Math.min(0.28, this.dAlt * 0.1));
    r.fpsPitch += (pitchGoal - r.fpsPitch) * Math.min(1.0, dt * (this.switchedToTps ? 3.5 : 6.0));
    this.app.renderer.cameraTarget.set(u.pos.x, u.height, u.pos.y);

    // =========================================================================
    // 2. STARFOX PILOT AVATAR ANIMATION & TYPEWRITER DIALOGUE
    // =========================================================================
    const activeLineIdx = INTRO_SCRIPT.findIndex(l => t >= l.startTime && t <= l.endTime);
    let isTalking = false;

    if (activeLineIdx !== -1) {
      const line = INTRO_SCRIPT[activeLineIdx]!;
      this.phaseTagEl.innerText = line.phaseTag;

      if (this.lastSpokenLineIdx !== activeLineIdx) {
        this.lastSpokenLineIdx = activeLineIdx;
        this.app.sound.speak(line.voiceText, true);
      }

      const lineSpan = (line.endTime - line.startTime) * 0.68;
      const charProgress = Math.min(1.0, Math.max(0.0, (t - line.startTime) / lineSpan));
      const charsToShow = Math.floor(line.text.length * charProgress);
      this.dialogueTextEl.innerHTML = `${line.text.slice(0, charsToShow)}<span class="starfox-cursor">▋</span>`;

      isTalking = (t - line.startTime) < (line.endTime - line.startTime) * 0.82;

      if (isTalking) {
        this.blipTimer -= dt;
        if (this.blipTimer <= 0) {
          this.blipTimer = 0.095 + Math.random() * 0.05;
          this.app.sound.playStarFoxRadioBlip(0.92 + Math.random() * 0.22);
        }
      }
    }

    this.waveformBars.forEach((bar, i) => {
      const h = isTalking
        ? 4 + Math.abs(Math.sin(t * 18 + i * 1.3)) * 12
        : 3;
      bar.style.height = `${Math.round(h)}px`;
    });

    this.renderPilotAvatar(t, isTalking);
  }

  // Draw animated StarFox-style Wraith Pilot portrait on 2D canvas
  private renderPilotAvatar(t: number, isTalking: boolean) {
    const ctx = this.ctx;
    const w = this.canvasEl.width;
    const h = this.canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Cockpit background with radar grid
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#071426');
    bgGrad.addColorStop(1, '#0c233d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 18) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const rollTilt = this.wraith ? Math.max(-0.16, Math.min(0.16, this.wraith.roll * 0.35)) : 0;
    const bobY = Math.sin(t * 4.2) * 1.5;

    ctx.save();
    ctx.translate(w / 2, h / 2 + 8 + bobY);
    ctx.scale(1.18, 1.18);
    ctx.rotate(rollTilt);

    // 2. Flight Suit Shoulders & Armored Collar
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-48, 52);
    ctx.quadraticCurveTo(-38, 22, -20, 18);
    ctx.lineTo(20, 18);
    ctx.quadraticCurveTo(38, 22, 48, 52);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-36, 30, 10, 4);
    ctx.fillRect(26, 30, 10, 4);

    // 3. Lower Face / Jaw (StarFox talking articulation)
    const mouthOpen = isTalking
      ? (Math.sin(t * 26.0) * 0.5 + 0.5) * (Math.cos(t * 12.0) * 0.35 + 0.65)
      : 0;
    const jawDrop = mouthOpen * 5.5;

    ctx.fillStyle = '#d6a582';
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(18, -2);
    ctx.lineTo(15, 14 + jawDrop);
    ctx.quadraticCurveTo(0, 23 + jawDrop, -15, 14 + jawDrop);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2a0f14';
    const mouthH = 1.5 + mouthOpen * 6.5;
    const mouthW = 13 + mouthOpen * 3.0;
    ctx.beginPath();
    ctx.roundRect(-mouthW / 2, 6 + jawDrop * 0.35, mouthW, mouthH, 2);
    ctx.fill();

    if (mouthOpen > 0.25) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-mouthW / 2 + 2, 6.5 + jawDrop * 0.35, mouthW - 4, 1.8);
      ctx.fillStyle = '#be123c';
      ctx.fillRect(-mouthW / 2 + 3, 6.5 + jawDrop * 0.35 + mouthH - 2.2, mouthW - 6, 2);
    }

    // 4. Tactical Wraith Flight Helmet
    const helmGrad = ctx.createLinearGradient(-30, -48, 30, 10);
    helmGrad.addColorStop(0, '#2563eb');
    helmGrad.addColorStop(0.5, '#1d4ed8');
    helmGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = helmGrad;

    ctx.beginPath();
    ctx.arc(0, -14, 31, Math.PI * 0.88, Math.PI * 2.12);
    ctx.lineTo(27, 8);
    ctx.lineTo(18, 12);
    ctx.lineTo(16, -4);
    ctx.lineTo(-16, -4);
    ctx.lineTo(-18, 12);
    ctx.lineTo(-27, 8);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-4, -44, 8, 14);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-2, -42, 4, 10);

    // 5. Glowing Cyan Holographic Pilot Visor
    const visorGrad = ctx.createLinearGradient(-24, -24, 24, -2);
    visorGrad.addColorStop(0, '#0284c7');
    visorGrad.addColorStop(0.5, '#38bdf8');
    visorGrad.addColorStop(1, '#0369a1');
    ctx.fillStyle = visorGrad;

    ctx.beginPath();
    ctx.moveTo(-24, -20);
    ctx.quadraticCurveTo(0, -25, 24, -20);
    ctx.lineTo(20, -2);
    ctx.quadraticCurveTo(0, 3, -20, -2);
    ctx.closePath();
    ctx.fill();

    const isBlinking = (t % 3.4) > 3.25;
    if (!isBlinking) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(-13, -13, 6, 2.5);
      ctx.fillRect(7, -13, 6, 2.5);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(-18, -19);
    ctx.lineTo(-8, -19);
    ctx.lineTo(-14, -4);
    ctx.lineTo(-20, -4);
    ctx.closePath();
    ctx.fill();

    // 6. Boom Microphone & Pulsing Voice Indicator LED
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-24, 5);
    ctx.quadraticCurveTo(-16, 14 + jawDrop * 0.4, -5, 12 + jawDrop * 0.4);
    ctx.stroke();

    ctx.fillStyle = isTalking ? '#22c55e' : '#0ea5e9';
    ctx.beginPath();
    ctx.arc(-4, 12 + jawDrop * 0.4, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  public finish() {
    if (!this.isActive) return;
    this.isActive = false;
    this.containerEl.style.display = 'none';
    this.app.sound.playStarFoxCommsClose();

    if (this.wraith && !this.wraith.isDead) {
      this.wraith.pos.x = this.restPos.x;
      this.wraith.pos.y = this.restPos.y;
      this.wraith.velX = 0;
      this.wraith.velY = 0;
      this.wraith.flightSpeed = 0;
      this.wraith.isAfterburning = false;
      this.wraith.afterburnerTimer = 0;
      this.wraith.rotation = Math.PI / 4; // Facing Southeast (95, 95)
      this.wraith.roll = 0;
      this.wraith.pitch = 0;
      // Leave the cinematic low-flyby altitude and ease up to the standard cruise height used by all flyers
      this.wraith.flightAltitude = 1.65;
      this.wraith.settleToCruise = true;
      this.wraith.height = ProceduralGrassSystem.getTerrainHeight(this.wraith.pos.x, this.wraith.pos.y) + 1.65;
      this.wraith.updateMeshTransform();
      this.app.fog.revealCircle(this.wraith.pos.x, this.wraith.pos.y, this.wraith.sightRange);
    }

    this.app.renderer.cameraTarget.set(27.5, 0, 27.5);
    this.app.renderer.savedRtsTarget.set(27.5, 0, 27.5);
    this.app.exitFpsMode();
    this.app.ui.triggerMissionObjectiveIntro();
  }
}
