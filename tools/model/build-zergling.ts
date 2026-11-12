/**
 * Builds the in-game zergling from a high-poly source model (2.8M triangles, 85 untextured parts).
 *
 *   bun tools/model/build-zergling.ts ~/Desktop/zergling__starcraft_2.glb
 *
 * Steps: load -> bake world transforms -> face +Z, scale to game size, feet on y=0 -> split limbs left/right and the tail into
 * segments -> weld + quadric-simplify each piece (meshoptimizer) -> smooth normals -> bake vertex colours (palette per part +
 * cheap ambient occlusion, team-colour mask) -> compute joint pivots -> write src/graphics/zerglingData.ts (compact base64 buffers).
 * The runtime (ZerglingModel.ts) rebuilds a ~14 mesh rig from that data; ZerglingAnimator drives the joints.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptSimplifier as S } from 'meshoptimizer';

const src = process.argv[2];
if (!src) { console.error('usage: bun tools/model/build-zergling.ts <zergling.glb>'); process.exit(1); }
await S.ready;
const buf = await Bun.file(src.replace(/^~/, process.env.HOME!)).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
gltf.scene.updateMatrixWorld(true);
const rootNode = gltf.scene.getObjectByName('RootNode') as THREE.Object3D;

// ---------- tunables ----------
const BUDGET = Number(process.env.BUDGET ?? 0.62); // global triangle-budget multiplier
const LENGTH = 1.9;                  // head-tip to tail-tip length in model units (the game then scales units 1.5x)
const X0 = 0.05, ZC = -0.02;         // body mid-plane x and centre z in the source model
const WINGS = process.env.WINGS !== '0';
const TAIL_SEGMENTS = 4;

// ---------- geometry helpers ----------
type Mesh = { pos: Float32Array; idx: Uint32Array };

/** All triangles of a top-level part (matched by name prefix), world transforms baked in. */
function collect(prefix: string): Mesh {
  const node = rootNode.children.find(c => c.name.startsWith(prefix));
  if (!node) throw new Error('missing part ' + prefix);
  const P: number[] = [], I: number[] = [];
  node.traverse((o: any) => {
    if (!o.isMesh) return;
    const g: THREE.BufferGeometry = o.geometry, p = g.attributes.position, base = P.length / 3, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); }
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) I.push(i + base);
  });
  return { pos: new Float32Array(P), idx: new Uint32Array(I) };
}

/** Source space -> game space: rotate 180 degrees about Y (head faces +Z), centre on the body, scale, feet on the ground. */
const SCALE = LENGTH / (3.73 + 1.9);
let GROUND = 0;
const toGame = (m: Mesh): Mesh => {
  const p = new Float32Array(m.pos.length);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = -(m.pos[i]! - X0) * SCALE; p[i + 1] = (m.pos[i + 1]! - GROUND) * SCALE; p[i + 2] = -(m.pos[i + 2]! - ZC) * SCALE;
  }
  return { pos: p, idx: m.idx };
};
function bbox(m: Mesh) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.pos[i + k]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v; }
  return { min, max };
}
/** Drop unused vertices and renumber. */
function compact(m: Mesh): Mesh {
  const map = new Map<number, number>(), P: number[] = [], I = new Uint32Array(m.idx.length);
  for (let i = 0; i < m.idx.length; i++) {
    const o = m.idx[i]!; let n = map.get(o);
    if (n === undefined) { n = P.length / 3; map.set(o, n); P.push(m.pos[o * 3]!, m.pos[o * 3 + 1]!, m.pos[o * 3 + 2]!); }
    I[i] = n;
  }
  return { pos: new Float32Array(P), idx: I };
}
/** Split triangles into groups by a function of the triangle centroid. */
function splitBy(m: Mesh, key: (x: number, y: number, z: number) => string): Record<string, Mesh> {
  const buckets: Record<string, number[]> = {};
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t]! * 3, b = m.idx[t + 1]! * 3, c = m.idx[t + 2]! * 3;
    const k = key((m.pos[a]! + m.pos[b]! + m.pos[c]!) / 3, (m.pos[a + 1]! + m.pos[b + 1]! + m.pos[c + 1]!) / 3, (m.pos[a + 2]! + m.pos[b + 2]! + m.pos[c + 2]!) / 3);
    (buckets[k] ||= []).push(m.idx[t]!, m.idx[t + 1]!, m.idx[t + 2]!);
  }
  const out: Record<string, Mesh> = {};
  for (const [k, ids] of Object.entries(buckets)) out[k] = compact({ pos: m.pos, idx: new Uint32Array(ids) });
  return out;
}
/** Weld coincident vertices, then simplify to ~`tris` triangles (error unbounded so the budget always wins). */
function simplify(m: Mesh, tris: number): Mesh {
  tris = Math.max(10, Math.round(tris * BUDGET));
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
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2); // area weighted
    for (const v of [i, j, k]) { n[v * 3] += e1.x; n[v * 3 + 1] += e1.y; n[v * 3 + 2] += e1.z; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
/** Average position of the vertices inside a box-ish region selected by a predicate. */
function centroidWhere(m: Mesh, pred: (x: number, y: number, z: number) => boolean): [number, number, number] {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let i = 0; i < m.pos.length; i += 3) if (pred(m.pos[i]!, m.pos[i + 1]!, m.pos[i + 2]!)) { sx += m.pos[i]!; sy += m.pos[i + 1]!; sz += m.pos[i + 2]!; n++; }
  return n ? [sx / n, sy / n, sz / n] : [0, 0, 0];
}

