import { simRandom } from './Rng';
import * as THREE from 'three';
import { MAP_SIZE, BUILDING_CONFIGS } from '../config';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { CREEP_FRAGMENT_COMMON, CREEP_FRAGMENT_COLOR, CREEP_FRAGMENT_NORMAL } from '../graphics/CreepShader';

/**
 * Zerg creep. Gameplay is tile based, the look is continuous.
 *
 * Simulation: every Hatchery / Hive is a creep *source* with an `allowed` footprint (a disc of CREEP_RADIUS reached through open ground, so cliffs
 * stop it) and a `grown` set of tiles. Every TICK a finished source grows a few random frontier tiles, so the edge fills in patchily instead of
 * advancing as a ring; a source whose building died loses random edge tiles instead. Other things that spread creep later (Creep Tumors) only
 * need to be added to `sourceOf`.
 *
 * Rendering: the covered tiles are blurred into a smooth signed field (tiles to the edge, clamped to +-2) that goes into a texture;
 * `CreepShader` turns it into an opaque, ragged-edged, procedurally detailed membrane (see graphics/CreepShader.ts).
 */
export const CREEP_RADIUS = 12.05;       // SC2: a finished Hatchery covers 457 tiles at most (13 "game units" counted its way); this radius gives 457 here
const START_RADIUS = 4.7;                // ...and 69 tiles (the 9x9 patch) the moment it finishes
const TICK = 0.25;                       // creep updates every 0.25 s
const GROW_PER_TICK = 1.5;               // random frontier tiles gained per tick while spreading (~388 tiles in ~45 s)
const RECEDE_PER_TICK = 4;               // random edge tiles lost per tick once the source is gone
const SD_RANGE = 2;                      // the field stores distance-to-edge in [-SD_RANGE, SD_RANGE] tiles

interface Source { x: number; y: number; allowed: Uint8Array; grown: Uint8Array; count: number; x0: number; x1: number; y0: number; y1: number }
interface SourceBuilding { type: string; id: string; pos: { x: number; y: number }; isDead: boolean; isConstructed: boolean; width: number }

/** Zerg structures live on creep: all of them except the town hall, Extractor and the supply building. */
const OFF_CREEP_OK = new Set(['hatchery', 'hive', 'extractor', 'overlord_pod', 'nydus_worm']);
export const needsCreep = (type: string): boolean => BUILDING_CONFIGS[type as keyof typeof BUILDING_CONFIGS]?.race === 'zerg' && !OFF_CREEP_OK.has(type);
/** A creep-bound structure with no creep under it loses this fraction of its max health per second (about 100 s to die). */
export const OFF_CREEP_BLEED = 0.01;

/** Buildings that spread creep, and how far. */
const sourceOf = (b: SourceBuilding): { max: number } | null =>
  b.type === 'hatchery' || b.type === 'hive' ? { max: CREEP_RADIUS } : b.type === 'creep_tumor' ? { max: 10 } : null;

export class CreepSystem {
  public width: number;
  public height: number;
  public creepGrid: Uint8Array;
  public texture: THREE.DataTexture;
  private textureData: Uint8Array;
  private best: Float32Array;
  public mesh: THREE.Mesh;
  private sources = new Map<string, Source>();
  private uTime = { value: 0 };
  private dirty = false;
  private sinceRebuild = 0;
  private tickAcc = 0;
  private tmp: Float32Array;
  private level: Float32Array;   // per tile 0..1: eases toward the gameplay mask so new creep swells in and old creep fades out
  private animating = false;
  private sinceRebuildPrev = 0.05;
  private isCliff: ((x: number, y: number) => boolean) | null = null;

