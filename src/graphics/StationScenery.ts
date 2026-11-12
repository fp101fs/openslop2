import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ProceduralGrassSystem } from './ProceduralGrass';
import { LAYOUT, MAP_LAYOUT_OF } from '../maps';
import { MAP_CONFIGS } from '../config';

/**
 * Space-station dressing for the default map (replaces the outdoor trees / rocks / bushes / flowers / logs):
 * cargo containers, crates, barrels, pipes, vents, consoles, cables, debris and floor beacons, at ~30% of the old
 * doodad count. Every prop shares one material (vertex colours + a per-vertex glow flag for the small emissive
 * accents + world-projected grime), all instanced and chunked so off-screen tiles are culled. Nothing runs per frame.
 */

type FogU = { value: THREE.Texture | null };
type Applier = (mat: THREE.Material, fog: FogU, size: number, instanced?: boolean) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---- geometry helpers: every part is non-indexed with position / normal / color / aGlow (so they all merge) ----
function part(g: THREE.BufferGeometry, hex: number, glow = 0): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.getAttribute('position').count;
  const c = new THREE.Color(hex), col = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; gl[i] = glow; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return ng;
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z);
  return g.applyMatrix4(_m.compose(_p, _q, _s));
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: number, glow = 0, rx = 0, ry = 0, rz = 0) =>
  part(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), col, glow);
const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, col: number, glow = 0, rx = 0, ry = 0, rz = 0) =>
  part(place(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz), col, glow);
/** Cylinder between two points (cables, braces). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, col: number, seg = 5) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len * 1.04, seg);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  _p.copy(a).add(b).multiplyScalar(0.5);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return part(g, col);
}
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;
/** Move a list of parts as one group (yaw then offset). */
const group = (parts: THREE.BufferGeometry[], x: number, y: number, z: number, ry = 0, rz = 0) => parts.map(p => place(p, x, y, z, 0, ry, rz));

// palette (vertex colours; the instance colour multiplies the whole prop)
const DARK = 0x2a2e34, MID = 0x5a616a, LIGHT = 0x8a929c, BODY = 0xc4c9d0, HAZ = 0xb08a2c;
const AMBER = 0xffa53a, CYAN = 0x38d2ff, RED = 0xff4a32, GREEN = 0x5cff9a;

function containerParts(light = AMBER): THREE.BufferGeometry[] {
  const p = [
    box(2.6, 1.28, 1.28, 0, 0.68, 0, BODY),
    box(2.72, 0.09, 1.36, 0, 0.045, 0, DARK),
    box(2.72, 0.08, 0.08, 0, 1.33, 0.64, DARK), box(2.72, 0.08, 0.08, 0, 1.33, -0.64, DARK),
    box(0.09, 1.38, 1.38, 1.31, 0.69, 0, DARK), box(0.09, 1.38, 1.38, -1.31, 0.69, 0, DARK),
    box(0.03, 1.0, 0.05, 1.37, 0.68, 0.2, MID), box(0.03, 1.0, 0.05, 1.37, 0.68, -0.2, MID),
    box(0.04, 0.12, 0.2, 1.37, 1.16, 0.42, light, 1),
    box(2.62, 0.1, 1.3, 0, 1.02, 0, LIGHT),   // stencil band
  ];
  for (const x of [-0.86, -0.43, 0, 0.43, 0.86]) p.push(box(0.07, 1.14, 1.34, x, 0.68, 0, LIGHT));
  return p;
}
function crate(s: number, x: number, y: number, z: number, ry: number): THREE.BufferGeometry[] {
  const h = s * 0.5, f = 0.05;
  // the frame rims sit a few mm proud of the lid (never coplanar with it, or the tops z-fight / flicker while panning)
  const p = [box(s, s, s, 0, h, 0, MID), box(s + f, f, s + f, 0, s - f / 2 + 0.015, 0, DARK), box(s + f, f, s + f, 0, f / 2, 0, DARK),
    box(s * 0.45, s * 0.14, s + 0.012, 0, s * 0.62, 0, HAZ)];
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) p.push(box(f * 0.9, s - 0.02, f * 0.9, cx * h, h, cz * h, DARK));
  return group(p, x, y, z, ry);
}
function barrel(x: number, z: number, hazard: boolean, tipped = false): THREE.BufferGeometry[] {
  const p = [cyl(0.27, 0.27, 0.82, 10, 0, 0.41, 0, LIGHT), cyl(0.24, 0.24, 0.02, 10, 0, 0.83, 0, MID)];
  for (const y of [0.05, 0.41, 0.77]) p.push(cyl(0.285, 0.285, 0.05, 10, 0, y, 0, DARK));
  if (hazard) p.push(cyl(0.276, 0.276, 0.14, 10, 0, 0.58, 0, HAZ));
  return tipped ? group(p, x + 0.4, 0.28, z, 0.7, Math.PI / 2) : group(p, x, 0, z);
}

function buildKits() {
  const container = merge(containerParts());
  const containerStack = merge([...containerParts(GREEN), ...group(containerParts(), 0.25, 1.38, 0.04, 0.06)]);
  const crates = merge([...crate(0.9, 0, 0, 0, 0), ...crate(0.68, 0.92, 0, 0.12, 0.25), ...crate(0.55, 0.05, 0.9, -0.05, 0.5)]);
  const barrels = merge([...barrel(0, 0, false), ...barrel(0.6, 0.12, true), ...barrel(0.24, 0.55, false), ...barrel(-0.55, 0.65, false, true)]);
  const pipes = merge([
    cyl(0.15, 0.15, 3.2, 10, 0, 0.5, 0.22, LIGHT, 0, 0, Math.PI / 2), cyl(0.15, 0.15, 3.2, 10, 0, 0.5, -0.22, LIGHT, 0, 0, Math.PI / 2),
    ...[-1.55, -0.5, 0.5, 1.55].flatMap(x => [cyl(0.21, 0.21, 0.07, 10, x, 0.5, 0.22, DARK, 0, 0, Math.PI / 2), cyl(0.21, 0.21, 0.07, 10, x, 0.5, -0.22, DARK, 0, 0, Math.PI / 2)]),
    box(0.14, 0.42, 0.8, -1.05, 0.21, 0, DARK), box(0.14, 0.42, 0.8, 1.05, 0.21, 0, DARK),
    box(0.3, 0.05, 0.9, -1.05, 0.025, 0, MID), box(0.3, 0.05, 0.9, 1.05, 0.025, 0, MID),
    cyl(0.03, 0.03, 0.3, 5, 0, 0.78, 0.22, DARK), cyl(0.15, 0.15, 0.035, 12, 0, 0.93, 0.22, 0x9a3024),
  ]);
  const vent = merge([
    box(1.2, 0.4, 1.2, 0, 0.2, 0, MID), box(1.04, 0.02, 1.04, 0, 0.405, 0, 0x111316),
    ...[-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42].map(z => box(1.02, 0.05, 0.05, 0, 0.43, z, DARK)),
    box(1.26, 0.06, 1.26, 0, 0.03, 0, DARK), box(0.18, 0.08, 0.03, 0.4, 0.3, 0.61, RED, 1),
  ]);
  const consoleK = merge([
    box(0.72, 0.84, 0.46, 0, 0.42, 0, MID), box(0.78, 0.06, 0.52, 0, 0.03, 0, DARK),
    box(0.76, 0.07, 0.58, 0, 0.92, 0.08, DARK, 0, -0.62), box(0.58, 0.02, 0.4, 0, 0.955, 0.1, CYAN, 1, -0.62),
    box(0.05, 0.03, 0.05, -0.22, 0.64, 0.24, AMBER, 1), box(0.05, 0.03, 0.05, -0.12, 0.64, 0.24, GREEN, 1),
    box(0.3, 0.5, 0.06, 0, 1.2, -0.17, DARK), box(0.24, 0.36, 0.015, 0, 1.2, -0.135, CYAN, 0.6),
  ]);
  const cableParts: THREE.BufferGeometry[] = [];
  [[0, 0x1d1f22, 0.06], [0.14, 0x7a2a1e, 0.045], [-0.13, 0x2a3f6a, 0.045], [0.26, 0x1d1f22, 0.035]].forEach(([off, col, r]) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 9; i++) { const t = i / 9 * 3.4 - 1.7; pts.push(new THREE.Vector3(t, r + 0.01, Math.sin(t * 1.4 + off * 3) * 0.45 + off)); }
    for (let i = 0; i < 9; i++) cableParts.push(rod(pts[i]!, pts[i + 1]!, r, col));
  });
  cableParts.push(box(0.3, 0.12, 0.42, -1.75, 0.06, 0.05, DARK), box(0.3, 0.12, 0.5, 1.75, 0.06, 0.15, DARK));
  const cables = merge(cableParts);
  const debris = merge([
    box(0.9, 0.05, 0.62, 0, 0.06, 0, MID, 0, 0.12, 0.4, 0.05), box(0.7, 0.04, 0.5, 0.75, 0.04, 0.4, DARK, 0, 0, 1.1, 0.08),
    box(1.7, 0.12, 0.12, -0.2, 0.1, -0.45, LIGHT, 0, 0, -0.3, 0.06), box(0.4, 0.3, 0.35, -0.8, 0.15, 0.3, MID, 0, 0.2, 0.7, 0.3),
    box(0.5, 0.04, 0.3, 0.5, 0.18, -0.2, DARK, 0, -0.5, 0.9, 0.3), box(0.25, 0.2, 0.25, 0.25, 0.1, 0.65, HAZ, 0, 0, 0.4, 0),
  ]);
  const beacon = (c: number) => merge([cyl(0.15, 0.17, 0.1, 10, 0, 0.05, 0, DARK), cyl(0.1, 0.11, 0.06, 10, 0, 0.13, 0, c, 1)]);
  const smallBox = merge([box(0.36, 0.28, 0.46, 0, 0.14, 0, MID), box(0.37, 0.04, 0.47, 0, 0.2, 0, DARK), box(0.37, 0.04, 0.47, 0, 0.06, 0, DARK)]);
  const coil = merge([cyl(0.3, 0.3, 0.07, 12, 0, 0.035, 0, 0x1d1f22), cyl(0.28, 0.28, 0.07, 12, 0, 0.105, 0, 0x3a2a24), cyl(0.12, 0.12, 0.16, 8, 0, 0.08, 0, MID)]);
  const mast = merge([
    box(0.6, 0.1, 0.6, 0, 0.05, 0, DARK), cyl(0.05, 0.07, 2.6, 6, 0, 1.35, 0, LIGHT),
    box(0.7, 0.04, 0.04, 0, 1.9, 0, MID), box(0.04, 0.04, 0.5, 0, 2.25, 0, MID),
    cyl(0.28, 0.05, 0.12, 10, 0.12, 2.0, 0, LIGHT, 0, 0, -1.0), cyl(0.09, 0.09, 0.12, 8, 0, 2.71, 0, RED, 1),
  ]);
  const pylon = merge([
    box(0.9, 0.2, 0.9, 0, 0.1, 0, DARK), cyl(0.3, 0.34, 2.0, 6, 0, 1.1, 0, MID),
    cyl(0.36, 0.36, 0.08, 6, 0, 0.42, 0, DARK), cyl(0.36, 0.36, 0.08, 6, 0, 1.78, 0, DARK),
    box(0.07, 1.1, 0.07, 0.3, 1.1, 0, CYAN, 1), box(0.07, 1.1, 0.07, -0.3, 1.1, 0, CYAN, 1), box(0.8, 0.15, 0.8, 0, 2.15, 0, DARK),
  ]);
  const tankParts = [
    cyl(1.1, 1.1, 2.6, 14, 0, 1.3, 0, LIGHT), cyl(0.6, 1.1, 0.4, 14, 0, 2.8, 0, LIGHT), cyl(1.25, 1.25, 0.15, 14, 0, 0.075, 0, DARK),
    ...[0.7, 1.5, 2.3].map(y => cyl(1.13, 1.13, 0.08, 14, 0, y, 0, DARK)),
    box(0.06, 2.8, 0.06, 1.14, 1.4, 0.18, DARK), box(0.06, 2.8, 0.06, 1.14, 1.4, -0.18, DARK), box(0.05, 0.12, 0.2, 1.13, 2.4, 0.5, AMBER, 1),
  ];
  for (let y = 0.3; y < 2.7; y += 0.32) tankParts.push(box(0.04, 0.03, 0.36, 1.14, y, 0, DARK));
  const tank = merge(tankParts);
  return { container, containerStack, crates, barrels, pipes, vent, consoleK, cables, debris, beacons: [beacon(AMBER), beacon(CYAN), beacon(RED)], smallBox, coil, mast, pylon, tank };
}

