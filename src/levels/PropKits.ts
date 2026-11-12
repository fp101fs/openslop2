import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Theme } from './Themes';

/**
 * Prop kits: named sets of instanceable meshes any level can reference from its `props` rules.
 * Procedural kits (boulder, spire, crystal...) follow the level theme; GLB kits come straight from the source scenes
 * (e.g. alien_planet.glb's rocks / crystals / vines) and keep their own materials.
 */
export interface PropVariant { geo: THREE.BufferGeometry; mat: THREE.Material; height: number }
export type KitBuilder = (theme: Theme) => PropVariant[] | Promise<PropVariant[]>;

const kits = new Map<string, KitBuilder>();
export const registerKit = (id: string, b: KitBuilder) => { kits.set(id, b); };
export const hasKit = (id: string) => kits.has(id);
/** Every registered prop kit id (import CampaignProps first for the campaign set pieces). */
export const kitIds = () => [...kits.keys()];
export async function buildKit(id: string, theme: Theme): Promise<PropVariant[]> {
  const b = kits.get(id);
  return b ? await b(theme) : [];
}

const baseUrl = () => ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';

/** Move a geometry so it stands on y=0, centred on x/z. */
function grounded(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingBox();
  return g;
}

function rand(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function lumpy(g: THREE.BufferGeometry, seed: number, amp: number) {
  const r = rand(seed);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) { d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(amp); seen.set(k, d); }
    p.setXYZ(i, p.getX(i) + d.x, p.getY(i) + d.y, p.getZ(i) + d.z);
  }
  g.computeVertexNormals();
  return g;
}

const stdMat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });

// ---------- generic procedural kits (theme-coloured) ----------
registerKit('boulder', (th) => [0, 1, 2, 3].map(i => {
  const g = lumpy(new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), 11 + i * 7, 0.38);
  g.scale(1.1 + i * 0.12, 0.75 + (i % 2) * 0.25, 1);
  grounded(g);
  return { geo: g, mat: stdMat(th.cliff[1], { roughness: 0.95 }), height: 1.6 };
}));

registerKit('spire', (th) => [0, 1, 2].map(i => {
  const parts: THREE.BufferGeometry[] = [];
  const r = rand(30 + i);
  for (let k = 0; k < 4 + i; k++) {
    const h = 2.6 + r() * 3.4, w = 0.45 + r() * 0.5;
    const c = new THREE.ConeGeometry(w, h, 5).toNonIndexed();
    c.rotateZ((r() - 0.5) * 0.35); c.rotateX((r() - 0.5) * 0.35);
    c.translate((r() - 0.5) * 1.6, h / 2, (r() - 0.5) * 1.6);
    parts.push(c);
  }
  const g = grounded(mergeGeometries(parts)!);
  return { geo: g, mat: stdMat(th.cliff[1], { roughness: 0.9 }), height: 5 };
}));

registerKit('crystal', (th) => [0, 1, 2].map(i => {
  const parts: THREE.BufferGeometry[] = [];
  const r = rand(70 + i);
  for (let k = 0; k < 3 + i * 2; k++) {
    const h = 1.2 + r() * 2.4, w = 0.22 + r() * 0.22;
    const c = new THREE.OctahedronGeometry(1, 0).toNonIndexed();
    c.scale(w, h, w);
    c.rotateZ((r() - 0.5) * 0.7); c.rotateY(r() * 6);
    c.translate((r() - 0.5) * 1.3, h * 0.8, (r() - 0.5) * 1.3);
    parts.push(c);
  }
  const g = grounded(mergeGeometries(parts)!);
  const col = new THREE.Color(th.liquid);
  return { geo: g, mat: new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, flatShading: true }), height: 3 };
}));

registerKit('pebbles', (th) => [0, 1, 2].map(i => {
  const g = lumpy(new THREE.IcosahedronGeometry(0.28 + i * 0.06, 0).toNonIndexed(), 5 + i, 0.12);
  g.scale(1.3, 0.7, 1); grounded(g);
  return { geo: g, mat: stdMat(th.cliff[1]), height: 0.3 };
}));

// ---------- GLB kits: split a source scene's meshes into roles by material name ----------
interface GlbKitSpec { url: string; roles: Record<string, string[]>; skipMaterials?: string[]; maxPerRole?: number; minVerts?: number }
const glbCache = new Map<string, Promise<Map<string, PropVariant[]>>>();

function loadGlbRoles(spec: GlbKitSpec): Promise<Map<string, PropVariant[]>> {
  let p = glbCache.get(spec.url);
  if (p) return p;
  p = new GLTFLoader().loadAsync(baseUrl() + spec.url).then(gltf => {
    const roles = new Map<string, PropVariant[]>();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!(m as any).isMesh) return;
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      if (spec.skipMaterials?.includes(mat.name)) return;
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      g.deleteAttribute('uv');
      grounded(g);
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      const cat = Object.keys(spec.roles).find(r => spec.roles[r]!.includes(mat.name)) ?? 'misc';
      const arr = roles.get(cat) ?? []; roles.set(cat, arr);
      if (arr.length < (spec.maxPerRole ?? 24)) arr.push({ geo: g, mat, height: size.y });
    });
    return roles;
  });
  glbCache.set(spec.url, p);
  return p;
}

