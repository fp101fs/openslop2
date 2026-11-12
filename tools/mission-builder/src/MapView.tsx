import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MissionData, GroupDef, Region } from '../../../src/campaign/data/MissionData';
import type { Pt, Shape } from '../../../src/levels/LevelTypes';
import { dataLevel } from '../../../src/campaign/data/level';
import { LevelRaster } from '../../../src/levels/LevelRaster';
import { paintLevel } from '../../../src/ui/MapPreview';
import { entityIconUrl } from '../../../src/ui/IconImages';
import type { MissionStore, Selection } from './store';

/**
 * Top-down map: the game's own rasteriser + map-preview painter for the terrain, the reference image on top for tracing, then
 * regions, paths, props and unit groups. Tools: select / move, draw regions (rect, ellipse, polygon), paths, terrain shapes,
 * roads, ramps; drop palette items here. World units = tiles; the view keeps a centre + zoom (pixels per tile).
 */
export type Tool =
  | { t: 'select' }
  | { t: 'region'; shape: 'rect' | 'ell' | 'poly' }
  | { t: 'path' }
  | { t: 'terrain'; op: 'tier' | 'massif' | 'pit'; shape: 'rect' | 'ell' | 'poly'; tier: number; plaza?: boolean; liquid?: boolean }
  | { t: 'road'; width: number; tier?: number }
  | { t: 'ramp'; width: number; t0: number; t1: number }
  | { t: 'pick'; label: string; done: (p: Pt) => void };

const OWNER = { player: '#4aa8ff', enemy: '#ff5a4a' } as const;
const r1 = (v: number) => Math.round(v * 2) / 2;

function shapeCentre(s: Shape): Pt { return s.k === 'poly' ? [s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length, s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length] : [s.x, s.y]; }
function moveShape(s: Shape, dx: number, dy: number): Shape {
  return s.k === 'poly' ? { ...s, pts: s.pts.map(p => [r1(p[0] + dx), r1(p[1] + dy)] as Pt) } : { ...s, x: r1(s.x + dx), y: r1(s.y + dy) };
}