  constructor(scene: THREE.Scene, width: number = MAP_SIZE, height: number = MAP_SIZE, fogTexture?: THREE.DataTexture) {
    this.width = width;
    this.height = height;
    this.creepGrid = new Uint8Array(width * height);
    this.textureData = new Uint8Array(width * height * 4);
    this.best = new Float32Array(width * height);
    this.tmp = new Float32Array(width * height);
    this.level = new Float32Array(width * height);

    this.texture = new THREE.DataTexture(this.textureData, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.flipY = true;
    this.texture.colorSpace = THREE.NoColorSpace; // data, not colour
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;

    const geo = ProceduralGrassSystem.createTerrainGeometry(width, 192);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) posAttr.setY(i, posAttr.getY(i) + 0.03);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.texture, // only supplies the UV transform + sampler: the shader reads the distance field from it
      roughness: 0.6,
      metalness: 0.05,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 // opaque and a hair above the ground: never z-fight with it
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.tFogMap = { value: fogTexture ?? null };
      shader.uniforms.uMapSize = { value: width };
      shader.uniforms.uTime = this.uTime;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CREEP_FRAGMENT_COMMON}`)
        .replace('#include <map_fragment>', CREEP_FRAGMENT_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = creepRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CREEP_FRAGMENT_NORMAL}`);
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(width / 2, 0, height / 2);
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  public clear() {
    this.sources.clear();
    this.level.fill(0);
    this.uTime.value = 0; // a match start: the starting bases spread out from their 9x9 patch
    this.rebuild();
  }

  /** Save game: every creep source with its reachable and covered tiles (only its bounding box is stored). */
  public exportState() {
    const W = this.width;
    const box = (s: Source, a: Uint8Array) => {
      const w = s.x1 - s.x0 + 1, out = new Uint8Array(w * (s.y1 - s.y0 + 1));
      for (let y = s.y0; y <= s.y1; y++) out.set(a.subarray(y * W + s.x0, y * W + s.x1 + 1), (y - s.y0) * w);
      return out;
    };
    return {
      time: this.uTime.value,
      tickAcc: this.tickAcc,
      /** Multiplayer keyframes set this: restore the clock exactly (saves skip the swell-in by starting it at 2 s). */
      exact: false,
      sources: [...this.sources].map(([key, s]) => ({ key, x: s.x, y: s.y, count: s.count, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, allowed: box(s, s.allowed), grown: box(s, s.grown) }))
    };
  }

  /** Restore creep exactly as saved, with no swell-in animation. */
  public importState(st: ReturnType<CreepSystem['exportState']>) {
    const { width: W, height: H } = this;
    this.sources.clear();
    for (const r of st.sources) {
      const s: Source = { x: r.x, y: r.y, count: r.count, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, allowed: new Uint8Array(W * H), grown: new Uint8Array(W * H) };
      const w = r.x1 - r.x0 + 1;
      for (let y = r.y0; y <= r.y1; y++) {
        s.allowed.set(r.allowed.subarray((y - r.y0) * w, (y - r.y0 + 1) * w), y * W + r.x0);
        s.grown.set(r.grown.subarray((y - r.y0) * w, (y - r.y0 + 1) * w), y * W + r.x0);
      }
      this.sources.set(r.key, s);
    }
    // the clock also decides whether a new building's creep spreads in or appears at once, so keyframes need it exact
    this.uTime.value = st.exact ? st.time : Math.max(2, st.time);
    this.tickAcc = st.tickAcc ?? 0;
    this.rebuild();
    this.level.set(this.creepGrid); // already fully grown: skip the fade-in
    this.rebuild();
  }

  /** Everything a source could ever cover: tiles within `max` of it reachable through open ground. */
  private makeSource(x: number, y: number, max: number): Source {
    const { width: W, height: H } = this;
    const allowed = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    const sx = Math.min(W - 1, Math.max(0, Math.floor(x))), sy = Math.min(H - 1, Math.max(0, Math.floor(y)));
    const x0 = Math.max(0, Math.floor(x - max - 1)), x1 = Math.min(W - 1, Math.ceil(x + max + 1));
    const y0 = Math.max(0, Math.floor(y - max - 1)), y1 = Math.min(H - 1, Math.ceil(y + max + 1));
    const queue = [sy * W + sx]; seen[sy * W + sx] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi]!, cx = i % W, cy = (i - cx) / W;
      if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) > max) continue;
      allowed[i] = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const ni = ny * W + nx;
        if (seen[ni] || (this.isCliff && this.isCliff(nx + 0.5, ny + 0.5))) continue;
        seen[ni] = 1; queue.push(ni);
      }
    }
    return { x, y, allowed, grown: new Uint8Array(W * H), count: 0, x0, x1, y0, y1 };
  }

  /** Make every allowed tile within radius r of the source grown (instantly). */
  private fillTo(s: Source, r: number) {
    const W = this.width;
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const i = y * W + x;
      if (s.allowed[i] && !s.grown[i] && Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) <= r) { s.grown[i] = 1; s.count++; }
    }
  }

  /** Tiles at the edge of the grown area: `outside` = allowed tiles next to creep, else grown tiles next to bare ground. */
  private edge(s: Source, outside: boolean): number[] {
    const { width: W, height: H } = this;
    const out: number[] = [];
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const i = y * W + x;
      if (outside ? !(s.allowed[i] && !s.grown[i]) : !s.grown[i]) continue;
      const nb = (j: number) => s.grown[j] === 1;
      const near = outside
        ? (x > 0 && nb(i - 1)) || (x < W - 1 && nb(i + 1)) || (y > 0 && nb(i - W)) || (y < H - 1 && nb(i + W))
        : !((x > 0 && nb(i - 1)) && (x < W - 1 && nb(i + 1)) && (y > 0 && nb(i - W)) && (y < H - 1 && nb(i + W)));
      if (near) out.push(i);
    }
    return out;
  }

  private step(s: Source, outside: boolean, n: number) {
    const e = this.edge(s, outside);
    for (let k = 0; k < n && e.length; k++) {
      const j = Math.floor(simRandom() * e.length), i = e[j]!;
      e[j] = e[e.length - 1]!; e.pop();
      s.grown[i] = outside ? 1 : 0; s.count += outside ? 1 : -1;
    }
    this.dirty = true;
  }

  /** Per frame (also on multiplayer guests: the sources are derived from the buildings, so nothing extra is synced). */
  public update(dt: number, buildings: readonly SourceBuilding[], isCliff?: (x: number, y: number) => boolean) {
    this.isCliff = isCliff ?? null;
    this.uTime.value += dt;
    this.tickAcc += dt;
    const tick = this.tickAcc >= TICK;
    if (tick) this.tickAcc -= TICK;
    const live = new Set<string>();
    for (const b of buildings) {
      if (b.isDead) continue;
      const src = sourceOf(b);
      if (!src) continue;
      const key = `${b.pos.x},${b.pos.y}`; // keyed by place so a Hatchery morphing into a Hive keeps its creep
      live.add(key);
      let s = this.sources.get(key);
      if (!s) {
        s = this.makeSource(b.pos.x, b.pos.y, src.max);
        // a building going up stains the ground under it; a base that exists from the start (or a joined game) is handled below
        this.fillTo(s, Math.max(b.width, 3) / 2 + 1);
        if (b.isConstructed && this.uTime.value >= 2) this.fillTo(s, src.max); // mid-game sighting: already fully spread
        this.sources.set(key, s); this.dirty = true;
      }
      if (b.isConstructed && s.count < 60) { this.fillTo(s, START_RADIUS); this.dirty = true; } // completion: the 9x9 patch appears at once
      if (tick && b.isConstructed) this.step(s, true, Math.floor(GROW_PER_TICK + simRandom())); // fractional rates average out
    }
    if (tick) for (const [key, s] of this.sources) {
      if (live.has(key)) continue;
      this.step(s, false, RECEDE_PER_TICK);
      if (s.count <= 0) this.sources.delete(key);
    }
    this.sinceRebuild += dt;
    if ((this.dirty && this.sinceRebuild >= 0.05) || (this.animating && this.sinceRebuild >= 0.05)) this.rebuild();
  }

  private rebuild() {
    this.dirty = false; this.sinceRebuildPrev = this.sinceRebuild; this.sinceRebuild = 0;
    const { width: W, height: H, best, tmp, creepGrid, textureData } = this;
    creepGrid.fill(0);
    for (const s of this.sources.values())
      for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) { const i = y * W + x; if (s.grown[i]) creepGrid[i] = 1; }
    // ease each tile's level toward the mask (about 1.5 s to swell in, so new creep never pops)
    const dtE = Math.max(0.05, this.sinceRebuildPrev), k = Math.min(1, dtE / 1.5);
    let moving = false;
    for (let i = 0; i < W * H; i++) {
      const t = creepGrid[i]!, l = this.level[i]!;
      if (l === t) continue;
      const n = l + Math.sign(t - l) * Math.min(Math.abs(t - l), k);
      this.level[i] = Math.abs(t - n) < 0.002 ? t : n;
      moving = true;
    }
    this.animating = moving;
    // blur the eased levels into a smooth field (two 3x3 box passes) so the edge is soft and the shader can rag it
    for (let i = 0; i < W * H; i++) best[i] = this.level[i]!;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(W - 1, Math.max(0, x + dx)), ny = Math.min(H - 1, Math.max(0, y + dy));
          sum += best[ny * W + nx]!;
        }
        tmp[y * W + x] = sum / 9;
      }
      best.set(tmp);
    }
    for (let i = 0; i < W * H; i++) {
      const sd = (best[i]! - 0.5) * 2 * SD_RANGE; // 0 -> -2 tiles outside, 1 -> +2 inside, 0.5 on the edge
      textureData[i * 4] = Math.round((sd / (2 * SD_RANGE) + 0.5) * 255);
    }
    this.texture.needsUpdate = true;
    this.mesh.visible = this.sources.size > 0 || this.animating;
  }

  public hasCreep(x: number, y: number): boolean {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return false;
    return this.creepGrid[gy * this.width + gx] === 1;
  }
}
