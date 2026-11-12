import * as THREE from 'three';
import { buildRigged, type RigKind } from './RiggedModels';

/**
 * Terran add-ons modelled after the SC2 renders: the Reactor is a squat grey octagonal pedestal with a green-lit band, a red
 * armoured dome with a glowing green ring on top, and two ribbed black hoses ending in orange-trimmed connector boxes; the
 * Tech Lab is a red armoured capsule on a grey plate with a tall slanted sail-blade, a star emblem over a green light and
 * the same hoses. The hoses point towards -X (the add-on sits to the +X side of its parent), so they are not yawed with the body.
 */

const mats = (() => {
  const std = (color: number, rough = 0.55, metal = 0.25, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  return {
    red: std(0x9a2f26, 0.5, 0.3),
    redDark: std(0x6a1c18, 0.55, 0.3),
    grey: std(0x7c8088, 0.5, 0.4),
    greyLight: std(0xaeb2b8, 0.45, 0.45),
    dark: std(0x24262a, 0.6, 0.3),
    hose: std(0x15161a, 0.7, 0.2),
    orange: std(0xd98a1c, 0.5, 0.3),
    green: new THREE.MeshStandardMaterial({ color: 0x1b6b3a, emissive: 0x3dff80, emissiveIntensity: 1.8, roughness: 0.4 }),
    greenDim: new THREE.MeshStandardMaterial({ color: 0x1b6b3a, emissive: 0x3dff80, emissiveIntensity: 0.9, roughness: 0.4 })
  };
})();

/** Add-ons are built once with the red palette; each instance swaps the red armour for the owner's colour. */
const teamMats: Record<string, THREE.MeshStandardMaterial> = {};
function paintTeam(root: THREE.Object3D, isPlayer: boolean) {
  const c = new THREE.Color(isPlayer ? 0x3a68e0 : 0xd8352e);
  const mk = (k: string, mul: number) => (teamMats[k] ??= new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(mul), roughness: 0.5, metalness: 0.3 }));
  // add-ons loaded from their GLB were exported in the player's blue: swap those two materials for the owner's colour
  const near = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 0.02;
  const PB = new THREE.Color(0x3a68e0), PBD = PB.clone().multiplyScalar(0.62);
  root.traverse(o => {
    const m = o as THREE.Mesh;
    const col = m.isMesh && (m.material as THREE.MeshStandardMaterial).color;
    if (!col) return;
    if (near(col, PB)) m.material = mk(isPlayer ? 'pr' : 'er', 1);
    else if (near(col, PBD)) m.material = mk(isPlayer ? 'prd' : 'erd', 0.62);
  });
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === mats.red) m.material = mk(isPlayer ? 'pr' : 'er', 1);
    else if (m.material === mats.redDark) m.material = mk(isPlayer ? 'prd' : 'erd', 0.62);
  });
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.userData.noSurfaceDetail = true;
  return o;
};

/** Eight-pointed SC2 "star" emblem as a flat extruded shape. */
function starGeometry(r: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const pts = 8;
  for (let i = 0; i < pts * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.38;
    const a = (i / (pts * 2)) * Math.PI * 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false });
}

/** A ribbed black hose from `a` to `b` (stack of tori along a sagging curve) ending in a grey connector box with an orange stripe. */
function hose(a: THREE.Vector3, b: THREE.Vector3, sag = -0.18): THREE.Group {
  const g = new THREE.Group();
  const mid = a.clone().lerp(b, 0.5); mid.y += sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const ring = new THREE.TorusGeometry(0.1, 0.035, 6, 10);
  const n = 11;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPoint(t), tan = curve.getTangent(t);
    const r = mesh(ring, mats.hose, p.x, p.y, p.z);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    g.add(r);
  }
  const core = new THREE.TubeGeometry(curve, 16, 0.075, 6, false);
  g.add(mesh(core, mats.hose));
  // connector block at the parent end
  const dir = b.clone().sub(a).normalize();
  const box = new THREE.Group();
  box.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), mats.grey));
  box.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.32), mats.orange, 0.16, 0, 0));
  box.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.32), mats.orange, -0.1, 0, 0));
  box.add(mesh(new THREE.BoxGeometry(0.1, 0.18, 0.18), mats.dark, -0.24, 0, 0));
  box.position.copy(b).addScaledVector(dir, 0.1);
  box.rotation.y = Math.atan2(-dir.z, dir.x) + Math.PI; // box length axis along the hose
  g.add(box);
  return g;
}

