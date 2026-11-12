/**
 * Procedural Zerg Extractor (from the SC2 reference art): three fat purple bio-pods with glowing acid-green sacs on their faces,
 * tall bone horns, spiny studs and a ridged, segmented body knitting them together. Vertex-coloured, faces +Z, feet on y=0.
 *   bun tools/model/build-extractor.ts
 */
import * as THREE from 'three';
import { writeGlb, type OutPart } from './glb';

let P: number[] = [], U: number[] = [], N: number[] = [], C: number[] = [], I: number[] = [];
const parts: OutPart[] = []; let cur = '';
/** Start a named part (becomes a construction stage in the game): 'base' | 'pod_a' | 'pod_b' | 'ridge'. */
function begin(name: string) {
  if (cur && I.length) parts.push({ name: cur, pivot: [0, 0, 0], pos: new Float32Array(P), nrm: new Float32Array(N), col: new Float32Array(C), uv: new Float32Array(U), idx: new Uint32Array(I) });
  P = []; U = []; N = []; C = []; I = []; cur = name;
}
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const mixc = (a: number, b: number, t: number) => hex(a).lerp(hex(b), Math.max(0, Math.min(1, t)));
const noise = (x: number, y: number, z: number) => Math.sin(x * 7.1 + y * 5.3 + z * 3.7) * Math.sin(z * 6.7 - y * 4.1 + x * 2.3) * 0.5 + 0.5;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

type ColFn = (x: number, y: number, z: number, ny: number) => THREE.Color;
function add(g: THREE.BufferGeometry, m: THREE.Matrix4, col: ColFn, lump = 0) {
  g = g.index ? g.toNonIndexed() : g.clone();
  const pos = g.attributes.position!;
  const v = new THREE.Vector3(), base = P.length / 3;
  const tris: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (lump) { const k = 1 + lump * (noise(v.x * 3.1, v.y * 3.1, v.z * 3.1) - 0.5) * 2; v.multiplyScalar(k); }
    v.applyMatrix4(m); tris.push(v.clone());
  }
  // smooth-ish normals: per-vertex from original geometry transformed
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const nor = g.attributes.normal!;
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i]!;
    const n = new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    const c = col(t.x, t.y, t.z, n.y);
    c.multiplyScalar(0.55 + 0.45 * Math.min(1, t.y / 1.2 + 0.35));
    P.push(t.x, t.y, t.z); N.push(n.x, n.y, n.z); C.push(c.r, c.g, c.b);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ay >= ax && ay >= az) U.push(t.x, t.z); else if (ax >= az) U.push(t.z, t.y); else U.push(t.x, t.y);
    I.push(base + i);
  }
}
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const flat = (c: number) => () => hex(c);

const PURP = 0x5a2a6e, PURP2 = 0x7b3d8e, DEEP = 0x2e1438, RIDGE = 0x8a4c8c, BONE = 0xb8ab94, BONE2 = 0x7d725f, GREEN = 0x6bff2a, GREENDK = 0x2f8a14;
const skin = (x: number, y: number, z: number) => mixc(PURP, PURP2, noise(x * 2.2, y * 2.2, z * 2.2) * 0.9).lerp(hex(DEEP), Math.max(0, 0.5 - y * 0.45));

interface Pod { x: number; z: number; r: number; h: number; face: number; horn: [number, number]; horn2?: [number, number] }
const pods: Pod[] = [
  { x: -0.7, z: -0.3, r: 0.88, h: 1.55, face: 0.55, horn: [-0.35, -0.3], horn2: [0.15, -0.7] },
  { x: 0.7, z: 0.4, r: 0.82, h: 1.45, face: 0.25, horn: [0.3, -0.25] },
];