const iconCache = new Map<string, HTMLImageElement>();
function icon(type: string, redraw: () => void): HTMLImageElement | null {
  const url = entityIconUrl(type); if (!url) return null;
  let im = iconCache.get(url);
  if (!im) { im = new Image(); im.src = url; im.onload = redraw; iconCache.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}

export function MapView({ store, tool, setTool, layers }: { store: MissionStore; tool: Tool; setTool: (t: Tool) => void; layers: Record<string, boolean> }) {
  const d = store.doc;
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ cx: d.map.size / 2, cy: d.map.size / 2, z: 5 });
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [, force] = useState(0);
  const redraw = () => force(n => n + 1);

  // terrain image: re-rasterised only when the map's terrain data changes
  const mapKey = (store.level?.id ?? '') + JSON.stringify({ ...d.map, decor: (d.map.decor ?? []).filter(x => x.block).map(x => [x.at, x.block]), refImage: null });
  const terrain = useMemo(() => {
    const level = store.level ?? dataLevel(d);
    const r = new LevelRaster({ ...level, id: `editor_${Math.random()}` });
    const N = d.map.size * 4;
    const c = document.createElement('canvas'); c.width = c.height = N;
    paintLevel(c.getContext('2d')!, r, d.map.theme, N);
    return { c, r };
  }, [mapKey]);

  const ref = useMemo(() => {
    const src = d.map.refImage?.src; if (!src) return null;
    const im = new Image(); im.src = '/' + src.replace(/^\//, ''); im.onload = redraw; return im;
  }, [d.map.refImage?.src]);

  // fit the map once
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    setView({ cx: d.map.size / 2, cy: d.map.size / 2, z: Math.min(el.clientWidth, el.clientHeight) / d.map.size * 0.95 });
  }, [d.key, d.map.size]);

  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const b = canvas.current!.getBoundingClientRect();
    return [view.cx + (e.clientX - b.left - b.width / 2) / view.z, view.cy + (e.clientY - b.top - b.height / 2) / view.z];
  };

  // ---- drawing ----
  useEffect(() => {
    const c = canvas.current, el = wrap.current; if (!c || !el) return;
    const dpr = devicePixelRatio || 1, W = el.clientWidth, H = el.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b0e12'; g.fillRect(0, 0, W, H);
    const z = view.z;
    g.translate(W / 2 - view.cx * z, H / 2 - view.cy * z); g.scale(z, z);
    const lw = 1 / z;
    g.imageSmoothingEnabled = false;
    if (layers.terrain) g.drawImage(terrain.c, 0, 0, d.map.size, d.map.size);
    const ri = d.map.refImage;
    if (layers.reference && ri && ref?.complete) { g.globalAlpha = ri.opacity ?? 0.5; g.drawImage(ref, ri.x, ri.y, ri.w, ri.h); g.globalAlpha = 1; }
    if (layers.grid) {
      g.strokeStyle = '#ffffff14'; g.lineWidth = lw;
      for (let i = 0; i <= d.map.size; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, d.map.size); g.moveTo(0, i); g.lineTo(d.map.size, i); g.stroke(); }
    }
    const sel = store.sel;
    const isSel = (kind: Selection['kind'], id: string | number) => sel?.kind === kind && sel.id === id;
    const pathShape = (s: Shape) => {
      g.beginPath();
      if (s.k === 'ell') g.ellipse(s.x, s.y, s.rx, s.ry, s.rot ?? 0, 0, Math.PI * 2);
      else if (s.k === 'rect') { g.save(); g.translate(s.x, s.y); g.rotate(s.rot ?? 0); g.rect(-s.w / 2, -s.h / 2, s.w, s.h); g.restore(); }
      else { s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
    };
    const label = (text: string, x: number, y: number, col = '#fff') => {
      g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sx = W / 2 + (x - view.cx) * z, sy = H / 2 + (y - view.cy) * z;
      g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillStyle = '#000b'; g.fillText(text, sx + 1, sy + 1); g.fillStyle = col; g.fillText(text, sx, sy); g.restore();
    };
    // terrain shapes (outlines) while a terrain tool is active or one is selected
    const terrainTool = tool.t === 'terrain' || tool.t === 'road' || tool.t === 'ramp' || ['tier', 'massif', 'pit', 'road', 'ramp'].includes(sel?.kind ?? '');
    if (layers.terrainShapes || terrainTool) {
      const outline = (s: Shape, col: string, on: boolean) => { pathShape(s); g.strokeStyle = on ? '#fff' : col; g.lineWidth = (on ? 2.5 : 1.2) * lw; g.setLineDash([4 * lw, 3 * lw]); g.stroke(); g.setLineDash([]); };
      (d.map.tiers ?? []).forEach(([s], i) => outline(s, '#e8c070', isSel('tier', i)));
      (d.map.massifs ?? []).forEach(([s], i) => outline(s, '#b07050', isSel('massif', i)));
      (d.map.pits ?? []).forEach(([s], i) => outline(s, '#7080ff', isSel('pit', i)));
      (d.map.roads ?? []).forEach((rd, i) => { g.beginPath(); rd.pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = isSel('road', i) ? '#fff' : '#c8d0d8'; g.lineWidth = 1.5 * lw; g.stroke(); });
      (d.map.ramps ?? []).forEach(([a, b], i) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = isSel('ramp', i) ? '#fff' : '#9fe870'; g.lineWidth = 2 * lw; g.stroke(); });
    }
    if (layers.regions) for (const rg of d.regions) {
      pathShape(rg.shape); const on = isSel('region', rg.id);
      g.fillStyle = on ? '#ffd54a33' : '#ffd54a14'; g.fill(); g.strokeStyle = on ? '#ffe680' : '#ffd54a99'; g.lineWidth = (on ? 2 : 1) * lw; g.stroke();
      const [x, y] = shapeCentre(rg.shape); label(rg.id, x, y, '#ffe680');
    }
    if (layers.paths) for (const p of d.paths) {
      const on = isSel('path', p.id);
      g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
      g.strokeStyle = on ? '#9ff' : '#5cd6d699'; g.lineWidth = (on ? 2.2 : 1.4) * lw; g.stroke();
      p.pts.forEach((q, i) => { g.fillStyle = on ? '#9ff' : '#5cd6d6'; g.beginPath(); g.arc(q[0], q[1], (on ? 4 : 2.5) * lw, 0, 7); g.fill(); if (on) label(String(i + 1), q[0], q[1] - 6 * lw); });
      if (p.pts[0]) label(p.id, p.pts[0][0], p.pts[0][1] - 8 * lw, '#9ff');
    }
    if (layers.props) for (const pr of d.map.decor ?? []) {
      const on = isSel('decor', pr.id), s = 6 * lw;
      g.beginPath(); g.moveTo(pr.at[0], pr.at[1] - s); g.lineTo(pr.at[0] + s, pr.at[1]); g.lineTo(pr.at[0], pr.at[1] + s); g.lineTo(pr.at[0] - s, pr.at[1]); g.closePath();
      g.fillStyle = on ? '#fff' : '#d9a3ff'; g.fill(); g.strokeStyle = '#000a'; g.lineWidth = lw; g.stroke();
      if (pr.block) { g.beginPath(); g.arc(pr.at[0], pr.at[1], pr.block, 0, 7); g.strokeStyle = '#d9a3ff77'; g.stroke(); }
      if (on || z > 6) label(pr.kit, pr.at[0], pr.at[1] + 14 * lw, '#e8c8ff');
    }
    if (layers.props) for (const pk of d.pickups ?? []) {
      const on = isSel('pickup', pk.id), h = 0.8;
      g.fillStyle = on ? '#fff' : '#3a8ad8'; g.fillRect(pk.at[0] - h, pk.at[1] - h, h * 2, h * 2);
      g.strokeStyle = '#000a'; g.lineWidth = lw; g.strokeRect(pk.at[0] - h, pk.at[1] - h, h * 2, h * 2);
      if (on || z > 6) label(`${pk.minerals ?? 0}m${pk.gas ? ` ${pk.gas}g` : ''}`, pk.at[0], pk.at[1] + 12 * lw, '#9fd0ff');
    }
    d.map.bases.forEach((b, i) => { g.strokeStyle = i === d.map.home ? OWNER.player : OWNER.enemy; g.lineWidth = 1.5 * lw; g.strokeRect(b.th[0] - 2.5, b.th[1] - 2.5, 5, 5); });
    if (layers.units) for (const gr of d.groups) drawGroup(g, gr, isSel('group', gr.id), lw, redraw, label);
    // drafts
    if (draft.length) {
      g.beginPath(); draft.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      if (hover) g.lineTo(hover[0], hover[1]);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5 * lw; g.setLineDash([3 * lw, 3 * lw]); g.stroke(); g.setLineDash([]);
      draft.forEach(p => { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 3 * lw, 0, 7); g.fill(); });
    }
    if (drag.current?.kind === 'box' && hover) {
      const a = drag.current.start, b = hover; const s = boxShape(a, b, (tool as any).shape === 'ell' ? 'ell' : 'rect');
      pathShape(s); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * lw; g.stroke();
    }
  });

  // ---- input ----
  const drag = useRef<null | { kind: 'pan'; x: number; y: number; cx: number; cy: number } | { kind: 'move'; start: Pt; apply: (dx: number, dy: number) => void } | { kind: 'box'; start: Pt }>(null);

  const hit = (p: Pt): { sel: Selection; move: (dx: number, dy: number) => void } | null => {
    const near = (q: Pt, r: number) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= r;
    const tol = 9 / view.z;
    const sel = store.sel;
    // handles of the selected path / poly first
    if (sel?.kind === 'path') { const pa = d.paths.find(x => x.id === sel.id); const i = pa?.pts.findIndex(q => near(q, tol)) ?? -1; if (pa && i >= 0) return { sel, move: (dx, dy) => store.live(m => { const q = m.paths.find(x => x.id === sel.id)!.pts[i]!; q[0] = r1(q[0] + dx); q[1] = r1(q[1] + dy); }) }; }
    if (sel?.kind === 'region') { const rg = d.regions.find(x => x.id === sel.id); if (rg?.shape.k === 'poly') { const i = rg.shape.pts.findIndex(q => near(q, tol)); if (i >= 0) return { sel, move: (dx, dy) => store.live(m => { const s = m.regions.find(x => x.id === sel.id)!.shape as any; s.pts[i][0] = r1(s.pts[i][0] + dx); s.pts[i][1] = r1(s.pts[i][1] + dy); }) }; } }
    if (layers.units) for (const gr of [...d.groups].reverse()) if (near(gr.at, Math.max(1.6, tol))) return { sel: { kind: 'group', id: gr.id }, move: (dx, dy) => store.live(m => { const x = m.groups.find(q => q.id === gr.id)!; x.at = [r1(x.at[0] + dx), r1(x.at[1] + dy)]; }) };
    if (layers.props) for (const pr of d.map.decor ?? []) if (near(pr.at, Math.max(1.4, tol))) return { sel: { kind: 'decor', id: pr.id }, move: (dx, dy) => store.live(m => { const x = m.map.decor!.find(q => q.id === pr.id)!; x.at = [r1(x.at[0] + dx), r1(x.at[1] + dy)]; }) };
    if (layers.props) for (const pk of d.pickups ?? []) if (near(pk.at, Math.max(1.2, tol))) return { sel: { kind: 'pickup', id: pk.id }, move: (dx, dy) => store.live(m => { const x = m.pickups!.find(q => q.id === pk.id)!; x.at = [r1(x.at[0] + dx), r1(x.at[1] + dy)]; }) };
    if (layers.paths) for (const pa of d.paths) if (pa.pts.some(q => near(q, tol))) return { sel: { kind: 'path', id: pa.id }, move: (dx, dy) => store.live(m => { const x = m.paths.find(q => q.id === pa.id)!; x.pts = x.pts.map(q => [r1(q[0] + dx), r1(q[1] + dy)]); }) };
    const terrainOn = layers.terrainShapes || tool.t !== 'select' || ['tier', 'massif', 'pit', 'road', 'ramp'].includes(sel?.kind ?? '');
    if (terrainOn) {
      for (const [kind, list] of [['pit', d.map.pits ?? []], ['massif', d.map.massifs ?? []], ['tier', d.map.tiers ?? []]] as const) {
        for (let i = list.length - 1; i >= 0; i--) if (near(shapeCentre(list[i]![0]), Math.max(2, tol))) {
          const key = kind === 'tier' ? 'tiers' : kind === 'pit' ? 'pits' : 'massifs';
          return { sel: { kind, id: i }, move: (dx, dy) => store.live(m => { const arr = (m.map as any)[key]; arr[i][0] = moveShape(arr[i][0], dx, dy); }) };
        }
      }
      for (let i = 0; i < (d.map.ramps ?? []).length; i++) { const [a, b] = d.map.ramps![i]!; if (near([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.max(2, tol))) return { sel: { kind: 'ramp', id: i }, move: (dx, dy) => store.live(m => { const rp = m.map.ramps![i]!; rp[0] = [r1(rp[0][0] + dx), r1(rp[0][1] + dy)]; rp[1] = [r1(rp[1][0] + dx), r1(rp[1][1] + dy)]; }) }; }
      for (let i = 0; i < (d.map.roads ?? []).length; i++) { const rd = d.map.roads![i]!; const j = rd.pts.findIndex(q => near(q, tol)); if (j >= 0) return { sel: { kind: 'road', id: i }, move: (dx, dy) => store.live(m => { const q = m.map.roads![i]!.pts[j]!; q[0] = r1(q[0] + dx); q[1] = r1(q[1] + dy); }) }; }
    }
    if (layers.regions) for (const rg of [...d.regions].reverse()) if (inShapeLoose(rg, p)) return { sel: { kind: 'region', id: rg.id }, move: (dx, dy) => store.live(m => { const x = m.regions.find(q => q.id === rg.id)!; x.shape = moveShape(x.shape, dx, dy); }) };
    return null;
  };

  const finishDraft = (pts: Pt[]) => {
    setDraft([]);
    if (tool.t === 'region' && pts.length >= 3) store.edit(m => { const id = store.freshId('region'); m.regions.push({ id, shape: { k: 'poly', pts } }); store.sel = { kind: 'region', id }; });
    else if (tool.t === 'path' && pts.length >= 2) store.edit(m => { const id = store.freshId('path'); m.paths.push({ id, pts }); store.sel = { kind: 'path', id }; });
    else if (tool.t === 'terrain' && pts.length >= 3) addTerrain(store, tool, { k: 'poly', pts });
    else if (tool.t === 'road' && pts.length >= 2) store.edit(m => { (m.map.roads ??= []).push({ pts, width: tool.width, tier: tool.tier }); store.sel = { kind: 'road', id: m.map.roads.length - 1 }; });
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e), q: Pt = [r1(p[0]), r1(p[1])];
    if (e.button === 1 || e.button === 2 || e.altKey) { drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; return; }
    if (tool.t === 'pick') { tool.done(q); setTool({ t: 'select' }); return; }
    if (tool.t === 'select') {
      const h = hit(p);
      store.select(h?.sel ?? null);
      if (h && !store.readOnly) { store.begin(); drag.current = { kind: 'move', start: p, apply: h.move }; }
      else drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
      return;
    }
    if ((tool.t === 'region' || tool.t === 'terrain') && tool.shape !== 'poly') { drag.current = { kind: 'box', start: q }; return; }
    if (tool.t === 'ramp') {
      if (!draft.length) setDraft([q]);
      else { const a = draft[0]!; setDraft([]); store.edit(m => { (m.map.ramps ??= []).push([a, q, tool.width, tool.t0, tool.t1]); store.sel = { kind: 'ramp', id: m.map.ramps.length - 1 }; }); }
      return;
    }
    if (e.detail >= 2) { finishDraft(draft); return; } // double click finishes a polygon / path / road
    setDraft([...draft, q]);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toWorld(e); setHover([r1(p[0]), r1(p[1])]);
    const dr = drag.current; if (!dr) return;
    if (dr.kind === 'pan') setView(v => ({ ...v, cx: dr.cx - (e.clientX - dr.x) / v.z, cy: dr.cy - (e.clientY - dr.y) / v.z }));
    else if (dr.kind === 'move') { const dx = r1(p[0] - dr.start[0]), dy = r1(p[1] - dr.start[1]); if (dx || dy) { dr.apply(dx, dy); dr.start = [dr.start[0] + dx, dr.start[1] + dy]; } }
  };
  const onUp = (e: React.PointerEvent) => {
    const dr = drag.current; drag.current = null;
    if (dr?.kind === 'move') store.end();
    if (dr?.kind === 'box') {
      const p = toWorld(e), b: Pt = [r1(p[0]), r1(p[1])];
      if (Math.abs(b[0] - dr.start[0]) < 1 || Math.abs(b[1] - dr.start[1]) < 1) return;
      const s = boxShape(dr.start, b, (tool as any).shape);
      if (tool.t === 'region') store.edit(m => { const id = store.freshId('region'); m.regions.push({ id, shape: s }); store.sel = { kind: 'region', id }; });
      if (tool.t === 'terrain') addTerrain(store, tool, s);
    }
    redraw();
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = toWorld(e), k = Math.exp(-e.deltaY * 0.0015);
    setView(v => { const z = Math.max(1, Math.min(60, v.z * k)); return { z, cx: p[0] - (p[0] - v.cx) * (v.z / z), cy: p[1] - (p[1] - v.cy) * (v.z / z) }; });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-mission-item'); if (!raw) return;
    const item = JSON.parse(raw) as { kind: 'unit' | 'building' | 'prop' | 'start' | 'pickup'; type: string; owner?: 'player' | 'enemy' };
    const p = toWorld(e), at: Pt = [r1(p[0]), r1(p[1])];
    store.edit(m => {
      if (item.kind === 'prop') { const id = store.freshId(item.type + '_'); (m.map.decor ??= []).push({ id, kit: item.type, at }); store.sel = { kind: 'decor', id }; return; }
      if (item.kind === 'pickup') { const id = store.freshId('pallet'); (m.pickups ??= []).push({ id, at, minerals: 100 }); store.sel = { kind: 'pickup', id }; return; }
      if (item.kind === 'start') { m.map.bases[item.owner === 'enemy' ? m.map.foe : m.map.home]!.th = at; return; }
      const id = store.freshId(item.type.replace(/_/g, '') + '_');
      const g: GroupDef = { id, owner: item.owner ?? 'enemy', at, spawn: 'start', units: [{ type: item.type as any, count: item.kind === 'building' ? 1 : 3 }] };
      m.groups.push(g); store.sel = { kind: 'group', id };
    });
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === 'Enter' && draft.length) finishDraft(draft);
      if (e.key === 'Escape') { setDraft([]); setTool({ t: 'select' }); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });

  const cursor = tool.t === 'select' ? 'default' : 'crosshair';
  const hint = tool.t === 'pick' ? `Click the map: ${tool.label}` : tool.t === 'region' && tool.shape === 'poly' || tool.t === 'path' || tool.t === 'road' || (tool.t === 'terrain' && tool.shape === 'poly')
    ? 'Click to add points · double-click or Enter to finish · Esc cancels' : tool.t === 'ramp' ? 'Click the low end, then the high end' : tool.t !== 'select' ? 'Drag to draw · Esc cancels' : 'Drag to move · Alt/right-drag pans · wheel zooms · drop palette items here';
  return (
    <div className="map" ref={wrap} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <canvas ref={canvas} style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onWheel={onWheel} onContextMenu={e => e.preventDefault()} />
      <div className="map-hud"><span>{hint}</span>{hover && <span className="coord">{hover[0]}, {hover[1]} · tier {terrain.r.tierAt(hover[0], hover[1]).toFixed(0)}{terrain.r.isWall(hover[0], hover[1]) ? ' · wall' : ''}</span>}</div>
    </div>
  );
}

