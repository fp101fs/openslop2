import { Vector2D } from '../types';
import { MAP_SIZE } from '../config';
import { LAYOUT } from '../maps';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';

export class Pathfinding {
  public width: number;
  public height: number;
  public obstacleGrid: Uint8Array; // 0 = walkable, 1 = blocked
  private cliffGrid: Uint8Array;   // 1 = permanent impassable cliff or unbuildable ramp
  private version = 0;              // bumped whenever the blocked grid changes (invalidates cached flow fields)
  private fields = new Map<number, { version: number; dist: Float64Array; used: number }>();
  private fieldClock = 0;

  constructor(width: number = MAP_SIZE, height: number = MAP_SIZE) {
    this.width = width;
    this.height = height;
    this.obstacleGrid = new Uint8Array(width * height);
    this.cliffGrid = new Uint8Array(width * height);

    // Pre-mark impassable high-ground cliff faces and central tactical mesas
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // level maps: units are stopped by the half-tile cliff samples, so a cell is open only when every sample it touches is
        let wall = ProceduralGrassSystem.isCliffWall(x + 0.5, y + 0.5);
        if (!wall && LAYOUT.level) {
          for (let sy = 0; sy <= 2 && !wall; sy++) for (let sx = 0; sx <= 2; sx++) {
            if (ProceduralGrassSystem.isCliffWall(x + sx * 0.5, y + sy * 0.5)) { wall = true; break; }
          }
        }
        if (wall) {
          const idx = y * width + x;
          this.obstacleGrid[idx] = 1;
          this.cliffGrid[idx] = 1;
        }
      }
    }
  }

  public setObstacle(x: number, y: number, blocked: boolean) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx >= 0 && gx < this.width && gy >= 0 && gy < this.height) {
      const idx = gy * this.width + gx;
      if (this.obstacleGrid[idx] !== (blocked ? 1 : 0)) this.version++;
      if (this.cliffGrid[idx] === 1) {
        this.obstacleGrid[idx] = 1;
      } else {
        this.obstacleGrid[idx] = blocked ? 1 : 0;
      }
    }
  }

  public setAreaObstacle(x: number, y: number, w: number, h: number, blocked: boolean) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setObstacle(x + dx, y + dy, blocked);
      }
    }
  }

  public isWalkable(x: number, y: number): boolean {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return false;
    return this.obstacleGrid[gy * this.width + gx] === 0;
  }

  /** Permanent terrain wall (cliff face / unbuildable ramp), as opposed to a building or rock that happens to block a cell. */
  public isCliff(x: number, y: number): boolean {
    const gx = Math.floor(x), gy = Math.floor(y);
    return gx < 0 || gx >= this.width || gy < 0 || gy >= this.height || this.cliffGrid[gy * this.width + gx] === 1;
  }

  public isBuildable(x: number, y: number): boolean {
    if (!this.isWalkable(x, y)) return false;
    // Prevent building directly inside the narrow ramp roadway so units can always traverse
    return !ProceduralGrassSystem.isRamp(x + 0.5, y + 0.5);
  }

  public isAreaWalkable(x: number, y: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (!this.isBuildable(x + dx, y + dy)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Tactical Ramp Waypoint Router:
   * When a ground unit moves between a high-ground fortress plateau and low ground,
   * automatically route it through the carved tactical ramp corridor so armies
   * smoothly funnel through choke points without getting stuck on cliff walls.
   */
  public getRampWaypoint(fromPos: Vector2D, toPos: Vector2D): Vector2D | null {
    for (const p of LAYOUT.plateaus) {
      const fromD = Math.hypot(fromPos.x - p.x, fromPos.y - p.y);
      const toD = Math.hypot(toPos.x - p.x, toPos.y - p.y);
      const onPlateau = fromD < 16.5;
      const targetOnPlateau = toD < 16.5;
      if (onPlateau === targetOnPlateau) continue;
      // Ramp top (plateau lip) and bottom (valley floor) along this plateau's ramp axis
      const top = { x: p.x + p.dx * 14.6, y: p.y + p.dy * 14.6 };
      const topExit = { x: p.x + p.dx * 14.4, y: p.y + p.dy * 14.4 };
      const bottom = { x: p.x + p.dx * 23.3, y: p.y + p.dy * 23.3 };
      const rampInfo = ProceduralGrassSystem.getRampInfo(fromPos.x, fromPos.y);
      if (rampInfo.onRamp && fromD < 30) {
        // Already inside this ramp channel - aim toward the exit end
        const exitWp = onPlateau ? bottom : topExit;
        return Math.hypot(fromPos.x - exitWp.x, fromPos.y - exitWp.y) > 1.8 ? exitWp : null;
      }
      const entryWp = onPlateau ? top : bottom;
      if (Math.hypot(fromPos.x - entryWp.x, fromPos.y - entryWp.y) > 2.2) return entryWp;
      const exitWp = onPlateau ? bottom : topExit;
      if (Math.hypot(fromPos.x - exitWp.x, fromPos.y - exitWp.y) > 1.8) return exitWp;
    }
    return null;
  }

  // Find nearest walkable cell if target is blocked (e.g. clicked on a building or obstacle)
  public findNearestWalkable(target: Vector2D, maxRadius: number = 5): Vector2D {
    if (this.isWalkable(target.x, target.y)) return target;

    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const nx = target.x + dx;
            const ny = target.y + dy;
            if (this.isWalkable(nx, ny)) {
              return { x: nx, y: ny };
            }
          }
        }
      }
    }
    return target;
  }

  // Fast direct path with multi-angle whisker obstacle avoidance
  public getSteeringVector(
    pos: Vector2D,
    destination: Vector2D,
    lookahead: number = 1.2,
    preferredSide: number = 1
  ): Vector2D {
    const dirX = destination.x - pos.x;
    const dirY = destination.y - pos.y;
    const dist = Math.hypot(dirX, dirY);

    if (dist < 0.1) return { x: 0, y: 0 };

    const normX = dirX / dist;
    const normY = dirY / dist;

    // Check ahead at near and far lookahead points
    const checkNearX = pos.x + normX * (lookahead * 0.55);
    const checkNearY = pos.y + normY * (lookahead * 0.55);
    const checkFarX = pos.x + normX * lookahead;
    const checkFarY = pos.y + normY * lookahead;

    if (this.isWalkable(checkNearX, checkNearY) && this.isWalkable(checkFarX, checkFarY)) {
      return { x: normX, y: normY };
    }

    // Probe angled whiskers (35°, 65°, 90°) biased by preferredSide to prevent frame-to-frame oscillation
    const baseAngle = Math.atan2(normY, normX);
    const side = preferredSide >= 0 ? 1 : -1;
    const offsets = [0.6, -0.6, 1.1, -1.1, 1.57, -1.57];
    // Sort so preferredSide angles are tested first at each spread tier
    const orderedOffsets = offsets.map(a => a * side);

    for (const off of orderedOffsets) {
      const ang = baseAngle + off;
      const wx = Math.cos(ang);
      const wy = Math.sin(ang);
      if (
        this.isWalkable(pos.x + wx * (lookahead * 0.6), pos.y + wy * (lookahead * 0.6)) &&
        this.isWalkable(pos.x + wx * lookahead, pos.y + wy * lookahead)
      ) {
        return { x: wx, y: wy };
      }
    }

    return { x: normX, y: normY };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Flow-field routing for data-driven levels (src/levels): many walls, ramps and tiers need real pathfinding, not just
  // whisker steering. One distance field per destination cell (shared by every unit heading there), cached until the
  // blocked grid changes. Units follow the field and string-pull to the farthest point they can see.
  // ---------------------------------------------------------------------------------------------------------------
  /** Straight line walkable with `margin` of side clearance (so units don't scrape wall corners). */
  private lineClear(ax: number, ay: number, bx: number, by: number, margin = 0.42): boolean {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1e-6) return true;
    const px = -dy / d * margin, py = dx / d * margin;
    const n = Math.ceil(d / 0.4);
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + dx * t, y = ay + dy * t;
      if (!this.isWalkable(x, y) || !this.isWalkable(x + px, y + py) || !this.isWalkable(x - px, y - py)) return false;
    }
    return true;
  }

  /**
   * Cells where a flow field towards (goalX, goalY) starts. A walkable goal is a single cell. A goal inside a building / mineral patch /
   * rock (an SCV returning cargo to the Command Center, a unit sent to a structure) starts from EVERY walkable cell touching that
   * obstacle, so each unit approaches from its own side instead of walking round to one arbitrary face.
   */
  private fieldSources(goalX: number, goalY: number): number[] | null {
    const W = this.width, H = this.height, grid = this.obstacleGrid;
    const gx = Math.max(0, Math.min(W - 1, Math.floor(goalX))), gy = Math.max(0, Math.min(H - 1, Math.floor(goalY)));
    if (grid[gy * W + gx] === 0) return [gy * W + gx];
    if (this.cliffGrid[gy * W + gx] === 0) {
      // flood the blocked, non-cliff obstacle containing the goal cell (bounded) and collect its walkable neighbours
      const seen = new Set<number>([gy * W + gx]), stack = [gy * W + gx], ring = new Set<number>();
      while (stack.length && seen.size < 600) {
        const c = stack.pop()!, cx = c % W, cy = (c / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (grid[n] === 0) { if (!dx || !dy) ring.add(n); continue; }
          if (this.cliffGrid[n] === 0 && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      if (ring.size) return [...ring];
    }
    const n = this.findNearestWalkable({ x: goalX, y: goalY }, 8);
    return this.isWalkable(n.x, n.y) ? [Math.floor(n.y) * W + Math.floor(n.x)] : null;
  }

  private fieldFor(goalX: number, goalY: number): Float64Array | null {
    const sources = this.fieldSources(goalX, goalY);
    if (!sources) return null;
    const key = Math.max(0, Math.min(this.height - 1, Math.floor(goalY))) * this.width + Math.max(0, Math.min(this.width - 1, Math.floor(goalX)));
    const hit = this.fields.get(key);
    this.fieldClock++;
    if (hit && hit.version === this.version) { hit.used = this.fieldClock; return hit.dist; }

    const W = this.width, H = this.height, grid = this.obstacleGrid;
    const dist = new Float64Array(W * H).fill(Infinity);
    // binary heap of [cost, cell]
    const hc: number[] = [], hn: number[] = [];
    const push = (c: number, n: number) => {
      let i = hc.length; hc.push(c); hn.push(n);
      while (i > 0) { const p = (i - 1) >> 1; if (hc[p]! <= c) break; hc[i] = hc[p]!; hn[i] = hn[p]!; i = p; }
      hc[i] = c; hn[i] = n;
    };
    const pop = (): number => {
      const top = hn[0]!; const c = hc.pop()!, n = hn.pop()!;
      if (hc.length) {
        let i = 0;
        for (;;) {
          let m = 2 * i + 1; if (m >= hc.length) break;
          if (m + 1 < hc.length && hc[m + 1]! < hc[m]!) m++;
          if (hc[m]! >= c) break;
          hc[i] = hc[m]!; hn[i] = hn[m]!; i = m;
        }
        hc[i] = c; hn[i] = n;
      }
      return top;
    };
    for (const c of sources) { dist[c] = 0; push(0, c); }
    while (hc.length) {
      const d0 = hc[0]!; const c = pop();
      if (d0 > dist[c]!) continue;
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (grid[n] !== 0) continue;
        if (dx && dy && (grid[cy * W + nx] !== 0 || grid[ny * W + cx] !== 0)) continue; // no corner cutting
        const nd = d0 + (dx && dy ? 1.4142 : 1);
        if (nd < dist[n]!) { dist[n] = nd; push(nd, n); }
      }
    }
    this.fields.set(key, { version: this.version, dist, used: this.fieldClock });
    if (this.fields.size > 24) { // evict the least recently used field
      let oldest = -1, oldestUse = Infinity;
      for (const [k, v] of this.fields) if (v.used < oldestUse) { oldestUse = v.used; oldest = k; }
      this.fields.delete(oldest);
    }
    return dist;
  }

  /** Next point to steer to when walking from `from` to `to` around cliffs / walls, or null when the straight line is already clear. */
  public getPathWaypoint(from: Vector2D, to: Vector2D): Vector2D | null {
    if (this.lineClear(from.x, from.y, to.x, to.y)) return null;
    // a group move gives every unit its own formation slot: share one route per 4x4-cell block (otherwise 20+ distinct goals thrash the
    // field cache and every unit re-runs a whole-map search each frame, which made half the group stall); the last stretch is a clear straight line anyway
    const sx = Math.floor(to.x / 4) * 4 + 2, sy = Math.floor(to.y / 4) * 4 + 2;
    const goal = this.isWalkable(sx, sy) && this.lineClear(sx, sy, to.x, to.y, 0.2) ? { x: sx, y: sy } : to;
    const dist = this.fieldFor(goal.x, goal.y);
    if (!dist) return null;
    const W = this.width, H = this.height;
    let cx = Math.max(0, Math.min(W - 1, Math.floor(from.x))), cy = Math.max(0, Math.min(H - 1, Math.floor(from.y)));
    if (!isFinite(dist[cy * W + cx]!)) { // standing on a blocked / disconnected cell: hop to the best neighbour
      let best = Infinity, bx = cx, by = cy;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const d = dist[ny * W + nx]!;
        if (d < best) { best = d; bx = nx; by = ny; }
      }
      if (!isFinite(best)) return null;
      cx = bx; cy = by;
    }
    let bestPt: Vector2D | null = null;
    for (let step = 0; step < 14; step++) {
      const here = dist[cy * W + cx]!;
      if (here === 0) break;
      let bd = here, nx = cx, ny = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const ax = cx + dx, ay = cy + dy;
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        if (dx && dy && (this.obstacleGrid[cy * W + ax] !== 0 || this.obstacleGrid[ay * W + cx] !== 0)) continue;
        const d = dist[ay * W + ax]!;
        if (d < bd) { bd = d; nx = ax; ny = ay; }
      }
      if (nx === cx && ny === cy) break;
      cx = nx; cy = ny;
      const pt = { x: cx + 0.5, y: cy + 0.5 };
      if (step === 0 || this.lineClear(from.x, from.y, pt.x, pt.y)) bestPt = pt;
      else break;
    }
    return bestPt;
  }
}
