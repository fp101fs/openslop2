import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ProceduralGrassSystem } from './ProceduralGrass';
import { LAYOUT } from '../maps';
import { createStationScenery } from './StationScenery';

/** Inject the SC2-style 3-state fog-of-war tint into a standard material (world XZ -> fog texture). */
export function applyFogOfWar(mat: THREE.Material, fogUniform: { value: THREE.Texture | null }, mapSize: number, instanced = false) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tFogMap = fogUniform;
    shader.uniforms.uMapSize = { value: mapSize };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (instanced
        ? 'vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;'
        : 'vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'));
    // Tint the albedo (and emissive) BEFORE lighting, exactly like the terrain shader does. Multiplying the final
    // tone-mapped colour instead turned shrouded doodads/trees pure black (0.04 in display space vs a dim lit surface).
    const sample = `
        float fogB = texture2D( tFogMap, clamp( vec2( vFogWorld.x, uMapSize - vFogWorld.z ) / uMapSize, 0.0, 1.0 ) ).r; // fog texture is flipY, V = 1 - z/size (same as grass)
        vec3 fogSh = vec3( 0.04, 0.06, 0.10 ), fogEx = vec3( 0.38, 0.44, 0.56 );
        vec3 fogTint = fogB < 0.42 ? mix( fogSh, fogEx, smoothstep( 0.0, 0.42, fogB ) ) : mix( fogEx, vec3( 1.0 ), smoothstep( 0.42, 1.0, fogB ) );`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;\nuniform sampler2D tFogMap;\nuniform float uMapSize;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{' + sample + '\n diffuseColor.rgb *= fogTint; }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{' + sample + '\n totalEmissiveRadiance *= fogTint; }');
  };
  mat.customProgramCacheKey = () => 'fow' + (instanced ? 'i' : '');
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function tint(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const strip = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };

