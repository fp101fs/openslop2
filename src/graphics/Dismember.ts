import * as THREE from 'three';
import { ProceduralGrassSystem } from './ProceduralGrass';
import type { LiquidMelt } from './LiquidMelt';

/**
 * Gory deaths for rigged units: the model is baked into its current pose, split by bone into
 * body parts and regrouped by the kind of death:
 *  - shred:   torn into many pieces by a huge hit
 *  - blast:   2-4 parts are blown off
 *  - decap:   the head pops off, the body topples with the neck spurting
 *  - halve:   cut in two at the waist, upper half thrown, the lower half topples / flops
 *  - partial: 1-2 pieces drop off and the rest falls over
 *  - fall:    nothing comes off, the body just topples
 * Each unit has a RigProfile (bone names -> parts, which parts go where, blood colour).
 * Every part is a small rigid body (gravity, spin, ground contact with friction).
 */

export type DismemberKind = 'shred' | 'blast' | 'decap' | 'halve' | 'partial' | 'fall';
export type Fluid = 'blood' | 'ichor';

export interface RigProfile {
  /** Fine body part of a bone (`restMinY` = lowest rest-pose vertex of the mesh / triangle). */
  region(bone: string, restMinY: number): string;
  /** Split by triangle (one skinned mesh) instead of by whole mesh (model made of separate parts). */
  perTriangle?: boolean;
  /** Fine part -> whole part for every kind but shred (forearm goes with the arm). */
  whole: Record<string, string>;
  /** Parts that can be blown off in a blast. */
  limbs: string[];
  /** Parts that leave together on a decapitation. */
  head: string[];
  /** Whole parts below the waist cut. */
  lower: string[];
  /** Pool a partial death draws 1-2 parts from (repeat entries to weight them). */
  partial: string[];
  /** Carried items: no blood, come loose. */
  gear: string[];
  /** Big chunks in a shred (thud instead of tumbling far). */
  heavy: string[];
  fluid: Fluid;
  /** Bones (name regexes): neck stump and waist cut, for spurting stumps at the right place. */
  neckBone?: RegExp; headBone?: RegExp; waistBone?: RegExp;
  /** Topple only to the unit's left or right: facing = from `back` bone towards `front` bone. */
  sideways?: { back: RegExp; front: RegExp };
  /** Lower half after a cut flops about on the ground instead of toppling over. */
  lowerFlops?: boolean;
}

export const MARINE_RIG: RigProfile = {
  region(bone, restMinY) {
    const b = bone.replace(/^mixamorig/, '');
    if (/^Left(ForeArm|Hand)/.test(b)) return 'lfore';
    if (/^Right(ForeArm|Hand)/.test(b)) return 'rfore';
    if (/^Left(Shoulder|Arm)/.test(b)) return 'larm';
    if (/^Right(Shoulder|Arm)/.test(b)) return 'rarm';
    if (/^Left(Leg|Foot|Toe)/.test(b)) return 'lshin';
    if (/^Right(Leg|Foot|Toe)/.test(b)) return 'rshin';
    if (/^LeftUpLeg/.test(b)) return 'lleg';
    if (/^RightUpLeg/.test(b)) return 'rleg';
    // the helmet pieces are weighted to the spine; they are the ones sitting above the chest plate
    if (/^(Head|Neck)/.test(b) || (/^Spine/.test(b) && restMinY > 2.3)) return 'head';
    if (/^Bone/.test(b)) return 'gun';
    if (/^Hips/.test(b)) return 'hips';
    return 'torso';
  },
  whole: { lfore: 'larm', rfore: 'rarm', lshin: 'lleg', rshin: 'rleg' },
  limbs: ['head', 'larm', 'rarm', 'lleg', 'rleg'],
  head: ['head'],
  lower: ['hips', 'lleg', 'rleg'],
  partial: ['larm', 'rarm', 'gun', 'head', 'larm', 'rarm', 'lleg', 'rleg'],
  gear: ['gun'],
  heavy: ['torso', 'hips'],
  fluid: 'blood',
};