/** One material for every station prop: vertex colour albedo, aGlow → emissive accents, world-projected grime map. */
function propMaterial(fog: FogU, size: number, applyFog: Applier, grime: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.58 });
  applyFog(mat, fog, size, true);
  const fogHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    fogHook.call(mat, sh, r);
    sh.uniforms.tGrime = { value: grime };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying vec3 vGlowC;\nvarying vec3 vPropN;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlowC = color.rgb * aGlow;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvPropN = mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrime;\nvarying vec3 vGlowC;\nvarying vec3 vPropN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs( normalize( vPropN ) );
          vec2 gp = an.y > max( an.x, an.z ) ? vFogWorld.xz : ( an.x > an.z ? vFogWorld.zy : vFogWorld.xy );
          float g = dot( texture2D( tGrime, gp * 0.42 ).rgb, vec3( 0.333 ) );
          diffuseColor.rgb *= mix( 0.55, 1.12, smoothstep( 0.45, 0.9, g ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vGlowC, step( 0.001, dot( vGlowC, vec3( 1.0 ) ) ) );
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlowC * 0.75;   // under the bloom threshold: tiny blooming lights shimmer while panning');
  };
  mat.customProgramCacheKey = () => 'station-prop';
  return mat;
}

export function createStationScenery(root: THREE.Group, detail: THREE.Group, mapSize: number, fog: FogU, applyFog: Applier) {
  const R = rng(4242);
  const baseUrl = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
  const tl = new THREE.TextureLoader();
  const grime = tl.load(baseUrl + 'textures/hull_plating.webp');
  grime.wrapS = grime.wrapT = THREE.RepeatWrapping; grime.colorSpace = THREE.SRGBColorSpace;
  const mat = propMaterial(fog, mapSize, applyFog, grime);
  const K = buildKits();
  const dummy = new THREE.Object3D();

  // ---- outer deck: dark hull plating outside the walls (replaces the meadow), on the same 45deg grid as the map's own panels ----
  const big = mapSize + 160;
  const og = new THREE.PlaneGeometry(big, big); og.rotateX(-Math.PI / 2); og.translate(mapSize / 2, -0.06, mapSize / 2);
  const op = og.getAttribute('position'), ouv = og.getAttribute('uv');
  for (let i = 0; i < op.count; i++) {
    const sx = op.getX(i) / 2.2, sy = (mapSize - op.getZ(i)) / 2.2;   // the terrain shader's slab grid (pw = (x, size - z))
    ouv.setXY(i, (sx - sy) * 0.70710678 * 0.25 - 0.06, (sx + sy) * 0.70710678 * 0.25 - 0.068);
  }
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x6e7379, roughness: 0.62, metalness: 0.38 });
  tl.load(baseUrl + 'textures/floor/station_panels.jpg', t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    outerMat.map = t; outerMat.needsUpdate = true;
  });
  applyFog(outerMat, fog, mapSize);
  const outerHook = outerMat.onBeforeCompile;
  outerMat.onBeforeCompile = (sh, r) => {
    outerHook.call(outerMat, sh, r);
    // pull the photo's green cast toward neutral gunmetal, like the in-map panels
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) ), diffuseColor.rgb, 0.35 ) * vec3( 0.95, 0.99, 1.05 );`);
  };
  outerMat.customProgramCacheKey = () => 'fow-outer-deck';
  const outer = new THREE.Mesh(og, outerMat); outer.receiveShadow = true;
  root.add(outer);

  // ---- placement: even dart-throwing spread, bases / lanes / ramps / expansions kept clear ----
  const laneDist = (x: number, z: number) => Math.min(999, ...LAYOUT.trails.map(t => {
    const dx = t.b[0] - t.a[0], dz = t.b[1] - t.a[1];
    const k = Math.max(0, Math.min(1, ((x - t.a[0]) * dx + (z - t.a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (t.a[0] + k * dx), z - (t.a[1] + k * dz));
  }));
  // every expansion of every map id that uses this layout stays clear
  const expos = Object.values(MAP_CONFIGS).filter(c => MAP_LAYOUT_OF[c.id] === LAYOUT.id).flatMap(c => c.expansionPositions);
  const placed: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) => placed.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r);
  const okInside = (x: number, z: number) =>
    ProceduralGrassSystem.getCliffWeight(x, z) < 0.01 && !ProceduralGrassSystem.isCliffWall(x, z) &&
    !LAYOUT.plateaus.some(pl => Math.hypot(x - pl.x, z - pl.y) < 24) && laneDist(x, z) >= 9 &&
    !LAYOUT.clearings.some(c => Math.hypot(x - c.x, z - c.y) < 13) && !expos.some(c => Math.hypot(x - c.x, z - c.y) < 12) && !LAYOUT.mesas.some(m => Math.hypot(x - m.x, z - m.y) < 9) &&
    !LAYOUT.rocks?.some(rk => Math.hypot(x - rk.x, z - rk.y) < 4);
  const sc2 = (mapSize / 120) ** 2;
  type Spot = { x: number; z: number; ry: number; s: number };
  const scatter = (count: number, r: number, gridYaw: boolean | 'axis', sMin = 1, sMax = 1, at?: () => [number, number] | null): Spot[] => {
    const out: Spot[] = [];
    for (let i = 0; i < count * 60 && out.length < count; i++) {
      let x: number, z: number;
      if (at) { const q = at(); if (!q) continue; [x, z] = q; } else { x = 5 + R() * (mapSize - 10); z = 5 + R() * (mapSize - 10); if (!okInside(x, z)) continue; }
      if (!free(x, z, r)) continue;
      placed.push({ x, z, r });
      const ry = gridYaw ? (gridYaw === 'axis' ? 0 : Math.PI / 4) + Math.floor(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.12 : R() * Math.PI * 2;
      out.push({ x, z, ry, s: sMin + R() * (sMax - sMin) });
    }
    return out;
  };
  const CHUNK = 40;   // bigger tiles than the outdoor scenery: fewer draw calls, still culled
  const emit = (geo: THREE.BufferGeometry, spots: Spot[], into: THREE.Object3D, shadow: boolean, tints?: number[], outside = false) => {
    if (!spots.length) return;
    const buckets = new Map<string, Spot[]>();
    for (const p of spots) { const k = Math.floor(p.x / CHUNK) + ',' + Math.floor(p.z / CHUNK); const b = buckets.get(k); if (b) b.push(p); else buckets.set(k, [p]); }
    for (const list of buckets.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, j) => {
        const y = outside ? -0.06 : ProceduralGrassSystem.getTerrainHeight(p.x, p.z) - 0.02;
        dummy.position.set(p.x, y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
        im.setMatrixAt(j, dummy.matrix);
        if (tints) im.setColorAt(j, new THREE.Color(tints[Math.floor(R() * tints.length)]!));
      });
      im.castShadow = shadow; im.receiveShadow = false;
      im.computeBoundingSphere();
      into.add(im);
    }
  };
  const cTints = [0x737c87, 0x8a7048, 0x7a5448, 0x55627a, 0x63686f, 0x6f757c];

  // big props first so the small ones fill around them; 30% of the outdoor doodad counts
  const edgeSpot = (): [number, number] | null => {   // just inside the walls (was the inner tree clumps)
    const e = 1.6 + R() * 1.6, t = 6 + R() * (mapSize - 12), side = Math.floor(R() * 4);
    const [x, z] = side === 0 ? [t, e] : side === 1 ? [t, mapSize - e] : side === 2 ? [e, t] : [mapSize - e, t];
    return LAYOUT.plateaus.some(p => Math.hypot(x - p.x, z - p.y) < 22) ? null : [x, z];
  };
  const edgeC = scatter(Math.round(21 * sc2), 1.6, 'axis', 0.9, 1.05, edgeSpot);
  emit(K.container, edgeC.filter((_, i) => i % 3), root, true, cTints);
  emit(K.containerStack, edgeC.filter((_, i) => !(i % 3)), root, true, cTints);
  emit(K.pylon, scatter(Math.round(3 * sc2), 1.4, true), detail, true);
  emit(K.mast, scatter(Math.round(8 * sc2), 1.0, false, 0.85, 1.2), detail, true);
  emit(K.pipes, scatter(Math.round(6 * sc2), 2.0, true, 0.9, 1.2), detail, true);
  emit(K.consoleK, scatter(Math.round(5 * sc2), 1.0, true), detail, true);
  emit(K.debris, scatter(Math.round(15 * sc2), 1.3, false, 0.8, 1.4), detail, false);
  emit(K.crates, scatter(Math.round(26 * sc2), 1.3, true, 0.85, 1.15), detail, true);
  emit(K.barrels, scatter(Math.round(24 * sc2), 1.0, false, 0.9, 1.1), detail, true, [0xffffff, 0xd8e0ff, 0xffe0c8]);
  emit(K.vent, scatter(Math.round(16 * sc2), 1.0, true), detail, false);
  emit(K.cables, scatter(Math.round(50 * sc2), 1.6, false, 0.8, 1.2), detail, false);
  emit(K.coil, scatter(Math.round(70 * sc2), 0.6, false, 0.8, 1.2), detail, false);
  emit(K.smallBox, scatter(Math.round(110 * sc2), 0.6, true, 0.8, 1.3), detail, false);
  const beacons = scatter(Math.round(160 * sc2), 0.7, false);
  K.beacons.forEach((g, k) => emit(g, beacons.filter((_, i) => i % 3 === k), detail, false));

  // ---- outside the walls (was the forest belt): container stacks, tanks and pipe racks on the hull ----
  const beltSpot = (): [number, number] | null => {
    const d = 3.2 + Math.pow(R(), 0.8) * 13, t = -12 + R() * (mapSize + 24), side = Math.floor(R() * 4);
    return side === 0 ? [t, -d] : side === 1 ? [t, mapSize + d] : side === 2 ? [-d, t] : [mapSize + d, t];
  };
  const sc = mapSize / 120;
  const belt = scatter(Math.round(150 * sc), 2.6, 'axis', 1.0, 1.6, beltSpot);
  emit(K.containerStack, belt.filter((_, i) => i % 3 === 0), root, false, cTints, true);
  emit(K.tank, belt.filter((_, i) => i % 3 === 1), root, false, [0xffffff, 0xc8d0dc, 0xb0a890], true);
  emit(K.pipes, belt.filter((_, i) => i % 3 === 2).map(s => ({ ...s, s: s.s * 1.5 })), root, false, undefined, true);
}