function drawGroup(g: CanvasRenderingContext2D, gr: GroupDef, on: boolean, lw: number, redraw: () => void, label: (t: string, x: number, y: number, c?: string) => void) {
  const [x, y] = gr.at, R = Math.max(1.4, 11 * lw);
  g.beginPath(); g.arc(x, y, R, 0, 7);
  g.fillStyle = '#000c'; g.fill();
  g.lineWidth = (on ? 3 : 1.8) * lw; g.strokeStyle = on ? '#fff' : OWNER[gr.owner];
  if (gr.spawn === 'trigger') g.setLineDash([3 * lw, 2 * lw]);
  g.stroke(); g.setLineDash([]);
  const im = icon(gr.units[0]?.type ?? '', redraw);
  if (im) g.drawImage(im, x - R * 0.78, y - R * 0.78, R * 1.56, R * 1.56);
  const n = gr.units.map(u => typeof u.count === 'number' ? u.count : `${u.count.casual ?? u.count.normal ?? 0}-${u.count.brutal ?? u.count.normal ?? 0}`).join('+');
  label(`${gr.id} ×${n}`, x, y + R + 12 * lw, OWNER[gr.owner]);
}

function boxShape(a: Pt, b: Pt, kind: 'rect' | 'ell' | 'poly'): Shape {
  const x = r1((a[0] + b[0]) / 2), y = r1((a[1] + b[1]) / 2), w = r1(Math.abs(b[0] - a[0])), h = r1(Math.abs(b[1] - a[1]));
  return kind === 'ell' ? { k: 'ell', x, y, rx: w / 2, ry: h / 2 } : { k: 'rect', x, y, w, h };
}