function spike(x: number, y: number, z: number, nx: number, ny: number, nz: number, len: number, rad: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  add(new THREE.ConeGeometry(rad, len, 5), T(x + nx * len * 0.35, y + ny * len * 0.35, z + nz * len * 0.35, e.x, e.y, e.z), (px, py, pz) => mixc(BONE2, BONE, (py - y) / len + 0.5));
}
function horn(x: number, y: number, z: number, tx: number, tz: number, len: number, rad: number) {
  const dir = new THREE.Vector3(tx, 1, tz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  const c = new THREE.Vector3(x, y, z).addScaledVector(dir, len / 2);
  add(new THREE.ConeGeometry(rad, len, 8, 4), T(c.x, c.y, c.z, e.x, e.y, e.z), (px, py, pz) => {
    const t = (py - y) / (len * dir.y);
    return mixc(0x6d634f, BONE, t * 1.1).multiplyScalar(0.9 + 0.2 * noise(px * 9, py * 9, pz * 9));
  });
  add(new THREE.TorusGeometry(rad * 1.02, rad * 0.22, 6, 14), T(x + dir.x * 0.1, y + dir.y * 0.1, z + dir.z * 0.1, Math.PI / 2 + e.x, e.y, e.z), flat(0x8a5a8e));
}

let podIdx = 0;
begin('base');
for (const p of pods) { // bases first
  add(new THREE.CylinderGeometry(p.r * 0.92, p.r * 1.0, 0.18, 24), T(p.x, 0.09, p.z), flat(DEEP));
}
for (const p of pods) {
  begin(podIdx++ === 0 ? 'pod_a' : 'pod_b');
  const sphere = new THREE.SphereGeometry(1, 28, 20);
  add(sphere, T(p.x, p.h * 0.5, p.z, 0, 0, 0, p.r, p.h * 0.55, p.r), (x, y, z) => skin(x, y, z), 0.05);
  // glowing sacs on the front face (big one low, two smaller above)
  const sacs: [number, number, number][] = [[0, 0.32, 0.36], [-0.5, 0.62, 0.2], [0.5, 0.62, 0.2], [0.05, 0.9, 0.16]];
  for (const [da, hy, sr] of sacs) {
    const a = p.face + da, y = p.h * hy * 0.85;
    const rr = Math.sqrt(Math.max(0.05, 1 - (y / (p.h * 0.55) - 0.9) ** 2));
    const sx = p.x + Math.sin(a) * p.r * rr * 0.93, sz = p.z + Math.cos(a) * p.r * rr * 0.93;
    const rimQ = new THREE.Euler(0, a, 0);
    add(new THREE.SphereGeometry(sr * 1.25, 14, 10), T(sx, y, sz, rimQ.x, rimQ.y, rimQ.z, 1, 1, 0.45), flat(0x3a1a46)); // fleshy rim
    add(new THREE.SphereGeometry(sr, 16, 12), T(sx + Math.sin(a) * 0.04, y, sz + Math.cos(a) * 0.04, rimQ.x, rimQ.y, rimQ.z, 1, 1, 0.5), (x, yy, z) => mixc(GREENDK, GREEN, 0.75 + 0.5 * (1 - Math.hypot(x - sx, yy - y) / sr)));
  }
  // horns
  horn(p.x + p.horn[0] * 0.3, p.h * 0.9, p.z + p.horn[1] * 0.3, p.horn[0], p.horn[1], 1.25, 0.34);
  if (p.horn2) horn(p.x + p.horn2[0] * 0.3, p.h * 0.82, p.z + p.horn2[1] * 0.3, p.horn2[0], p.horn2[1], 0.85, 0.2);
  // spiny studs scattered over the shoulders and back
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, t = 0.25 + rnd() * 0.65;
    const ny = (t - 0.5) * 1.6, rr = Math.sqrt(1 - ny * ny * 0.5);
    const x = p.x + Math.sin(a) * p.r * rr, y = p.h * (0.5 + 0.55 * (t - 0.5) * 1.7), z = p.z + Math.cos(a) * p.r * rr;
    spike(x, y, z, Math.sin(a), 0.5 + ny * 0.5, Math.cos(a), 0.14 + rnd() * 0.14, 0.035 + rnd() * 0.025);
  }
}

// connecting ridged, segmented body between and in front of the pods
begin('ridge');
const SEG = 7;
for (let i = 0; i < SEG; i++) {
  const t = i / (SEG - 1);
  const x = -0.55 + t * 1.2, z = 0.45 - t * 0.55 + Math.sin(t * Math.PI) * 0.25;
  const r = 0.5 + Math.sin(t * Math.PI) * 0.12;
  add(new THREE.SphereGeometry(1, 20, 14), T(x, 0.42, z, 0, 0.6, 0, r * 1.0, r * 0.85, r * 0.62),
    (px, py, pz) => mixc(PURP2, RIDGE, 0.5 + 0.5 * noise(px * 4, py * 4, pz * 4)).multiplyScalar(0.9), 0.04);
  // tiny pale studs along the ridge
  add(new THREE.SphereGeometry(0.07, 8, 6), T(x + 0.02, 0.88, z + 0.1), flat(0xd8cfd6));
}
// a few pale pustule plates on the segmented body
for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.1, 10, 8), T(-0.5 + i * 0.28, 0.35 + (i % 2) * 0.1, 0.8 - i * 0.1, 0, 0, 0, 1, 0.8, 0.5), flat(0xd9cdd6));
begin('base2');
// bone claws gripping the ground at the front
for (let i = 0; i < 4; i++) spike(-0.9 + i * 0.6, 0.12, 1.15 - (i % 2) * 0.2, 0, 0.2, 1, 0.4, 0.07);

begin('');
const glb = writeGlb(parts);
await Bun.write('public/models/extractor.glb', glb);
console.log(`extractor: ${parts.map(p => p.name + ' ' + p.idx.length / 3).join(', ')}, ${(glb.length / 1024).toFixed(0)} KB`);