/** Hoses in the "hose frame" (x runs from the add-on back towards its parent): they start on the add-on body (`start`, scaled by `s`) and end at `reach`, where the connector boxes meet the parent's wall. */
function hoses(s = 1, start = 0.65, reach = 1.45, latEnd = 0.78, endY?: number): THREE.Group {
  const g = new THREE.Group();
  const lat = 0.5 * s;
  g.add(hose(new THREE.Vector3(-start, 0.78 * s, lat), new THREE.Vector3(-reach, endY ?? 0.62 * s + 0.08, latEnd), -0.16 * Math.max(s, 0.6)));
  g.add(hose(new THREE.Vector3(-start, 0.5 * s, -lat), new THREE.Vector3(-reach, endY !== undefined ? endY - 0.18 : 0.4 * s + 0.08, -latEnd), -0.14 * Math.max(s, 0.6)));
  return g;
}

function base(g: THREE.Group) {
  g.add(mesh(new THREE.CylinderGeometry(0.98, 1.05, 0.18, 8), mats.dark, 0, 0.09, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.88, 0.96, 0.22, 8), mats.grey, 0, 0.29, 0));
  g.add(mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 8).rotateX(Math.PI / 2), mats.orange, 0, 0.4, 0));
}

/** The add-on from its standalone GLB (models/<kind>.glb, an export of the code-built model below), or null if it isn't loaded. */
function fromGlb(kind: RigKind, isPlayer: boolean): THREE.Group | null {
  const rig = buildRigged(kind);
  if (!rig) return null;
  const root = new THREE.Group();
  root.add(rig);
  root.userData.sized = true;
  paintTeam(root, isPlayer);
  return root;
}

export function buildReactorModel(isPlayer = true): THREE.Group {
  const glb = fromGlb('reactor', isPlayer); if (glb) return glb;
  const root = new THREE.Group();
  const body = new THREE.Group();
  base(body);
  // lower grey body band with green status lights
  body.add(mesh(new THREE.CylinderGeometry(0.74, 0.82, 0.5, 8), mats.grey, 0, 0.66, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.22 - 0.35;
    body.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.green, Math.cos(a) * 0.76, 0.78, Math.sin(a) * 0.76));
  }
  body.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.08), mats.dark, 0.74, 0.62, 0));     // front hatch
  const star = mesh(starGeometry(0.2), mats.greyLight, 0, 0.5, 0.82); star.rotation.y = 0; body.add(star);
  // red armoured dome: wide waist, rounded shoulders
  body.add(mesh(new THREE.CylinderGeometry(0.82, 0.78, 0.4, 8), mats.red, 0, 1.1, 0));
  const dome = mesh(new THREE.SphereGeometry(0.84, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.red, 0, 1.3, 0);
  dome.scale.set(1, 0.78, 1);
  body.add(dome);
  // panel seams
  for (const y of [1.1, 1.32]) body.add(mesh(new THREE.TorusGeometry(0.83 - (y - 1.1) * 0.25, 0.018, 5, 14).rotateX(Math.PI / 2), mats.redDark, 0, y, 0));
  // dark plates on the dome and the green ring "eye" on top
  body.add(mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.08, 14), mats.dark, 0, 1.93, 0));
  body.add(mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 20).rotateX(Math.PI / 2), mats.green, 0, 1.98, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), mats.greenDim, 0, 1.97, 0));
  // front vertical slot
  body.add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.28), mats.dark, 0.78, 1.28, 0));
  body.rotation.y = -Math.PI / 4;
  root.add(body);
  const hz = hoses(); hz.rotation.y = -0.54; // hoses run back to the parent, which sits up-grid at (-2.12, -1.41)
  root.add(hz);
  root.userData.sized = true;
  paintTeam(root, isPlayer);
  return root;
}

