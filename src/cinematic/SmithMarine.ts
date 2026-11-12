import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SMITH_CHIN_Y } from './SmithHead';

/** Helmet pieces of models/marine.glb (shell, golden visor, rim) and its rifle. */
export const MARINE_HELMET = ['Object_123', 'Object_133', 'Object_135'];
export const MARINE_RIFLE = ['Object_91'];

export interface Actor {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Record<'run' | 'idle' | 'death', THREE.AnimationClip>;
  bones: Record<string, THREE.Bone>;
  action?: THREE.AnimationAction;
}

export function makeMarine(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, opts: { helmet: boolean; rifle: boolean; scale?: number }): Actor {
  const model = cloneSkinned(gltf.scene) as THREE.Object3D;
  const root = new THREE.Group();
  root.add(model);
  model.scale.multiplyScalar(opts.scale ?? 1);
  const bones: Record<string, THREE.Bone> = {};
  model.traverse(o => {
    if ((o as THREE.Bone).isBone) bones[o.name.replace('mixamorig', '').replace(/_\d+$/, '')] = o as THREE.Bone;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds are stale once posed procedurally
    if ((!opts.helmet && MARINE_HELMET.includes(o.name)) || (!opts.rifle && MARINE_RIFLE.includes(o.name))) o.visible = false;
  });
  const by = (re: RegExp) => gltf.animations.find(a => re.test(a.name))!;
  const mixer = new THREE.AnimationMixer(model);
  return { root, mixer, bones, clips: { run: by(/run/i), idle: by(/idle/i), death: by(/death/i) } };
}

export function play(a: Actor, which: 'run' | 'idle' | 'death', fade = 0.2, speed = 1, once = false) {
  const next = a.mixer.clipAction(a.clips[which]);
  next.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1);
  if (once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  if (a.action && a.action !== next) next.crossFadeFrom(a.action, fade, false);
  next.play();
  a.action = next;
}

/**
 * Replace the Marine's helmet with Colonel Smith's head. The head is parented to the Marine's head bone, so it follows every animation.
 * The marine is first put in its idle pose, the old helmet's bounds give the target position / size, and the offset from the bone is
 * frozen from there.
 */
export function graftHead(a: Actor, head: THREE.Group, tune = { scale: 1.5, dy: 0.05, dz: 0.03 }) {
  play(a, 'idle', 0);
  a.mixer.update(0);
  a.root.updateMatrixWorld(true);
  // measure the helmet shell + visor in the posed marine (root space)
  const box = new THREE.Box3();
  a.root.traverse(o => {
    const s = o as THREE.SkinnedMesh;
    if (!s.isSkinnedMesh || !['Object_123', 'Object_133'].includes(o.name)) return;
    s.skeleton.update();
    (s as any).boundingBox = null;
    s.computeBoundingBox();
    box.union(s.boundingBox!.clone().applyMatrix4(s.matrixWorld));
  });
  const c = box.getCenter(new THREE.Vector3());
  const hb = a.bones['Head']!;
  // the head sits with its chin at the bottom of the old helmet, scaled up so it reads against the armour
  const S = tune.scale;
  const holder = new THREE.Group();
  const inner = head.clone(true);
  inner.position.set(0, -SMITH_CHIN_Y * S, 0);
  inner.scale.setScalar(S);
  holder.add(inner);
  holder.position.set(c.x, box.min.y + 0.02 + tune.dy, c.z + tune.dz);
  holder.updateMatrixWorld(true);
  // freeze the local transform relative to the head bone
  const rel = new THREE.Matrix4().copy(hb.matrixWorld).invert().multiply(holder.matrixWorld);
  holder.removeFromParent();
  rel.decompose(holder.position, holder.quaternion, holder.scale);
  hb.add(holder);
  return holder;
}

/** Rotate `bone` by `angle` about a WORLD-space axis (used to pose the slapping arm on top of the playing clip). */
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _r = new THREE.Quaternion();
export function rotateBoneWorld(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
  bone.parent!.getWorldQuaternion(_pq);
  _r.setFromAxisAngle(axis, angle);
  _q.copy(_pq).invert().multiply(_r).multiply(_pq);
  bone.quaternion.premultiply(_q);
}

/** Force `bone` to a fixed WORLD orientation (the head keeps facing where it was while the torso swings under it). Parent matrices must be up to date. */
export function holdBoneWorldRotation(bone: THREE.Bone, worldQ: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(worldQ));
}
