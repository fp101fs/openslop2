import { BaseDef, LevelDef, Op, Pt, Shape } from './LevelTypes';

/** Standard SC2 resource layout: 8 mineral patches in a curved line behind the town hall (ends curl inward) and a geyser at each end. */
export function mkBase(th: Pt, face: number, kind: BaseDef['kind'], patches = 8, geysers = 2): BaseDef {
  const minerals: Pt[] = [];
  for (let i = 0; i < patches; i++) {
    const t = patches === 1 ? 0 : (i / (patches - 1)) * 2 - 1;      // -1..1 along the arc
    const a = face + t * 1.02;
    const r = 7.5 - 0.9 * t * t + (i % 2 ? 0.25 : -0.1);
    minerals.push([th[0] + Math.cos(a) * r, th[1] + Math.sin(a) * r]);
  }
  const gs: Pt[] = [];
  if (geysers >= 1) gs.push([th[0] + Math.cos(face - 1.62) * 8, th[1] + Math.sin(face - 1.62) * 8]);
  if (geysers >= 2) gs.push([th[0] + Math.cos(face + 1.62) * 8, th[1] + Math.sin(face + 1.62) * 8]);
  return { th, face, kind, minerals, geysers: gs };
}

export type Sym = 'rot' | 'flipx' | 'flipy' | 'diag';
const mp = (p: Pt, s: number, m: Sym): Pt =>
  m === 'rot' ? [s - p[0], s - p[1]] : m === 'flipx' ? [s - p[0], p[1]] : m === 'flipy' ? [p[0], s - p[1]] : [p[1], p[0]];
const mAng = (a: number, m: Sym) =>
  m === 'rot' ? a + Math.PI : m === 'flipx' ? Math.PI - a : m === 'flipy' ? -a : Math.PI / 2 - a;

export const mirrorPt = mp;
export const mirrorAngle = mAng;

export function mirrorShape(sh: Shape, s: number, m: Sym): Shape {
  if (sh.k === 'poly') return { k: 'poly', pts: sh.pts.map(p => mp(p, s, m)) };
  const c = mp([sh.x, sh.y], s, m);
  return { ...sh, x: c[0], y: c[1], rot: sh.rot !== undefined ? mAng(sh.rot, m) : undefined } as Shape;
}

export function mirrorOp(op: Op, s: number, m: Sym): Op {
  if (op.op === 'ramp') return { ...op, a: mp(op.a, s, m), b: mp(op.b, s, m) };
  if (op.op === 'road') return { ...op, pts: op.pts.map(p => mp(p, s, m)) };
  return { ...op, shape: mirrorShape(op.shape, s, m) } as Op;
}

export function mirrorBase(b: BaseDef, s: number, m: Sym): BaseDef {
  return {
    ...b, th: mp(b.th, s, m), face: mAng(b.face, m),
    minerals: b.minerals.map(p => mp(p, s, m)), geysers: b.geysers.map(p => mp(p, s, m))
  };
}

/** Ops + their mirror image (ops order preserved: originals first, then mirrored copies). */
export function withMirror(ops: Op[], s: number, m: Sym): Op[] {
  return [...ops, ...ops.map(o => mirrorOp(o, s, m))];
}

export const ell = (x: number, y: number, rx: number, ry = rx, rot?: number): Shape => ({ k: 'ell', x, y, rx, ry, rot });
export const rect = (x: number, y: number, w: number, h: number, rot?: number): Shape => ({ k: 'rect', x, y, w, h, rot });
export const poly = (...pts: Pt[]): Shape => ({ k: 'poly', pts });

const sc = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
function scaleShape(sh: Shape, k: number): Shape {
  if (sh.k === 'poly') return { k: 'poly', pts: sh.pts.map(p => sc(p, k)) };
  if (sh.k === 'rect') return { ...sh, x: sh.x * k, y: sh.y * k, w: sh.w * k, h: sh.h * k };
  return { ...sh, x: sh.x * k, y: sh.y * k, rx: sh.rx * k, ry: sh.ry * k };
}