/**
 * Tech Lab fit per host building. The lab is always built on the same grid cell, but the hosts differ in size, so each host gets its own
 * `scale` (SC2 add-ons are clearly smaller than the building, the Factory one is the reference at 1), `shift` (how far the lab slides
 * towards the host, in world units) and `reach` (distance from the lab's grid centre to the host wall where the hose connectors end) `spread` (sideways distance between the two connectors) and optional `endY` (height of the connectors on the host wall).
 * Tune with tools: spawn the host + techlab on a flat map and look at the connectors.
 */
export const TECHLAB_FIT: Record<string, { scale: number; shift: number; reach: number; spread: number; endY?: number }> = {
  factory: { scale: 1, shift: 0, reach: 1.45, spread: 0.78 },
  barracks: { scale: 0.72, shift: 0.3, reach: 1.9, spread: 0.55 },
  starport: { scale: 0.58, shift: 0.7, reach: 2.2, spread: 0.32, endY: 0.95 }
};

export function buildTechLabModel(isPlayer = true, host?: string): THREE.Group {
  const glb = fromGlb(host === 'barracks' ? 'techlab_barracks' : host === 'starport' ? 'techlab_starport' : 'techlab', isPlayer); if (glb) return glb;
  const fit = TECHLAB_FIT[host ?? 'factory'] ?? TECHLAB_FIT.factory!;
  const root = new THREE.Group();
  const body = new THREE.Group();
  base(body);
  // red armoured capsule body
  const core = mesh(new THREE.SphereGeometry(0.72, 14, 10), mats.red, 0, 0.98, 0);
  core.scale.set(1.15, 0.85, 1);
  body.add(core);
  body.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 1.15), mats.red, -0.12, 0.85, 0));
  body.add(mesh(new THREE.BoxGeometry(0.5, 0.32, 1.2), mats.redDark, 0.42, 0.62, 0));
  // grey emblem plate with the star above a green light, on the front face
  const plate = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16).rotateX(Math.PI / 2), mats.grey, 0.0, 0.95, 0.74);
  body.add(plate);
  const star = mesh(starGeometry(0.22), mats.greyLight, 0, 0.95, 0.77); body.add(star);
  body.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateX(Math.PI / 2), mats.green, 0.0, 0.5, 0.74));
  // tall slanted sail-blade (red outside, grey edge, hazard stripe)
  const blade = new THREE.Group();
  blade.add(mesh(new THREE.BoxGeometry(0.16, 1.55, 0.92), mats.red, 0, 0.78, 0));
  blade.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 0.96), mats.greyLight, 0, 1.58, 0));
  blade.add(mesh(new THREE.BoxGeometry(0.18, 0.1, 0.94), mats.orange, 0, 1.22, 0));
  blade.add(mesh(new THREE.BoxGeometry(0.18, 0.4, 0.14), mats.dark, 0, 0.55, 0.3));
  blade.position.set(-0.34, 0.9, -0.1);
  blade.rotation.z = -0.32;
  body.add(blade);
  // green light bar and angled side armour
  body.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.06), mats.green, 0.5, 0.82, -0.62));
  body.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.12), mats.redDark, 0.3, 1.0, 0.64));
  // everything lives in the hose frame (+x = away from the parent) so the body can slide towards the host and shrink without the hoses detaching
  const inner = new THREE.Group();
  inner.rotation.y = -0.54; // the parent sits up-grid at (-2.12, -1.41)
  body.rotation.y = -Math.PI / 4 + 0.54;
  body.scale.setScalar(fit.scale);
  body.position.x = -fit.shift;
  inner.add(body);
  inner.add(hoses(fit.scale, fit.shift + 0.65 * fit.scale, fit.reach, fit.spread, fit.endY));
  root.add(inner);
  root.userData.sized = true;
  paintTeam(root, isPlayer);
  return root;
}

