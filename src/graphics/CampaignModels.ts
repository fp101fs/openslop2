import * as THREE from 'three';

/**
 * Procedural models for campaign-only structures. Holoboard (Liberation Day): a tall Dominion propaganda billboard on two
 * legs, a glowing blue screen with three gold Dominion emblems, and a soft flicker (onBeforeRender, no per-frame allocation).
 */
export function buildHoloboardModel(isPlayer: boolean): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: isPlayer ? 0x2c5aa0 : 0x8a1f1f, roughness: 0.5, metalness: 0.5 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x0b2440, emissive: 0x2f7fd6, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, emissive: 0x6b4d10, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.8 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  add(new THREE.BoxGeometry(2.2, 0.25, 1.1), steel, 0, 0.12);
  for (const x of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.22, 2.0, 0.22), steel, x, 1.1);
  add(new THREE.BoxGeometry(2.5, 1.55, 0.22), trim, 0, 2.75);
  const s = add(new THREE.PlaneGeometry(2.3, 1.35), screen, 0, 2.75, 0.115);
  add(new THREE.PlaneGeometry(2.3, 1.35), screen, 0, 2.75, -0.115).rotation.y = Math.PI;
  for (const x of [-0.72, 0, 0.72]) for (const z of [0.125, -0.125]) {
    const e = add(new THREE.TorusGeometry(0.22, 0.05, 6, 16), gold, x, 2.8, z);
    add(new THREE.BoxGeometry(0.06, 0.32, 0.02), gold, x, 2.8, z);
    void e;
  }
  let t = 0;
  s.onBeforeRender = () => { t += 0.016; screen.emissiveIntensity = 1.0 + 0.15 * Math.sin(t * 9) * Math.sin(t * 2.3) + (Math.sin(t * 31) > 0.97 ? -0.5 : 0); };
  g.scale.setScalar(1.45); // SC2 holoboards tower over Marines
  g.userData.sized = true;
  return g;
}
