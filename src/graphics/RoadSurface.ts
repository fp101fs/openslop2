import * as THREE from 'three';
import type { Op } from '../levels/LevelTypes';

/**
 * Asphalt roads (themes with roadStyle 'asphalt'): the level's road polylines baked into a texture the terrain shader reads.
 *   R = distance from the nearest road's centre line / MAX_D   (1 = far from any road)
 *   G = road surface height at the nearest centre point / ROAD_MAX_H, so the dirt shoulders stay on ground near road level
 *       instead of spilling onto the plateau above a trench
 *   B = cos of the position along that road (one turn per DASH_PERIOD units): the dashed centre line. A cosine instead of the
 *       raw distance so linear filtering and 8-bit precision stay fine over a long road.
 *   A = that road's half width / MAX_D (0 = no road nearby)
 */
export const ROAD_MAX_D = 16;
export const DASH_PERIOD = 4;
export const ROAD_MAX_H = 8;
const TEX_PER_UNIT = 8;

type RoadOp = Extract<Op, { op: 'road' }>;

export interface RoadBake { texture: THREE.DataTexture; dist: Float32Array; half: Float32Array; res: number; mapSize: number }

export function bakeRoads(ops: Op[], mapSize: number, heightAt: (x: number, z: number) => number): RoadBake | null {
  const roads = ops.filter((o): o is RoadOp => o.op === 'road');
  if (!roads.length) return null;
  const res = Math.min(2048, Math.ceil(mapSize * TEX_PER_UNIT));
  const n = res * res;
  const dist = new Float32Array(n).fill(ROAD_MAX_D), along = new Float32Array(n), half = new Float32Array(n), cx = new Float32Array(n), cz = new Float32Array(n);
  for (const road of roads) {
    const h = road.width / 2;
    let acc = 0;
    for (let k = 0; k + 1 < road.pts.length; k++) {
      const [ax, ay] = road.pts[k]!, [bx, by] = road.pts[k + 1]!;
      const vx = bx - ax, vy = by - ay, len = Math.hypot(vx, vy) || 1e-6, len2 = len * len;
      const pad = ROAD_MAX_D;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad) / mapSize * res)), x1 = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + pad) / mapSize * res));
      const z0 = Math.max(0, Math.floor((Math.min(ay, by) - pad) / mapSize * res)), z1 = Math.min(res - 1, Math.ceil((Math.max(ay, by) + pad) / mapSize * res));
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const x = (ix + 0.5) / res * mapSize, z = (iz + 0.5) / res * mapSize, i = iz * res + ix;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - ay) * vy) / len2));
        // compare by distance past the asphalt edge, so a wide road is not overruled by a narrow one's centre
        const d = Math.hypot(x - (ax + vx * t), z - (ay + vy * t));
        if (d - h < dist[i]! - half[i]!) { dist[i] = d; along[i] = acc + t * len; half[i] = h; cx[i] = ax + vx * t; cz[i] = ay + vy * t; }
      }
      acc += len;
    }
  }
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (half[i]! > 0) data[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, heightAt(cx[i]!, cz[i]!) / ROAD_MAX_H)) * 255);
    const ph = along[i]! / DASH_PERIOD * Math.PI * 2;
    data[i * 4] = Math.round(Math.min(1, dist[i]! / ROAD_MAX_D) * 255);
    data[i * 4 + 2] = Math.round((Math.cos(ph) * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = Math.round(Math.min(1, half[i]! / ROAD_MAX_D) * 255);
  }
  const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, dist, half, res, mapSize };
}

/** Distance (world units) from the asphalt edge of the nearest road; negative on the asphalt, ROAD_MAX_D when far away. */
export function roadEdgeDist(b: RoadBake, x: number, z: number): number {
  const ix = Math.max(0, Math.min(b.res - 1, Math.floor(x / b.mapSize * b.res))), iz = Math.max(0, Math.min(b.res - 1, Math.floor(z / b.mapSize * b.res)));
  const i = iz * b.res + ix;
  return b.half[i]! > 0 ? b.dist[i]! - b.half[i]! : ROAD_MAX_D;
}