// ---------- palette ----------
const hex = (h: number) => new THREE.Color().setHex(h, THREE.SRGBColorSpace);
const PAL = {
  // dark purple / maroon hide, bone-ivory spikes and claws; `shell` is the carapace that carries the team colour in game
  skin: hex(0x4b2a48), skinDark: hex(0x1e1020), belly: hex(0x6a3c46), plate: hex(0x3d1a36), plateDark: hex(0x180a16),
  shell: hex(0x7a4f92), shellDark: hex(0x2a1434),
  bone: hex(0x957552), boneDark: hex(0x3e241a), mouth: hex(0x7c2434), hind: hex(0x3a2246), wing: hex(0x4c1c36), claw: hex(0x22150f)
};
const noise = (x: number, y: number, z: number) => Math.sin(x * 23.1 + y * 17.3) * Math.sin(z * 19.7 + y * 11.1) * 0.5 + 0.5;
/** Finer ridged noise for chitin grooves on the carapace. */
const groove = (x: number, y: number, z: number) => Math.abs(Math.sin(z * 41 + Math.sin(x * 30) * 1.2) * Math.sin(x * 37 + y * 9));
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
type Style = (x: number, y: number, z: number, ny: number, h: number) => THREE.Color;
/** Team-colour weight (0..1) per vertex: the dorsal carapace, the top of the head and the tops of the limb guards. */
type Team = (x: number, y: number, z: number, ny: number) => number;
const TEAM: Record<string, Team> = {
  body: (_x, y, _z, ny) => sstep(0.1, 0.45, ny) * sstep(0.46, 0.56, y),
  head: (_x, y, z, ny) => sstep(-0.05, 0.3, ny) * sstep(0.5, 0.58, y) * (1 - sstep(0.5, 0.56, z) * 0.6),
  plates: (_x, _y, _z, ny) => sstep(0.1, 0.55, ny) * 0.85
};
const shell = (x: number, y: number, z: number, t: number, base: THREE.Color) => t <= 0 ? base : mix(base, mix(PAL.shell, PAL.shellDark, groove(x, y, z) * 0.55), t);
const STYLES: Record<string, Style> = {
  body: (x, y, z, ny, h) => shell(x, y, z, TEAM.body!(x, y, z, ny), mix(mix(PAL.belly, PAL.skin, h * 1.6), PAL.skinDark, noise(x, y, z) * 0.45)),
  head: (x, y, z, ny) => shell(x, y, z, TEAM.head!(x, y, z, ny), mix(PAL.skin, PAL.skinDark, 0.2 + noise(x, y, z) * 0.4)),
  // mouth tusks: dark brown where they leave the skull, bone at the curled tips
  horns: (x, y, z) => mix(PAL.boneDark, mix(PAL.bone, PAL.boneDark, noise(x, y, z) * 0.25), sstep(0.1, 0.3, Math.hypot(x, y - 0.5, z - 0.6))),
  jaw: (x, y, z, ny) => mix(PAL.mouth, PAL.skinDark, Math.max(0, -ny) * 0.5 + noise(x, y, z) * 0.2),
  tail: (x, y, z) => mix(PAL.skin, PAL.skinDark, 0.3 + noise(x, y, z) * 0.5),
  limb: (x, y, z) => mix(PAL.skin, PAL.skinDark, 0.25 + noise(x, y, z) * 0.55),
  hind: (x, y, z) => mix(PAL.hind, PAL.skinDark, 0.2 + noise(x, y, z) * 0.45),
  foot: (_x, _y, _z, _ny, h) => mix(PAL.skinDark, PAL.claw, Math.max(0, 1 - h * 3)),
  plates: (x, y, z, ny) => shell(x, y, z, TEAM.plates!(x, y, z, ny), mix(PAL.plate, PAL.plateDark, 0.2 + noise(x, y, z) * 0.55)),
  // spikes and claws: ivory tips fading to a dark brown root
  spikes: (x, y, z) => mix(mix(PAL.plate, PAL.boneDark, 0.6), mix(PAL.bone, PAL.boneDark, noise(x, y, z) * 0.3), sstep(0.55, 1.0, y)),
  // the two dorsal arms that carry the scythe talons: dark purple all the way up to where the talons attach
  blades: (x, y, z) => mix(mix(PAL.skin, PAL.plate, 0.4), PAL.skinDark, 0.2 + noise(x, y, z) * 0.45),
  // the scythe blades hanging from the dorsal arms: dark where they join (the top), bone along the blade, darker towards the edge
  scythes: (x, y, z) => mix(mix(PAL.bone, PAL.boneDark, 0.15 + noise(x, y, z) * 0.3 + sstep(0.98, 0.93, y) * 0.25), mix(PAL.plate, PAL.boneDark, 0.5), sstep(1.12, 1.24, y)),
  wing: (x, y, z) => mix(PAL.wing, PAL.plateDark, noise(x, y, z) * 0.5),
  eye: () => hex(0xffb020)
};

