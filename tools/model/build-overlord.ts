// Recolours the (decimated, untextured) Overlord sculpt with vertex colours that follow the SC2 look:
// glossy purple bio-sacs with magenta glow patches, brown-purple ridges / limbs, dark steel spikes.
//   bun tools/model/build-overlord.ts in.glb out.glb [swarm]   (swarm = brown chitin / amber palette for the Swarm Host)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { writeGlb, type OutPart } from './glb';
const [inp, outp, mode] = process.argv.slice(2) as [string, string, string | undefined];
const SWARM = mode === 'swarm';
const buf = await Bun.file(inp).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
gltf.scene.updateMatrixWorld(true);
const geoms: { pos: Float32Array; idx: number[] }[] = [];
gltf.scene.traverse((o: any) => {
  if (!o.isMesh) return;
  const g = o.geometry as THREE.BufferGeometry; const p = g.attributes.position!;
  const pos = new Float32Array(p.count * 3); const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); }
  const idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: p.count }, (_, i) => i);
  geoms.push({ pos, idx });
});
// weld by position and find connected components over all meshes
const key = (x: number, y: number, z: number) => `${Math.round(x * 400)},${Math.round(y * 400)},${Math.round(z * 400)}`;
const wid = new Map<string, number>(); const parent: number[] = [];
const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]!]!; a = parent[a]!; } return a; };
const vmap = geoms.map(g => { const m = new Int32Array(g.pos.length / 3); for (let i = 0; i < m.length; i++) { const k = key(g.pos[i * 3]!, g.pos[i * 3 + 1]!, g.pos[i * 3 + 2]!); let id = wid.get(k); if (id === undefined) { id = parent.length; wid.set(k, id); parent.push(id); } m[i] = id; } return m; });
geoms.forEach((g, gi) => { for (let t = 0; t < g.idx.length; t += 3) { const a = find(vmap[gi]![g.idx[t]!]!), b = find(vmap[gi]![g.idx[t + 1]!]!), c = find(vmap[gi]![g.idx[t + 2]!]!); parent[b] = a; parent[find(c)] = a; } });
const comp = new Map<number, { n: number; mn: THREE.Vector3; mx: THREE.Vector3 }>();
geoms.forEach((g, gi) => { const m = vmap[gi]!; for (let i = 0; i < m.length; i++) { const r = find(m[i]!); let c = comp.get(r); if (!c) { c = { n: 0, mn: new THREE.Vector3(1e9, 1e9, 1e9), mx: new THREE.Vector3(-1e9, -1e9, -1e9) }; comp.set(r, c); } c.n++; const p = new THREE.Vector3(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); c.mn.min(p); c.mx.max(p); } });
const list = [...comp.entries()].sort((a, b) => b[1].n - a[1].n);
console.log('components', list.length); list.slice(0, 12).forEach(([r, c]) => console.log(r, c.n, c.mn.toArray().map(n => +n.toFixed(2)), c.mx.toArray().map(n => +n.toFixed(2))));
const bigN = list[0]![1].n;
// smooth value noise
const h = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x: number, y: number, z: number) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); const L = (a: number, b: number, t: number) => a + (b - a) * t; let r = 0; for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r += h(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w); return r; };
const fbm = (x: number, y: number, z: number) => noise(x, y, z) * 0.55 + noise(x * 2.3, y * 2.3, z * 2.3) * 0.3 + noise(x * 5.1, y * 5.1, z * 5.1) * 0.15;
const lerp3 = (a: number[], b: number[], t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const hex = (n: number) => [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(c => Math.pow(c, 2.2));
const SACS_A = hex(SWARM ? 0x4a3524 : 0x3a1a63), SACS_B = hex(SWARM ? 0x9a7040 : 0x7b3fd0), GLOW = hex(SWARM ? 0xe8b030 : 0xd04cff), RIDGE = hex(SWARM ? 0x2a2018 : 0x3b2438), RIDGE_B = hex(SWARM ? 0x4a3a2c : 0x5a3a52), STEEL = hex(0x23232a), STEEL_B = hex(0x6a6a74);
const parts: OutPart[] = [];
geoms.forEach((g, gi) => {
  const n = g.pos.length / 3; const col = new Float32Array(n * 3); const nrm = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3)); geo.setIndex(g.idx); geo.computeVertexNormals(); nrm.set(geo.attributes.normal!.array as Float32Array);
  for (let i = 0; i < n; i++) {
    const x = g.pos[i * 3]!, y = g.pos[i * 3 + 1]!, z = g.pos[i * 3 + 2]!; const c = comp.get(find(vmap[gi]![i]!))!;
    const small = c.n < bigN * 0.05; // spikes / claws are separate small pieces
    const ny = nrm[i * 3 + 1]!;
    let rgb: number[];
    if (small) rgb = lerp3(STEEL, STEEL_B, Math.min(1, Math.max(0, fbm(x * 3, y * 3, z * 3) * 1.6 - 0.3)));
    else {
      // body: upper / outward surfaces are the purple sacs, the underside and the limbs are brown-purple ridges
      const sac = Math.min(1, Math.max(0, (y + 2.2) / 3.2 * 0.7 + ny * 0.5 + 0.1 + (fbm(x * 1.2, y * 1.2, z * 1.2) - 0.5) * 0.8));
      const ridge = lerp3(RIDGE, RIDGE_B, fbm(x * 4, y * 4, z * 4));
      rgb = lerp3(ridge, lerp3(SACS_A, SACS_B, fbm(x * 2, y * 2, z * 2)), Math.min(1, sac * 1.4));
      const gl = Math.max(0, (fbm(x * 3.2 + 9, y * 3.2, z * 3.2) - 0.62) * 5) * sac; // magenta glow patches in the sacs
      if (gl > 0) rgb = lerp3(rgb, GLOW, Math.min(1, gl));
    }
    col.set(rgb, i * 3);
  }
  parts.push({ name: `ov_${gi}`, pivot: [0, 0, 0], pos: g.pos, nrm, col, idx: Uint32Array.from(g.idx) });
});
await Bun.write(outp, writeGlb(parts));
console.log('wrote', outp, parts.length, 'parts');
