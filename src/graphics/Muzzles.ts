import * as THREE from 'three';

const v = new THREE.Vector3();

interface MuzzleHost { mesh?: THREE.Object3D | null }

/** Collect every node named `muzzle*` in a model once and cache the list on the model root. */
function muzzleNodes(root: THREE.Object3D): THREE.Object3D[] {
  let list = root.userData.muzzleNodes as THREE.Object3D[] | undefined;
  if (!list) {
    list = [];
    root.traverse(o => { if (o.name.startsWith('muzzle') && o.name !== 'marine_muzzle_flash') list!.push(o); });
    root.userData.muzzleNodes = list;
  }
  return list;
}

/**
 * World-space position of the weapon muzzle the entity is firing from, or null when its model has no muzzle
 * (callers then fall back to the old centre-of-body origin). Multi-barrel units alternate between muzzles
 * on every call.
 *  - Marine: the muzzle flash group at the end of the rifle in the marine's hands
 *  - Wraith: its wing-pod cannons (alternating)
 *  - Everything else: nodes named `muzzle*` in the model (turret barrels, arm cannons, rocket pods ...)
 */
export function muzzleWorldPos(host: MuzzleHost): { x: number; y: number; z: number } | null {
  const mesh = host.mesh;
  if (!mesh) return null;
  mesh.updateMatrixWorld(true);

  const bones = mesh.userData.bones;
  if (bones?.muzzleFlash) {
    bones.muzzleFlash.getWorldPosition(v);
    return { x: v.x, y: v.y, z: v.z };
  }
  const wr = mesh.userData.wraithRig;
  if (wr?.flashL && wr?.flashR) {
    const s = (mesh.userData.muzzleShot = ((mesh.userData.muzzleShot ?? 0) + 1) % 2);
    (s === 0 ? wr.flashL : wr.flashR).getWorldPosition(v);
    return { x: v.x, y: v.y, z: v.z };
  }
  // Banshee: Backlash launchers sit either side of the nose (the model's Star2Omni01/02 nodes), fired alternately
  if (mesh.userData.rigged && mesh.userData.bansheeMuzzles !== null) {
    let pods = mesh.userData.bansheeMuzzles as THREE.Object3D[] | null | undefined;
    if (pods === undefined) {
      const l = mesh.getObjectByName('Star2Omni01_38'), r = mesh.getObjectByName('Star2Omni02_39');
      pods = mesh.userData.bansheeMuzzles = l && r ? [l, r] : null;
    }
    if (pods) {
      const s = (mesh.userData.muzzleShot = ((mesh.userData.muzzleShot ?? 0) + 1) % 2);
      pods[s]!.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    }
  }
  const list = muzzleNodes(mesh);
  if (!list.length) return null;
  const idx = (mesh.userData.muzzleShot = ((mesh.userData.muzzleShot ?? -1) + 1) % list.length);
  list[idx]!.getWorldPosition(v);
  return { x: v.x, y: v.y, z: v.z };
}

/** Index of the muzzle most recently used by muzzleWorldPos (for alternating recoil). */
export function lastMuzzleIndex(host: MuzzleHost): number {
  return host.mesh?.userData.muzzleShot ?? 0;
}
