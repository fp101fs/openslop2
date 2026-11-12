import * as THREE from 'three';

/**
 * Viking Fighter <-> Assault Mode visuals. The Viking model is one static mesh in its bind pose, which is the upright
 * Assault Mode walker. Fighter Mode tips the whole body forward into a flight attitude (head first, legs trailing like
 * a tail, as the SC2 fighter folds its legs back), and the transform swings it between the two poses while it lands or
 * climbs. Both mode meshes are built the same way (only the starting pose differs), so the mesh swap at the end of a
 * transform is seamless. Pose 0 = fighter, 1 = assault.
 */

/** Forward tilt of the fighter pose (rad). */
const FIGHTER_PITCH = 1.3;

interface VkParts { body: THREE.Group; pivotY: number; pose: number; walk: number; lastX: number; lastZ: number; settle: number }

/** Wrap the model in a pivot at its centre so it can tip between the walker and fighter attitudes. */
export function decorateViking(group: THREE.Group, rig: THREE.Object3D, assault: boolean) {
  const box = new THREE.Box3().setFromObject(rig);
  const c = box.getCenter(new THREE.Vector3());
  const body = new THREE.Group(); body.name = 'vk_body';
  group.remove(rig); body.add(rig); group.add(body);
  rig.position.y -= c.y; // pivot about the model's centre
  const parts: VkParts = { body, pivotY: c.y, pose: assault ? 1 : 0, walk: 0, lastX: NaN, lastZ: NaN, settle: 0 };
  group.userData.viking = parts;
  applyPose(parts, parts.pose, 0, 0);
}

function applyPose(v: VkParts, p: number, walk: number, stride: number) {
  // fighter: centred on the flight altitude; assault: standing with its feet on the ground
  const e = p * p * (3 - 2 * p);
  v.body.rotation.x = FIGHTER_PITCH * (1 - e);
  v.body.position.y = v.pivotY * e + Math.abs(Math.sin(stride)) * 0.06 * walk;
  // heavy walker gait: a side-to-side rock and a slight forward lean while it walks
  v.body.rotation.z = Math.sin(stride) * 0.06 * walk;
  v.body.rotation.x += 0.08 * walk;
}

export class VikingAnimator {
  public static update(unit: any, dt: number) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    const v = mesh?.userData.viking as VkParts | undefined;
    if (!v || dt <= 0) return;
    const target = unit.type === 'viking_assault' ? 1 : 0;
    if (unit.isTransforming && unit.transformTotal > 0) {
      const k = Math.min(1, 1 - Math.max(0, unit.transformTimer) / unit.transformTotal);
      // landing: swing upright over the descent; lift-off: tip forward as it climbs
      v.pose = unit.transformToType === 'viking_assault' ? Math.min(1, k * 1.15) : 1 - Math.min(1, k * 1.25);
    } else v.pose += (target - v.pose) * Math.min(1, dt * 10);
    const x = unit.pos.x, z = unit.pos.y;
    const moved = Number.isNaN(v.lastX) ? 0 : Math.hypot(x - v.lastX, z - v.lastZ);
    v.lastX = x; v.lastZ = z;
    const walking = unit.type === 'viking_assault' && !unit.isTransforming && moved / dt > 0.2 ? 1 : 0;
    v.settle += (walking - v.settle) * Math.min(1, dt * 8);
    if (walking) v.walk += dt * 7;
    applyPose(v, v.pose, v.settle, v.walk);
  }
}