/** Hydralisk (models/hydralisk.glb): one skinned mesh, faces +Z, +X is its left. */
export const HYDRALISK_RIG: RigProfile = {
  region(bone) {
    if (/^(Head|Jaw|Unit_Zerg_Hydralisk_Jaw)/.test(bone)) return 'head';
    if (/^Karapis_Bone01/.test(bone)) return 'lplate';            // hood side plates
    if (/^Karapis_Bone02/.test(bone)) return 'rplate';
    if (/^(Neck02|Unit_Zerg_Hydralisk_Crest|Spikes)/.test(bone)) return 'hood';
    if (/^(ForeArmLft|HandLft)/.test(bone)) return 'lfore';        // scythes
    if (/^(ForeArmRt|HandRt)/.test(bone)) return 'rfore';
    if (/^(ShoulderLft|ArmLft)/.test(bone)) return 'larm';
    if (/^(ShoulderRt|ArmRT)/.test(bone)) return 'rarm';
    if (/^(Tail0[56]|TailTIP)/.test(bone)) return 'tailtip';
    if (/^Tail0[34]/.test(bone)) return 'tail';
    if (/^(Root|Tail0[12])/.test(bone)) return 'lower';
    if (/^(SpineUp01|Dummy01)/.test(bone)) return 'belly';
    return 'chest';                                                 // SpineUp02-03, Neck01
  },
  perTriangle: true,
  whole: { lfore: 'larm', rfore: 'rarm', belly: 'lower', tail: 'lower', tailtip: 'lower' },
  limbs: ['head', 'larm', 'rarm', 'lplate', 'rplate', 'hood'],
  head: ['head', 'hood', 'lplate', 'rplate'],
  lower: ['lower'],
  partial: ['larm', 'rarm', 'larm', 'rarm', 'lplate', 'rplate', 'hood', 'head'],
  gear: [],
  heavy: ['chest', 'lower', 'belly'],
  fluid: 'ichor',
  neckBone: /^Neck01/, headBone: /^Neck02/, waistBone: /^SpineUp02/,
  sideways: { back: /^TailTIP/, front: /^Head_/ },
  lowerFlops: true,
};

interface Body {
  obj: THREE.Group;
  vel: THREE.Vector3;
  ang: THREE.Vector3;         // angular velocity (world, rad/s)
  invI: number;               // inverse moment of inertia (unit mass, approx sphere-ish)
  pts: THREE.Vector3[];       // local contact points (bbox corners)
  still: number;              // seconds spent nearly motionless
  age: number;
  bleed: number;              // seconds of blood trail left
  landed: boolean;
  pooled: boolean;
  poolDelay: number;          // contacts before this age don't make the landing pool (standing feet)
  spurt?: { at: THREE.Vector3; dir: THREE.Vector3; t: number }; // gushing stump (local point / direction)
  heavy: boolean;             // body / half body: lands with a thud, no bounce
  fluid: Fluid;
  rest?: boolean;             // settled for good, no more physics
  groundT?: number;           // time spent touching the ground
  tip?: { pivot: THREE.Vector3; axis: THREE.Vector3; theta: number; omega: number; pen0: number }; // toppling over its feet
  lieDown?: THREE.Vector3;    // forward at death: if it comes to rest upright, tip it onto its left / right side
}
interface Drop { m: THREE.Mesh; vel: THREE.Vector3; }
/** Stump: 'top' / 'bottom' of the part, or a world point + outward direction. */
type Stump = 'top' | 'bottom' | { at: THREE.Vector3; dir: THREE.Vector3 };
interface Launch { vel: THREE.Vector3; ang: THREE.Vector3; lieDown?: THREE.Vector3; bleed?: number; pool?: boolean; poolDelay?: number; spurt?: Stump; tip?: THREE.Vector3; heavy?: boolean; }

