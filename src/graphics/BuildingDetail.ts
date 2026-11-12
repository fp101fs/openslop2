import * as THREE from 'three';

/**
 * Race-specific sculpted silhouette add-ons for buildings (real extra meshes, not just textures):
 * Terran buttresses / roof vents / pipes / mast, Zerg chitin spires + sacs, Protoss gold spires + floating crystal.
 */
const M: Record<string, THREE.Material> = {};
const std = (k: string, color: number, rough = 0.6, metal = 0.4, emissive = 0, ei = 0) =>
  (M[k] ??= new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei }));

export function addBuildingDetail(root: THREE.Object3D, type: string, isPlayer: boolean) {
  if (root.userData.detailed) return;
  root.userData.detailed = true;
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  const p = root.position;
  const x0 = bb.min.x - p.x, x1 = bb.max.x - p.x, z0 = bb.min.z - p.z, z1 = bb.max.z - p.z, top = bb.max.y - p.y;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  const g = new THREE.Group(); g.name = 'detail';
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.scale.set(sx, sy, sz);
    o.castShadow = true; o.userData.silhouette = true; g.add(o); return o;
  };
  const team = std(isPlayer ? 'tp' : 'te', isPlayer ? 0x2f7bff : 0xff3a2a, 0.5, 0.3, isPlayer ? 0x1a4fc0 : 0xb01808, 0.8);
  const race = ['hatchery', 'overlord_pod', 'spawning_pool', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'extractor', 'infestation_pit', 'hive', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'creep_tumor', 'nydus_worm'].includes(type) ? 'zerg'
    : ['nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'stargate'].includes(type) ? 'protoss' : 'terran';
  const small = Math.min(hw, hd) < 0.9;

  if (race === 'terran') {
    const steel = std('steel', 0x6b7380, 0.45, 0.7), dark = std('tdark', 0x2a2d33, 0.7, 0.5), glow = std('tglow', 0xffb46a, 0.4, 0, 0xff7a20, 1.6);
    if (type !== 'command_center' && type !== 'orbital_command' && type !== 'planetary_fortress' && type !== 'engineering_bay') for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // corner buttress columns with caps (not on the CC)
      const x = cx + sx * (hw - 0.08), z = cz + sz * (hd - 0.08);
      add(new THREE.CylinderGeometry(0.16, 0.22, Math.max(0.8, top * 0.7), 14), steel, x, Math.max(0.8, top * 0.7) / 2, z);
      add(new THREE.SphereGeometry(0.2, 14, 10), dark, x, Math.max(0.8, top * 0.7), z, 0, 0, 1, 0.6, 1);
    }
    if (!small) for (let i = 0; i < 3; i++) { // roof vents
      const x = cx - hw * 0.5 + i * hw * 0.5, z = cz + (i % 2 ? 0.3 : -0.3) * hd;
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 16), dark, x, top + 0.12, z);
      add(new THREE.TorusGeometry(0.2, 0.03, 8, 16), glow, x, top + 0.28, z, Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.1, 0.1, hw * 1.6, 12), steel, cx, top + 0.1, cz - hd * 0.7, 0, Math.PI / 2); // roof pipe run
    add(new THREE.CylinderGeometry(0.025, 0.04, 1.4, 8), dark, cx + hw * 0.6, top + 0.7, cz + hd * 0.5);            // antenna mast
    add(new THREE.SphereGeometry(0.07, 10, 8), team, cx + hw * 0.6, top + 1.42, cz + hd * 0.5);                      // team beacon
  } else if (race === 'zerg') {
    const chitin = std('zchit', 0x4a2a66, 0.55, 0.15, 0x220a40, 0.3), bone = std('zbone', 0xe3d9b8, 0.7, 0.05), sac = std('zsac', 0x8f4fe0, 0.35, 0, 0x5a20b0, 1.1);
    const n = small ? 5 : 9;
    for (let i = 0; i < n; i++) { // chitin spires ringing the base
      const a = (i / n) * Math.PI * 2, r = Math.max(hw, hd) * 0.95, h = 0.9 + ((i * 37) % 10) / 10 * 1.2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = add(new THREE.ConeGeometry(0.2, h, 8), i % 2 ? chitin : bone, x, h / 2, z);
      s.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    }
    for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.28 + i * 0.05, 14, 10), sac, cx + (i - 1) * hw * 0.55, top + 0.05, cz + (i % 2 ? 0.25 : -0.25) * hd, 0, 0, 1, 0.8, 1);
  } else {
    const gold = std('pgold', 0xd9a63a, 0.3, 0.8, 0x8a5a10, 0.4), glow = std('pglow', 0x66e0ff, 0.2, 0, 0x33b8ff, 2.0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // gold corner spires
      const x = cx + sx * (hw - 0.05), z = cz + sz * (hd - 0.05);
      add(new THREE.ConeGeometry(0.16, Math.max(1.2, top * 0.9), 6), gold, x, Math.max(1.2, top * 0.9) / 2, z);
      add(new THREE.SphereGeometry(0.09, 10, 8), glow, x, Math.max(1.2, top * 0.9) + 0.08, z);
    }
    const c = add(new THREE.OctahedronGeometry(0.3, 0), glow, cx, top + 0.9, cz, 0, 0, 1, 1.5, 1); c.name = 'floating_crystal'; c.castShadow = false;
    add(new THREE.TorusGeometry(0.5, 0.03, 8, 28), gold, cx, top + 0.9, cz, Math.PI / 2.4).castShadow = false;
  }
  root.add(g);
}
