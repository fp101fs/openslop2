import { LevelDef, Op, Shape, TIER_HEIGHT } from './LevelTypes';

/** Pure (DOM / three free) rasteriser: LevelDef -> height field + cliff / ramp / biome / pathing data at 0.5-tile resolution. */
const hash2 = (x: number, y: number) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

export function inShape(s: Shape, x: number, y: number): boolean {
  if (s.k === 'poly') {
    let inside = false;
    const p = s.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i]!, [xj, yj] = p[j]!;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  let dx = x - s.x, dy = y - s.y;
  if (s.rot) { const c = Math.cos(-s.rot), sn = Math.sin(-s.rot); const rx = dx * c - dy * sn; dy = dx * sn + dy * c; dx = rx; }
  if (s.k === 'rect') return Math.abs(dx) <= s.w / 2 && Math.abs(dy) <= s.h / 2;
  return (dx * dx) / (s.rx * s.rx) + (dy * dy) / (s.ry * s.ry) <= 1;
}

function boxBlur(src: Float32Array, res: number, radius: number, passes: number): Float32Array {
  let a = Float32Array.from(src); const b = new Float32Array(src.length);
  const k = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < res; y++) { // horizontal
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += a[y * res + Math.min(res - 1, Math.max(0, x))]!;
      for (let x = 0; x < res; x++) {
        b[y * res + x] = acc / k;
        acc += a[y * res + Math.min(res - 1, x + radius + 1)]! - a[y * res + Math.max(0, x - radius)]!;
      }
    }
    for (let x = 0; x < res; x++) { // vertical
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[Math.min(res - 1, Math.max(0, y)) * res + x]!;
      for (let y = 0; y < res; y++) {
        a[y * res + x] = acc / k;
        acc += b[Math.min(res - 1, y + radius + 1) * res + x]! - b[Math.max(0, y - radius) * res + x]!;
      }
    }
  }
  return a;
}

export class LevelRaster {
  readonly size: number;
  readonly res: number;
  tier: Float32Array;
  ramp: Uint8Array;
  rampT: Float32Array;
  blocked: Uint8Array;
  liquid: Uint8Array;
  plaza: Float32Array;
  /** Painted road (road op): joins the ramps in the road texture mask. */
  paved: Float32Array;
  /** Unwalkable without changing the ground (block op): props' footprints. */
  solid: Uint8Array;
  height!: Float32Array;
  wall!: Uint8Array;
  cliffW!: Float32Array;
  road!: Float32Array;
  biome!: Float32Array;

  constructor(readonly def: LevelDef) {
    this.size = def.size;
    const res = this.res = def.size * 2 + 1;
    const hit = cache.get(def.id);
    if (hit) {
      this.tier = hit.tier; this.ramp = hit.ramp; this.rampT = hit.rampT;
      this.blocked = hit.blocked; this.liquid = hit.liquid; this.plaza = hit.plaza;
      this.height = hit.height; this.wall = hit.wall; this.cliffW = hit.cliffW;
      this.road = hit.road; this.biome = hit.biome; this.paved = hit.paved; this.solid = hit.solid;
      return;
    }
    const n = res * res;
    this.tier = new Float32Array(n).fill(def.baseTier ?? 0);
    this.ramp = new Uint8Array(n);
    this.rampT = new Float32Array(n);
    this.blocked = new Uint8Array(n);
    this.liquid = new Uint8Array(n);
    this.plaza = new Float32Array(n);
    this.paved = new Float32Array(n);
    this.solid = new Uint8Array(n);
    for (const op of def.ops) this.apply(op);
    this.finish();
  }

  private apply(op: Op) {
    const { res } = this;
    const wob = (op as any).wob ?? 1.2;
    if (op.op === 'road') { this.paintRoad(op); return; }
    for (let iz = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++) {
        const x = ix * 0.5, z = iz * 0.5, i = iz * res + ix;
        if (op.op === 'ramp') {
          const [ax, ay] = op.a, [bx, by] = op.b;
          const vx = bx - ax, vy = by - ay, len = Math.hypot(vx, vy), ux = vx / len, uy = vy / len;
          const proj = (x - ax) * ux + (z - ay) * uy;
          if (proj < 0 || proj > len) continue;
          const perp = Math.abs((x - ax) * -uy + (z - ay) * ux);
          const s = proj / len;
          const half = (op.width / 2) * (1 + 0.18 * (1 - Math.min(1, Math.min(s, 1 - s) * 6))); // mouths flare slightly
          if (perp > half) continue;
          this.tier[i] = op.t0 + (op.t1 - op.t0) * smooth(s * 1.05 - 0.025);
          this.ramp[i] = 1; this.rampT[i] = s; this.blocked[i] = 0; this.liquid[i] = 0;
          continue;
        }
        const dx = (vnoise(x * 0.13, z * 0.13) - 0.5) * 2 * wob;
        const dz = (vnoise(x * 0.13 + 40, z * 0.13 + 17) - 0.5) * 2 * wob;
        if (!inShape(op.shape, x + dx, z + dz)) continue;
        if (op.op === 'tier') {
          this.tier[i] = op.tier; this.ramp[i] = 0; this.blocked[i] = 0; this.liquid[i] = 0;
          if (op.plaza !== undefined) this.plaza[i] = op.plaza ? 1 : 0;
        } else if (op.op === 'massif') {
          this.tier[i] = op.tier; this.ramp[i] = 0; this.blocked[i] = 1; this.liquid[i] = 0;
        } else if (op.op === 'pit') {
          this.tier[i] = -op.depth; this.ramp[i] = 0; this.blocked[i] = 1; this.liquid[i] = op.liquid ? 1 : 0;
        } else if (op.op === 'plaza') {
          this.plaza[i] = op.on ? 1 : 0;
        } else if (op.op === 'block') {
          this.solid[i] = 1;
        }
      }
    }
  }

  /** Road op: every cell within width/2 of the polyline gets the road texture; with a tier, cells out to width/2 + shoulder
   *  are flattened to it (paving plus flat verges). The verges stop square at the road's two ends: a round cap would carve
   *  into the ground beside a ramp that continues the road and leave units snagged on the ramp's side. */
  private paintRoad(op: Extract<Op, { op: 'road' }>) {
    const { res } = this, pave = op.width / 2, half = pave + (op.tier !== undefined ? op.shoulder ?? 0 : 0);
    for (let k = 0; k + 1 < op.pts.length; k++) {
      const [ax, ay] = op.pts[k]!, [bx, by] = op.pts[k + 1]!;
      const vx = bx - ax, vy = by - ay, len2 = vx * vx + vy * vy || 1;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - 1) * 2)), x1 = Math.min(res - 1, Math.ceil((Math.max(ax, bx) + half + 1) * 2));
      const z0 = Math.max(0, Math.floor((Math.min(ay, by) - half - 1) * 2)), z1 = Math.min(res - 1, Math.ceil((Math.max(ay, by) + half + 1) * 2));
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const x = ix * 0.5, z = iz * 0.5, i = iz * res + ix;
        const tRaw = ((x - ax) * vx + (z - ay) * vy) / len2, t = Math.max(0, Math.min(1, tRaw));
        const d = Math.hypot(x - (ax + vx * t), z - (ay + vy * t));
        const pastEnd = (k === 0 && tRaw < 0) || (k + 2 === op.pts.length && tRaw > 1);
        if (d > (pastEnd ? pave : half)) continue;
        if (d <= pave) this.paved[i] = 1;
        if (op.tier !== undefined && !this.ramp[i]) { this.tier[i] = op.tier; this.blocked[i] = 0; this.liquid[i] = 0; }
      }
    }
  }

  private finish() {
    const { res, size } = this;
    const n = res * res;
    // map border: impassable, flat
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const x = ix * 0.5, z = iz * 0.5;
      if (x < 4 || z < 4 || x > size - 4 || z > size - 4) { const i = iz * res + ix; this.blocked[i] = 1; this.ramp[i] = 0; }
    }
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.tier[i]! * TIER_HEIGHT;
    this.height = boxBlur(raw, res, 2, 2);
    // rock rim around the map edge (no hard drop into the void)
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const d = Math.min(ix, iz, res - 1 - ix, res - 1 - iz) * 0.5;
      if (d < 4.5) { const i = iz * res + ix; this.height[i] = Math.max(this.height[i]!, 3.6 * smooth((4.5 - d) / 2.5) * (0.15 + 0.85 * smooth(d / 1.8))); }
    }
    // gentle rock grain on the blocked masses only (keeps playable ground flat)
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix;
      if (this.blocked[i] && !this.liquid[i]) this.height[i] = this.height[i]! + (vnoise(ix * 0.35, iz * 0.35) - 0.5) * 0.5 + (vnoise(ix * 0.9, iz * 0.9) - 0.5) * 0.18;
    }

    // pathing wall: blocked cells, plus any non-ramp cell within 1 tile of a different tier
    this.wall = new Uint8Array(n);
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix;
      if (this.blocked[i] || this.solid[i]) { this.wall[i] = 1; continue; }
      if (this.ramp[i]) continue;
      const t = this.tier[i]!;
      let w = 0;
      for (let dz = -2; dz <= 2 && !w; dz++) for (let dx = -2; dx <= 2; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= res || jz >= res) continue;
        const j = jz * res + jx;
        if (this.blocked[j] || Math.abs(this.tier[j]! - t) >= 0.2) { w = 1; break; }
      }
      this.wall[i] = w;
    }

    // visual cliff weight from the blurred slope (+ solid rock on massifs), road / ao for ramps
    const ramp01 = new Float32Array(n);
    for (let i = 0; i < n; i++) ramp01[i] = Math.max(this.ramp[i]!, this.paved[i]!);
    this.road = boxBlur(ramp01, res, 1, 1);
    this.cliffW = new Float32Array(n);
    for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
      const i = iz * res + ix;
      const l = this.height[iz * res + Math.max(0, ix - 1)]!, r = this.height[iz * res + Math.min(res - 1, ix + 1)]!;
      const u = this.height[Math.max(0, iz - 1) * res + ix]!, d = this.height[Math.min(res - 1, iz + 1) * res + ix]!;
      const slope = Math.hypot(r - l, d - u); // per 1 tile
      let w = smooth((slope - 0.16) / 0.3);
      if (this.blocked[i] && !this.liquid[i]) w = 1;
      this.cliffW[i] = w * (1 - Math.min(1, this.road[i]! * 1.2));
    }
    const pl = boxBlur(this.plaza, res, 3, 3);
    this.biome = new Float32Array(n);
    for (let i = 0; i < n; i++) this.biome[i] = 1 - Math.min(1, pl[i]! * 1.15);
  }

  // ---- queries (world coords, 1 unit = 1 tile) ----
  private idx(x: number, z: number) {
    const ix = Math.max(0, Math.min(this.res - 1, Math.round(x * 2)));
    const iz = Math.max(0, Math.min(this.res - 1, Math.round(z * 2)));
    return iz * this.res + ix;
  }
  private bil(a: Float32Array, x: number, z: number) {
    const res = this.res;
    const fx = Math.max(0, Math.min(res - 1.001, x * 2)), fz = Math.max(0, Math.min(res - 1.001, z * 2));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * res + ix;
    const h0 = a[i]! + (a[i + 1]! - a[i]!) * tx, h1 = a[i + res]! + (a[i + res + 1]! - a[i + res]!) * tx;
    return h0 + (h1 - h0) * tz;
  }
  heightAt(x: number, z: number) {
    return this.bil(this.height, x, z);
  }
  isWall(x: number, z: number) { return this.wall[this.idx(x, z)] === 1; }
  isRamp(x: number, z: number) { return this.ramp[this.idx(x, z)] === 1; }
  rampT01(x: number, z: number) { return this.rampT[this.idx(x, z)]!; }
  cliffWeight(x: number, z: number) { return this.bil(this.cliffW, x, z); }
  roadWeight(x: number, z: number) { return this.bil(this.road, x, z); }
  biomeWeight(x: number, z: number) { return this.bil(this.biome, x, z); }
  isLiquid(x: number, z: number) { return this.liquid[this.idx(x, z)] === 1; }
  tierAt(x: number, z: number) { return this.tier[this.idx(x, z)]!; }
}

const cache = new Map<string, LevelRaster>();
export function primeRaster(id: string, r: LevelRaster) { cache.set(id, r); }
export function rasterFor(def: LevelDef): LevelRaster {
  let r = cache.get(def.id);
  if (!r) { r = new LevelRaster(def); cache.set(def.id, r); }
  return r;
}
