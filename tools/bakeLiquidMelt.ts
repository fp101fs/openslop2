// Bakes the T1000 liquid-metal flipbook (melt order) into a small GLB of decimated frames.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from 'meshoptimizer';
const FRAMES = 24, TARGET_TRIS = 900;
// usage: bun tools/bakeLiquidMelt.ts <t1000_liquid_metal.glb> public/models/fx/liquid_melt.glb
const buf = await Bun.file(process.argv[2]!).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
const root = gltf.scene;  // frame meshes share one local space; use their raw vertices
const meshes: THREE.Mesh[] = []; root.traverse((o: any) => o.isMesh && meshes.push(o));
await MeshoptSimplifier.ready;
const geos: { pos: Float32Array; nrm: Float32Array; idx: Uint16Array }[] = [];
let ref: THREE.Box3 | null = null;
for (let k = 0; k < FRAMES; k++) {
  const n = 1 + Math.round(k * 71 / (FRAMES - 1)); // 1..72 = melt order, before the puddle splits into droplets
  const name = n === 1 ? 'Subdivision_Surface_Metall_0' : `Subdivision_Surface_${n}_Metall_0`;
  const m = meshes.find(x => x.name === name)!;
  const g = m.geometry.clone();
  const p = g.attributes.position.array as Float32Array; const ix = new Uint32Array(g.index!.array);
  const [out] = MeshoptSimplifier.simplify(ix, p, 3, TARGET_TRIS * 3, 0.05, ['LockBorder']);
  // keep only the largest connected blob (the sim splits into several droplets; the game spawns its own copies)
  const key = (v: number) => `${p[v*3].toFixed(3)},${p[v*3+1].toFixed(3)},${p[v*3+2].toFixed(3)}`;
  const weld = new Map<string, number>(); const par: number[] = [];
  const rootOf = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const wid = (v: number) => { const k = key(v); let id = weld.get(k); if (id === undefined) { id = par.length; par.push(id); weld.set(k, id); } return id; };
  for (let t = 0; t < out.length; t += 3) { const a = rootOf(wid(out[t])), b = rootOf(wid(out[t+1])), c = rootOf(wid(out[t+2])); par[b] = a; par[rootOf(c)] = a; }
  const cnt = new Map<number, number>(); for (let t = 0; t < out.length; t += 3) { const r = rootOf(wid(out[t])); cnt.set(r, (cnt.get(r) ?? 0) + 1); }
  let best = -1, bestN = 0; for (const [r, n] of cnt) if (n > bestN) { best = r; bestN = n; }
  const keep: number[] = []; for (let t = 0; t < out.length; t += 3) if (rootOf(wid(out[t])) === best) keep.push(out[t], out[t+1], out[t+2]);
  console.log('  components', cnt.size, [...cnt.values()].sort((x, y) => y - x).join('/'));
  const used = new Map<number, number>(); const np: number[] = []; const ni: number[] = [];
  for (const v of keep) { if (!used.has(v)) { used.set(v, used.size); np.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]); } ni.push(used.get(v)!); }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3)); ng.setIndex(ni);
  if (!ref) { ng.computeBoundingBox(); ref = ng.boundingBox!.clone(); }
  const c = ref.getCenter(new THREE.Vector3()); const sc = 2 / Math.max(ref.max.x - ref.min.x, ref.max.z - ref.min.z);
  ng.translate(-c.x, -ref.min.y, -c.z); ng.scale(sc, sc, sc); ng.computeVertexNormals();
  geos.push({ pos: ng.attributes.position.array as Float32Array, nrm: ng.attributes.normal.array as Float32Array, idx: new Uint16Array(ni) });
  ng.computeBoundingBox(); console.log(k, name, ni.length / 3, 'tris', ng.boundingBox!.min.toArray().map(x => x.toFixed(2)) + '', ng.boundingBox!.max.toArray().map(x => x.toFixed(2)) + '');
}
// minimal GLB writer: one node+mesh per frame, named f00..f23
const chunks: Uint8Array[] = []; let off = 0; const bufferViews: any[] = [], accessors: any[] = [], gm: any[] = [], nodes: any[] = [];
const push = (a: ArrayBufferView, target: number) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); const pad = (4 - (u.byteLength % 4)) % 4; bufferViews.push({ buffer: 0, byteOffset: off, byteLength: u.byteLength, target }); chunks.push(u, new Uint8Array(pad)); off += u.byteLength + pad; return bufferViews.length - 1; };
geos.forEach((g, i) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < g.pos.length; v += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], g.pos[v + a]); mx[a] = Math.max(mx[a], g.pos[v + a]); }
  accessors.push({ bufferView: push(g.pos, 34962), componentType: 5126, count: g.pos.length / 3, type: 'VEC3', min: mn, max: mx });
  accessors.push({ bufferView: push(g.nrm, 34962), componentType: 5126, count: g.nrm.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: push(g.idx, 34963), componentType: 5123, count: g.idx.length, type: 'SCALAR' });
  gm.push({ name: `f${String(i).padStart(2, '0')}`, primitives: [{ attributes: { POSITION: i * 3, NORMAL: i * 3 + 1 }, indices: i * 3 + 2, material: 0 }] });
  nodes.push({ name: `f${String(i).padStart(2, '0')}`, mesh: i });
});
const json = { asset: { version: '2.0', generator: 'sc2-clone t1000 bake' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gm, accessors, bufferViews, buffers: [{ byteLength: off }], materials: [{ name: 'liquid', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1], metallicFactor: 1, roughnessFactor: 0.2 } }] };
let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - js.length % 4) % 4; js = new Uint8Array([...js, ...new Array(jp).fill(32)]);
const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
const total = 12 + 8 + js.length + 8 + bin.length; const out = new Uint8Array(total); const dv = new DataView(out.buffer);
dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(js, 20);
dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); out.set(bin, 28 + js.length);
await Bun.write(process.argv[3]!, out); console.log('wrote', process.argv[3], total, 'bytes');
