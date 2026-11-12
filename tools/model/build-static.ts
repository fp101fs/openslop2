/**
 * Turns the high-poly, untextured sculpts on the Desktop into light game models (vertex-coloured, one draw call per part).
 *
 *   bun tools/model/build-static.ts <name|all> [--out public/models]
 *
 * Steps per model: load -> bake world transforms -> orient (rot + flip) so the model faces +Z with +Y up -> optional
 * triangle filter (e.g. remove the pedestal) -> scale to game size, feet on y=0, centred -> weld + quadric-simplify
 * (meshoptimizer) -> smooth normals -> bake vertex colours (palette + cheap ambient occlusion) -> optional rigid parts
 * (wings, legs...) with pivots -> write a small GLB (no textures). StaticModels.ts loads these at runtime.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier as S } from 'meshoptimizer';

type Mesh = { pos: Float32Array; idx: Uint32Array };
type StyleIn = { x: number; y: number; z: number; nx: number; ny: number; nz: number; h: number; name: string; ridge: number };
type Style = (p: StyleIn) => THREE.Color;
interface PartDef { name: string; test: (x: number, y: number, z: number) => boolean; pivot: [number, number, number]; tris?: number }
interface Cfg {
  src: string;
  /** Euler XYZ in degrees applied to the source (to get +Y up). */
  rot?: [number, number, number];
  /** Rotate 180 degrees about Y afterwards (source faced -Z). */
  flip?: boolean;
  /** Fine yaw in degrees after the flip. */
  yaw?: number;
  /** Keep a triangle? Evaluated on its centroid after orientation, in source units. */
  keep?: (x: number, y: number, z: number) => boolean;
  /** Target size in game units: height, or the larger of length/width footprint. */
  height?: number; footprint?: number;
  tris: number;
  /** Simplify each named source mesh separately (and colour it by name) instead of merging everything. */
  byName?: boolean;
  /** Group meshes by material colour (name = its hex) and keep that colour as the base. */
  byMaterial?: boolean;
  style: Style;
  parts?: PartDef[];
  /** Carapace areas that take the owner's colour (0..1 per vertex, written as a _TEAMMASK attribute for TeamColor's 'mask' mode). */
  team?: (p: StyleIn) => number;
  /** Lift the model so its lowest point sits at this height (flyers hover on their own). */
  lift?: number;
}

// ---------- palette ----------
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const noise = (x: number, y: number, z: number) => Math.sin(x * 23.1 + y * 17.3) * Math.sin(z * 19.7 + y * 11.1) * 0.5 + 0.5;

const flat = (c: number): Style => () => hex(c);
const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Drone: 1 on the spine, ribs (raised ridges), claws and the underside; 0 on the wing membranes. */
const droneBone = ({ x, z, ny, ridge }: Pick<StyleIn, 'x' | 'z' | 'ny' | 'ridge'>) =>
  Math.max(sstep(0.3, 0.7, ridge), 1 - sstep(0.1, 0.16, Math.abs(x)), sstep(0.3, 0.42, z), 1 - sstep(-0.35, -0.05, ny));

