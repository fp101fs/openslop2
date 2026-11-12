import * as THREE from 'three';
import { GameWorld } from '../simulation/GameWorld';
import { Renderer } from '../graphics/Renderer';
import { LAYOUT } from '../maps';
import { themeOf } from '../levels/Themes';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { MAP_SIZE } from '../config';

/** Default map is dressed as a space station (see Renderer STATION_MAP). */
const STATION = !LAYOUT.level && LAYOUT.id === 'standard';

export class Minimap {
  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCache: HTMLCanvasElement;
  private baseTerrainPixels!: Uint8ClampedArray;
  private fogCompositeCanvas: HTMLCanvasElement;
  private fogCompositeCtx: CanvasRenderingContext2D;
  private fogCompositeImg: ImageData;
  private frameCounter: number = 0;
  private world: GameWorld;
  private renderer: Renderer;
  private isDragging: boolean = false;
  /** Backing-store size of the canvas; the map itself is composed in a 180x180 "map space". */
  private static readonly PX = 360;
  private static readonly N = 180;
  private _v = new THREE.Vector3();

  constructor(container: HTMLElement, world: GameWorld, renderer: Renderer) {
    this.world = world;
    this.renderer = renderer;

    this.canvas = document.createElement('canvas');
    // Backing store is 2x the 180px slot so the rotated (diamond) map stays crisp.
    this.canvas.width = Minimap.PX;
    this.canvas.height = Minimap.PX;
    this.canvas.className = 'minimap-canvas';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.fogCompositeCanvas = document.createElement('canvas');
    this.fogCompositeCanvas.width = 180;
    this.fogCompositeCanvas.height = 180;
    this.fogCompositeCtx = this.fogCompositeCanvas.getContext('2d')!;
    this.fogCompositeImg = this.fogCompositeCtx.createImageData(180, 180);

    this.terrainCache = this.buildTerrainCache(180, 180);
    this.setupEvents();
  }

  private buildTerrainCache(w: number, h: number): HTMLCanvasElement {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(w, h);
    const data = img.data;

    for (let py = 0; py < h; py++) {
      const wz = (py / h) * MAP_SIZE;
      for (let px = 0; px < w; px++) {
        const wx = (px / w) * MAP_SIZE;
        const grassW = ProceduralGrassSystem.getGrassBiomeWeight(wx, wz);
        const hillS = ProceduralGrassSystem.getHillShadeFactor(wx, wz);
        const cliffRamp = ProceduralGrassSystem.getCliffAndRampMask(wx, wz);

        // Sand base clearing / trail color vs elevation-shaded rolling grass hill color
        const th = LAYOUT.level ? themeOf(LAYOUT.level.theme) : null;
        const sandR = th ? th.minimap[1][0] : 228, sandG = th ? th.minimap[1][1] : 214, sandB = th ? th.minimap[1][2] : 186;
        const grassR = th ? Math.round(th.minimap[0][0] * (0.6 + hillS * 0.7)) : Math.round(32 + hillS * 58);
        const grassG = th ? Math.round(th.minimap[0][1] * (0.6 + hillS * 0.7)) : Math.round(74 + hillS * 96);
        const grassB = th ? Math.round(th.minimap[0][2] * (0.6 + hillS * 0.7)) : Math.round(24 + hillS * 38);

        let r = Math.round(sandR * (1 - grassW) + grassR * grassW);
        let g = Math.round(sandG * (1 - grassW) + grassG * grassW);
        let b = Math.round(sandB * (1 - grassW) + grassB * grassW);

        // Highlight high-ground plateaus slightly brighter and shade basalt cliff walls & ramps
        if (cliffRamp > 0.65) {
          // Dark basalt cliff wall rim
          r = th ? th.minimap[2][0] : 42;
          g = th ? th.minimap[2][1] : 48;
          b = th ? th.minimap[2][2] : 56;
        } else if (cliffRamp >= 0.30 && cliffRamp <= 0.62) {
          // Engineered tactical ramp corridor
          r = 152;
          g = 158;
          b = 166;
        } else if (ProceduralGrassSystem.getTerrainHeight(wx, wz) > 1.6) {
          // High-ground plateau elevation boost
          r = Math.min(255, Math.round(r * 1.1));
          g = Math.min(255, Math.round(g * 1.1));
          b = Math.min(255, Math.round(b * 1.08));
        }

        if (STATION) {   // station deck: dark gunmetal floor, lighter base decks, near-black bulkheads, steel ramps
          const hg = ProceduralGrassSystem.getTerrainHeight(wx, wz) > 1.6 ? 1.12 : 1;
          const k = (0.92 + hillS * 0.12) * hg;
          r = (42 + (1 - grassW) * 26) * k; g = (46 + (1 - grassW) * 28) * k; b = (53 + (1 - grassW) * 31) * k;
          if (cliffRamp > 0.65) { r = 20; g = 23; b = 28; }
          else if (cliffRamp >= 0.30 && cliffRamp <= 0.62) { r = 118; g = 124; b = 132; }
          r = Math.round(r); g = Math.round(g); b = Math.round(b);
        }
        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    this.baseTerrainPixels = new Uint8ClampedArray(data);
    octx.putImageData(img, 0, 0);
    return off;
  }

  private setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Left click: Pan camera
        this.isDragging = true;
        this.panCameraFromEvent(e);
      } else if (e.button === 2) {
        // Right click: Issue move order to selected units
        e.preventDefault();
        const worldPos = this.eventToWorldPos(e);
        const playerUnits = this.world.selectedEntities.filter(
          ent => 'setCommand' in ent && (ent as any).playerId === 'player'
        );
        playerUnits.forEach(ent => {
          (ent as any).setCommand({ type: 'move', targetPos: worldPos });
        });
        if (playerUnits.length > 0) {
          this.world.sound.playUnitOrder((playerUnits[0] as any).type, 'move');
        } else {
          this.world.sound.playCommandConfirm();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.panCameraFromEvent(e);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * The minimap is rotated by the camera yaw so that "up" on the minimap is the camera's forward direction
   * (exactly like SC2, where the playable area shows as a diamond and the view footprint is an upright trapezoid).
   * k scales the 180-unit map square so the rotated square fits the canvas.
   */
  private mapScale(): number {
    const yaw = this.renderer.cameraYaw;
    return Minimap.PX / (Minimap.N * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw))));
  }

