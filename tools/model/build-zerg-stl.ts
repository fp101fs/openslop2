/**
 * Converts a Thingiverse STL (Zerg structures by Oyvindtk, CC-BY 4.0 - see README credits) into a game GLB.
 *
 *   bun tools/model/build-zerg-stl.ts <in.stl> <out.glb> <lengthInTiles> <thingiverse-id> "<title>" [yawDeg]
 *
 * STL is Z-up with the base on z=0 -> rotate to Y-up, centre on the footprint, scale to `length`, weld + quadric-simplify
 * (meshoptimizer), smooth normals, bake vertex colours (dark violet-brown carapace, pinker flesh in the crevices and on
 * undersides, bone-pale tips on the highest points) with cheap cavity shading -> one static mesh (positions + normals + colours).
 */
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptSimplifier as S } from 'meshoptimizer';

const [src, dst, lenArg, thingId, title, yawArg] = process.argv.slice(2);
if (!src || !dst || !lenArg || !thingId || !title) { console.error('usage: bun tools/model/build-zerg-stl.ts <in.stl> <out.glb> <length> <thing-id> <title> [yawDeg]'); process.exit(1); }
const LENGTH = Number(lenArg), YAW = (Number(yawArg ?? 0) * Math.PI) / 180, TRIS = Number(process.env.TRIS ?? 24000);
await S.ready;

const geo = new STLLoader().parse(await Bun.file(src).arrayBuffer());
const raw = geo.attributes.position.array as Float32Array;
let pos = new Float32Array(raw.length);
{
  // Z-up -> Y-up (x, y, z) -> (x, z, -y), then yaw about Y
  const c = Math.cos(YAW), s = Math.sin(YAW);
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i]!, y = raw[i + 2]!, z = -raw[i + 1]!;
    pos[i] = x * c + z * s; pos[i + 1] = y; pos[i + 2] = -x * s + z * c;
  }
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i + k]!); max[k] = Math.max(max[k]!, pos[i + k]!); }
  const sc = LENGTH / Math.max(max[0]! - min[0]!, max[2]! - min[2]!), cx = (min[0]! + max[0]!) / 2, cz = (min[2]! + max[2]!) / 2;
  for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i]! - cx) * sc; pos[i + 1] = (pos[i + 1]! - min[1]!) * sc; pos[i + 2] = (pos[i + 2]! - cz) * sc; }
}
const idx0 = new Uint32Array(pos.length / 3); for (let i = 0; i < idx0.length; i++) idx0[i] = i;

// ---- weld + simplify ----
const remap = S.generatePositionRemap(pos, 3);
const welded = new Uint32Array(idx0.length); for (let i = 0; i < idx0.length; i++) welded[i] = remap[idx0[i]!]!;
function compact(p: Float32Array, ix: Uint32Array) {
  const map = new Map<number, number>(), out: number[] = [], I2 = new Uint32Array(ix.length);
  for (let i = 0; i < ix.length; i++) { const o = ix[i]!; let n = map.get(o); if (n === undefined) { n = out.length / 3; map.set(o, n); out.push(p[o * 3]!, p[o * 3 + 1]!, p[o * 3 + 2]!); } I2[i] = n; }
  return { pos: new Float32Array(out), idx: I2 };
}
let m = compact(pos, welded);
console.log('welded', m.pos.length / 3, 'verts', m.idx.length / 3, 'tris');
if (m.idx.length / 3 > TRIS) {
  let [out] = S.simplify(m.idx, m.pos, 3, TRIS * 3, 1.0, ['Prune']);
  if (out.length / 3 > TRIS * 1.5) [out] = S.simplifySloppy(m.idx, m.pos, 3, null, TRIS * 3, 1.0);
  m = compact(m.pos, out);
}
console.log('simplified', m.pos.length / 3, 'verts', m.idx.length / 3, 'tris');

// ---- smooth normals ----
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

// ---- vertex colours ----
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const PAL = { carapace: hex(0x4a3a52), carapaceDark: hex(0x2a2030), flesh: hex(0x7a4a5a), fleshLight: hex(0x9a5a68), bone: hex(0xb8a890) };
const noise = (x: number, y: number, z: number) => Math.sin(x * 7.1 + y * 5.3) * Math.sin(z * 6.7 + y * 4.1) * 0.5 + 0.5;
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
let maxY = 0; for (let i = 1; i < m.pos.length; i += 3) maxY = Math.max(maxY, m.pos[i]!);
const col = new Float32Array(m.pos.length);
for (let i = 0; i < m.pos.length; i += 3) {
  const x = m.pos[i]!, y = m.pos[i + 1]!, z = m.pos[i + 2]!, ny = nrm[i + 1]!, h = y / maxY, nz = noise(x, y, z);
  let c = mix(PAL.carapace, PAL.carapaceDark, nz * 0.8 + (1 - h) * 0.25);
  if (ny < -0.1) c = mix(c, PAL.flesh, Math.min(1, -ny * 1.5) * 0.8);                 // undersides: flesh
  if (nz > 0.8 && ny < 0.5) c = mix(c, PAL.fleshLight, (nz - 0.8) * 3);                // mottled flesh patches
  if (h > 0.8) c = mix(c, PAL.bone, (h - 0.8) * 3.5);                                  // pale tips on the highest points
  const cav = 0.75 + 0.35 * (ny * 0.5 + 0.5);
  col[i] = c.r * cav * 1.3; col[i + 1] = c.g * cav * 1.3; col[i + 2] = c.b * cav * 1.3;
}

// ---- write GLB ----
const nV = m.pos.length / 3, nI = m.idx.length, idx16 = nV < 65536;
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const parts = [pad(Buffer.from(m.pos.buffer)), pad(Buffer.from(nrm.buffer)), pad(Buffer.from(col.buffer)), pad(idx16 ? Buffer.from(new Uint16Array(m.idx).buffer) : Buffer.from(m.idx.buffer))];
const offs: number[] = []; let o = 0; for (const p of parts) { offs.push(o); o += p.length; }
const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, m.pos[i + k]!); max[k] = Math.max(max[k]!, m.pos[i + k]!); }
const json = {
  asset: { version: '2.0', generator: 'sc2-clone build-zerg-stl', extras: { title, author: 'Oyvindtk', authorUrl: 'https://www.thingiverse.com/oyvindtk', license: 'CC-BY-4.0', source: `https://www.thingiverse.com/thing:${thingId}`, note: 'converted from STL, simplified, recoloured' } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: title }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.65 } }],
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
await Bun.write(dst, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]));
console.log('wrote', dst, ((12 + 16 + js.length + bin.length) / 1024).toFixed(0), 'KB');