// ---------- assemble bones ----------
GROUND = bbox(collect('Pies')).min[1]!;
const G = (n: string) => toGame(collect(n));
type Chunk = { mesh: Mesh; style: string; tris: number };
type Bone = { name: string; parent: string | null; chunks: Chunk[]; pivot: [number, number, number]; basic?: boolean; castShadow?: boolean };
const bones: Record<string, Bone> = {};
const bone = (name: string, parent: string | null, basic = false, castShadow = false): Bone => (bones[name] ||= { name, parent, chunks: [], pivot: [0, 0, 0], basic, castShadow });
const put = (b: string, mesh: Mesh, style: string, tris: number) => bones[b]!.chunks.push({ mesh, style, tris });

bone('body', null, false, true); bone('head', 'body', false, true); bone('jaw', 'head'); bone('eyes', 'head', true);
for (let i = 0; i < TAIL_SEGMENTS; i++) bone('tail' + i, i === 0 ? 'body' : 'tail' + (i - 1));
for (const s of ['l', 'r']) { bone('arm_' + s, 'body'); bone('leg_' + s, 'body'); bone('foot_' + s, 'leg_' + s); }

// body: torso, dorsal crest, dorsal blades, optional wings
const torso = G('Cuerpo001');
put('body', torso, 'body', 1300);
put('body', G('NurbsPath017'), 'scythes', 220); put('body', G('NurbsPath016'), 'scythes', 260); put('body', G('NurbsPath015'), 'scythes', 300);
put('body', G('Brazo_dorsal_izquierdo'), 'blades', 260); put('body', G('Brazo_dorsal_derecho'), 'blades', 260);
if (WINGS) { put('body', G('Alas_peque'), 'wing', 120); put('body', G('Alas_grandes'), 'wing', 120); }

