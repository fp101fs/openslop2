import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ZERGLING_PARTS, type ZerglingPartData } from './zerglingData';

/**
 * Zergling built from a high-poly sculpt that was decimated offline (tools/model/build-zergling.ts) to ~6k triangles in
 * 14 rigid parts. Every part is a vertex-coloured mesh with baked shading, so one shared material and one shared
 * geometry set serve every zergling (14 draw calls each, versus ~70 for the old primitive-built model).
 *
 * Three LOD levels share that geometry: the full rig, a merged 6-mesh rig and a single static mesh.
 * Joint hierarchy (all named zl_*, rest pose = zero rotation) for ZerglingAnimator:
 *   body > head > (jaw, eyes) | tail0 > tail1 > tail2 > tail3 | arm_l | arm_r | leg_l > foot_l | leg_r > foot_r
 */
const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

let cache: { geos: Map<string, THREE.BufferGeometry>; skin: THREE.MeshStandardMaterial; eye: THREE.MeshBasicMaterial } | null = null;

function decode(p: ZerglingPartData): THREE.BufferGeometry {
  const posQ = new Int16Array(b64(p.pos).buffer), nrmQ = new Int8Array(b64(p.nrm).buffer), colQ = b64(p.col), idx = new Uint16Array(b64(p.idx).buffer);
  const pos = new Float32Array(posQ.length), nrm = new Float32Array(nrmQ.length), col = new Float32Array(colQ.length);
  for (let i = 0; i < posQ.length; i++) pos[i] = posQ[i]! * p.scale;
  for (let i = 0; i < nrmQ.length; i += 3) {
    const x = nrmQ[i]!, y = nrmQ[i + 1]!, z = nrmQ[i + 2]!, l = Math.hypot(x, y, z) || 1;
    nrm[i] = x / l; nrm[i + 1] = y / l; nrm[i + 2] = z / l;
  }
  const c = new THREE.Color();
  for (let i = 0; i < colQ.length; i += 3) {
    c.setRGB(colQ[i]! / 255, colQ[i + 1]! / 255, colQ[i + 2]! / 255, THREE.SRGBColorSpace);
    col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
  }
  const teamQ = b64(p.team), team = new Float32Array(teamQ.length);
  for (let i = 0; i < teamQ.length; i++) team[i] = teamQ[i]! / 255;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('teamMask', new THREE.BufferAttribute(team, 1)); // carapace areas that take the owner's colour (TeamColor 'mask' mode)
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

function res() {
  if (cache) return cache;
  const geos = new Map<string, THREE.BufferGeometry>();
  for (const p of ZERGLING_PARTS) geos.set(p.name, decode(p));
  cache = {
    geos,
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.08 }),
    eye: new THREE.MeshBasicMaterial({ vertexColors: true })
  };
  cache.skin.userData.teamMaskAttr = true; // geometry carries a 'teamMask' attribute
  return cache;
}

/** Absolute (root-space) pivot of each part: sum of joint offsets up the chain. */
const absPivot = (() => {
  const abs = new Map<string, [number, number, number]>();
  for (const p of ZERGLING_PARTS) {
    const par = p.parent ? abs.get(p.parent)! : [0, 0, 0];
    abs.set(p.name, [par[0]! + p.offset[0]!, par[1]! + p.offset[1]!, par[2]! + p.offset[2]!]);
  }
  return abs;
})();

/** Rest-pose merge of several parts into one geometry expressed relative to `ref`'s pivot (merged LOD bones). */
function merged(names: string[], ref: string): THREE.BufferGeometry {
  const R = res(), r = absPivot.get(ref)!;
  const list = names.map(n => {
    const g = R.geos.get(n)!.clone(), a = absPivot.get(n)!;
    g.translate(a[0]! - r[0]!, a[1]! - r[1]!, a[2]! - r[2]!);
    return g;
  });
  return mergeGeometries(list, false)!;
}

let lodGeos: Map<string, THREE.BufferGeometry> | null = null;
function lodRes() {
  if (lodGeos) return lodGeos;
  const m = new Map<string, THREE.BufferGeometry>();
  m.set('body', merged(['body', 'head', 'jaw', 'eyes'], 'body'));
  m.set('tail0', merged(['tail0', 'tail1', 'tail2', 'tail3'], 'tail0'));
  for (const s of ['l', 'r']) { m.set('arm_' + s, merged(['arm_' + s], 'arm_' + s)); m.set('leg_' + s, merged(['leg_' + s, 'foot_' + s], 'leg_' + s)); }
  m.set('static', merged(ZERGLING_PARTS.map(p => p.name), 'body'));
  for (const g of m.values()) g.computeBoundingSphere();
  return (lodGeos = m);
}

const mkMesh = (g: THREE.BufferGeometry, shadow: boolean) => {
  const m = new THREE.Mesh(g, res().skin);
  m.castShadow = shadow;
  m.userData.noSurfaceDetail = true; // vertex colours carry the look; skip the generic grime/bump pass (and its per-unit geometry copy)
  return m;
};

/** Full rig: 14 jointed parts (close-ups). */
function buildRig(): THREE.Group {
  const R = res();
  const root = new THREE.Group();
  const joints = new Map<string, THREE.Group>();
  for (const p of ZERGLING_PARTS) {
    const j = new THREE.Group();
    j.name = 'zl_' + p.name;
    j.position.set(p.offset[0]!, p.offset[1]!, p.offset[2]!);
    const m = p.basic ? new THREE.Mesh(R.geos.get(p.name)!, R.eye) : mkMesh(R.geos.get(p.name)!, p.castShadow);
    m.userData.noSurfaceDetail = true;
    j.add(m);
    joints.set(p.name, j);
    (p.parent ? joints.get(p.parent)! : root).add(j);
  }
  return root;
}

/** Mid-distance rig: body+head+jaw merged, tail merged, arms, legs+feet merged = 6 draw calls, gait still animates. */
function buildMidRig(): THREE.Group {
  const L = lodRes(), root = new THREE.Group();
  const body = new THREE.Group(); body.name = 'zl_body';
  const bp = absPivot.get('body')!;
  body.position.set(bp[0]!, bp[1]!, bp[2]!);
  body.add(mkMesh(L.get('body')!, true));
  for (const n of ['tail0', 'arm_l', 'arm_r', 'leg_l', 'leg_r']) {
    const a = absPivot.get(n)!, j = new THREE.Group();
    j.name = 'zl_' + n; j.position.set(a[0]! - bp[0]!, a[1]! - bp[1]!, a[2]! - bp[2]!);
    j.add(mkMesh(L.get(n)!, false));
    body.add(j);
  }
  root.add(body);
  return root;
}

/** Far / zoomed-out: one static mesh (1 draw call). */
function buildStatic(): THREE.Group {
  const root = new THREE.Group(), g = new THREE.Group(), bp = absPivot.get('body')!;
  g.position.set(bp[0]!, bp[1]!, bp[2]!);
  g.add(mkMesh(lodRes().get('static')!, false));
  root.add(g);
  return root;
}

export const ZERGLING_LOD_DISTANCES = [0, 30, 64];

/** Three-level LOD (full rig / merged rig / static). ZerglingAnimator animates whichever rig is showing. */
export function buildZergling(): THREE.Object3D {
  const lod = new THREE.LOD();
  const rigs = [buildRig(), buildMidRig(), buildStatic()];
  rigs.forEach((r, i) => lod.addLevel(r, ZERGLING_LOD_DISTANCES[i]!));
  lod.userData.isZergling = true;
  lod.userData.zlRigs = rigs;
  return lod;
}
