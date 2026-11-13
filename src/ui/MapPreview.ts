import { LAYOUTS, MAP_LAYOUT_OF } from '../maps';
import { MAP_CONFIGS } from '../config';
import { rasterFor, type LevelRaster } from '../levels/LevelRaster';
import { themeOf } from '../levels/Themes';

/**
 * Draws a top-down preview of any map into a canvas for the map-select screen, without needing the map to be loaded:
 * data-driven levels come from their raster + theme palette, the classic maps from their plateau / mesa / trail lists.
 */
const BLUE = '#4aa8ff', RED = '#ff4a4a', CYAN = '#38e8ff';

/** Paint a level's terrain (theme colours: ground / plaza by tier, cliffs, liquid, roads) into an N x N canvas, top-down.
 *  Shared by the map-select previews and the Mission Builder's map view. */
export function paintLevel(ctx: CanvasRenderingContext2D, r: LevelRaster, theme: string, N: number) {
  const k = N / r.size;
  const img = ctx.createImageData(N, N);
  const px = img.data;
  const put = (i: number, rr: number, gg: number, bb: number) => { px[i] = rr; px[i + 1] = gg; px[i + 2] = bb; px[i + 3] = 255; };
  const th = themeOf(theme);
  const [g, p, c] = th.minimap;
  const lq = [(th.liquid >> 16) & 255, (th.liquid >> 8) & 255, th.liquid & 255];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = (x + 0.5) / k, wz = (y + 0.5) / k, i = (y * N + x) * 4;
    if (r.isLiquid(wx, wz)) { put(i, lq[0]! * 0.8, lq[1]! * 0.8, lq[2]! * 0.8); continue; }
    const cw = r.cliffWeight(wx, wz);
    if (cw > 0.5 || r.blocked[r.res * Math.round(wz * 2) + Math.round(wx * 2)]) { put(i, c[0], c[1], c[2]); continue; }
    if (r.roadWeight(wx, wz) > 0.5) { put(i, 150, 156, 164); continue; }
    const t = r.tierAt(wx, wz), plaza = 1 - r.biomeWeight(wx, wz);
    const f = 0.82 + t * 0.12;
    put(i, Math.min(255, (g[0] * (1 - plaza) + p[0] * plaza) * f), Math.min(255, (g[1] * (1 - plaza) + p[1] * plaza) * f), Math.min(255, (g[2] * (1 - plaza) + p[2] * plaza) * f));
  }
  ctx.putImageData(img, 0, 0);
}

export function drawMapPreview(canvas: HTMLCanvasElement, mapId: string) {
  const layout = LAYOUTS[MAP_LAYOUT_OF[mapId] ?? 'standard'] ?? LAYOUTS.standard!;
  const N = canvas.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const S = layout.size, k = N / S;

  if (layout.level) {
    paintLevel(ctx, rasterFor(layout.level), layout.level.theme, N);
  } else {
    ctx.fillStyle = '#3c6a30'; ctx.fillRect(0, 0, N, N);
    ctx.strokeStyle = '#d8c89a'; ctx.lineWidth = Math.max(2, N * 0.025); ctx.lineCap = 'round';
    for (const t of layout.trails) { ctx.beginPath(); ctx.moveTo(t.a[0] * k, t.a[1] * k); ctx.lineTo(t.b[0] * k, t.b[1] * k); ctx.stroke(); }
    for (const c of layout.clearings) { ctx.fillStyle = '#d8c89a'; ctx.beginPath(); ctx.arc(c.x * k, c.y * k, 8 * k, 0, 7); ctx.fill(); }
    for (const p of layout.plateaus) {
      ctx.fillStyle = '#2a3038'; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, 21 * k, 0, 7); ctx.fill();
      ctx.fillStyle = '#c4b890'; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, 17.5 * k, 0, 7); ctx.fill();
      ctx.strokeStyle = '#98a0a8'; ctx.lineWidth = 5 * k; ctx.beginPath(); ctx.moveTo((p.x + p.dx * 14) * k, (p.y + p.dy * 14) * k); ctx.lineTo((p.x + p.dx * 24) * k, (p.y + p.dy * 24) * k); ctx.stroke();
    }
    for (const m of layout.mesas) { ctx.fillStyle = '#2a3038'; ctx.beginPath(); ctx.arc(m.x * k, m.y * k, 6 * k, 0, 7); ctx.fill(); }
    for (const rk of layout.rocks) { ctx.fillStyle = '#6a6258'; ctx.fillRect((rk.x - rk.size / 2) * k, (rk.y - rk.size / 2) * k, rk.size * k, rk.size * k); }
  }

  // bases: start locations (blue / red) and expansions (cyan)
  const dot = (x: number, y: number, col: string, rad: number) => {
    ctx.fillStyle = '#000a'; ctx.beginPath(); ctx.arc(x * k, y * k, rad + 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x * k, y * k, rad, 0, 7); ctx.fill();
  };
  for (const e of MAP_CONFIGS[mapId as keyof typeof MAP_CONFIGS]?.expansionPositions ?? []) dot(e.x, e.y, CYAN, N * 0.017);
  dot(layout.playerBase.x, layout.playerBase.y, BLUE, N * 0.03);
  dot(layout.enemyBase.x, layout.enemyBase.y, RED, N * 0.03);
}

// ---- menu previews: painted lazily and cached ----
// Building a level raster takes ~30 ms per map (much longer on phones), so painting every preview on a screen at once froze
// the menu for seconds. Previews are now painted only when they scroll into view, one per task, and cached per map + size,
// so re-renders of the menu draw them instantly.
const painted = new Map<string, HTMLCanvasElement>();
let queue: HTMLCanvasElement[] = [];
let pumping = false;
let io: IntersectionObserver | null = null;

const keyOf = (c: HTMLCanvasElement) => `${c.dataset.map}@${c.width}x${c.height}`;
function blitCached(c: HTMLCanvasElement): boolean {
  const hit = painted.get(keyOf(c));
  if (hit) c.getContext('2d')?.drawImage(hit, 0, 0);
  return !!hit;
}
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const c = queue.shift();
    if (!c) { pumping = false; return; }
    if (c.isConnected && !blitCached(c)) {
      const off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      drawMapPreview(off, c.dataset.map!);
      painted.set(keyOf(c), off);
      c.getContext('2d')?.drawImage(off, 0, 0);
    }
    setTimeout(step, 0); // yield between maps so taps and scrolling stay responsive
  };
  setTimeout(step, 0);
}

/** Paint every `canvas.mappreview[data-map]` under `root`: cached ones now, the rest as they come into view. */
export function paintMapPreviews(root: ParentNode) {
  const canvases = [...root.querySelectorAll<HTMLCanvasElement>('canvas.mappreview[data-map]')];
  io?.disconnect(); // the previous screen's canvases are gone
  queue = queue.filter(c => c.isConnected);
  const todo = canvases.filter(c => !blitCached(c));
  if (!todo.length) return;
  if (typeof IntersectionObserver === 'undefined') { queue.push(...todo); pump(); return; }
  io ??= new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io!.unobserve(e.target); queue.push(e.target as HTMLCanvasElement); }
    pump();
  }, { rootMargin: '300px' });
  todo.forEach(c => io!.observe(c));
}