/** Trees, rocks, bushes and flowers: map-edge forest + scattered ground cover. Returns the group to add to the scene. */
export function createScenery(mapSize: number, fogUniform: { value: THREE.Texture | null }, grassTex: THREE.Texture): THREE.Group {
  const root = new THREE.Group();
  const R = rng(1337);
  const dummy = new THREE.Object3D();
  // Spatial chunking: one big InstancedMesh can never be frustum-culled (it always draws every instance). Splitting
  // instances into map tiles gives each tile its own bounding sphere, so off-screen tiles cost nothing.
  const CHUNK = 24;
  const addChunked = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: { x: number; z: number }[], mats: THREE.Matrix4[], cols: THREE.Color[] | null, into: THREE.Object3D) => {
    const buckets = new Map<string, number[]>();
    pos.forEach((p, i) => { const k = Math.floor(p.x / CHUNK) + ',' + Math.floor(p.z / CHUNK); const b = buckets.get(k); if (b) b.push(i); else buckets.set(k, [i]); });
    for (const idx of buckets.values()) {
      const im = new THREE.InstancedMesh(geo, mat, idx.length);
      idx.forEach((si, j) => { im.setMatrixAt(j, mats[si]!); if (cols) im.setColorAt(j, cols[si]!); });
      im.castShadow = false; im.receiveShadow = false;
      im.computeBoundingSphere();
      im.frustumCulled = true;
      into.add(im);
    }
  };
  /** Small ground cover + doodads: hidden by the Low graphics tier. */
  const detail = new THREE.Group(); detail.name = 'sceneryDetail';
  root.userData.detail = detail;
  root.add(detail);
  if (!LAYOUT.level && LAYOUT.id === 'standard') {   // default map: space-station props instead of the outdoor doodads
    createStationScenery(root, detail, mapSize, fogUniform, applyFogOfWar);
    root.traverse(o => { o.userData.noOutline = true; (o as any).raycast = () => {}; });
    return root;
  }
  const baseAvoid = (x: number, z: number) => LAYOUT.plateaus.some(p => Math.hypot(x - p.x, z - p.y) < 22);
  const sc = mapSize / 120, sc2 = sc * sc; // density scale for bigger maps

  // ---- surrounding meadow so the playfield sits in a green landscape rather than a void ----
  const big = mapSize + 160;
  const gt = grassTex.clone(); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(big / 6, big / 6); gt.needsUpdate = true;
  const meadowMat = new THREE.MeshStandardMaterial({ map: gt, color: 0x5f9a3c, roughness: 0.95, metalness: 0 });
  applyFogOfWar(meadowMat, fogUniform, mapSize);
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(big, big), meadowMat);
  meadow.rotation.x = -Math.PI / 2; meadow.position.set(mapSize / 2, -0.06, mapSize / 2); meadow.receiveShadow = true;
  root.add(meadow);

  // ---- tree (conifer + broadleaf variants merged into single vertex-coloured geometries) ----
  const pine = mergeGeometries([
    tint(strip(new THREE.CylinderGeometry(0.18, 0.28, 1.6, 7).translate(0, 0.8, 0)), 0x5a3d22),
    tint(strip(new THREE.ConeGeometry(1.5, 2.4, 8).translate(0, 2.4, 0)), 0x2f6b2c),
    tint(strip(new THREE.ConeGeometry(1.15, 2.1, 8).translate(0, 3.7, 0)), 0x3a7d33),
    tint(strip(new THREE.ConeGeometry(0.75, 1.8, 8).translate(0, 4.9, 0)), 0x4a9140),
  ])!;
  const oak = mergeGeometries([
    tint(strip(new THREE.CylinderGeometry(0.22, 0.36, 2.0, 7).translate(0, 1.0, 0)), 0x6a4a2a),
    tint(strip(new THREE.IcosahedronGeometry(1.6, 1).translate(0, 3.0, 0)), 0x3f8f35),
    tint(strip(new THREE.IcosahedronGeometry(1.1, 1).translate(0.9, 2.6, 0.3)), 0x58a840),
    tint(strip(new THREE.IcosahedronGeometry(1.0, 1).translate(-0.8, 3.5, -0.4)), 0x2f7a2c),
  ])!;
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  applyFogOfWar(treeMat, fogUniform, mapSize, true);

  const treePos: { x: number; z: number; s: number; r: number; oak: boolean }[] = [];
  const addTree = (x: number, z: number) => treePos.push({ x, z, s: 0.8 + R() * 0.9, r: R() * 6.28, oak: R() < 0.4 });
  const outer = 14, wallGap = 2.2;
  for (let i = 0; i < Math.round(520 * sc); i++) { // thick forest belt outside the walls
    const t = R() * (mapSize + 2 * outer), d = wallGap + Math.pow(R(), 0.8) * outer;
    const side = Math.floor(R() * 4);
    const along = t - outer;
    if (side === 0) addTree(along, -d); else if (side === 1) addTree(along, mapSize + d);
    else if (side === 2) addTree(-d, along); else addTree(mapSize + d, along);
  }
  for (let i = 0; i < Math.round(70 * sc); i++) { // sparse clumps just inside the edges (skip the base corners)
    const e = 1.2 + R() * 2.2, t = 4 + R() * (mapSize - 8), side = Math.floor(R() * 4);
    const [x, z] = side === 0 ? [t, e] : side === 1 ? [t, mapSize - e] : side === 2 ? [e, t] : [mapSize - e, t];
    if (!baseAvoid(x, z)) addTree(x, z);
  }
  for (const [geo, isOak] of [[pine, false], [oak, true]] as const) {
    const list = treePos.filter(t => t.oak === isOak);
    const ms = list.map(t => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.r, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); return dummy.matrix.clone(); });
    addChunked(geo, treeMat, list, ms, null, root);
  }

  // ---- rocks (outcrops inside the playfield away from bases + along the edges) ----
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = rockGeo.getAttribute('position');
  for (let i = 0; i < rp.count; i++) {
    const k = 0.78 + (Math.sin(rp.getX(i) * 7.1 + rp.getY(i) * 3.3) * 0.5 + 0.5) * 0.4 + (Math.sin(rp.getZ(i) * 9.7) * 0.5 + 0.5) * 0.15;
    rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * 0.7, rp.getZ(i) * k);
  }
  // Faceted look from real per-face normals (shader flatShading rendered ~half the instances black on some GPUs)
  const rockFlat = rockGeo.toNonIndexed(); rockFlat.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8c86, roughness: 0.95 });
  applyFogOfWar(rockMat, fogUniform, mapSize, true);
  const rockSpots: { x: number; z: number; s: number; r: number }[] = [];
  const rockN = Math.round(160 * sc2), rockEdge = Math.round(110 * sc);
  for (let i = 0; i < rockN; i++) {
    const edge = i < rockEdge;
    let x: number, z: number;
    if (edge) { const d = 1.6 + R() * 8, t = -10 + R() * (mapSize + 20), s = Math.floor(R() * 4); [x, z] = s === 0 ? [t, -d] : s === 1 ? [t, mapSize + d] : s === 2 ? [-d, t] : [mapSize + d, t]; }
    else { x = 6 + R() * (mapSize - 12); z = 6 + R() * (mapSize - 12); if (baseAvoid(x, z) || ProceduralGrassSystem.getGrassBiomeWeight(x, z) < 0.95 || ProceduralGrassSystem.getCliffWeight(x, z) > 0.02) continue; }
    rockSpots.push({ x, z, s: 0.35 + Math.pow(R(), 2) * (edge ? 1.8 : 0.9), r: R() * 6.28 });
  }
  const rockMats: THREE.Matrix4[] = [], rockCols: THREE.Color[] = [];
  rockSpots.forEach((p) => {
    const inside = p.x > 0 && p.x < mapSize && p.z > 0 && p.z < mapSize;
    dummy.position.set(p.x, (inside ? ProceduralGrassSystem.getTerrainHeight(p.x, p.z) : 0) + p.s * 0.15, p.z);
    dummy.rotation.set(R() * 0.4, p.r, R() * 0.4); dummy.scale.set(p.s * (0.9 + R() * 0.5), p.s, p.s * (0.9 + R() * 0.5)); dummy.updateMatrix();
    rockMats.push(dummy.matrix.clone());
    rockCols.push(new THREE.Color().setHSL(0.1 + R() * 0.05, 0.05 + R() * 0.08, 0.45 + R() * 0.2));
  });
  addChunked(rockFlat, rockMat, rockSpots, rockMats, rockCols, root);

  // ---- bushes + flowers scattered across the grassland ----
  const bushGeo = new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed(); bushGeo.scale(1, 0.62, 1); bushGeo.computeVertexNormals();
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  applyFogOfWar(bushMat, fogUniform, mapSize, true);
  const flowerGeo = mergeGeometries([
    tint(strip(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4).translate(0, 0.14, 0)), 0x3c7a2a),
    tint(strip(new THREE.IcosahedronGeometry(0.075, 0).translate(0, 0.3, 0)), 0xffffff),
    tint(strip(new THREE.ConeGeometry(0.07, 0.07, 5).rotateX(Math.PI).translate(0, 0.22, 0)), 0x4a9a34),
  ])!;
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: 0x222222 });
  applyFogOfWar(flowerMat, fogUniform, mapSize, true);
  const bushes: { x: number; z: number }[] = [], flowers: { x: number; z: number }[] = [];
  const bushMax = Math.round(220 * sc2), flowerMax = Math.round(1300 * sc2);
  for (let i = 0; i < 6000 * sc2 && (bushes.length < bushMax || flowers.length < flowerMax); i++) {
    const x = 4 + R() * (mapSize - 8), z = 4 + R() * (mapSize - 8);
    if (ProceduralGrassSystem.getGrassBiomeWeight(x, z) < 0.97 || ProceduralGrassSystem.getCliffWeight(x, z) > 0.01) continue;
    if (LAYOUT.plateaus.some(p => Math.hypot(x - p.x, z - p.y) < 16)) continue;
    // flowers grow in drifts
    const drift = Math.sin(x * 0.31) * Math.sin(z * 0.27) + Math.sin(x * 0.09 + z * 0.13);
    if (drift > 0.5 && flowers.length < flowerMax) flowers.push({ x, z });
    else if (R() < 0.25 && bushes.length < bushMax) bushes.push({ x, z });
  }
  const bushMats: THREE.Matrix4[] = [], bushCols: THREE.Color[] = [];
  bushes.forEach((p) => {
    const s = 0.7 + R() * 0.9;
    dummy.position.set(p.x, ProceduralGrassSystem.getTerrainHeight(p.x, p.z) + 0.12, p.z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.set(s, s * (0.8 + R() * 0.5), s); dummy.updateMatrix();
    bushMats.push(dummy.matrix.clone()); bushCols.push(new THREE.Color().setHSL(0.25 + R() * 0.08, 0.5, 0.3 + R() * 0.14));
  });
  addChunked(bushGeo, bushMat, bushes, bushMats, bushCols, detail);
  const palette = [0xffffff, 0xffe14a, 0xff7fb0, 0xb48cff, 0xff6a4a, 0x7fc8ff];
  const flowerMats: THREE.Matrix4[] = [], flowerCols: THREE.Color[] = [];
  flowers.forEach((p) => {
    const s = 0.8 + R() * 0.9;
    dummy.position.set(p.x, ProceduralGrassSystem.getTerrainHeight(p.x, p.z), p.z); dummy.rotation.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3); dummy.scale.setScalar(s); dummy.updateMatrix();
    flowerMats.push(dummy.matrix.clone()); flowerCols.push(new THREE.Color(palette[Math.floor(R() * palette.length)]));
  });
  addChunked(flowerGeo, flowerMat, flowers, flowerMats, flowerCols, detail);

  // ---- extra doodads: dead trees, glowing crystal spires, broken ruin pillars, fallen logs (instanced, visual only) ----
  const deadGeo = mergeGeometries([
    tint(strip(new THREE.CylinderGeometry(0.1, 0.24, 2.6, 6).translate(0, 1.3, 0)), 0x5b5148),
    tint(strip(new THREE.CylinderGeometry(0.04, 0.09, 1.2, 5).rotateZ(0.9).translate(0.55, 2.1, 0)), 0x6a6055),
    tint(strip(new THREE.CylinderGeometry(0.03, 0.07, 1.0, 5).rotateZ(-1.0).translate(-0.45, 1.7, 0.1)), 0x6a6055),
    tint(strip(new THREE.CylinderGeometry(0.03, 0.06, 0.8, 5).rotateX(0.9).translate(0.05, 2.4, 0.35)), 0x5b5148),
  ])!;
  const crystalGeo = mergeGeometries([
    tint(strip(new THREE.ConeGeometry(0.22, 1.5, 5).translate(0, 0.75, 0)), 0x5eead4),
    tint(strip(new THREE.ConeGeometry(0.16, 1.0, 5).rotateZ(0.35).translate(0.28, 0.45, 0.05)), 0x38bdf8),
    tint(strip(new THREE.ConeGeometry(0.14, 0.8, 5).rotateZ(-0.4).translate(-0.25, 0.35, -0.08)), 0xa5f3fc),
  ])!;
  const pillarGeo = mergeGeometries([
    tint(strip(new THREE.BoxGeometry(0.9, 0.35, 0.9).translate(0, 0.17, 0)), 0x8b8d86),
    tint(strip(new THREE.CylinderGeometry(0.32, 0.36, 1.7, 8).translate(0, 1.2, 0)), 0xa3a59d),
    tint(strip(new THREE.CylinderGeometry(0.4, 0.34, 0.2, 8).translate(0, 2.15, 0)), 0x8b8d86),
  ])!;
  const logGeo = mergeGeometries([
    tint(strip(new THREE.CylinderGeometry(0.2, 0.24, 2.4, 7).rotateZ(Math.PI / 2).translate(0, 0.22, 0)), 0x6a4a2a),
    tint(strip(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 7).rotateZ(Math.PI / 2).translate(1.2, 0.22, 0)), 0xc8a06a),
  ])!;
  const doodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  applyFogOfWar(doodMat, fogUniform, mapSize, true);
  const crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, emissive: 0x1d8fa0, emissiveIntensity: 0.7 });
  applyFogOfWar(crystalMat, fogUniform, mapSize, true);
  // Real per-face normals (shader flatShading rendered black silhouettes on some GPUs, same issue as the rocks above)
  for (const g of [deadGeo, crystalGeo, pillarGeo, logGeo]) g.computeVertexNormals();
  // keep doodads out of walkways: base-to-base trails, expansion clearings and the plateau ramps/approaches
  const laneDist = (x: number, z: number) => Math.min(999, ...LAYOUT.trails.map(t => {
    const dx = t.b[0] - t.a[0], dz = t.b[1] - t.a[1];
    const k = Math.max(0, Math.min(1, ((x - t.a[0]) * dx + (z - t.a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (t.a[0] + k * dx), z - (t.a[1] + k * dz));
  }));
  const scatter = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number, minS: number, maxS: number, tilt: number) => {
    const spots: { x: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < count * 40 && spots.length < count; i++) {
      const x = 5 + R() * (mapSize - 10), z = 5 + R() * (mapSize - 10);
      if (ProceduralGrassSystem.getCliffWeight(x, z) > 0.01 || LAYOUT.plateaus.some(pl => Math.hypot(x - pl.x, z - pl.y) < 17)) continue;
      if (laneDist(x, z) < 9 || LAYOUT.clearings.some(c => Math.hypot(x - c.x, z - c.y) < 13) || LAYOUT.mesas.some(m => Math.hypot(x - m.x, z - m.y) < 9)) continue;
      if (LAYOUT.rocks?.some((rk: any) => Math.hypot(x - rk.x, z - rk.y) < 4)) continue;
      spots.push({ x, z, s: minS + R() * (maxS - minS), r: R() * 6.28 });
    }
    const ms = spots.map((p) => {
      dummy.position.set(p.x, ProceduralGrassSystem.getTerrainHeight(p.x, p.z), p.z);
      dummy.rotation.set((R() - 0.5) * tilt, p.r, (R() - 0.5) * tilt); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      return dummy.matrix.clone();
    });
    addChunked(geo, mat, spots, ms, null, detail);
  };
  scatter(deadGeo, doodMat, Math.round(26 * sc2), 0.8, 1.5, 0.15);
  scatter(crystalGeo, crystalMat, Math.round(16 * sc2), 0.8, 2.0, 0.2);
  scatter(pillarGeo, doodMat, Math.round(10 * sc2), 0.9, 1.4, 0.22);
  scatter(logGeo, doodMat, Math.round(20 * sc2), 0.8, 1.5, 0.05);

  root.traverse(o => { o.userData.noOutline = true; (o as any).raycast = () => {}; });
  return root;
}
