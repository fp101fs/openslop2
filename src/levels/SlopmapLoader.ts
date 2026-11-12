/**
 * Runtime loader for `.slopmap` single-file binary maps.
 *
 * Only fetches & decodes a `.slopmap` binary when that map is the active boot map (or requested on demand),
 * priming `LevelRaster` with the pre-computed terrain/pathing grids and instantiating the map's placed doodads
 * + embedded glTF 2.0 `.glb` models in `LevelScenery`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelDef } from './LevelTypes';
import { LevelRaster, primeRaster } from './LevelRaster';
import type { Theme } from './Themes';
import { buildKit } from './PropKits';

const SLOPMAP_MAGIC = 0x504f4c53; // "SLOP"

interface SlopmapBufferView {
  name: string;
  byteOffset: number;
  byteLength: number;
  dtype: 'float32' | 'uint8' | 'uint16' | 'uint32' | 'bytes';
  shape: number[];
  mimeType?: string;
}

interface SlopmapDoodadDef {
  id: string;
  parentId: string;
  name: string;
  propKit: string;
  mdxPath?: string;
  glbBufferView?: string;
  hasEmbeddedTexture?: boolean;
  instanceCount: number;
}

interface ParsedSlopmap {
  manifest: {
    meta: { id: string; name: string; size: number; res: number };
    doodadPalette: SlopmapDoodadDef[];
    bufferViews: Record<string, SlopmapBufferView>;
  };
  bin: Uint8Array;
  getFloat32(name: string): Float32Array;
  getUint8(name: string): Uint8Array;
  getUint16(name: string): Uint16Array;
  getBytes(name: string): Uint8Array;
}

function parseSlopmapBuffer(buf: ArrayBuffer | Uint8Array): ParsedSlopmap {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== SLOPMAP_MAGIC) throw new Error('Invalid .slopmap magic');
  const jsonLen = dv.getUint32(8, true);
  const binLen = dv.getUint32(12, true);
  const manifest = JSON.parse(new TextDecoder().decode(u8.subarray(16, 16 + jsonLen)));
  const bin = u8.subarray(16 + jsonLen, 16 + jsonLen + binLen);
  const view = (name: string) => {
    const bv = manifest.bufferViews[name] as SlopmapBufferView | undefined;
    if (!bv) throw new Error(`Missing bufferView ${name}`);
    return bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
  };
  return {
    manifest,
    bin,
    getFloat32(name: string) {
      const s = view(name);
      const a = s.byteOffset % 4 === 0 ? s : new Uint8Array(s);
      return new Float32Array(a.buffer, a.byteOffset, s.byteLength / 4);
    },
    getUint8(name: string) { return view(name); },
    getUint16(name: string) {
      const s = view(name);
      const a = s.byteOffset % 2 === 0 ? s : new Uint8Array(s);
      return new Uint16Array(a.buffer, a.byteOffset, s.byteLength / 2);
    },
    getBytes(name: string) { return view(name); }
  };
}

const loadedSlopmaps = new Map<string, ParsedSlopmap>();

export const SLOPMAP_URLS: Record<string, string> = {
  sunken_city: 'maps/sunken_city.slopmap'
};

export const sunkenCityLevel: LevelDef = {
  id: 'sunken_city',
  name: 'Sunken City v2.5.2b (2P Dungeon)',
  subtitle: 'Ancient Sunken Ruins Labyrinth (.slopmap)',
  description: 'Ported from Warcraft III Sunken City v2.5.2b (.slopmap): 192x192 ancient temple ruins, flooded canals, carved stone corridors, and 11,749 placed doodads.',
  size: 192,
  theme: 'sunken_ruins',
  ops: [],
  bases: [
    {
      th: [74, 168], face: 1.867, kind: 'main',
      minerals: [[76.03, 173.33], [74.89, 174.14], [73.56, 173.68], [72.19, 173.93], [71.18, 172.96], [69.84, 172.59], [69.34, 171.29]],
      geysers: [[77.95, 173.16], [67.84, 170.07]]
    },
    {
      th: [64, 58], face: 4.012, kind: 'main',
      minerals: [[58.43, 56.81], [58.37, 55.41], [59.47, 54.55], [60.01, 53.26], [61.37, 52.94], [62.41, 52.01], [63.77, 52.3]],
      geysers: [[57.52, 58.51], [65.61, 51.7]]
    },
    {
      th: [30, 78], face: 3.408, kind: 'natural',
      minerals: [[24.74, 80.19], [23.89, 79.07], [24.31, 77.74], [24.02, 76.37], [24.96, 75.34], [25.28, 73.98], [26.58, 73.44]],
      geysers: [[24.96, 82.11], [27.74, 71.9]]
    },
    {
      th: [132, 98], face: 0.055, kind: 'natural',
      minerals: [[136.69, 94.76], [137.75, 95.67], [137.62, 97.07], [138.19, 98.34], [137.49, 99.55], [137.45, 100.95], [136.3, 101.74]],
      geysers: [[136.07, 92.93], [135.48, 103.49]]
    },
    {
      th: [98, 86], face: 4.91, kind: 'third',
      minerals: [[95.46, 80.9], [96.51, 79.98], [97.87, 80.3], [99.22, 79.92], [100.31, 80.79], [101.69, 81.02], [102.31, 82.27]],
      geysers: [[93.56, 81.26], [103.93, 83.33]]
    },
    {
      th: [58, 86], face: 3.399, kind: 'third',
      minerals: [[52.76, 88.23], [51.9, 87.13], [52.3, 85.79], [52, 84.42], [52.94, 83.38], [53.25, 82.02], [54.53, 81.47]],
      geysers: [[53, 90.15], [55.69, 79.92]]
    }
  ],
  starts: [
    { base: 0, defense: [74, 168] },
    { base: 1, defense: [64, 58] }
  ],
  props: []
};

function attachSlopmapToRaster(def: LevelDef, parsed: ParsedSlopmap) {
  const r = Object.create(LevelRaster.prototype) as LevelRaster;
  (r as any).def = def;
  (r as any).size = parsed.manifest.meta.size;
  (r as any).res = parsed.manifest.meta.res;
  r.height = parsed.getFloat32('raster.height');
  r.tier = parsed.getFloat32('raster.tier');
  r.wall = parsed.getUint8('raster.wall');
  r.blocked = parsed.getUint8('raster.blocked');
  r.ramp = parsed.getUint8('raster.ramp');
  r.rampT = parsed.getFloat32('raster.rampT');
  r.liquid = parsed.getUint8('raster.liquid');
  r.plaza = parsed.getFloat32('raster.plaza');
  r.cliffW = parsed.getFloat32('raster.cliffW');
  r.road = parsed.getFloat32('raster.road');
  r.biome = parsed.getFloat32('raster.biome');
  const n = r.res * r.res; r.paved = new Float32Array(n); r.solid = new Uint8Array(n); // not in .slopmap files (campaign ops only)
  primeRaster(def.id, r);
  loadedSlopmaps.set(def.id, parsed);
}

/** Load and prime a `.slopmap` by level id if not already loaded. */
export async function ensureSlopmapLoaded(id: string, def: LevelDef): Promise<ParsedSlopmap | null> {
  const hit = loadedSlopmaps.get(id);
  if (hit) return hit;
  const relUrl = SLOPMAP_URLS[id];
  if (!relUrl) return null;
  try {
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      const base = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
      const res = await fetch(base + relUrl);
      if (!res.ok) return null;
      const parsed = parseSlopmapBuffer(await res.arrayBuffer());
      attachSlopmapToRaster(def, parsed);
      return parsed;
    }
    const bun = (globalThis as any).Bun;
    if (bun) {
      const ab = await bun.file('public/' + relUrl).arrayBuffer();
      const parsed = parseSlopmapBuffer(new Uint8Array(ab));
      attachSlopmapToRaster(def, parsed);
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn(`[SlopmapLoader] Failed to load ${relUrl}:`, e);
    return null;
  }
}