/**
 * Planetary Fortress armour (SC2 render): the Command Center body wrapped in heavy red plates, a big red gun-turret block on top
 * with a glowing amber visor, thruster-pod cylinders on the diagonals and a hazard-striped hatch. `w` = footprint width, `h` = body height.
 */
export function buildPlanetaryArmor(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const glow = new THREE.MeshStandardMaterial({ color: 0x6b4a10, emissive: 0xffb43a, emissiveIntensity: 1.6, roughness: 0.4 });
  const hazard = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!; x.fillStyle = '#d9a21c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#111';
    for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 8, 64); x.lineTo(i + 72, 0); x.lineTo(i + 64, 0); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.2 });
  })();
  const maroon = new THREE.MeshStandardMaterial({ color: 0x74302a, roughness: 0.62, metalness: 0.35 });
  const maroonDk = new THREE.MeshStandardMaterial({ color: 0x4e1e1b, roughness: 0.65, metalness: 0.35 });
  const r = w * 0.5;
  // top gun block
  const top = new THREE.Group();
  top.add(mesh(new THREE.BoxGeometry(r * 0.95, h * 0.15, r * 0.72), maroon, 0, 0, 0));
  top.add(mesh(new THREE.BoxGeometry(r * 0.66, h * 0.07, r * 0.5), maroonDk, 0, h * 0.1, -r * 0.04));
  top.add(mesh(new THREE.BoxGeometry(r * 0.34, h * 0.035, r * 0.28), mats.greyLight, 0, h * 0.14, 0));
  top.add(mesh(new THREE.BoxGeometry(r * 0.7, h * 0.035, 0.05), glow, 0, -h * 0.01, r * 0.37));   // amber visor
  top.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, h * 0.25, 5), mats.dark, r * 0.35, h * 0.28, -r * 0.1)); // antenna
  top.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, r * 0.45, 10).rotateX(Math.PI / 2), mats.dark, 0, -h * 0.01, r * 0.55)); // barrel
  top.position.set(0, h * 0.8, 0);
  g.add(top);
  // four thruster pods on the diagonals + red shoulder plates on the faces
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const pod = new THREE.Group();
    pod.add(mesh(new THREE.CylinderGeometry(r * 0.15, r * 0.15, r * 0.42, 14).rotateZ(Math.PI / 2), mats.dark, 0, 0, 0));
    for (const d of [-0.2, 0, 0.2]) pod.add(mesh(new THREE.TorusGeometry(r * 0.155, 0.03, 6, 16).rotateY(Math.PI / 2), mats.greyLight, r * d, 0, 0));
    pod.add(mesh(new THREE.BoxGeometry(0.05, r * 0.13, r * 0.09), glow, r * 0.22, 0, 0));
    pod.position.set(Math.cos(a) * r * 0.9, h * 0.3, Math.sin(a) * r * 0.9);
    pod.rotation.y = -a + Math.PI / 2;
    g.add(pod);
    const f = i * Math.PI / 2;
    const plate = new THREE.Group();
    plate.add(mesh(new THREE.BoxGeometry(r * 0.38, h * 0.2, 0.1), maroonDk, 0, 0, 0));
    plate.add(mesh(new THREE.BoxGeometry(r * 0.14, h * 0.05, 0.12), mats.greyLight, 0, h * 0.04, 0));
    plate.position.set(Math.cos(f) * r * 0.86, h * 0.55, Math.sin(f) * r * 0.86);
    plate.rotation.y = -f + Math.PI / 2;
    g.add(plate);
  }
  // hazard-striped hatch on one face
  const hatch = mesh(new THREE.BoxGeometry(r * 0.36, h * 0.09, 0.1), hazard, 0, h * 0.12, r * 0.9);
  g.add(hatch);
  return g;
}