  private eventToWorldPos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * Minimap.PX - Minimap.PX / 2;
    const py = ((e.clientY - rect.top) / rect.height) * Minimap.PX - Minimap.PX / 2;
    // inverse of: translate(centre) rotate(yaw) scale(k) translate(-N/2)
    const yaw = this.renderer.cameraYaw, c = Math.cos(yaw), sn = Math.sin(yaw), k = this.mapScale();
    const mx = (px * c + py * sn) / k + Minimap.N / 2;
    const my = (-px * sn + py * c) / k + Minimap.N / 2;
    const clamp = (v: number) => Math.max(0, Math.min(MAP_SIZE, (v / Minimap.N) * MAP_SIZE));
    return { x: clamp(mx), y: clamp(my) };
  }

  private panCameraFromEvent(e: MouseEvent) {
    const pos = this.eventToWorldPos(e);
    this.renderer.setCameraTarget(pos.x, pos.y);
  }

  public render() {
    const w = Minimap.N;
    const h = Minimap.N;
    const scale = w / MAP_SIZE;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Minimap.PX, Minimap.PX);
    const k = this.mapScale();
    ctx.translate(Minimap.PX / 2, Minimap.PX / 2);
    ctx.rotate(this.renderer.cameraYaw);
    ctx.scale(k, k);
    ctx.translate(-Minimap.N / 2, -Minimap.N / 2);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.imageSmoothingEnabled = true;

    // 1. Update offscreen Fog-Composited Terrain at 15 Hz (zero getImageData GPU readbacks, zero allocations)
    if (this.frameCounter++ % 4 === 0) {
      const base = this.baseTerrainPixels;
      const out = this.fogCompositeImg.data;
      const invScale = 1.0 / scale;

      for (let py = 0; py < h; py++) {
        const wy = py * invScale;
        const rowOffset = py * w;
        for (let px = 0; px < w; px++) {
          const wx = px * invScale;
          const fogB = this.world.fog.getFogBrightness(wx, wy);
          const idx = (rowOffset + px) * 4;

          if (fogB <= 0.02) {
            out[idx] = 7;
            out[idx + 1] = 10;
            out[idx + 2] = 16;
            out[idx + 3] = 255;
          } else if (fogB >= 0.99) {
            out[idx] = base[idx]!;
            out[idx + 1] = base[idx + 1]!;
            out[idx + 2] = base[idx + 2]!;
            out[idx + 3] = 255;
          } else {
            const r = base[idx]!;
            const g = base[idx + 1]!;
            const b = base[idx + 2]!;
            out[idx] = (7 + (r - 7) * fogB * 0.92) | 0;
            out[idx + 1] = (10 + (g - 10) * fogB * 0.95) | 0;
            out[idx + 2] = (16 + (b - 16) * Math.min(1.0, fogB * 1.08)) | 0;
            out[idx + 3] = 255;
          }
        }
      }
      this.fogCompositeCtx.putImageData(this.fogCompositeImg, 0, 0);
    }

    // 2. Blit cached Fog-Composited Terrain in 1 hardware-accelerated drawImage call
    this.ctx.drawImage(this.fogCompositeCanvas, 0, 0);

    // 3. Draw Creep (only where explored, dimmed in explored fog)
    if (this.world.creep) {
      // SC2's minimap creep: solid violet (sampled from a real minimap), one tile per cell, dimmed where only explored
      const creep = this.world.creep, fog = this.world.fog;
      for (let y = 0; y < MAP_SIZE; y++) {
        let runStart = -1, runDim = false;
        for (let x = 0; x <= MAP_SIZE; x++) {
          const on = x < MAP_SIZE && creep.hasCreep(x, y) && fog.isExplored(x, y);
          const dim = on && fog.getFogBrightness(x, y) < 0.5;
          if (on && runStart >= 0 && dim === runDim) continue;
          if (runStart >= 0) { this.ctx.fillStyle = runDim ? 'rgb(66, 25, 76)' : 'rgb(106, 40, 122)'; this.ctx.fillRect(runStart * scale, y * scale, (x - runStart) * scale, scale + 0.5); runStart = -1; }
          if (on) { runStart = x; runDim = dim; }
        }
      }
    }

    // 4. Draw Resource Nodes (only where explored)
    for (let i = 0; i < this.world.resourceNodes.length; i++) {
      const res = this.world.resourceNodes[i]!;
      const fogB = this.world.fog.getFogBrightness(res.pos.x, res.pos.y);
      if (fogB > 0.15) {
        this.ctx.fillStyle = res.type === 'minerals'
          ? (fogB > 0.7 ? '#00d2ff' : '#0b6b8a')
          : (fogB > 0.7 ? '#00ff88' : '#0a7a48');
        const rx = res.pos.x * scale;
        const ry = res.pos.y * scale;
        this.ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
    }

    // 5. Draw Buildings on top (crisp icons for player & explored enemy structures)
    this.world.buildings.forEach(b => {
      const isVisible = b.playerId === 'player' || this.world.fog.isExplored(b.pos.x, b.pos.y);
      if (isVisible) {
        const inActiveSight = b.playerId === 'player' || this.world.fog.isVisible(b.pos.x, b.pos.y);
        this.ctx.fillStyle = b.playerId === 'player'
          ? '#00ffff'
          : inActiveSight
            ? '#ff3333'
            : '#992222';
        const bx = b.pos.x * scale;
        const by = b.pos.y * scale;
        const size = Math.max(4, b.width * scale);
        this.ctx.fillRect(bx - size / 2, by - size / 2, size, size);
      }
    });

    // 6. Draw Units on top (crisp dots for player & actively visible enemy units)
    this.world.units.forEach(u => {
      const isVisible = u.playerId === 'player' || this.world.fog.isVisible(u.pos.x, u.pos.y);
      if (isVisible) {
        this.ctx.fillStyle = u.playerId === 'player' ? '#38bdf8' : '#ff2222';
        const ux = u.pos.x * scale;
        const uy = u.pos.y * scale;
        this.ctx.beginPath();
        this.ctx.arc(ux, uy, 2.2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    ctx.restore();

    // 7. Camera view footprint: the real camera frustum intersected with the ground plane (a trapezoid, wider at
    //    the far edge because of perspective), drawn in world space so zoom, FOV, pitch and yaw are all honoured.
    const cam = this.renderer.camera;
    cam.updateMatrixWorld();
    const pts: [number, number][] = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      const v = this._v.set(nx, ny, 0.5).unproject(cam).sub(cam.position);
      let t = v.y < -1e-3 ? -cam.position.y / v.y : 90;
      t = Math.max(0, Math.min(t, 90));
      pts.push([(cam.position.x + v.x * t) * scale, (cam.position.z + v.z * t) * scale]);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / k * 1.5;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Diamond outline of the playable area
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1 / k * 1.5;
    ctx.strokeRect(0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