const CFGS: Record<string, Cfg> = {
  ghost: {
    // Nova / Ghost: Meshy "stealth gunner" (CC-BY, Ethan Cox). 450k source vertices -> ~18k tris, dark covert suit with a cyan visor.
    src: 'newsounds/stealth_gunner_with_night_vision_meshy_6.glb', height: 1.5, tris: 18000,
    style: ({ x, y, z, ny, h }) => {
      const base = mix(hex(0x1c2230), hex(0x3a4558), noise(x * 2, y * 2, z * 2) * 0.7);
      if (h > 0.82 && z > 0.05) return mix(base, hex(0x37e6ff), Math.min(1, (h - 0.82) * 9));
      return mix(base, hex(0x6c7a90), Math.max(0, ny) * 0.25);
    }
  } as any,
  hydralisk: {
    src: 'hydralisk_with_pedestal.glb', height: 3.1, tris: 16000, flip: true,
    keep: (_x, y) => y > -6.15,
    style: ({ x, y, z, ny, h }) => mix(mix(hex(0xb89060), hex(0x6b4528), h * 0.9), hex(0x3d2b5e), noise(x, y, z) * 0.35 + Math.max(0, ny) * 0.1)
  },
  firebat: {
    src: 'aegis_firebat_-_free_terran_heavy_armor.glb', height: 2.0, tris: 16000,
    style: ({ x, y, z, ny, h }) => { const n = noise(x * 1.3, y * 1.3, z * 1.3); const base = n > 0.55 ? hex(0x9aa4b8) : n > 0.3 ? hex(0x3f62b0) : hex(0x23283a); return mix(base, hex(0xe08a2a), Math.max(0, 0.16 - Math.abs(h - 0.5)) * (noise(z, x, y) > 0.72 ? 5 : 0)); }
  } as any,
  // (the Armory is now a hand-made PBR GLB: Desktop armory_pbr.glb -> slim-glb.py + shrink-textures.py -> public/models/armory.glb)
  // (refinery.glb is now an export of the code-built Refinery, see src/dev/exportModels.ts; the old gas-vent sculpt bake was unused)
  medic: {
    src: 'medibat_modified_cmc-405.glb', height: 1.8, tris: 18000, byMaterial: true,
    style: ({ name, ny, y, x, z }) => mix(hex(parseInt(name, 16)), hex(0x9aa8b8), 0.0).multiplyScalar(0.92 + 0.12 * noise(x * 2, y * 2, z * 2) + Math.max(0, ny) * 0.04)
  } as any,
  drone: {
    // Bronze segmented spine, ribs and claws; the wing membranes between the ribs take the team colour (dark maroon underneath).
    src: 'drone_starcraft_zerg_untextured.glb', length: 1.3, tris: 9000,
    style: ({ x, y, z, ny, ridge }) => {
      const n = noise(x * 3, y * 3, z * 3);
      const bronze = mix(mix(hex(0x3e2814), hex(0x9c7646), ridge * 0.7 + Math.max(0, ny) * 0.35), hex(0x24160c), n * 0.35);
      const hide = mix(hex(0x3a1626), hex(0x5a2848), Math.max(0, ny) * 0.6 + n * 0.3);
      return mix(hide, bronze, droneBone({ x, y, z, ny, ridge }));
    },
    team: p => (1 - droneBone(p)) * sstep(-0.15, 0.25, p.ny)
  } as any,
  roach: { src: 'roach_starcraft_zerg_untextured.glb', footprint: 2.3, tris: 12000, style: ({ x, y, z, ny }) => mix(mix(hex(0xc0803c), hex(0x4a3a22), Math.max(0, ny + 0.2) * 1.1), hex(0x2c2418), noise(x, y, z) * 0.35) } as any,
  ultralisk: { src: 'ultralisk_zerg_starcraft_untextured.glb', footprint: 4.2, tris: 20000, style: ({ x, y, z, ny }) => mix(mix(hex(0xb89a82), hex(0x4c5668), Math.max(0, ny + 0.1) * 1.2), hex(0x20242e), noise(x, y, z) * 0.35) } as any,
  overlord: { src: 'overlord_zerg_starcraft_uncolored.glb', yaw: -90, height: 3, tris: 14000, style: ({ x, y, z, ny, h }) => mix(mix(hex(0xc8a090), hex(0x6a4a6a), (1 - h) * 0.7), hex(0x4a3858), noise(x, y, z) * 0.3 + Math.max(0, ny) * 0.1) } as any,
  mutalisk: {
    src: 'starcraft_mutalisk_fanart.glb', rot: [-90, 0, 0], footprint: 2.6, tris: 20000,
    style: ({ x, y, z, ny, name }) => mix(mix(hex(0x5a4a86), hex(0x2c2246), Math.max(0, ny) * 0.5), hex(0x7a8a4a), noise(x, y, z) * 0.25),
    parts: [
      { name: 'wing_l', test: x => x > 0.3, pivot: [0.3, 0.55, 0] },
      { name: 'wing_r', test: x => x < -0.3, pivot: [-0.3, 0.55, 0] }
    ]
  } as any,
  scv: {
    src: 'scv_terran_starcraft.glb', yaw: -90, height: 2.2, tris: 14000, byName: true,
    style: ({ x, y, z, ny, name }) => {
      if (/cockpit/.test(name)) return mix(hex(0x6ab8d8), hex(0x203848), Math.max(0, -ny) * 0.5);
      if (/light|top_rig/.test(name)) return hex(0xffb030);
      if (/drill|grabber|elbow_pipe|pipes|gear/.test(name)) return mix(hex(0x8a8f98), hex(0x3a3d44), noise(x, y, z) * 0.5);
      if (/shoulder|torso|rig|booster/.test(name)) return mix(hex(0x3a6cc0), hex(0x1c3566), noise(x, y, z) * 0.4);
      return mix(hex(0x7a8290), hex(0x363a44), noise(x, y, z) * 0.5);
    }
  } as any
};