/** Register `<prefix>_<role>` kits for every role in the GLB. */
export function registerGlbKits(prefix: string, spec: GlbKitSpec) {
  for (const role of Object.keys(spec.roles)) {
    registerKit(`${prefix}_${role}`, async () => (await loadGlbRoles(spec)).get(role) ?? []);
  }
}

registerGlbKits('alien', {
  url: 'models/props/alien_planet.glb',
  roles: { rock: ['Rock'], crystal: ['Crystal'], pebble: ['Pebble'], vine: ['Vine'], moss: ['Moss'] },
  skipMaterials: ['Dirt']
});

// ---------- vertex-coloured procedural kits (theme.foliage / cliff palettes) ----------
export function compose(parts: { geo: THREE.BufferGeometry; color: number }[]): THREE.BufferGeometry {
  const gs = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  return grounded(mergeGeometries(gs)!);
}
export const vcMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
const shade = (hex: number, k: number) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

registerKit('pine', (th) => [0, 1, 2].map(i => {
  const [trunk, lo, hi] = th.foliage;
  const parts = [{ geo: new THREE.CylinderGeometry(0.16, 0.26, 1.5 + i * 0.3, 6).translate(0, 0.75 + i * 0.15, 0), color: trunk }];
  for (let k = 0; k < 3; k++) {
    const r = (1.45 - k * 0.38) * (0.9 + i * 0.1), h = 1.9 - k * 0.2;
    parts.push({ geo: new THREE.ConeGeometry(r, h, 7).translate(0, 1.6 + i * 0.2 + k * 1.05, 0), color: k % 2 ? hi : lo });
  }
  return { geo: compose(parts), mat: vcMat(), height: 5 };
}));

registerKit('bush', (th) => [0, 1, 2].map(i => {
  const [, lo, hi] = th.foliage;
  const parts: { geo: THREE.BufferGeometry; color: number }[] = [];
  const r = rand(90 + i);
  for (let k = 0; k < 3; k++) {
    const g = lumpy(new THREE.IcosahedronGeometry(0.5 + r() * 0.3, 1).toNonIndexed(), 40 + i * 3 + k, 0.16);
    g.translate((r() - 0.5) * 0.9, 0.35 + r() * 0.2, (r() - 0.5) * 0.9);
    parts.push({ geo: g, color: k % 2 ? hi : lo });
  }
  return { geo: compose(parts), mat: vcMat(), height: 1 };
}));

registerKit('deadtree', (th) => [0, 1].map(i => {
  const trunk = shade(th.foliage[0], 1.3);
  const parts: { geo: THREE.BufferGeometry; color: number }[] = [{ geo: new THREE.CylinderGeometry(0.12, 0.25, 2.6, 5).translate(0, 1.3, 0), color: trunk }];
  const r = rand(120 + i);
  for (let k = 0; k < 4; k++) {
    const g = new THREE.CylinderGeometry(0.04, 0.1, 1.2, 4);
    g.rotateZ(0.9 * (k % 2 ? 1 : -1)); g.rotateY(r() * 6); g.translate(0, 1.5 + k * 0.3, 0);
    parts.push({ geo: g, color: trunk });
  }
  return { geo: compose(parts), mat: vcMat(), height: 3 };
}));

registerKit('pillar', (th) => [0, 1, 2].map(i => {
  const [, mid, hi] = th.cliff;
  const h = 2.2 + i * 1.1;
  const parts = [
    { geo: new THREE.BoxGeometry(1.0, h, 1.0).translate(0, h / 2, 0), color: mid },
    { geo: new THREE.BoxGeometry(1.3, 0.3, 1.3).translate(0, 0.15, 0), color: hi },
    { geo: new THREE.BoxGeometry(1.3, 0.3, 1.3).translate(0, h + 0.1 - (i === 1 ? 0.6 : 0), 0), color: hi }
  ];
  return { geo: compose(parts), mat: vcMat(), height: h };
}));

registerKit('reeds', (th) => [0, 1].map(i => {
  const [, lo, hi] = th.foliage;
  const parts: { geo: THREE.BufferGeometry; color: number }[] = [];
  const r = rand(150 + i);
  for (let k = 0; k < 9; k++) {
    const h = 0.9 + r() * 0.9;
    const g = new THREE.ConeGeometry(0.05, h, 3); g.rotateZ((r() - 0.5) * 0.3); g.translate((r() - 0.5) * 0.9, h / 2, (r() - 0.5) * 0.9);
    parts.push({ geo: g, color: k % 2 ? hi : lo });
  }
  return { geo: compose(parts), mat: vcMat(), height: 1.5 };
}));

registerKit('mesa_rock', (th) => [0, 1, 2].map(i => {
  // layered sandstone stack: wide flat slabs getting smaller, banded with the cliff palette
  const parts: { geo: THREE.BufferGeometry; color: number }[] = [];
  let y = 0;
  for (let k = 0; k < 4 + i; k++) {
    const h = 0.55 + (k % 2) * 0.35, w = 2.2 - k * 0.28 + (i % 2) * 0.3;
    const g = new THREE.CylinderGeometry(w * 0.9, w, h, 7);
    g.rotateY(k * 0.7); g.translate((k % 2 ? 0.1 : -0.1), y + h / 2, 0); y += h;
    parts.push({ geo: g, color: th.cliff[(k % 3) as 0 | 1 | 2] });
  }
  return { geo: compose(parts), mat: vcMat(), height: y };
}));