const G = 14;
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function randDir() { return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); }
/** Random spin rate: sometimes none, often a little, sometimes a lot (axis picked separately). */
function spinRate() {
  const r = Math.random();
  return r < 0.2 ? rnd(0, 0.3) : r < 0.6 ? rnd(1, 4) : r < 0.9 ? rnd(5, 10) : rnd(12, 20);
}
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** Baked world-space copy of the triangles `tris` (or all of them) of a skinned mesh. */
function bake(sm: THREE.SkinnedMesh, tris: number[] | null): THREE.BufferGeometry {
  const geo = sm.geometry, pos = geo.attributes.position!, uv = geo.attributes.uv;
  const out = new THREE.BufferGeometry();
  if (!tris) {
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      sm.getVertexPosition(i, _v).applyMatrix4(sm.matrixWorld);
      arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
    }
    out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (uv) out.setAttribute('uv', uv);
    if (geo.index) out.setIndex(geo.index);
    for (const g of geo.groups) out.addGroup(g.start, g.count, g.materialIndex);
  } else {
    // compact: only the vertices these triangles use
    const idx = geo.index, remap = new Map<number, number>(), verts: number[] = [], index: number[] = [];
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      let n = remap.get(v);
      if (n === undefined) { n = verts.length; remap.set(v, n); verts.push(v); }
      index.push(n);
    }
    const arr = new Float32Array(verts.length * 3), uvs = uv ? new Float32Array(verts.length * 2) : null;
    verts.forEach((v, i) => {
      sm.getVertexPosition(v, _v).applyMatrix4(sm.matrixWorld);
      arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
      if (uvs && uv) { uvs[i * 2] = uv.getX(v); uvs[i * 2 + 1] = uv.getY(v); }
    });
    out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.setIndex(index);
  }
  out.computeVertexNormals();
  return out;
}

export class Dismember {
  private bodies: Body[] = [];
  private drops: Drop[] = [];
  private dropGeo = new THREE.SphereGeometry(1, 5, 4);
  private dropMats: Record<Fluid, THREE.Material> = {
    blood: new THREE.MeshBasicMaterial({ color: 0x5a0306 }),
    ichor: new THREE.MeshBasicMaterial({ color: 0x4f8a14 }),
  };
  private static MAX_BODIES = 140;

  constructor(private scene: THREE.Scene, private melt: LiquidMelt) {}

  public clear() {
    for (const b of this.bodies) this.scene.remove(b.obj);
    for (const d of this.drops) this.scene.remove(d.m);
    this.bodies = []; this.drops = [];
  }

