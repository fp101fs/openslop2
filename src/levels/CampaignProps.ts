import * as THREE from 'three';
import { registerKit, compose, vcMat } from './PropKits';

/**
 * Procedural stand-ins for campaign set pieces placed with a map's `decor` list (Liberation Day: Mengsk statue, Browder's gas
 * station, graffiti signs, billboards, the camp gate, the scorched crater). Vertex-coloured boxes and cylinders; swap a kit
 * for a GLB later without touching the maps. Loaded only by the renderer (LevelScenery), never by skirmish logic.
 */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r0: number, r1: number, h: number, x = 0, y = 0, z = 0, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);
const one = (parts: { geo: THREE.BufferGeometry; color: number }[], height: number) => [{ geo: compose(parts), mat: vcMat(), height }];

const STONE = 0x8d8a82, STONE_D = 0x6c6962, BRONZE = 0x6b5a3a, STEEL = 0x5d636b, STEEL_D = 0x3c4148, RED = 0xa8322a, DOM = 0x2f3d63;

// Mengsk statue: three-step plinth and a standing figure with one arm raised (HQ plaza)
registerKit('mengsk_statue', () => one([
  { geo: box(6, 0.6, 6), color: STONE_D }, { geo: box(4.6, 0.6, 4.6, 0, 0.6), color: STONE }, { geo: box(3.2, 1.6, 3.2, 0, 1.2), color: STONE_D },
  { geo: cyl(0.32, 0.36, 1.6, -0.3, 2.8), color: BRONZE }, { geo: cyl(0.32, 0.36, 1.6, 0.3, 2.8), color: BRONZE },
  { geo: box(1.3, 1.7, 0.8, 0, 4.4), color: BRONZE }, { geo: box(1.7, 1.5, 0.95, 0, 4.4), color: shade(BRONZE, 0.85) },
  { geo: new THREE.SphereGeometry(0.42, 10, 8).translate(0, 6.5, 0), color: BRONZE },
  { geo: cyl(0.16, 0.16, 1.6, -1.0, 5.2).rotateZ(0.2), color: BRONZE }, { geo: cyl(0.16, 0.16, 1.4, 1.05, 4.2), color: BRONZE },
], 7));

// Big Daddy Browder's Gas & Guns: canopy on posts, shop, pumps, and the flame-painted truck on the roof
registerKit('gas_station', () => one([
  { geo: box(7, 0.35, 5, 0, 3.4), color: 0xc9c2b0 }, { geo: box(7.05, 0.15, 5.05, 0, 3.75), color: RED },
  ...[[-3, -2], [3, -2], [-3, 2], [3, 2]].map(([x, z]) => ({ geo: cyl(0.14, 0.14, 3.4, x, 0, z), color: STEEL })),
  { geo: box(1.0, 1.5, 0.6, -1.2), color: RED }, { geo: box(1.0, 1.5, 0.6, 1.2), color: RED },
  { geo: box(5, 2.8, 3.4, 0, 0, 5), color: 0xb8a487 }, { geo: box(5.1, 0.5, 3.5, 0, 2.8, 5), color: 0x7a2a22 },
  { geo: box(2.6, 1.0, 1.4, 0, 3.3, 5), color: 0x222428 }, { geo: box(1.0, 0.7, 1.35, 1.1, 4.3, 5), color: 0x222428 },
  { geo: box(1.2, 0.3, 1.42, -0.6, 3.6, 5), color: 0xf28a1d },
], 4.8));

// Sign on two posts sprayed with anti-Mengsk graffiti (variants = colour of the tags)
registerKit('graffiti_sign', () => [0x2ec4b6, 0xe71d36, 0xffbf00].map(tag => ({
  geo: compose([
    { geo: cyl(0.1, 0.1, 2.6, -1.3), color: STEEL_D }, { geo: cyl(0.1, 0.1, 2.6, 1.3), color: STEEL_D },
    { geo: box(3.2, 1.5, 0.12, 0, 1.4), color: 0xd8d2c0 },
    { geo: box(1.2, 0.5, 0.14, -0.6, 1.9), color: tag }, { geo: box(0.9, 0.35, 0.14, 0.7, 1.6), color: tag }, { geo: box(1.6, 0.18, 0.14, 0.1, 2.5), color: shade(tag, 0.7) },
  ]), mat: vcMat(), height: 2.9,
})));

// Billboard: big panel on legs (variant 0 = battlecruiser silhouette, 1 = "Real men drill deep")
registerKit('billboard', () => [0, 1].map(v => ({
  geo: compose([
    { geo: cyl(0.18, 0.18, 4, -2.2), color: STEEL_D }, { geo: cyl(0.18, 0.18, 4, 2.2), color: STEEL_D },
    { geo: box(6.4, 2.8, 0.2, 0, 3.6), color: v ? 0xe1c79a : 0x8fb0cc },
    ...(v ? [{ geo: box(0.5, 2.2, 0.24, 1.6, 3.9), color: 0x6b4a2a }, { geo: box(3.4, 0.4, 0.24, -0.8, 5.2), color: 0x9c2b1e }]
      : [{ geo: box(3.8, 0.6, 0.24, 0, 4.9), color: 0x2a2e33 }, { geo: box(1.2, 0.9, 0.24, -1.4, 4.6), color: 0x2a2e33 }, { geo: box(0.9, 0.3, 0.24, 1.9, 4.9), color: 0x2a2e33 }]),
  ]), mat: vcMat(), height: 6.4,
})));

// Camp gate: two posts, a crossbar with the RESTRICTED stripe, fence wings
registerKit('fence_gate', () => one([
  { geo: box(0.5, 3, 0.5, -3), color: STEEL_D }, { geo: box(0.5, 3, 0.5, 3), color: STEEL_D },
  { geo: box(6.5, 0.5, 0.35, 0, 3), color: DOM }, { geo: box(3.2, 0.3, 0.38, 0, 3.1), color: 0xe8c22a },
  ...[-1, 1].flatMap(s => [{ geo: box(3.5, 0.12, 0.08, s * 5, 2), color: STEEL }, { geo: box(3.5, 0.12, 0.08, s * 5, 1.1), color: STEEL }, { geo: box(0.15, 2.4, 0.15, s * 6.7), color: STEEL_D }]),
], 3.5));

// Scorched crater floor: flat irregular dark disc with a charred rim
registerKit('crater_scorch', () => {
  const ring = (r: number, h: number, c: number, seed: number) => {
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 18);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 + seed * 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    return { geo: g.translate(0, h / 2, 0), color: c };
  };
  return one([ring(7, 0.06, 0x2a221d, 1), ring(5, 0.1, 0x1a1512, 2), ring(2.6, 0.13, 0x110d0b, 3)], 0.2);
});

function shade(hex: number, k: number) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }
