import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralGrassSystem } from './ProceduralGrass';

/**
 * Liquid melt: a flipbook of a blob of liquid slumping and spreading into a puddle (24 decimated frames baked from a
 * liquid-metal simulation, public/models/fx/liquid_melt.glb). Frame 0 is a blob 2 wide and 1.4 tall; the last frame is a flat,
 * lopsided puddle. Used for blood pools (Terran bio), ichor (Zerg), molten metal (Terran mech) and royal-blue Protoss blood.
 * After the melt the puddle lies for a while, then flattens and sinks into the ground.
 */
export type MeltKind = 'blood' | 'ichor' | 'metal' | 'plasma';

interface Melt { mesh: THREE.Mesh; t: number; f0: number; fps: number; hold: number; sink: number; sy: number; baseY: number }

const FRAMES = 24;
const MAX_ACTIVE = 64;

export class LiquidMelt {
  private static frames: THREE.BufferGeometry[] = [];
  private static loading = false;
  private melts: Melt[] = [];
  private mats: Record<MeltKind, THREE.Material>;

  constructor(private scene: THREE.Scene) {
    this.mats = {
      blood: new THREE.MeshStandardMaterial({ color: 0x4a0205, roughness: 0.16, metalness: 0.25, envMapIntensity: 2.5 }),
      ichor: new THREE.MeshStandardMaterial({ color: 0x46691a, roughness: 0.22, metalness: 0.15, emissive: 0x1a3006, emissiveIntensity: 0.25, envMapIntensity: 1.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x7d848f, roughness: 0.2, metalness: 0.85, envMapIntensity: 1.6 }),
      plasma: new THREE.MeshStandardMaterial({ color: 0x1c34b8, roughness: 0.15, metalness: 0.25, emissive: 0x0c1a78, emissiveIntensity: 0.45, envMapIntensity: 2.2 })
    };
    LiquidMelt.load();
  }

  private static load() {
    if (LiquidMelt.loading) return;
    LiquidMelt.loading = true;
    const base = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
    new GLTFLoader().loadAsync(base + 'models/fx/liquid_melt.glb').then(g => {
      const byName = new Map<string, THREE.BufferGeometry>();
      g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) byName.set(m.name, m.geometry); });
      const out: THREE.BufferGeometry[] = [];
      for (let i = 0; i < FRAMES; i++) { const geo = byName.get(`f${String(i).padStart(2, '0')}`); if (geo) out.push(geo); }
      LiquidMelt.frames = out;
    }).catch(e => console.warn('liquid melt effect failed to load', e));
  }

  /**
   * Spawn a melt at `pos` (on the ground). `size` is the blob radius in world units; `fromFrame` skips the tall start of the
   * melt (0 = full blob collapse, ~12 = only the gush that spreads into a pool).
   */
  /**
   * A death's worth of liquid: 1-5 blobs. Sizes step down sharply (each blob 50-68% of the one before, so no two are alike);
   * total area stays about one big pool. About half of the extra blobs land overlapping a bigger one and merge into an
   * irregular joined pool; the rest splash out around it.
   */
  public spawnGroup(kind: MeltKind, pos: THREE.Vector3, size: number, fromFrame = 0, delay = 0) {
    const r = Math.random();
    const n = r < 0.3 ? 1 : r < 0.58 ? 2 : r < 0.8 ? 3 : r < 0.93 ? 4 : 5;
    const sizes = [1];
    for (let i = 1; i < n; i++) sizes.push(sizes[i - 1]! * (0.5 + Math.random() * 0.18));
    const area = sizes.reduce((a, s) => a + s * s, 0);
    const k = size * 1.15 / Math.sqrt(area);
    const placed: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = Math.max(size * 0.12, sizes[i]! * k);
      let x = pos.x, z = pos.z;
      if (i > 0) {
        const a = Math.random() * Math.PI * 2;
        if (Math.random() < 0.55) {
          // joined: overlaps an earlier (bigger) blob so the two read as one pool
          const host = placed[Math.floor(Math.random() * placed.length)]!;
          const d = (host.s + s) * (0.35 + Math.random() * 0.35);
          x = host.x + Math.cos(a) * d; z = host.z + Math.sin(a) * d;
        } else {
          const d = placed[0]!.s + s + Math.random() * size * 0.7;
          x = pos.x + Math.cos(a) * d; z = pos.z + Math.sin(a) * d;
        }
      }
      placed.push({ x, z, s });
      const f = fromFrame + Math.floor(Math.random() * 3) - (i === 0 ? 0 : 1);
      this.spawn(kind, new THREE.Vector3(x, pos.y, z), s, f, delay + (i === 0 ? 0 : Math.random() * 0.3));
    }
  }

  public spawn(kind: MeltKind, pos: THREE.Vector3, size: number, fromFrame = 0, delay = 0) {
    const frames = LiquidMelt.frames;
    if (!frames.length) return;
    if (this.melts.length >= MAX_ACTIVE) { const old = this.melts.shift()!; this.scene.remove(old.mesh); }
    const f0 = Math.max(0, Math.min(FRAMES - 2, fromFrame));
    const mesh = new THREE.Mesh(frames[f0], this.mats[kind]);
    const ground = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.z);
    mesh.position.set(pos.x, ground + 0.03, pos.z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    const stretch = 0.8 + Math.random() * 0.4;
    mesh.scale.set(size * stretch, size * 0.9 * (0.75 + Math.random() * 0.4), size / stretch);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.raycast = () => {};
    mesh.visible = delay <= 0;
    this.scene.add(mesh);
    this.melts.push({
      mesh, t: -delay, f0, fps: 17 * (0.8 + Math.random() * 0.4),
      hold: kind === 'metal' ? 9 : 6, sink: 2.5,
      sy: mesh.scale.y, baseY: mesh.position.y
    });
  }

  public update(dt: number) {
    const frames = LiquidMelt.frames;
    for (let i = this.melts.length - 1; i >= 0; i--) {
      const m = this.melts[i]!;
      m.t += dt;
      if (m.t < 0) continue;
      m.mesh.visible = true;
      const meltDur = (FRAMES - 1 - m.f0) / m.fps;
      if (m.t < meltDur) {
        m.mesh.geometry = frames[Math.min(FRAMES - 1, m.f0 + Math.floor(m.t * m.fps))]!;
        continue;
      }
      m.mesh.geometry = frames[FRAMES - 1]!;
      const k = (m.t - meltDur - m.hold) / m.sink;
      if (k > 0) {
        // the puddle flattens and soaks into the ground
        m.mesh.scale.y = m.sy * Math.max(0.02, 1 - k);
        m.mesh.position.y = m.baseY - k * 0.05;
      }
      if (k >= 1) { this.scene.remove(m.mesh); this.melts.splice(i, 1); }
    }
  }

  public clear() {
    for (const m of this.melts) this.scene.remove(m.mesh);
    this.melts = [];
  }
}
