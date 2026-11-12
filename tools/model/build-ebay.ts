/**
 * Procedural Engineering Bay (from the SC2 reference art): low gunmetal hull, front glass canopy, blue dome, exhaust stack,
 * hatch plate, green side lights and four landing legs ending in round spoked foot pads. Vertex-coloured; the red panels
 * are the player-colour slots (BLDG_RED in TeamColor). Faces +Z, feet on y=0.   bun tools/model/build-ebay.ts
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { writeGlb, type OutPart } from './glb';

const P: number[] = [], U: number[] = [], N: number[] = [], C: number[] = [], I: number[] = [];
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const noise = (x: number, y: number, z: number) => Math.sin(x * 23.1 + y * 17.3) * Math.sin(z * 19.7 + y * 11.1) * 0.5 + 0.5;

/** Add a geometry with transform and colour (number or per-vertex fn). */
function add(g: THREE.BufferGeometry, m: THREE.Matrix4, col: number | ((x: number, y: number, z: number, ny: number) => THREE.Color)) {
  g = g.index ? g : g.clone();
  const pos = g.attributes.position!, nor = g.attributes.normal!, base = P.length / 3;
  const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    const c = typeof col === 'number' ? hex(col).multiplyScalar(0.82 + 0.3 * noise(v.x * 3, v.y * 3, v.z * 3)) : col(v.x, v.y, v.z, n.y);
    c.multiplyScalar(0.7 + 0.3 * Math.min(1, v.y / 1.2 + 0.4));
    // box-projected UV from world position (dominant normal axis), 1 unit = 1 tile
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ay >= ax && ay >= az) U.push(v.x, v.z); else if (ax >= az) U.push(v.z, v.y); else U.push(v.x, v.y);
    P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); C.push(c.r, c.g, c.b);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base); else for (let i = 0; i < pos.count; i++) I.push(i + base);
}
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: any, rx = 0, ry = 0, rz = 0) => add(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, w / 4, h / 4, d / 4)), T(x, y, z, rx, ry, rz), col);
const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, col: any, seg = 14, rx = 0, rz = 0) => add(new THREE.CylinderGeometry(rt, rb, h, seg), T(x, y, z, rx, 0, rz), col);

const HULL = 0x434a54, HULL2 = 0x59616d, PLATE = 0x7d8693, RED = 0xb8322c, GLASS = 0xb9c4cc, GREEN = 0x2bff6a, BLUE = 0x2f64d8, DARK = 0x16181c, RUST = 0x5e5a56;
const LEG = 0x5c626b;   // very light gray metal for arms and foot pads
const mixc = (a: number, b: number, t: number) => hex(a).lerp(hex(b), Math.max(0, Math.min(1, t)));