// ---------- geometry helpers ----------
function load(path: string, rot: [number, number, number] | undefined, flip: boolean | undefined, yaw: number | undefined) {
  return (async () => {
    await S.ready;
    const buf = await Bun.file(path).arrayBuffer();
    const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    const root = new THREE.Group();
    root.add(gltf.scene);
    root.rotation.set(...(rot ?? [0, 0, 0]).map(d => d * Math.PI / 180) as [number, number, number]);
    if (flip) root.rotation.y += Math.PI; // note: applied after rot (Euler XYZ), good enough for yaw-only flips
    if (yaw) root.rotation.y += yaw * Math.PI / 180;
    root.updateMatrixWorld(true);
    return root;
  })();
}
function collect(root: THREE.Object3D, byMat = false): { name: string; mesh: Mesh }[] {
  const out: { name: string; mesh: Mesh }[] = [];
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const g: THREE.BufferGeometry = o.geometry, p = g.attributes.position, v = new THREE.Vector3();
    const pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); }
    const idx = g.index ? Uint32Array.from(g.index.array as any) : Uint32Array.from({ length: p.count }, (_, i) => i);
    out.push({ name: byMat ? ((o.material?.color as THREE.Color)?.getHexString() ?? 'ffffff') : o.name.replace(/_\d+$/, ''), mesh: { pos, idx } });
  });
  return out;
}
function merge(ms: Mesh[]): Mesh {
  let pv = 0, iv = 0; for (const m of ms) { pv += m.pos.length; iv += m.idx.length; }
  const pos = new Float32Array(pv), idx = new Uint32Array(iv); let po = 0, io = 0;
  for (const m of ms) { pos.set(m.pos, po); for (let i = 0; i < m.idx.length; i++) idx[io + i] = m.idx[i]! + po / 3; po += m.pos.length; io += m.idx.length; }
  return { pos, idx };
}
function compact(m: Mesh): Mesh {
  const map = new Int32Array(m.pos.length / 3).fill(-1), P: number[] = [], I = new Uint32Array(m.idx.length);
  for (let i = 0; i < m.idx.length; i++) {
    const o = m.idx[i]!; let n = map[o]!;
    if (n < 0) { n = P.length / 3; map[o] = n; P.push(m.pos[o * 3]!, m.pos[o * 3 + 1]!, m.pos[o * 3 + 2]!); }
    I[i] = n;
  }
  return { pos: new Float32Array(P), idx: I };
}
function filterTris(m: Mesh, keep: (x: number, y: number, z: number) => boolean): Mesh {
  const I: number[] = [];
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]! * 3, b = m.idx[t + 1]! * 3, c = m.idx[t + 2]! * 3;
    if (keep((m.pos[a]! + m.pos[b]! + m.pos[c]!) / 3, (m.pos[a + 1]! + m.pos[b + 1]! + m.pos[c + 1]!) / 3, (m.pos[a + 2]! + m.pos[b + 2]!+ m.pos[c + 2]!) / 3)) I.push(m.idx[t]!, m.idx[t + 1]!, m.idx[t + 2]!);
  }
  return compact({ pos: m.pos, idx: new Uint32Array(I) });
}
function simplify(m: Mesh, tris: number): Mesh {
  const remap = S.generatePositionRemap(m.pos, 3);
  const idx = new Uint32Array(m.idx.length);
  for (let i = 0; i < idx.length; i++) idx[i] = remap[m.idx[i]!]!;
  let w = compact({ pos: m.pos, idx });
  if (w.idx.length / 3 > tris) {
    let [out] = S.simplify(w.idx, w.pos, 3, tris * 3, 1.0, ['Prune']);
    if (out.length / 3 > tris * 1.6) [out] = S.simplifySloppy(w.idx, w.pos, 3, null, tris * 3, 1.0);
    w = compact({ pos: w.pos, idx: out });
  }
  return w;
}
function normals(m: Mesh): Float32Array {
  const n = new Float32Array(m.pos.length), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < m.idx.length; t += 3) {
    const i = m.idx[t]!, j = m.idx[t + 1]!, k = m.idx[t + 2]!;
    a.fromArray(m.pos, i * 3); b.fromArray(m.pos, j * 3); c.fromArray(m.pos, k * 3);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    for (const v of [i, j, k]) { n[v * 3] += e1.x; n[v * 3 + 1] += e1.y; n[v * 3 + 2] += e1.z; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
/** How far each vertex stands out of its smoothed surroundings along its normal (ribs, spines: ~1; flat or creased: 0). */
function ridges(m: Mesh, n: Float32Array, iters = 6): Float32Array {
  const nv = m.pos.length / 3, nb: Set<number>[] = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = m.idx[t + k]!, b = m.idx[t + (k + 1) % 3]!; nb[a]!.add(b); nb[b]!.add(a); }
  let cur = Float32Array.from(m.pos);
  for (let it = 0; it < iters; it++) {
    const nx = new Float32Array(cur.length);
    for (let v = 0; v < nv; v++) {
      let sx = 0, sy = 0, sz = 0, c = 0;
      for (const u of nb[v]!) { sx += cur[u * 3]!; sy += cur[u * 3 + 1]!; sz += cur[u * 3 + 2]!; c++; }
      if (!c) { nx[v * 3] = cur[v * 3]!; nx[v * 3 + 1] = cur[v * 3 + 1]!; nx[v * 3 + 2] = cur[v * 3 + 2]!; continue; }
      nx[v * 3] = sx / c; nx[v * 3 + 1] = sy / c; nx[v * 3 + 2] = sz / c;
    }
    cur = nx;
  }
  const d = new Float32Array(nv); let mx = 1e-6;
  for (let v = 0; v < nv; v++) {
    d[v] = (m.pos[v * 3]! - cur[v * 3]!) * n[v * 3]! + (m.pos[v * 3 + 1]! - cur[v * 3 + 1]!) * n[v * 3 + 1]! + (m.pos[v * 3 + 2]! - cur[v * 3 + 2]!) * n[v * 3 + 2]!;
    if (d[v]! > 0) mx = Math.max(mx, d[v]!);
  }
  // normalise against a high percentile so a few spikes don't flatten everything
  const pos = [...d].filter(x => x > 0).sort((a, b) => a - b), ref = pos[Math.floor(pos.length * 0.9)] ?? mx;
  for (let v = 0; v < nv; v++) d[v] = Math.max(0, Math.min(1, d[v]! / ref));
  return d;
}
const bounds = (ms: Mesh[]) => {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const m of ms) for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.pos[i + k]!; if (v < mn[k]!) mn[k] = v; if (v > mx[k]!) mx[k] = v; }
  return { mn, mx };
};