/**
 * Blow a level up by `k`: terrain shapes, ramps, base spots and ramp defences scale; resource lines keep their true size
 * (they are re-generated around the scaled town hall). `extraBases` (already in the scaled coordinate space, plus their
 * mirror images) add expansions to use the new room.
 */
export function scaleLevel(def: LevelDef, k: number, patch: Partial<LevelDef> = {}, extra: BaseDef[] = [], sym: Sym = 'rot'): LevelDef {
  const size = Math.round(def.size * k);
  const ops = def.ops.map((o): Op => o.op === 'ramp'
    ? { ...o, a: sc(o.a, k), b: sc(o.b, k), width: o.width * Math.min(k, 1.35) }
    : o.op === 'road' ? { ...o, pts: o.pts.map(p => sc(p, k)), width: o.width * Math.min(k, 1.35), shoulder: o.shoulder === undefined ? undefined : o.shoulder * Math.min(k, 1.35) }
    : { ...o, shape: scaleShape(o.shape, k) } as Op);
  const bases = def.bases.map(b => mkBase(sc(b.th, k), b.face, b.kind, b.minerals.length, b.geysers.length));
  const all = [...bases, ...extra, ...extra.map(b => mirrorBase(b, size, sym))];
  return {
    ...def, size, ops, bases: all,
    starts: [{ base: def.starts[0].base, defense: sc(def.starts[0].defense, k) }, { base: def.starts[1].base, defense: sc(def.starts[1].defense, k) }],
    ...patch
  };
}

/** SC2 town halls (Command Center, Hatchery, Nexus) are 5x5. */
export const TOWN_HALL_SIZE = 5;
/** SC2 no-build gap between a town hall and the resources around it (cells). */
const RES_GAP = 3;

/**
 * SC2 base geometry around a 5x5 town hall: the hall sits on a cell centre; every geyser (3x3, on a cell centre) and
 * mineral field (2x1: x on a cell edge, y on a cell centre) sits on the grid exactly RES_GAP cells from the hall's edge,
 * mineral fields alternating between the near and far row (gap 3 / 4) like a ladder mineral line. Each resource keeps
 * its authored direction from the hall and is only moved along that ray, so the layout keeps its shape.
 * `blocked(cellX, cellY)` (optional) marks cliff / wall cells: a resource never lands on one, and keeps an open cell on its
 * hall side for the workers. In a pocket too small for the full gap it moves further out, then closer in (gap < 3),
 * and as a last resort stays on its authored spot.
 */