  /** Breaks `mesh` apart. Returns false (and does nothing) if it has no skinned pieces. */
  public explode(mesh: THREE.Object3D, center: THREE.Vector3, kind: DismemberKind = 'blast', rig: RigProfile = MARINE_RIG): boolean {
    mesh.updateMatrixWorld(true);
    const parts = new Map<string, THREE.BufferGeometry[]>();
    const mats = new Map<string, THREE.Material[]>();
    const bones = new Map<string, THREE.Vector3>();
    const fineOf = (fine: string) => kind === 'shred' ? fine : rig.whole[fine] ?? fine;
    const add = (region: string, g: THREE.BufferGeometry, m: THREE.Material) => {
      if (!parts.has(region)) { parts.set(region, []); mats.set(region, []); }
      parts.get(region)!.push(g); mats.get(region)!.push(m);
    };
    mesh.traverse(o => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.visible) return;
      for (const b of sm.skeleton.bones) if (!bones.has(b.name)) bones.set(b.name, b.getWorldPosition(new THREE.Vector3()));
      const geo = sm.geometry, pos = geo.attributes.position!, si = geo.attributes.skinIndex!, sw = geo.attributes.skinWeight!;
      const boneName = (i: number) => sm.skeleton.bones[i]?.name ?? '';
      if (!rig.perTriangle) {
        // whole mesh: dominant bone and rest-pose height decide the body part
        const tot = new Map<number, number>();
        let minY = Infinity;
        for (let i = 0; i < pos.count; i++) {
          minY = Math.min(minY, pos.getY(i));
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) tot.set(si.getComponent(i, k), (tot.get(si.getComponent(i, k)) ?? 0) + w); }
        }
        let best = 0, bw = -1;
        for (const [b, w] of tot) if (w > bw) { bw = w; best = b; }
        add(fineOf(rig.region(boneName(best), minY)), bake(sm, null), sm.material as THREE.Material);
        return;
      }
      // one mesh for the whole body: each triangle goes to the part its vertices are weighted to most
      const regionOfBone = new Map<number, string>();
      const regionOf = (b: number) => { let r = regionOfBone.get(b); if (r === undefined) { r = fineOf(rig.region(boneName(b), 0)); regionOfBone.set(b, r); } return r; };
      const idx = geo.index, nTri = (idx ? idx.count : pos.count) / 3;
      const matOf = (t: number) => {
        if (!Array.isArray(sm.material)) return sm.material as THREE.Material;
        const g = geo.groups.find(g => t * 3 >= g.start && t * 3 < g.start + g.count);
        return sm.material[g?.materialIndex ?? 0]!;
      };
      const tris = new Map<string, Map<THREE.Material, number[]>>();
      const score = new Map<string, number>();
      for (let t = 0; t < nTri; t++) {
        score.clear();
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
          for (let j = 0; j < 4; j++) { const w = sw.getComponent(v, j); if (w > 0) { const r = regionOf(si.getComponent(v, j)); score.set(r, (score.get(r) ?? 0) + w); } }
        }
        let best = '', bw = -1;
        for (const [r, w] of score) if (w > bw) { bw = w; best = r; }
        const m = matOf(t);
        if (!tris.has(best)) tris.set(best, new Map());
        const byMat = tris.get(best)!;
        if (!byMat.has(m)) byMat.set(m, []);
        byMat.get(m)!.push(t);
      }
      for (const [region, byMat] of tris) for (const [m, list] of byMat) add(region, bake(sm, list), m);
    });
    if (!parts.size) return false;
    this.scene.remove(mesh);
    const bone = (re?: RegExp) => { if (re) for (const [n, p] of bones) if (re.test(n)) return p; return null; };

    // Blast / cut comes from a random side, a little below the chest
    const blast = new THREE.Vector3(center.x + (Math.random() - 0.5) * 0.8, center.y + 0.2, center.z + (Math.random() - 0.5) * 0.8);
    const side = new THREE.Vector3(center.x - blast.x, 0, center.z - blast.z);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    // bodies that only fall sideways: to the unit's left or right, whichever is away from the hit
    let fallDir = side, jitter = 0.5, fwd: THREE.Vector3 | undefined;
    if (rig.sideways) {
      const back = bone(rig.sideways.back), front = bone(rig.sideways.front);
      if (back && front) {
        const f = front.clone().sub(back).setY(0);
        if (f.lengthSq() > 1e-4) {
          fwd = f.normalize();
          const right = fwd.clone().cross(_up);
          fallDir = right.dot(side) < 0 || (Math.abs(right.dot(side)) < 0.2 && Math.random() < 0.5) ? right.negate() : right;
          jitter = 0.2;
        }
      }
    }

    const groups = new Map<string, string[]>();
    const put = (key: string, r: string) => { if (!parts.has(r)) return; if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(r); };
    const all = [...parts.keys()];
    const gear = new Set(rig.gear), headSet = new Set(rig.head), lower = new Set(rig.lower);
    const limbs = shuffle(rig.limbs.filter(r => parts.has(r)));

    if (kind === 'shred') {
      for (const r of all) put(r, r);
    } else if (kind === 'blast') {
      const off = new Set<string>(limbs.slice(0, 2 + Math.floor(Math.random() * 3)));
      for (const g of gear) off.add(g);
      for (const r of all) put(off.has(r) ? r : 'body', r);
    } else if (kind === 'decap') {
      for (const r of all) put(headSet.has(r) ? 'head' : gear.has(r) && Math.random() < 0.6 ? r : 'body', r);
    } else if (kind === 'halve') {
      for (const r of all) put(gear.has(r) ? r : lower.has(r) ? 'lower' : 'upper', r);
    } else if (kind === 'partial') {
      // one or two pieces drop off
      const pool = shuffle([...rig.partial]).filter(r => parts.has(r));
      const off = new Set<string>();
      const n = Math.random() < 0.5 ? 1 : 2;
      for (const r of pool) if (off.size < n) off.add(r);
      for (const r of all) put(off.has(r) ? r : 'body', r);
    } else {
      for (const r of all) put('body', r);
    }

    // a toppling body: tips away from the hit (or to its side), sliding a little
    const topple = (rate: number): Launch => ({
      vel: new THREE.Vector3(), ang: new THREE.Vector3(),
      tip: fallDir.clone().applyAxisAngle(_up, rnd(-jitter, jitter)).multiplyScalar(rate),
      pool: true, poolDelay: 0.5, heavy: true,
    });
    // a piece thrown outward from the death spot: random heading (always away), launch angle, power and spin
    const thrown = (c: THREE.Vector3, power: number, up: number): Launch => {
      const out = c.clone().sub(blast).setY(0);
      if (out.lengthSq() < 1e-4) out.copy(side);
      out.normalize().applyAxisAngle(_up, rnd(-0.45, 0.45));
      const elev = rnd(0.15, 1.1);                    // shallow skim .. steep lob
      const vel = out.multiplyScalar(Math.cos(elev)).setY(Math.sin(elev)).multiplyScalar(power * rnd(0.6, 1.4));
      vel.y += up * rnd(0.6, 1.3);
      return { vel, ang: randDir().multiplyScalar(spinRate()) };
    };
    // a piece that just comes loose and drops
    const loose = (): Launch => ({
      vel: side.clone().multiplyScalar(rnd(0.3, 1.2)).add(randDir().setY(0).multiplyScalar(0.8)).setY(rnd(0.5, 1.6)),
      ang: randDir().multiplyScalar(spinRate() * 0.6),
    });
    // stumps at the cut bones when the rig names them, else the top / bottom of the part
    const neck = bone(rig.neckBone), headB = bone(rig.headBone), waist = bone(rig.waistBone);
    const neckStump: Stump = neck && headB ? { at: neck.clone().lerp(headB, 0.4), dir: headB.clone().sub(neck).normalize() } : 'top';
    const waistUp: Stump = waist ? { at: waist.clone(), dir: _up.clone() } : 'top';
    const waistDown: Stump = waist ? { at: waist.clone(), dir: _up.clone().negate() } : 'bottom';

    for (const [key, regions] of groups) {
      const geos = regions.flatMap(r => parts.get(r)!), ms = regions.flatMap(r => mats.get(r)!);
      const isGear = gear.has(key), isLimb = !isGear && key !== 'body' && key !== 'upper' && key !== 'lower';
      this.spawnBody(geos, ms, rig.fluid, c => {
        if (kind === 'shred') {
          const heavy = rig.heavy.includes(key);
          if (heavy) return { ...thrown(c, rnd(2, 3.5), rnd(1.5, 3)), pool: true, heavy, bleed: 0.8 };
          return { ...thrown(c, rnd(4, 9), rnd(3, 7)), bleed: isGear ? 0 : 1.2, pool: !isGear };
        }
        if (kind === 'blast') {
          if (key === 'body') {
            // a long body like the Hydralisk's would land upright if thrown: knocked over sideways instead
            if (rig.sideways) return topple(rnd(1.2, 2));
            return { ...thrown(c, rnd(1.4, 2.2), 1.2), ang: randDir().multiplyScalar(rnd(1, 3)), pool: true, heavy: true };
          }
          return { ...thrown(c, rnd(3, 7), rnd(2, 5)), bleed: isLimb ? 1.2 : 0, pool: isLimb };
        }
        if (kind === 'decap') {
          if (key === 'head') return { vel: side.clone().applyAxisAngle(_up, rnd(-0.6, 0.6)).multiplyScalar(rnd(0.5, 2.5)).setY(rnd(3.5, 7)), ang: randDir().multiplyScalar(spinRate()), bleed: 0.8, pool: true };
          if (isGear) return loose();
          return { ...topple(rnd(0.6, 1.4)), spurt: neckStump };
        }
        if (kind === 'halve') {
          if (key === 'upper') {
            // long bodies tumble end over end so they don't land standing
            const ang = rig.sideways ? randDir().setY(0).normalize().multiplyScalar(rnd(4, 8)) : randDir().multiplyScalar(rnd(1, 6));
            return { ...thrown(c, rnd(1.5, 2.8), rnd(2, 3.2)), ang, bleed: 0.6, pool: true, spurt: waistDown, heavy: true, lieDown: fwd };
          }
          if (key === 'lower') {
            if (!rig.lowerFlops) return { ...topple(rnd(0.4, 1.1)), spurt: waistUp };
            // the tail lurches up and flops back down, twisting
            return { vel: randDir().setY(0).multiplyScalar(rnd(0.3, 1)).setY(rnd(1.5, 3)), ang: new THREE.Vector3(rnd(-1.5, 1.5), rnd(-4, 4), rnd(-1.5, 1.5)), pool: true, heavy: true, spurt: waistUp, lieDown: fwd };
          }
          return loose();
        }
        if (key === 'body') return topple(rnd(0.5, 1.3));
        return { ...loose(), bleed: isLimb ? 0.9 : 0, pool: isLimb };
      });
    }
    // spray at the moment of the hit
    const spray = kind === 'shred' ? 45 : kind === 'blast' ? 26 : kind === 'halve' ? 22 : kind === 'fall' ? 6 : 12;
    const at = kind === 'decap' ? (neck?.clone() ?? new THREE.Vector3(center.x, center.y + 1.2, center.z)) : blast;
    for (let i = 0; i < spray; i++) this.drop(at, kind === 'shred' ? 4.5 : kind === 'blast' ? 3.5 : 2.5, rig.fluid);
    return true;
  }

  private spawnBody(geos: THREE.BufferGeometry[], mats: THREE.Material[], fluid: Fluid, launch: (c: THREE.Vector3) => Launch) {
    const box = new THREE.Box3();
    for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox!); }
    const c = box.getCenter(new THREE.Vector3());
    const obj = new THREE.Group();
    obj.position.copy(c);
    geos.forEach((g, i) => {
      g.translate(-c.x, -c.y, -c.z);
      const m = new THREE.Mesh(g, mats[i]);
      m.castShadow = true;
      obj.add(m);
    });
    box.translate(c.clone().negate());
    const pts: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    const size = box.getSize(new THREE.Vector3());
    const rad = Math.max(0.05, size.length() * 0.5);

    const L = launch(c);
    const sp = L.spurt;
    const spurt = !sp ? undefined
      : typeof sp === 'object' ? { at: sp.at.clone().sub(c), dir: sp.dir.clone(), t: rnd(1.6, 2.4) }
      : { at: new THREE.Vector3(0, sp === 'top' ? box.max.y * 0.92 : box.min.y * 0.92, 0), dir: new THREE.Vector3(0, sp === 'top' ? 1 : -1, 0), t: rnd(1.6, 2.4) };
    this.scene.add(obj);
    this.bodies.push({ obj, vel: L.vel, ang: L.ang, invI: 1 / (0.4 * rad * rad), pts, still: 0, age: 0, bleed: L.bleed ?? 0, landed: false, pooled: !L.pool, poolDelay: L.poolDelay ?? 0, spurt, heavy: !!L.heavy, fluid, lieDown: L.lieDown });
    if (L.tip) this.startTip(this.bodies[this.bodies.length - 1]!, L.tip.clone().normalize(), L.tip.length());
    while (this.bodies.length > Dismember.MAX_BODIES) this.scene.remove(this.bodies.shift()!.obj);
  }

  /** Topple like a hinged pole over the ground edge on the `dir` side (world, horizontal). */
  private startTip(b: Body, dir: THREE.Vector3, rate: number) {
    const o = b.obj;
    // the outermost edge in the fall direction, so nothing swings down into the ground
    let reach = -Infinity, low = Infinity, pen0 = 0;
    for (const p of b.pts) {
      _c.copy(p).applyQuaternion(o.quaternion);
      reach = Math.max(reach, _c.x * dir.x + _c.z * dir.z);
      low = Math.min(low, _c.y);
      pen0 = Math.max(pen0, ProceduralGrassSystem.getTerrainHeight(o.position.x + _c.x, o.position.z + _c.z) - (o.position.y + _c.y));
    }
    const pivot = o.position.clone().addScaledVector(dir, reach);
    pivot.y = o.position.y + low;
    b.tip = { pivot, axis: _up.clone().cross(dir).normalize(), theta: 0, omega: rate, pen0 };
    b.rest = false;
  }

  private drop(at: THREE.Vector3, power: number, fluid: Fluid, dir?: THREE.Vector3) {
    const m = new THREE.Mesh(this.dropGeo, this.dropMats[fluid]);
    m.scale.setScalar(0.025 + Math.random() * 0.035);
    m.position.copy(at);
    const vel = dir
      ? dir.clone().addScaledVector(randDir(), 0.35).normalize().multiplyScalar(power * (0.6 + Math.random() * 0.6))
      : new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(power * (0.4 + Math.random()));
    this.scene.add(m);
    this.drops.push({ m, vel });
  }

  public update(dt: number) {
    dt = Math.min(dt, 0.05);
    // two substeps keep fast-spinning parts from sinking into the ground
    for (let s = 0; s < 2; s++) this.step(dt / 2);

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.vel.y -= G * dt;
      d.m.position.addScaledVector(d.vel, dt);
      if (d.m.position.y < ProceduralGrassSystem.getTerrainHeight(d.m.position.x, d.m.position.z)) { this.scene.remove(d.m); this.drops.splice(i, 1); }
    }
  }

  private step(dt: number) {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]!, o = b.obj;
      b.age += dt;
      if (b.tip) {
        // falls like a hinged pole: speeds up as it leans, then hands over to the rigid body once nearly flat
        const t = b.tip;
        t.omega += 7 * Math.sin(t.theta + 0.12) * dt;
        const d = t.omega * dt;
        t.theta += d;
        _q.setFromAxisAngle(t.axis, d);
        o.position.sub(t.pivot).applyQuaternion(_q).add(t.pivot);
        o.quaternion.premultiply(_q);
        // hits the ground: lift out of it and stay put
        if (t.theta > 0.3) {
          let pen = 0;
          for (const p of b.pts) {
            _c.copy(p).applyQuaternion(o.quaternion).add(o.position);
            pen = Math.max(pen, ProceduralGrassSystem.getTerrainHeight(_c.x, _c.z) - _c.y);
          }
          if (pen > t.pen0 + 0.03 || t.theta > 1.6) {
            o.position.y += Math.max(0, pen);
            b.tip = undefined; b.rest = true;
            this.land(b);
          }
        }
      }
      if (!b.tip && !b.rest) this.integrate(b, dt);
      // gushing stump, pulsing with the last heartbeats
      if (b.spurt && b.spurt.t > 0) {
        const sp = b.spurt;
        sp.t -= dt;
        const beat = Math.max(0, Math.sin(b.age * 9)) * Math.min(1, sp.t);
        if (Math.random() < dt * 70 * beat) {
          _c.copy(sp.at).applyQuaternion(o.quaternion).add(o.position);
          _r.copy(sp.dir).applyQuaternion(o.quaternion);
          this.drop(_c, 1.2 + 2.2 * beat, b.fluid, _r);
        }
      }
      // lie there, then sink away
      if (b.age > 7) o.position.y -= dt * 0.25;
      if (b.age > 9) { this.scene.remove(o); this.bodies.splice(i, 1); }
    }
  }

  private land(b: Body) {
    b.landed = true;
    if (!b.pooled) { b.pooled = true; this.melt.spawnGroup(b.fluid, b.obj.position.clone(), b.bleed > 0 ? 0.22 : 0.4, 16, 0.2); }
  }

  private integrate(b: Body, dt: number) {
    const o = b.obj;
    {
      b.vel.y -= G * dt;
      o.position.addScaledVector(b.vel, dt);
      const w = b.ang.length();
      if (w > 1e-4) { _q.setFromAxisAngle(_w.copy(b.ang).divideScalar(w), w * dt); o.quaternion.premultiply(_q); }

      // ground contacts: impulse at each corner below the terrain
      let pen = 0, touching = false;
      for (const p of b.pts) {
        _c.copy(p).applyQuaternion(o.quaternion);           // r (world offset)
        const wx = o.position.x + _c.x, wy = o.position.y + _c.y, wz = o.position.z + _c.z;
        const gy = ProceduralGrassSystem.getTerrainHeight(wx, wz);
        if (wy >= gy) continue;
        touching = true;
        pen = Math.max(pen, gy - wy);
        // contact point velocity = v + w x r
        _v.copy(b.ang).cross(_c).add(b.vel);
        if (_v.y >= 0) continue;
        // normal impulse (n = up), restitution 0.25
        _r.set(-_c.z, 0, _c.x);                                // r x n
        const jn = -(1.25) * _v.y / (1 + b.invI * _r.lengthSq());
        b.vel.y += jn;
        b.ang.addScaledVector(_r, jn * b.invI);
        // friction impulse against sliding, capped by mu * jn
        const tx = _v.x, tz = _v.z, ts = Math.hypot(tx, tz);
        if (ts > 1e-4) {
          const jt = Math.min(0.6 * jn, ts / (1 + b.invI * _c.lengthSq() * 0.5));
          const fx = -tx / ts * jt, fz = -tz / ts * jt;
          b.vel.x += fx; b.vel.z += fz;
          // r x f  (f = (fx,0,fz))
          b.ang.x += (_c.y * fz) * b.invI;
          b.ang.y += (_c.z * fx - _c.x * fz) * b.invI;
          b.ang.z += (-_c.y * fx) * b.invI;
        }
      }
      if (pen > 0) o.position.y += pen;
      if (touching) {
        b.ang.multiplyScalar(1 - 1.5 * dt);
        if (!b.landed && b.age >= b.poolDelay) this.land(b);
        // a body hits with a thud: kill the bounce and the tumbling, then stop
        if (b.heavy) {
          if (b.vel.y > 0) b.vel.y = 0;
          b.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
          b.ang.multiplyScalar(Math.max(0, 1 - 7 * dt));
          b.groundT = (b.groundT ?? 0) + dt;                    // touching the ground long enough settles it too
          if ((b.vel.lengthSq() < 0.09 && b.ang.lengthSq() < 0.5) || b.groundT > 1) {
            b.rest = true; b.vel.set(0, 0, 0); b.ang.set(0, 0, 0);
            if (b.lieDown) {
              const up = _w.set(0, 1, 0).applyQuaternion(o.quaternion);
              if (Math.abs(up.y) > 0.75) {
                const side = b.lieDown.clone().applyQuaternion(o.quaternion).cross(up).setY(0);
                if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
                this.startTip(b, side.normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1), 0.8);
              }
              b.lieDown = undefined;
            }
          }
        }
      }
      // blood trail from torn limbs
      if (b.bleed > 0) { b.bleed -= dt; if (Math.random() < dt * 30) this.drop(o.position, 0.8, b.fluid); }

      if (b.vel.lengthSq() < 0.04 && b.ang.lengthSq() < 0.2 && touching) b.still += dt; else b.still = 0;
      if (b.still > 0.3) { b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); }
    }
  }
}