function inShapeLoose(rg: Region, p: Pt): boolean {
  const s = rg.shape;
  if (s.k === 'ell') return ((p[0] - s.x) / s.rx) ** 2 + ((p[1] - s.y) / s.ry) ** 2 <= 1;
  if (s.k === 'rect') return Math.abs(p[0] - s.x) <= s.w / 2 && Math.abs(p[1] - s.y) <= s.h / 2;
  let inside = false;
  for (let i = 0, j = s.pts.length - 1; i < s.pts.length; j = i++) {
    const [xi, yi] = s.pts[i]!, [xj, yj] = s.pts[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function addTerrain(store: MissionStore, tool: Extract<Tool, { t: 'terrain' }>, s: Shape) {
  store.edit(m => {
    if (tool.op === 'tier') { (m.map.tiers ??= []).push([s, tool.tier, tool.plaza]); store.sel = { kind: 'tier', id: m.map.tiers.length - 1 }; }
    if (tool.op === 'massif') { (m.map.massifs ??= []).push([s, tool.tier]); store.sel = { kind: 'massif', id: m.map.massifs.length - 1 }; }
    if (tool.op === 'pit') { (m.map.pits ??= []).push([s, Math.max(1, tool.tier), tool.liquid]); store.sel = { kind: 'pit', id: m.map.pits.length - 1 }; }
  });
}