export function hasSlopmap(id: string): boolean {
  return id in SLOPMAP_URLS;
}

/**
 * Instantiate the placed doodads from a `.slopmap` (both embedded custom `.glb` models and mapped `PropKit` meshes).
 */
export async function buildSlopmapScenery(
  def: LevelDef,
  theme: Theme,
  fogUniform: { value: THREE.Texture | null },
  heightAt: (x: number, z: number) => number
): Promise<THREE.Group> {
  const { applyFogOfWar } = await import('../graphics/Scenery');
  const root = new THREE.Group();
  root.name = 'slopmapProps';
  const parsed = await ensureSlopmapLoaded(def.id, def);
  if (!parsed) return root;

  const clearPts: { x: number; z: number }[] = [];
  for (const b of def.bases) {
    clearPts.push({ x: b.th[0], z: b.th[1] });
    for (const p of [...b.minerals, ...b.geysers]) clearPts.push({ x: p[0], z: p[1] });
  }

  const transforms = parsed.getFloat32('doodads.transforms');
  const meta = parsed.getUint16('doodads.meta');
  const palette = parsed.manifest.doodadPalette;
  const count = transforms.length / 7;

  // Group instance matrices by (1) embedded GLB bufferView or (2) fallback PropKit
  const byGlb = new Map<string, THREE.Matrix4[]>();
  const byKit = new Map<string, THREE.Matrix4[]>();
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const palIdx = meta[i * 4]!;
    const ddef = palette[palIdx];
    if (!ddef || ddef.propKit === 'blocker') continue;

    const x = transforms[i * 7]!;
    const z = transforms[i * 7 + 2]!;
    if (x < 2 || z < 2 || x > def.size - 2 || z > def.size - 2) continue;
    if (clearPts.some(c => Math.hypot(c.x - x, c.z - z) < 7.5)) continue;

    const yaw = transforms[i * 7 + 3]!;
    const sx = Math.max(0.25, Math.min(3.5, transforms[i * 7 + 4]!));
    const sy = Math.max(0.25, Math.min(3.5, transforms[i * 7 + 5]!));
    const sz = Math.max(0.25, Math.min(3.5, transforms[i * 7 + 6]!));

    dummy.position.set(x, heightAt(x, z) - 0.05, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    const mat = dummy.matrix.clone();

    if (ddef.glbBufferView && ddef.hasEmbeddedTexture) {
      let arr = byGlb.get(ddef.glbBufferView);
      if (!arr) { arr = []; byGlb.set(ddef.glbBufferView, arr); }
      arr.push(mat);
    } else {
      let arr = byKit.get(ddef.propKit);
      if (!arr) { arr = []; byKit.set(ddef.propKit, arr); }
      arr.push(mat);
    }
  }

  // 1. Build InstancedMeshes for PropKit groups
  for (const [kitId, mats] of byKit.entries()) {
    if (!mats.length) continue;
    const variants = await buildKit(kitId, theme);
    if (!variants.length) continue;
    const buckets: THREE.Matrix4[][] = variants.map(() => []);
    for (let i = 0; i < mats.length; i++) {
      buckets[i % variants.length]!.push(mats[i]!);
    }
    variants.forEach((v, vi) => {
      const ms = buckets[vi]!;
      if (!ms.length) return;
      const mat = (v.mat as THREE.Material).clone();
      applyFogOfWar(mat, fogUniform, def.size, true);
      const im = new THREE.InstancedMesh(v.geo, mat, ms.length);
      ms.forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      root.add(im);
    });
  }

  // 2. Parse & instantiate embedded custom GLB models from the .slopmap binary payload
  const loader = new GLTFLoader();
  for (const [bvName, mats] of byGlb.entries()) {
    if (!mats.length) continue;
    try {
      const bytes = parsed.getBytes(bvName);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const gltf = await loader.parseAsync(ab, '');
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        const rawMat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        const mat = rawMat.clone();
        applyFogOfWar(mat, fogUniform, def.size, false);
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, j) => im.setMatrixAt(j, m));
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        root.add(im);
      });
    } catch (e) {
      console.warn(`[SlopmapLoader] Failed to parse embedded GLB ${bvName}:`, e);
    }
  }

  return root;
}

