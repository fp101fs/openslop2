import * as THREE from 'three';
import { MAP_SIZE } from '../config';
import { ProceduralGrassSystem } from './ProceduralGrass';

export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

export class FogOfWar {
  public width: number;
  public height: number;
  public grid: Uint8Array;
  private gridHeights: Float32Array;

  // High-resolution (2x world grid) smooth brightness buffers for SC2-style soft vision edges
  private texRes: number;
  private currentBrightness: Float32Array;
  private targetBrightness: Float32Array;
  private exploredBrightness: Float32Array;
  private texelHeights: Float32Array;
  public texture: THREE.DataTexture;
  private textureData: Uint8Array;
  public isFogEnabled: boolean = true;

  // SC2 brightness constants:
  // 0.0 = Unexplored black mask, 0.42 = Explored twilight fog, 1.0 = Active clear vision
  private static readonly EXPLORED_LEVEL = 0.42;
  private radiusLutCache: Map<number, { expLut: Float32Array; visLut: Float32Array; scale: number }> = new Map();
  private lastFogEnabledState: boolean = true;

  constructor(_scene: THREE.Scene, width: number = MAP_SIZE, height: number = MAP_SIZE) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
    this.gridHeights = new Float32Array(width * height);

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        this.gridHeights[z * width + x] = ProceduralGrassSystem.getTerrainHeight(x + 0.5, z + 0.5);
      }
    }

    this.texRes = width * 2; // 240x240 sub-tile resolution for silky-smooth circular sight edges
    const totalTexels = this.texRes * this.texRes;
    this.currentBrightness = new Float32Array(totalTexels);
    this.targetBrightness = new Float32Array(totalTexels);
    this.exploredBrightness = new Float32Array(totalTexels);
    this.texelHeights = new Float32Array(totalTexels);
    this.textureData = new Uint8Array(totalTexels * 4);

    for (let tz = 0; tz < this.texRes; tz++) {
      const wz = (tz + 0.5) * 0.5;
      const rowOffset = tz * this.texRes;
      for (let tx = 0; tx < this.texRes; tx++) {
        const wx = (tx + 0.5) * 0.5;
        this.texelHeights[rowOffset + tx] = ProceduralGrassSystem.getTerrainHeight(wx, wz);
      }
    }

    for (let i = 0; i < totalTexels; i++) {
      this.currentBrightness[i] = 0.0;
      this.targetBrightness[i] = 0.0;
      this.exploredBrightness[i] = 0.0;
      const idx = i * 4;
      this.textureData[idx] = 0;
      this.textureData[idx + 1] = 0;
      this.textureData[idx + 2] = 0;
      this.textureData[idx + 3] = 255;
    }

    this.texture = new THREE.DataTexture(
      this.textureData,
      this.texRes,
      this.texRes,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.texture.flipY = true;
    this.texture.generateMipmaps = false;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  public clearAll() {
    this.grid.fill(FOG_UNEXPLORED);
    this.currentBrightness.fill(0.0);
    this.targetBrightness.fill(0.0);
    this.exploredBrightness.fill(0.0);
    const totalTexels = this.texRes * this.texRes;
    for (let i = 0; i < totalTexels; i++) {
      const idx = i * 4;
      this.textureData[idx] = 0;
      this.textureData[idx + 1] = 0;
      this.textureData[idx + 2] = 0;
      this.textureData[idx + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  /** Save game: what has been explored (the visible area is recomputed from units on the next frame). */
  public exportState(): { grid: Uint8Array; explored: Uint8Array } {
    const explored = new Uint8Array(this.exploredBrightness.length);
    for (let i = 0; i < explored.length; i++) explored[i] = Math.round(this.exploredBrightness[i]! * 255);
    const grid = new Uint8Array(this.grid.length);
    for (let i = 0; i < grid.length; i++) grid[i] = this.grid[i] === FOG_UNEXPLORED ? FOG_UNEXPLORED : FOG_EXPLORED;
    return { grid, explored };
  }

  public importState(s: { grid: Uint8Array; explored: Uint8Array }) {
    if (s.grid.length !== this.grid.length || s.explored.length !== this.exploredBrightness.length) return;
    this.grid.set(s.grid);
    for (let i = 0; i < s.explored.length; i++) this.exploredBrightness[i] = s.explored[i]! / 255;
    this.targetBrightness.set(this.exploredBrightness);
    this.currentBrightness.set(this.exploredBrightness);
    this.updateTexture(1);
  }

  public resetVision() {
    // 1. Demote logical grid cells from VISIBLE (2) back to EXPLORED (1)
    for (let i = 0; i < this.width * this.height; i++) {
      if (this.grid[i] === FOG_VISIBLE) {
        this.grid[i] = FOG_EXPLORED;
      }
    }

    // 2. Reset high-res target brightness to the permanently feathered exploredBrightness buffer (0.0 -> 0.42)
    this.targetBrightness.set(this.exploredBrightness);
  }

  private getRadiusLut(radius: number) {
    const key = Math.round(radius * 10);
    let cached = this.radiusLutCache.get(key);
    if (cached) return cached;

    const shroudOuterRadius = radius + 2.8;
    const shroudInnerRadius = Math.max(1.0, radius - 0.8);
    const shroudFeatherSpan = Math.max(0.5, shroudOuterRadius - shroudInnerRadius);
    const shroudOuterR2 = shroudOuterRadius * shroudOuterRadius;

    const visOuterRadius = radius + 1.2;
    const visInnerRadius = Math.max(1.0, radius - 2.6);
    const visFeatherSpan = Math.max(0.5, visOuterRadius - visInnerRadius);

    const expLevel = FogOfWar.EXPLORED_LEVEL;
    const lutSize = 2048;
    const scale = (lutSize - 1) / shroudOuterR2;
    const expLut = new Float32Array(lutSize);
    const visLut = new Float32Array(lutSize);

    for (let i = 0; i < lutSize; i++) {
      const d2 = i / scale;
      const dist = Math.sqrt(d2);

      let expB = expLevel;
      if (dist > shroudInnerRadius) {
        const te = Math.max(0.0, Math.min(1.0, 1.0 - (dist - shroudInnerRadius) / shroudFeatherSpan));
        const se = te * te * te * (te * (te * 6.0 - 15.0) + 10.0);
        expB = expLevel * se;
      }
      expLut[i] = expB;

      let visB = expB;
      if (dist <= visInnerRadius) {
        visB = 1.0;
      } else if (dist < visOuterRadius) {
        const tv = Math.max(0.0, Math.min(1.0, 1.0 - (dist - visInnerRadius) / visFeatherSpan));
        const sv = tv * tv * tv * (tv * (tv * 6.0 - 15.0) + 10.0);
        const candidateB = expLevel + sv * (1.0 - expLevel);
        if (candidateB > visB) visB = candidateB;
      }
      visLut[i] = visB;
    }

    cached = { expLut, visLut, scale };
    this.radiusLutCache.set(key, cached);
    return cached;
  }

  public revealCircle(
    centerX: number,
    centerZ: number,
    radius: number,
    observerHeight: number = 2.5,
    isFlying: boolean = false
  ) {
    if (!this.isFogEnabled) return;

    // High-ground line-of-sight rule (SC2 standard):
    // Ground units on low ground cannot see up onto high-ground cliffs/plateaus (> observerHeight + 0.85m)
    const maxSightElevation = isFlying ? 999.0 : observerHeight + 0.85;

    // 1. Update logical 120x120 visibility grid for fast gameplay queries
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(centerX + radius));
    const minZ = Math.max(0, Math.floor(centerZ - radius));
    const maxZ = Math.min(this.height - 1, Math.ceil(centerZ + radius));

    for (let z = minZ; z <= maxZ; z++) {
      const rowIdx = z * this.width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - centerX;
        const dz = z + 0.5 - centerZ;
        if (dx * dx + dz * dz <= r2) {
          const cellIdx = rowIdx + x;
          if (this.gridHeights[cellIdx]! <= maxSightElevation) {
            this.grid[cellIdx] = FOG_VISIBLE;
          } else if (this.grid[cellIdx] === FOG_UNEXPLORED) {
            this.grid[cellIdx] = FOG_EXPLORED;
          }
        }
      }
    }

    // 2. Update 240x240 sub-tile visual buffer using precomputed C² quintic smootherstep LUT (zero Math.sqrt per texel)
    const shroudOuterRadius = radius + 2.8;
    const shroudOuterR2 = shroudOuterRadius * shroudOuterRadius;
    const visInnerRadius = Math.max(1.0, radius - 2.6);
    const visInnerR2 = visInnerRadius * visInnerRadius;
    const expLevel = FogOfWar.EXPLORED_LEVEL;
    const { expLut, visLut, scale } = this.getRadiusLut(radius);

    const tMinX = Math.max(0, Math.floor((centerX - shroudOuterRadius) * 2));
    const tMaxX = Math.min(this.texRes - 1, Math.ceil((centerX + shroudOuterRadius) * 2));
    const tMinZ = Math.max(0, Math.floor((centerZ - shroudOuterRadius) * 2));
    const tMaxZ = Math.min(this.texRes - 1, Math.ceil((centerZ + shroudOuterRadius) * 2));

    for (let tz = tMinZ; tz <= tMaxZ; tz++) {
      const wz = (tz + 0.5) * 0.5;
      const dz = wz - centerZ;
      const dz2 = dz * dz;
      const rowOffset = tz * this.texRes;

      for (let tx = tMinX; tx <= tMaxX; tx++) {
        const wx = (tx + 0.5) * 0.5;
        const dx = wx - centerX;
        const d2 = dx * dx + dz2;
        if (d2 > shroudOuterR2) continue;

        const idx = rowOffset + tx;
        const occludedByCliff = this.texelHeights[idx]! > maxSightElevation;

        if (d2 <= visInnerR2) {
          this.exploredBrightness[idx] = expLevel;
          if (!occludedByCliff) {
            this.targetBrightness[idx] = 1.0;
          } else if (expLevel > this.targetBrightness[idx]!) {
            this.targetBrightness[idx] = expLevel;
          }
          continue;
        }

        const lutIdx = (d2 * scale) | 0;
        const expB = expLut[lutIdx]!;
        if (expB > this.exploredBrightness[idx]!) {
          this.exploredBrightness[idx] = expB;
        }

        const visB = occludedByCliff ? expB : visLut[lutIdx]!;
        const bestB = visB > this.exploredBrightness[idx]! ? visB : this.exploredBrightness[idx]!;
        if (bestB > this.targetBrightness[idx]!) {
          this.targetBrightness[idx] = bestB;
        }
      }
    }
  }

  public isVisible(x: number, z: number): boolean {
    if (!this.isFogEnabled) return true;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.height) return false;
    return this.grid[gz * this.width + gx] === FOG_VISIBLE;
  }

  public isExplored(x: number, z: number): boolean {
    if (!this.isFogEnabled) return true;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.height) return false;
    const val = this.grid[gz * this.width + gx];
    return val === FOG_EXPLORED || val === FOG_VISIBLE;
  }

  // Sample continuous fog brightness (0.0 = unexplored, 0.42 = explored, 1.0 = visible) for Minimap & UI
  public getFogBrightness(x: number, z: number): number {
    if (!this.isFogEnabled) return 1.0;
    const tx = Math.max(0, Math.min(this.texRes - 1, Math.floor(x * 2)));
    const tz = Math.max(0, Math.min(this.texRes - 1, Math.floor(z * 2)));
    return this.currentBrightness[tz * this.texRes + tx]!;
  }

  public updateTexture(dt: number = 0.016) {
    const total = this.texRes * this.texRes;
    const revealRate = Math.min(1.0, dt * 11.0); // Fast crisp reveal when units advance
    const fadeRate = Math.min(1.0, dt * 5.0);    // Smooth SC2 linger when units leave an area

    if (!this.isFogEnabled) {
      if (this.lastFogEnabledState) {
        this.lastFogEnabledState = false;
        this.currentBrightness.fill(1.0);
        this.textureData.fill(255);
        this.texture.needsUpdate = true;
      }
      return;
    }
    this.lastFogEnabledState = true;

    let dirty = false;
    for (let i = 0; i < total; i++) {
      const cur = this.currentBrightness[i]!;
      const tgt = this.targetBrightness[i]!;
      const diff = tgt - cur;
      if (diff === 0) continue;

      let next = tgt;
      if (diff > 0.002 || diff < -0.002) {
        next = cur + diff * (diff > 0 ? revealRate : fadeRate);
      }
      if (next !== cur) {
        this.currentBrightness[i] = next;
        dirty = true;
      }
    }

    if (dirty) {
      // Pre-smooth the 240x240 fog texture on CPU with a 5-tap cross kernel so GPU shaders only need 1 texture lookup
      const res = this.texRes;
      const src = this.currentBrightness;
      const dst = this.textureData;

      for (let z = 0; z < res; z++) {
        const row = z * res;
        const rowUp = z > 0 ? (z - 1) * res : row;
        const rowDn = z < res - 1 ? (z + 1) * res : row;
        for (let x = 0; x < res; x++) {
          const idx = row + x;
          const c = src[idx]!;
          // Fast path inside solid unexplored (0.0), explored (0.42), or visible (1.0) interiors
          let smoothed = c;
          if (c > 0.001 && c < 0.999) {
            const xL = x > 0 ? x - 1 : x;
            const xR = x < res - 1 ? x + 1 : x;
            smoothed =
              c * 0.36 +
              (src[row + xL]! + src[row + xR]! + src[rowUp + x]! + src[rowDn + x]!) * 0.16;
          }
          const byteVal = (smoothed * 255 + 0.5) | 0;
          const tIdx = idx * 4;
          dst[tIdx] = byteVal;
          dst[tIdx + 1] = byteVal;
          dst[tIdx + 2] = byteVal;
        }
      }
      this.texture.needsUpdate = true;
    }
  }

  public toggleFog() {
    this.isFogEnabled = !this.isFogEnabled;
  }
}