export function fitBaseResources(th: Pt, minerals: Pt[], geysers: Pt[], blocked?: (x: number, y: number) => boolean): { th: Pt; minerals: Pt[]; geysers: Pt[] } {
  const c: Pt = [Math.floor(th[0]) + 0.5, Math.floor(th[1]) + 0.5];
  const placed: { p: Pt; w: number; h: number }[] = [{ p: c, w: TOWN_HALL_SIZE, h: TOWN_HALL_SIZE }];
  const gapTo = (p: Pt, w: number, h: number) =>
    Math.max(Math.abs(p[0] - c[0]) - (TOWN_HALL_SIZE + w) / 2, Math.abs(p[1] - c[1]) - (TOWN_HALL_SIZE + h) / 2);
  const free = (p: Pt, w: number, h: number) => placed.every(o =>
    Math.abs(p[0] - o.p[0]) >= (w + o.w) / 2 || Math.abs(p[1] - o.p[1]) >= (h + o.h) / 2);
  const open = (p: Pt, w: number, h: number, dx: number, dy: number) => {
    if (!blocked) return true;
    for (let x = Math.round(p[0] - w / 2); x < p[0] + w / 2; x++) for (let y = Math.round(p[1] - h / 2); y < p[1] + h / 2; y++) if (blocked(x, y)) return false;
    // the workers' side (towards the hall) must be open too
    const sx = p[0] - dx * (Math.max(w, h) / 2 + 0.7), sy = p[1] - dy * (Math.max(w, h) / 2 + 0.7);
    return !blocked(Math.floor(sx), Math.floor(sy));
  };
  const fit = (src: Pt, w: number, h: number, gap: number, snap: (p: Pt) => Pt): Pt | null => {
    const a0 = Math.atan2(src[1] - c[1], src[0] - c[0]);
    // distance along direction (dx, dy) where the gap to the hall's edge is `g` (Chebyshev, like SC2's footprint check)
    const rAt = (dx: number, dy: number, g: number) => Math.min(
      Math.abs(dx) > 1e-6 ? ((TOWN_HALL_SIZE + w) / 2 + g) / Math.abs(dx) : Infinity,
      Math.abs(dy) > 1e-6 ? ((TOWN_HALL_SIZE + h) / 2 + g) / Math.abs(dy) : Infinity);
    const tryAt = (da: number, g: number, extra: number): Pt | null => {
      const dx = Math.cos(a0 + da), dy = Math.sin(a0 + da);
      const r0 = rAt(dx, dy, g);
      for (let r = r0; r <= r0 + extra + 1e-6; r += 0.5) {
        const p = snap([c[0] + dx * r, c[1] + dy * r]);
        if (gapTo(p, w, h) >= g - 1e-6 && free(p, w, h) && open(p, w, h, dx, dy)) return p;
      }
      return null;
    };
    // 1) the full gap on the authored bearing (a little further out if needed); 2) the full gap, swung round the hall
    // (a pocket base wraps its line round the corner, as SC2 maps do); 3) a smaller gap; 4) the authored spot
    const swings = [0];
    for (let k = 1; k <= 8; k++) swings.push(k * 0.12, -k * 0.12);
    let p: Pt | null = tryAt(0, gap, 5);
    for (const da of swings) { if (p) break; p = tryAt(da, gap, 2); }
    for (let g = gap - 1; g >= 0 && !p; g--) for (const da of swings) { p = tryAt(da, g, 0); if (p) break; }
    for (let k = 9; k <= 13 && !p; k++) p = tryAt(k * 0.12, 0, 3) ?? tryAt(-k * 0.12, 0, 3);
    if (!p) { if (blocked) return null; p = snap(src); } // nowhere open near the hall: the patch is left out
    placed.push({ p, w, h });
    return p;
  };
  const gs = geysers.map(g => fit(g, 3, 3, RES_GAP, p => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5])).filter((p): p is Pt => !!p);
  const ms = minerals.map((m, i) => fit(m, 2, 1, RES_GAP + (i % 2), p => [Math.round(p[0]), Math.floor(p[1]) + 0.5])).filter((p): p is Pt => !!p);
  return { th: c, minerals: ms, geysers: gs };
}

/**
 * `blocked` for fitBaseResources: true for wall cells and for every cell not connected to the hall's own open area
 * (flood fill within `reach` cells), so resources can never be pushed through a wall into the next area.
 */
export function hallAreaBlocked(th: Pt, wall: (x: number, y: number) => boolean, reach = 18): (x: number, y: number) => boolean {
  const cx = Math.floor(th[0]), cy = Math.floor(th[1]), n = reach * 2 + 1;
  const seen = new Uint8Array(n * n);
  const key = (x: number, y: number) => (y - cy + reach) * n + (x - cx + reach);
  const inBox = (x: number, y: number) => Math.abs(x - cx) <= reach && Math.abs(y - cy) <= reach;
  const stack: number[] = [cx, cy];
  if (!wall(cx, cy)) seen[key(cx, cy)] = 1; else stack.length = 0;
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx!, ny = y + dy!;
      if (!inBox(nx, ny) || seen[key(nx, ny)] || wall(nx, ny)) continue;
      seen[key(nx, ny)] = 1; stack.push(nx, ny);
    }
  }
  return (x, y) => !inBox(x, y) || !seen[key(x, y)];
}