// Auto-prime at boot if the active map is a `.slopmap` level (zero overhead for all other maps)
const activeBootMap = (() => {
  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search).get('map');
      if (q && q in SLOPMAP_URLS) {
        sessionStorage.setItem('sc2_boot_map', q);
        sessionStorage.setItem(
          'sc2_pending_match',
          JSON.stringify({ mode: 'skirmish', mapId: q, playerFaction: 'terran', enemyFaction: 'zerg', difficulty: 'normal' })
        );
        try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
        return q;
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      const m = sessionStorage.getItem('sc2_boot_map');
      if (m && m in SLOPMAP_URLS) return m;
    }
    if (typeof process !== 'undefined' && process.argv) {
      const arg = process.argv[2];
      if (arg && arg in SLOPMAP_URLS) return arg;
    }
  } catch { /* ignore */ }
  return null;
})();

export async function ensureBootSlopmapReady(): Promise<void> {
  if (activeBootMap === 'sunken_city') {
    await ensureSlopmapLoaded('sunken_city', sunkenCityLevel);
  } else if (typeof window !== 'undefined') {
    setTimeout(() => void ensureSlopmapLoaded('sunken_city', sunkenCityLevel), 400);
  }
}

// Synchronous preload for Bun CLI tools (e.g. tools/level/check.ts)
if (typeof window === 'undefined' && activeBootMap === 'sunken_city') {
  void ensureSlopmapLoaded('sunken_city', sunkenCityLevel);
}