// head / jaw / eyes
const skull = G('Cabeza');
put('head', skull, 'head', 900); put('head', G('Cuernos_boca'), 'horns', 300);
const mouth = G('Boca'); put('jaw', mouth, 'jaw', 450);
put('eyes', G('Ojos'), 'eye', 90);

// tail: split along its length (game -Z) into chained segments
const tail = G('Cola'); const tb = bbox(tail);
const tailStart = tb.max[2]!, tailEnd = tb.min[2]!, segLen = (tailStart - tailEnd) / TAIL_SEGMENTS;
const tailSegs = splitBy(tail, (_x, _y, z) => String(Math.min(TAIL_SEGMENTS - 1, Math.max(0, Math.floor((tailStart - z) / segLen)))));
for (let i = 0; i < TAIL_SEGMENTS; i++) put('tail' + i, tailSegs[String(i)]!, 'tail', 240);

// limbs: split left/right by game x (+x = left)
const side = (m: Mesh) => splitBy(m, x => (x >= 0 ? 'l' : 'r'));
const sides = (n: string, bonePrefix: string, style: string, tris: number) => { const s = side(G(n)); for (const k of ['l', 'r']) put(bonePrefix + k, s[k]!, style, tris); return s; };
const armsMain = sides('Brazos', 'arm_', 'limb', 520);
sides('Pinchos_brazos_2', 'arm_', 'spikes', 150); sides('Pinchos_brazos', 'arm_', 'spikes', 220); sides('Protectores_brazos', 'arm_', 'plates', 200);
const legsMain = sides('Piernas', 'leg_', 'hind', 300);
sides('Pinchos_piernas_3', 'leg_', 'spikes', 110); sides('Pinchos_piernas_2', 'leg_', 'spikes', 110); sides('Pinchos_piernas', 'leg_', 'spikes', 200); sides('Protectores_piernas', 'leg_', 'plates', 200);
const feetMain = sides('Pies', 'foot_', 'foot', 240);

// ---------- pivots (game space) ----------
const top = (m: Mesh, frac: number) => { const b = bbox(m), h = b.max[1]! - b.min[1]!; return centroidWhere(m, (_x, y) => y > b.max[1]! - h * frac); };
const bb = bbox(torso); bones.body!.pivot = [0, (bb.min[1]! + bb.max[1]!) / 2, 0];
{ const b = bbox(skull); bones.head!.pivot = [(b.min[0]! + b.max[0]!) / 2, b.min[1]! + (b.max[1]! - b.min[1]!) * 0.4, b.min[2]! + (b.max[2]! - b.min[2]!) * 0.05]; bones.eyes!.pivot = bones.head!.pivot; }
{ const b = bbox(mouth); bones.jaw!.pivot = [(b.min[0]! + b.max[0]!) / 2, b.max[1]! - (b.max[1]! - b.min[1]!) * 0.15, b.min[2]! + (b.max[2]! - b.min[2]!) * 0.1]; }
for (let i = 0; i < TAIL_SEGMENTS; i++) { const zb = tailStart - segLen * i; bones['tail' + i]!.pivot = centroidWhere(tail, (_x, _y, z) => Math.abs(z - zb) < segLen * 0.25); }
for (const s of ['l', 'r']) {
  bones['arm_' + s]!.pivot = top(armsMain[s]!, 0.12);
  bones['leg_' + s]!.pivot = top(legsMain[s]!, 0.1);
  bones['foot_' + s]!.pivot = top(feetMain[s]!, 0.25);
}

// ---------- bake + pack ----------
const modelH = bbox(merge2(Object.values(bones).flatMap(b => b.chunks.map(c => c.mesh)))).max[1]!;
function merge2(ms: Mesh[]): Mesh { const P: number[] = []; for (const m of ms) for (const v of m.pos) P.push(v); return { pos: new Float32Array(P), idx: new Uint32Array(0) }; }

