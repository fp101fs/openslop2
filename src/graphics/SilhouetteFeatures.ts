import * as THREE from 'three';

/**
 * Adds distinctive, top-down-visible silhouette parts to every unit model so that unit types
 * can be told apart at a glance (wide pauldrons, dorsal crests, spikes, halos, wingtip stripes...).
 * Parts are tagged `userData.silhouette` and are plain child meshes (animators ignore them).
 */
const cache: Record<string, THREE.Material> = {};
const mat = (hex: number, emissive = 0, ei = 0.8): THREE.Material => {
  const key = `${hex}:${emissive}:${ei}`;
  return (cache[key] ??= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.35, emissive, emissiveIntensity: ei }));
};
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.userData.silhouette = true;
  return o;
};
const cone = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, seg = 5) => {
  const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; o.userData.silhouette = true;
  return o;
};
const ring = (r: number, t: number, m: THREE.Material, y: number, rx = Math.PI / 2) => {
  const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 20), m);
  o.position.y = y; o.rotation.x = rx; o.userData.silhouette = true;
  return o;
};

export function addSilhouetteFeatures(group: THREE.Group, type: string, isPlayer: boolean) {
  const team = mat(isPlayer ? 0x2f7bff : 0xff3a2a, isPlayer ? 0x1a4fc0 : 0xb01808, 0.9);
  const dark = mat(0x23262b);
  const chitin = mat(0x4a2a66, 0x220a40, 0.3);
  const bone = mat(0xe3d9b8);
  const gold = mat(0xd9a63a, 0x8a5a10, 0.5);
  const glow = mat(0xffb46a, 0xff7a20, 1.4);
  const add = (...m: THREE.Object3D[]) => m.forEach(o => group.add(o));

  switch (type) {
    case 'marine': // tall team flag antenna + wide shoulder pads
      add(box(0.03, 1.1, 0.03, dark, -0.28, 1.3, -0.25), box(0.32, 0.2, 0.02, team, -0.14, 1.75, -0.25),
        box(0.2, 0.12, 0.26, team, 0.4, 0.95, 0), box(0.2, 0.12, 0.26, team, -0.4, 0.95, 0));
      break;
    case 'marauder': // massive pauldrons
      add(box(0.38, 0.28, 0.5, team, 0.66, 1.3, 0), box(0.38, 0.28, 0.5, team, -0.66, 1.3, 0), box(0.12, 0.5, 0.12, dark, 0, 2.0, -0.4));
      break;
    case 'siege_tank': case 'siege_tank_sieged': // side skirts + team roof stripe
      add(box(0.12, 0.3, 1.9, team, 0.98, 0.45, 0), box(0.12, 0.3, 1.9, team, -0.98, 0.45, 0), box(0.5, 0.05, 1.6, team, 0, 1.05, 0));
      break;
    case 'scv': // roof beacon + hazard shoulders
      add(box(0.1, 0.25, 0.1, dark, 0, 1.45, 0), box(0.22, 0.14, 0.22, gold, 0, 1.65, 0), box(0.18, 0.5, 0.18, gold, 0.5, 1.0, 0), box(0.18, 0.5, 0.18, gold, -0.5, 1.0, 0));
      break;
    case 'medivac': // wide team wingtip bars + red cross-like top fins
      add(box(0.18, 0.12, 1.1, team, 1.5, 0.3, 0), box(0.18, 0.12, 1.1, team, -1.5, 0.3, 0), box(0.9, 0.06, 0.25, team, 0, 0.95, 0));
      break;
    case 'wraith': // team wingtip bars + tail fin
      add(box(0.12, 0.1, 0.7, team, 1.35, 0.1, -0.2), box(0.12, 0.1, 0.7, team, -1.35, 0.1, -0.2), box(0.08, 0.55, 0.5, team, 0, 0.5, -0.9));
      break;
    case 'banshee': // team rotor tips
      add(box(2.2, 0.05, 0.12, team, 0, 0.95, 0), box(0.12, 0.05, 2.2, team, 0, 0.95, 0));
      break;
    case 'roach': // armoured dorsal plates
      for (let i = 0; i < 3; i++) add(box(0.85 - i * 0.12, 0.18, 0.4, chitin, 0, 1.0 + i * 0.05, -0.3 + i * 0.42, -0.2, 0, 0));
      add(cone(0.12, 0.5, bone, 0.35, 0.8, 0.9, Math.PI / 2, 0, 4), cone(0.12, 0.5, bone, -0.35, 0.8, 0.9, Math.PI / 2, 0, 4));
      break;
    case 'hydralisk': // tall hood crest + scythe arms
      add(box(0.06, 0.95, 0.75, chitin, 0, 1.9, -0.1, 0.3, 0, 0), cone(0.1, 0.8, bone, 0.5, 1.2, 0.5, Math.PI / 2.4, -0.4, 4), cone(0.1, 0.8, bone, -0.5, 1.2, 0.5, Math.PI / 2.4, 0.4, 4));
      break;
    case 'drone': // translucent wing blades
      add(box(0.9, 0.03, 0.28, mat(0xbfa6e8, 0x6040a0, 0.4), 0.55, 0.95, -0.15, 0, 0.4, 0.3), box(0.9, 0.03, 0.28, mat(0xbfa6e8, 0x6040a0, 0.4), -0.55, 0.95, -0.15, 0, -0.4, -0.3));
      break;
    case 'mutalisk': // long tail spike + wing tips
      add(cone(0.1, 1.4, bone, 0, 0.1, -1.2, -Math.PI / 2, 0, 4), box(0.15, 0.06, 0.9, chitin, 1.2, 0.2, 0), box(0.15, 0.06, 0.9, chitin, -1.2, 0.2, 0));
      break;
    case 'zealot': // wide psi-blade pauldrons + team sash
      add(box(0.12, 0.12, 1.1, glow, 0.62, 0.9, 0.4), box(0.12, 0.12, 1.1, glow, -0.62, 0.9, 0.4), box(0.3, 0.5, 0.05, team, 0, 0.8, -0.35));
      break;
    case 'stalker': // tall antenna + team head fin
      add(box(0.05, 0.9, 0.05, dark, 0, 2.0, 0), box(0.5, 0.05, 0.25, team, 0, 2.45, 0), cone(0.1, 0.5, team, 0, 1.65, 0.45, Math.PI / 2, 0, 4));
      break;
    case 'archon': // huge halo ring
      add(ring(1.35, 0.07, glow, 1.2), ring(1.0, 0.05, team, 1.2, Math.PI / 2.4));
      break;
    case 'probe': // glow halo ring
      add(ring(0.6, 0.04, glow, 0.85));
      break;
    case 'void_ray': // forward prongs + team crystal
      add(cone(0.12, 1.0, team, 0.35, 0.2, 1.2, Math.PI / 2, 0, 4), cone(0.12, 1.0, team, -0.35, 0.2, 1.2, Math.PI / 2, 0, 4), box(0.35, 0.35, 0.35, glow, 0, 0.55, 0, 0.7, 0.7, 0));
      break;
  }
}
