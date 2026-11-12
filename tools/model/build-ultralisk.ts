/**
 * Builds the in-game Ultralisk from the high-poly untextured source (woodsquid, CC-BY 4.0 - see README credits).
 *
 *   bun tools/model/build-ultralisk.ts ~/Desktop/ultralisk_zerg_starcraft_untextured.glb
 *
 * The source has no UVs, no skeleton and ~440k triangles, so: load -> bake world transforms -> face +Z (the game's forward axis),
 * scale to game size, feet on y=0 -> weld + quadric-simplify (meshoptimizer) -> smooth normals -> bake vertex colours from the
 * palette of the previous textured model (dark grey carapace, dark brown plates, red-brown flesh / blades) with cheap cavity shading
 * -> write public/models/ultralisk.glb (positions + normals + colours, one static mesh). Animation is procedural (IdleAnimator).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier as S } from 'meshoptimizer';

const src = process.argv[2];
if (!src) { console.error('usage: bun tools/model/build-ultralisk.ts <ultralisk.glb>'); process.exit(1); }
const TRIS = Number(process.env.TRIS ?? 22000);
const LENGTH = 3.4;
await S.ready;
const buf = await Bun.file(src.replace(/^~/, process.env.HOME!)).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
gltf.scene.updateMatrixWorld(true);

// ---- collect all triangles with world transforms baked in ----
const P: number[] = [], I: number[] = [];
gltf.scene.traverse((o: any) => {
  if (!o.isMesh) return;
  const g: THREE.BufferGeometry = o.geometry, p = g.attributes.position, base = P.length / 3, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); }
  if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base); else for (let i = 0; i < p.count; i++) I.push(i + base);
});
let pos = new Float32Array(P);
let idx = new Uint32Array(I);

// ---- source space -> game space (head towards +z), centred, feet on y=0 ----
{
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i + k]!); max[k] = Math.max(max[k]!, pos[i + k]!); }
  const lenZ = max[2]! - min[2]!, widX = max[0]! - min[0]!;
  const s = LENGTH / Math.max(lenZ, widX), cx = (min[0]! + max[0]!) / 2, cz = (min[2]! + max[2]!) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    const x = (pos[i]! - cx) * s, y = (pos[i + 1]! - min[1]!) * s, z = (pos[i + 2]! - cz) * s;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z; // the source already faces +z, which is the game's forward axis
  }
}

// ---- weld + simplify ----
const remap = S.generatePositionRemap(pos, 3);
const welded = new Uint32Array(idx.length);
for (let i = 0; i < idx.length; i++) welded[i] = remap[idx[i]!]!;
function compact(p: Float32Array, ix: Uint32Array) {
  const map = new Map<number, number>(), out: number[] = [], I2 = new Uint32Array(ix.length);
  for (let i = 0; i < ix.length; i++) { const o = ix[i]!; let n = map.get(o); if (n === undefined) { n = out.length / 3; map.set(o, n); out.push(p[o * 3]!, p[o * 3 + 1]!, p[o * 3 + 2]!); } I2[i] = n; }
  return { pos: new Float32Array(out), idx: I2 };
}
let m = compact(pos, welded);
console.log('welded', m.pos.length / 3, 'verts', m.idx.length / 3, 'tris');
{
  let [out] = S.simplify(m.idx, m.pos, 3, TRIS * 3, 1.0, ['Prune']);
  if (out.length / 3 > TRIS * 1.5) [out] = S.simplifySloppy(m.idx, m.pos, 3, null, TRIS * 3, 1.0);
  m = compact(m.pos, out);
}
console.log('simplified', m.pos.length / 3, 'verts', m.idx.length / 3, 'tris');

// ---- normals ----
const nrm = new Float32Array(m.pos.length);
{
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < m.idx.length; t += 3) {
    const i = m.idx[t]!, j = m.idx[t + 1]!, k = m.idx[t + 2]!;
    a.fromArray(m.pos, i * 3); b.fromArray(m.pos, j * 3); c.fromArray(m.pos, k * 3);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    for (const v of [i, j, k]) { nrm[v * 3] += e1.x; nrm[v * 3 + 1] += e1.y; nrm[v * 3 + 2] += e1.z; }
  }
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
}

// ---- vertex colours: palette sampled from the previous textured model ----
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const PAL = { body: hex(0x4a4e55), bodyDark: hex(0x2c2f34), plate: hex(0x4b2a18), plateDark: hex(0x2a140c), flesh: hex(0x64423c), blade: hex(0x6e5448), bladeTip: hex(0x93806a), glow: hex(0xc070c0) };
const noise = (x: number, y: number, z: number) => Math.sin(x * 9.1 + y * 7.3) * Math.sin(z * 8.7 + y * 5.1) * 0.5 + 0.5;
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
let maxY = 0, maxZ = 0;
for (let i = 0; i < m.pos.length; i += 3) { maxY = Math.max(maxY, m.pos[i + 1]!); maxZ = Math.max(maxZ, Math.abs(m.pos[i + 2]!)); }
const col = new Float32Array(m.pos.length);
for (let i = 0; i < m.pos.length; i += 3) {
  const x = m.pos[i]!, y = m.pos[i + 1]!, z = m.pos[i + 2]!, ny = nrm[i + 1]!;
  const h = y / maxY, side = Math.abs(z) / maxZ, nz = noise(x, y, z);
  let c = mix(PAL.body, PAL.bodyDark, nz * 0.7);
  if (ny > 0.15 && h > 0.45) c = mix(c, mix(PAL.plate, PAL.plateDark, nz), Math.min(1, (ny - 0.1) * 1.6) * 0.85); // back plates: dark brown
  if (ny < -0.15) c = mix(c, PAL.flesh, Math.min(1, -ny * 1.4) * 0.8);                                                  // undersides: red-brown flesh
  if (side > 0.55 && z > -0.1) c = mix(c, mix(PAL.blade, PAL.bladeTip, (side - 0.55) * 2 + (h - 0.5) * 0.4), Math.min(1, (side - 0.5) * 3)); // flared blades
  if (nz > 0.97 && ny > 0.3) c = mix(c, PAL.glow, 0.2); // a few purple glow spots, like the old texture's emissive map
  const cav = 0.78 + 0.32 * (ny * 0.5 + 0.5); // cheap cavity shading
  col[i] = c.r * cav * 1.3; col[i + 1] = c.g * cav * 1.3; col[i + 2] = c.b * cav * 1.3;
}

// ---- write GLB ----
const nV = m.pos.length / 3, nI = m.idx.length;
const idx16 = nV < 65536;
const posB = Buffer.from(m.pos.buffer), nrmB = Buffer.from(nrm.buffer), colB = Buffer.from(col.buffer);
const idxB = idx16 ? Buffer.from(new Uint16Array(m.idx).buffer) : Buffer.from(m.idx.buffer);
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const parts = [pad(posB), pad(nrmB), pad(colB), pad(idxB)];
const offs: number[] = []; let o = 0; for (const p of parts) { offs.push(o); o += p.length; }
const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, m.pos[i + k]!); max[k] = Math.max(max[k]!, m.pos[i + k]!); }
const json = {
  asset: { version: '2.0', generator: 'sc2-clone build-ultralisk', extras: { author: 'woodsquid (https://sketchfab.com/woodsquid)', license: 'CC-BY-4.0', source: 'https://sketchfab.com/3d-models/ultralisk-zerg-starcraft-untextured-198885e270d34d23a1c01c3572f57cdc', note: 'simplified, recoloured' } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'ultralisk' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.7 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: nV, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: nV, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: nV, type: 'VEC3' },
    { bufferView: 3, componentType: idx16 ? 5123 : 5125, count: nI, type: 'SCALAR' }
  ],
  bufferViews: parts.map((p, i) => ({ buffer: 0, byteOffset: offs[i], byteLength: p.length, target: i === 3 ? 34963 : 34962 })),
  buffers: [{ byteLength: o }]
};
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(parts);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const ch = (len: number, type: number) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
await Bun.write('public/models/ultralisk.glb', Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]));
console.log('wrote public/models/ultralisk.glb', ((12 + 16 + js.length + bin.length) / 1024).toFixed(0), 'KB');