import { writeGlb, type OutPart } from './glb';

// ---------- build ----------
async function build(name: string, outDir: string) {
  const cfg = CFGS[name]; if (!cfg) throw new Error('unknown model ' + name);
  const root = await load(`${process.env.HOME}/Desktop/${cfg.src}`, cfg.rot, cfg.flip, cfg.yaw);
  let groups = collect(root, cfg.byMaterial);
  if (!cfg.byName && !cfg.byMaterial) groups = [{ name: 'body', mesh: merge(groups.map(g => g.mesh)) }];
  else { const by = new Map<string, Mesh[]>(); for (const g of groups) (by.get(g.name) ?? by.set(g.name, []).get(g.name)!).push(g.mesh); groups = [...by].map(([n, ms]) => ({ name: n, mesh: merge(ms) })); }
  if (cfg.keep) groups = groups.map(g => ({ name: g.name, mesh: filterTris(g.mesh, cfg.keep!) })).filter(g => g.mesh.idx.length);

  // scale / centre / ground
  const b = bounds(groups.map(g => g.mesh));
  const sz = [b.mx[0]! - b.mn[0]!, b.mx[1]! - b.mn[1]!, b.mx[2]! - b.mn[2]!];
  const sc = cfg.height ? cfg.height / sz[1]! : cfg.footprint ? cfg.footprint / Math.max(sz[0]!, sz[2]!) : (cfg as any).length / sz[2]!;
  const cx = (b.mx[0]! + b.mn[0]!) / 2, cz = (b.mx[2]! + b.mn[2]!) / 2, gy = b.mn[1]!;
  for (const g of groups) for (let i = 0; i < g.mesh.pos.length; i += 3) {
    g.mesh.pos[i] = (g.mesh.pos[i]! - cx) * sc; g.mesh.pos[i + 1] = (g.mesh.pos[i + 1]! - gy) * sc + (cfg.lift ?? 0); g.mesh.pos[i + 2] = (g.mesh.pos[i + 2]! - cz) * sc;
  }
  const H = sz[1]! * sc;

  // distribute the triangle budget over groups (by sqrt of source triangle count so tiny parts keep detail)
  const weights = groups.map(g => Math.sqrt(g.mesh.idx.length / 3));
  const wsum = weights.reduce((a, c) => a + c, 0);
  // rigid parts: split every group by predicate (first match wins; the rest stays 'body')
  const defs: PartDef[] = [...(cfg.parts ?? []), { name: 'body', test: () => true, pivot: [0, 0, 0] }];
  const bucket = new Map<string, { mesh: Mesh; nameTag: string }[]>();
  groups.forEach((g, gi) => {
    const budget = Math.max(12, Math.round(cfg.tris * weights[gi]! / wsum));
    const simp = groups.length === 1 ? simplify(g.mesh, cfg.tris) : simplify(g.mesh, budget);
    // split into parts by centroid
    const per = new Map<string, number[]>();
    for (let t = 0; t < simp.idx.length; t += 3) {
      const a = simp.idx[t]! * 3, bb = simp.idx[t + 1]! * 3, c = simp.idx[t + 2]! * 3;
      const x = (simp.pos[a]! + simp.pos[bb]! + simp.pos[c]!) / 3, y = (simp.pos[a + 1]! + simp.pos[bb + 1]! + simp.pos[c + 1]!) / 3, z = (simp.pos[a + 2]! + simp.pos[bb + 2]! + simp.pos[c + 2]!) / 3;
      const d = defs.find(p => p.test(x, y, z))!;
      (per.get(d.name) ?? per.set(d.name, []).get(d.name)!).push(simp.idx[t]!, simp.idx[t + 1]!, simp.idx[t + 2]!);
    }
    for (const [pn, ids] of per) (bucket.get(pn) ?? bucket.set(pn, []).get(pn)!).push({ mesh: compact({ pos: simp.pos, idx: new Uint32Array(ids) }), nameTag: g.name });
  });

  const out: OutPart[] = []; let total = 0;
  for (const d of defs) {
    const list = bucket.get(d.name); if (!list) continue;
    const P: number[] = [], N: number[] = [], C: number[] = [], I: number[] = [], U: number[] = [], TM: number[] = [];
    for (const { mesh: m, nameTag } of list) {
      const n = normals(m), base = P.length / 3, col = new THREE.Color(), rd = ridges(m, n);
      for (let v = 0; v < m.pos.length / 3; v++) {
        const x = m.pos[v * 3]!, y = m.pos[v * 3 + 1]!, z = m.pos[v * 3 + 2]!, nx = n[v * 3]!, ny = n[v * 3 + 1]!, nz = n[v * 3 + 2]!;
        const h = Math.max(0, Math.min(1, y / H));
        const ao = (0.62 + 0.38 * h) * (0.8 + 0.2 * (ny * 0.5 + 0.5));
        const sin = { x, y, z, nx, ny, nz, h, name: nameTag, ridge: rd[v]! };
        col.copy(cfg.style(sin)).multiplyScalar(ao);
        if (cfg.team) TM.push(Math.max(0, Math.min(1, cfg.team(sin))));
        C.push(col.r, col.g, col.b);
        P.push(x - d.pivot[0], y - d.pivot[1], z - d.pivot[2]); N.push(nx, ny, nz);
        { const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz); if (ay >= ax && ay >= az) U.push(x, z); else if (ax >= az) U.push(z, y); else U.push(x, y); } // box-projected UV for the detail textures
      }
      for (const i of m.idx) I.push(i + base);
    }
    out.push({ name: d.name, pivot: d.pivot, pos: new Float32Array(P), nrm: new Float32Array(N), col: new Float32Array(C), uv: new Float32Array(U), ...(cfg.team ? { team: new Float32Array(TM) } : {}), idx: new Uint32Array(I) });
    total += I.length / 3;
    console.log(' ', d.name.padEnd(10), 'tris', I.length / 3);
  }
  const glb = writeGlb(out);
  await Bun.write(`${outDir}/${name}.glb`, glb);
  console.log(`${name}: ${total} tris, ${(glb.length / 1024).toFixed(0)} KB, size ${sz.map(v => +(v * sc).toFixed(2)).join('x')}`);
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1]! : 'public/models';
const names = args[0] === 'all' || !args[0] ? Object.keys(CFGS) : args.filter(a => a !== outDir);
for (const n of names) await build(n, outDir);