const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out: any[] = []; let totalTris = 0, totalVerts = 0;
const order = ['body', 'head', 'jaw', 'eyes', ...Array.from({ length: TAIL_SEGMENTS }, (_, i) => 'tail' + i), 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'foot_l', 'foot_r'];
for (const name of order) {
  const b = bones[name]!;
  const P: number[] = [], N: number[] = [], C: number[] = [], T: number[] = [], I: number[] = [];
  for (const ch of b.chunks) {
    const m = simplify(ch.mesh, ch.tris), n = normals(m), base = P.length / 3, style = STYLES[ch.style]!;
    for (let v = 0; v < m.pos.length / 3; v++) {
      const x = m.pos[v * 3]!, y = m.pos[v * 3 + 1]!, z = m.pos[v * 3 + 2]!, ny = n[v * 3 + 1]!;
      const h = Math.max(0, Math.min(1, y / modelH));
      const ao = (0.6 + 0.4 * h) * (0.78 + 0.22 * (ny * 0.5 + 0.5)); // belly / undersides darker
      const c = style(x, y, z, ny, h);
      const rgb = { r: 0, g: 0, b: 0 }; c.multiplyScalar(b.basic ? 1 : ao).getRGB(rgb as any, THREE.SRGBColorSpace);
      C.push(Math.round(Math.min(1, rgb.r) * 255), Math.round(Math.min(1, rgb.g) * 255), Math.round(Math.min(1, rgb.b) * 255));
      T.push(Math.round((TEAM[ch.style]?.(x, y, z, ny) ?? 0) * 255));
      P.push(x - b.pivot[0], y - b.pivot[1], z - b.pivot[2]);
      N.push(Math.round(n[v * 3]! * 127), Math.round(ny * 127), Math.round(n[v * 3 + 2]! * 127));
    }
    for (const i of m.idx) I.push(i + base);
  }
  let maxAbs = 1e-6; for (const v of P) maxAbs = Math.max(maxAbs, Math.abs(v));
  const scale = maxAbs / 32767;
  const pos = new Int16Array(P.map(v => Math.round(v / scale)));
  const parentPivot = b.parent ? bones[b.parent]!.pivot : [0, 0, 0];
  out.push({
    name, parent: b.parent, basic: !!b.basic, castShadow: !!b.castShadow,
    offset: [b.pivot[0] - parentPivot[0]!, b.pivot[1] - parentPivot[1]!, b.pivot[2] - parentPivot[2]!].map(v => +v.toFixed(4)),
    scale, pos: b64(pos), nrm: b64(new Int8Array(N)), col: b64(new Uint8Array(C)), team: b64(new Uint8Array(T)), idx: b64(new Uint16Array(I)),
    verts: P.length / 3, tris: I.length / 3
  });
  totalTris += I.length / 3; totalVerts += P.length / 3;
  console.log(name.padEnd(8), 'tris', String(I.length / 3).padStart(5), 'verts', String(P.length / 3).padStart(5), 'pivot', b.pivot.map(v => +v.toFixed(2)).join(','));
}
console.log('TOTAL tris', totalTris, 'verts', totalVerts, 'modelHeight', +modelH.toFixed(2));
if (out.some(o => o.verts > 65535)) throw new Error('a part exceeds 16-bit indices');

const file = `// GENERATED by tools/model/build-zergling.ts from a high-poly source model (${totalTris} triangles after simplification). Do not edit.
// Each part is a rigid piece of the zergling rig: quantised Int16 positions (relative to the part's joint pivot), Int8 normals,
// sRGB Uint8 vertex colours (palette + baked shading), Uint8 team-colour weights and Uint16 indices, all base64.
export interface ZerglingPartData { name: string; parent: string | null; basic: boolean; castShadow: boolean; offset: number[]; scale: number; pos: string; nrm: string; col: string; team: string; idx: string; verts: number; tris: number; }
export const ZERGLING_PARTS: ZerglingPartData[] = ${JSON.stringify(out)};
`;
await Bun.write(new URL('../../src/graphics/zerglingData.ts', import.meta.url), file);
console.log('wrote src/graphics/zerglingData.ts', Math.round(file.length / 1024) + ' KB');