// square frustum helper (flat-shaded): CylinderGeometry with 4 segments rotated 45 deg, rings resized to w x d
function frustum(wb: number, db: number, wt: number, dt: number, h: number, x: number, y: number, z: number, col: any) {
  const k = Math.SQRT2 / 2;  // CylinderGeometry radius reaches the corner; 4 segments rotated 45 deg give a box
  let g = new THREE.CylinderGeometry(1, 1, h, 4, 1, false); g.rotateY(Math.PI / 4);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) { const top = pos.getY(i) > 0, w = top ? wt : wb, d = top ? dt : db; pos.setX(i, Math.sign(pos.getX(i)) * w / 2); pos.setZ(i, Math.sign(pos.getZ(i)) * d / 2); }
  g = g.toNonIndexed(); g.computeVertexNormals(); void k;
  add(g, T(x, y, z), col);
}
// ---- body: ONE continuous slope from the bottom plate (1.1 x 2.2 at y=0.2) up to the roof (60% of that at y=1.55)
const Y0 = 0.2, Y1 = 1.55, WB = 1.1, DB = 2.2, K = 0.6;   // bottom plate 1 : 2 (X short, Z long, the side the green lights run along)
const hw = (y: number) => (WB / 2) * (1 - (1 - K) * (y - Y0) / (Y1 - Y0));   // half width at height y
const hd = (y: number) => (DB / 2) * (1 - (1 - K) * (y - Y0) / (Y1 - Y0));   // half depth at height y
const ANG = Math.atan(((WB / 2) * (1 - K)) / (Y1 - Y0));                        // lean of the side walls
const steel = (x: number, y: number, z: number) => mixc(HULL, HULL2, noise(x * 4, y * 4, z * 4));
box(WB * 1.04, 0.12, DB * 1.04, 0, Y0, 0, DARK);                                // bottom plate
frustum(WB, DB, WB * K, DB * K, Y1 - Y0, 0, (Y0 + Y1) / 2, 0, steel);
box(WB * K, 0.05, DB * K, 0, Y1 + 0.005, 0, (x: number, y: number, z: number) => mixc(HULL2, PLATE, noise(x * 5, y * 3, z * 5) * 0.7)); // roof plate
// player-colour side panels and green vents follow the sloped walls
for (const sx of [-1, 1]) {
  box(0.06, 0.5, 1.3, sx * (hw(0.8) + 0.02), 0.8, 0.1, (x, y, z) => mixc(RED, 0x8f241f, noise(x, y * 6, z * 5)), 0, 0, -sx * ANG);
  box(0.06, 0.16, 1.5, sx * (hw(1.4) + 0.02), 1.4, 0, (x, y, z) => mixc(RED, 0x8f241f, noise(x, y * 6, z * 5)), 0, 0, -sx * ANG);
}
for (let i = 0; i < 3; i++) { box(0.07, 0.1, 0.2, -(hw(0.55) + 0.025), 0.55, -0.5 + i * 0.35, GREEN, 0, 0, ANG); box(0.07, 0.04, 0.3, -(hw(0.38) + 0.02), 0.38, -0.5 + i * 0.35, DARK, 0, 0, ANG); }
for (let i = 0; i < 2; i++) box(0.07, 0.08, 0.18, hw(0.34) + 0.02, 0.34, 0.6 + i * 0.28, GREEN, 0, 0, -ANG);
// ---- roof items scaled to the smaller roof (about 0.82 of before)
const R = Y1;
box(0.5, 0.06, 0.5, 0, R + 0.05, 0.38, (x, y, z) => mixc(PLATE, 0x8b939e, noise(x * 9, y, z * 9)));   // hatch plate
box(0.5, 0.05, 0.05, 0, R + 0.09, 0.61, DARK); box(0.05, 0.05, 0.5, -0.25, R + 0.09, 0.38, DARK);
box(0.28, 0.07, 0.09, 0, R + 0.07, 0.05, BLUE);                                                         // blue relay
cyl(0.15, 0.16, 0.4, 0, R + 0.22, -0.2, (x, y, z) => mixc(DARK, PLATE, noise(x * 9, y * 9, z * 9)), 14);  // exhaust stack
cyl(0.18, 0.15, 0.07, 0, R + 0.45, -0.2, DARK, 14);
cyl(0.065, 0.065, 0.26, 0.21, R + 0.14, -0.05, HULL2, 10); cyl(0.065, 0.065, 0.22, -0.21, R + 0.12, -0.05, PLATE, 10);
add(new THREE.BoxGeometry(0.55, 0.3, 0.35), T(0, R + 0.15, -0.5, -0.5), (x, y, z) => mixc(HULL, PLATE, noise(x * 4, y * 4, z * 4) * 0.6));  // small dark rear block
// ---- blue pressure sphere on the right flank, intake pipe at the front
add(new THREE.SphereGeometry(0.18, 14, 10), T(hw(0.85) + 0.05, 0.85, 0.0), (x, y) => mixc(BLUE, 0xa0c0ff, Math.max(0, (y - 0.85) * 2.5)));
add(new THREE.TorusGeometry(0.17, 0.06, 8, 14, Math.PI), T(-0.22, 0.45, hd(0.45) + 0.02, 0, Math.PI / 2, 0), PLATE);
cyl(0.08, 0.08, 0.42, -0.1, 0.42, hd(0.42) + 0.04, HULL2, 10, Math.PI / 2);

// ---- four landing legs (moved in with the body, pads ~10% smaller)
for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
  const ax = sx * (WB / 2 - 0.05), az = sz * (DB / 2 - 0.05), hx = sx * (WB / 2 + 0.45), hz = sz * 1.4;
  const dx = hx - ax, dz = hz - az, len = Math.hypot(dx, dz);
  add(new THREE.BoxGeometry(0.18, 0.12, len + 0.18), T((ax + hx) / 2, 0.4, (az + hz) / 2, 0, Math.atan2(dx, dz), 0), LEG);
  box(0.24, 0.24, 0.24, ax, 0.4, az, HULL2);
  cyl(0.46, 0.49, 0.09, hx, 0.065, hz, (x, y, z) => mixc(LEG, 0x727882, noise(x * 7, y, z * 7)), 24);
  add(new THREE.TorusGeometry(0.41, 0.032, 6, 24), T(hx, 0.125, hz, Math.PI / 2), 0x757c86);
  for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.78, 0.04, 0.06), T(hx, 0.12, hz, 0, k * Math.PI / 4, 0), DARK);
  cyl(0.18, 0.2, 0.11, hx, 0.155, hz, HULL, 16);
  cyl(0.11, 0.11, 0.05, hx, 0.22, hz, BLUE, 14);
  add(new THREE.TorusGeometry(0.15, 0.022, 6, 16), T(hx, 0.18, hz, Math.PI / 2), RED);
}

// split parts: only 'body' (one mesh, one draw call)
const part: OutPart = { name: 'body', pivot: [0, 0, 0], pos: new Float32Array(P), nrm: new Float32Array(N), col: new Float32Array(C), uv: new Float32Array(U), idx: new Uint32Array(I) };
const glb = writeGlb([part]);
await Bun.write('public/models/engineering_bay.glb', glb);
console.log(`engineering_bay: ${I.length / 3} tris, ${(glb.length / 1024).toFixed(0)} KB`);
