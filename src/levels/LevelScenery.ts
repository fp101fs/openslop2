import * as THREE from 'three';
import { applyFogOfWar } from '../graphics/Scenery';
import type { LevelDef, PropRule } from './LevelTypes';
import type { LevelRaster } from './LevelRaster';
import type { Theme } from './Themes';
import { buildKit } from './PropKits';
import './CampaignProps';
import { hasSlopmap, buildSlopmapScenery } from './SlopmapLoader';

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Points the player cares about (town halls, minerals, geysers): props keep clear of them. */
function keepClear(def: LevelDef): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const b of def.bases) {
    out.push({ x: b.th[0], z: b.th[1] });
    for (const p of [...b.minerals, ...b.geysers]) out.push({ x: p[0], z: p[1] });
  }
  return out;
}

function zoneOk(rule: PropRule, r: LevelRaster, x: number, z: number): boolean {
  const size = r.size;
  switch (rule.zone) {
    case 'massif': return r.blocked[r.res * Math.round(z * 2) + Math.round(x * 2)] === 1 && !r.isLiquid(x, z) && x > 5 && z > 5 && x < size - 5 && z < size - 5 && r.cliffWeight(x, z) > 0.9;
    case 'border': return (x < 7 || z < 7 || x > size - 7 || z > size - 7) && x > 1 && z > 1 && x < size - 1 && z < size - 1;
    case 'cliff': return !r.isRamp(x, z) && r.roadWeight(x, z) < 0.02 && r.cliffWeight(x, z) > 0.3 && r.cliffWeight(x, z) < 0.95 && !r.isLiquid(x, z);
    case 'plaza': return !r.isWall(x, z) && r.biomeWeight(x, z) < 0.25;
    default: return !r.isWall(x, z) && !r.isRamp(x, z) && r.roadWeight(x, z) < 0.02 && r.biomeWeight(x, z) > 0.6;
  }
}

/** Scatter every prop rule of the level into instanced meshes (one per kit variant). */
export async function buildLevelProps(def: LevelDef, theme: Theme, r: LevelRaster,
  fogUniform: { value: THREE.Texture | null }, heightAt: (x: number, z: number) => number): Promise<THREE.Group> {
  if (hasSlopmap(def.id)) return buildSlopmapScenery(def, theme, fogUniform, heightAt);
  const root = new THREE.Group(); root.name = 'levelProps';
  const clear = keepClear(def);
  const R = rng(def.size * 7919 + 13);
  for (const rule of def.props) {
    const variants = await buildKit(rule.kit, theme);
    if (!variants.length) continue;
    const minD = rule.minDistBase ?? (rule.zone === 'open' || rule.zone === 'plaza' ? 10 : 6);
    const cells: [number, number][] = [];
    for (let z = 2; z < def.size - 2; z++) for (let x = 2; x < def.size - 2; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      if (!zoneOk(rule, r, cx, cz)) continue;
      if (clear.some(c => Math.hypot(c.x - cx, c.z - cz) < minD)) continue;
      cells.push([cx, cz]);
    }
    const count = Math.min(cells.length, Math.round((cells.length / 100) * rule.density));
    const [s0, s1] = rule.scale ?? [0.8, 1.3];
    const perVariant: THREE.Matrix4[][] = variants.map(() => []);
    const dummy = new THREE.Object3D();
    for (let n = 0; n < count; n++) {
      const [cx, cz] = cells.splice(Math.floor(R() * cells.length), 1)[0]!;
      const x = cx + (R() - 0.5), z = cz + (R() - 0.5);
      const vi = Math.floor(R() * variants.length);
      const s = s0 + R() * (s1 - s0);
      dummy.position.set(x, heightAt(x, z) - 0.05, z);
      dummy.rotation.set(0, R() * Math.PI * 2, 0);
      dummy.scale.set(s * (0.9 + R() * 0.25), s * (0.85 + R() * 0.35), s * (0.9 + R() * 0.25));
      dummy.updateMatrix();
      perVariant[vi]!.push(dummy.matrix.clone());
    }
    variants.forEach((v, i) => {
      const ms = perVariant[i]!;
      if (!ms.length) return;
      const mat = (v.mat as THREE.Material).clone();
      applyFogOfWar(mat, fogUniform, def.size, true);
      const im = new THREE.InstancedMesh(v.geo, mat, ms.length);
      ms.forEach((m, j) => im.setMatrixAt(j, m));
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      root.add(im);
    });
  }
  // props placed at exact spots (campaign maps: statues, gas stations, signs)
  for (const d of def.decor ?? []) {
    const variants = await buildKit(d.kit, theme);
    const v = variants[(d.variant ?? 0) % Math.max(1, variants.length)];
    if (!v) continue;
    const mat = (v.mat as THREE.Material).clone();
    applyFogOfWar(mat, fogUniform, def.size, false); // a plain mesh, not instanced
    const mesh = new THREE.Mesh(v.geo, mat);
    const sc = d.scale ?? 1;
    mesh.position.set(d.at[0], heightAt(d.at[0], d.at[1]) - 0.02, d.at[1]);
    mesh.rotation.y = d.rot ?? 0; mesh.scale.setScalar(sc);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
