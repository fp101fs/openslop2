/**
 * Validates and inspects a compiled .slopmap file (header, raster grids, bases, Dijkstra pathing, doodads, PNGs, GLBs).
 *
 * Usage:
 *   bun tools/level/check-slopmap.ts "<path/to/map.slopmap>" [--ascii]
 */
import * as fs from 'node:fs';
import { decodeSlopmap, SlopmapRaster } from './slopmap';

const file = process.argv[2] ?? 'public/maps/sunken_city.slopmap';
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const raw = new Uint8Array(fs.readFileSync(file));
const slop = decodeSlopmap(raw);
const { manifest } = slop;
const r = new SlopmapRaster(slop);
const S = r.size;

let problems = 0;
const bad = (msg: string) => {
  problems++;
  console.log(`  !! PROBLEM: ${msg}`);
};

console.log(`=== .slopmap Verification Report ===`);
console.log(`File       : ${file} (${(raw.byteLength / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`Format     : ${manifest.format} (generator: ${manifest.generator})`);
console.log(`Map Name   : ${manifest.meta.name} (id: ${manifest.meta.id}) by ${manifest.meta.author}`);
console.log(`Source     : ${manifest.meta.sourceFile} | Tileset: ${manifest.meta.tileset} (${manifest.meta.tilesetName})`);
console.log(`World Grid : ${S}x${S} tiles (raster: ${r.res}x${r.res} half-tiles, native bounds: x=[${manifest.meta.bounds.minX}..${manifest.meta.bounds.maxX}], z=[${manifest.meta.bounds.minZ}..${manifest.meta.bounds.maxZ}])`);
console.log(`Ground IDs : ${manifest.meta.groundTiles.join(', ')}`);
console.log(`Cliff IDs  : ${manifest.meta.cliffTiles.join(', ')}`);

// 1. Validate all bufferViews
const bvs = Object.values(manifest.bufferViews);
for (const bv of bvs) {
  if (bv.byteOffset % 4 !== 0) bad(`bufferView "${bv.name}" is not 4-byte aligned (offset=${bv.byteOffset})`);
  if (bv.byteOffset + bv.byteLength > slop.bin.byteLength) bad(`bufferView "${bv.name}" exceeds binary payload`);
  if (bv.dtype !== 'bytes') {
    const bpe = bv.dtype === 'float32' || bv.dtype === 'uint32' ? 4 : bv.dtype === 'uint16' ? 2 : 1;
    const expectedElems = bv.shape.reduce((a, b) => a * b, 1);
    if (bv.byteLength !== expectedElems * bpe) {
      bad(`bufferView "${bv.name}" byteLength ${bv.byteLength} != shape ${bv.shape.join('x')} * ${bpe}`);
    }
  }
}

// 2. Validate Raster arrays for NaNs / ranges
for (let i = 0; i < r.height.length; i++) {
  if (!Number.isFinite(r.height[i]!)) { bad(`NaN/Inf in raster.height at index ${i}`); break; }
  if (!Number.isFinite(r.tier[i]!)) { bad(`NaN/Inf in raster.tier at index ${i}`); break; }
}

// 3. Validate Bases & Dijkstra Pathing (same rules as tools/level/check.ts)
const walk = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return false;
  for (let sy = 0; sy <= 2; sy++) {
    for (let sx = 0; sx <= 2; sx++) {
      if (r.isWall(x + sx * 0.5, y + sy * 0.5)) return false;
    }
  }
  return true;
};

function search(sx: number, sy: number) {
  const dist = new Float64Array(S * S).fill(Infinity);
  const par = new Int32Array(S * S).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, n: number) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let m = i;
        const l = 2 * i + 1, r2 = l + 1;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r2 < heap.length && heap[r2]![0] < heap[m]![0]) m = r2;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const s = Math.floor(sy) * S + Math.floor(sx);
  dist[s] = 0;
  push(0, s);
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]!) continue;
    const cx = c % S, cy = (c / S) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!walk(nx, ny)) continue;
        if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
        const n = ny * S + nx;
        const nd = d + (dx && dy ? Math.SQRT2 : 1);
        if (nd < dist[n]!) {
          dist[n] = nd;
          par[n] = c;
          push(nd, n);
        }
      }
    }
  }
  return { dist, par };
}

const d0 = manifest.starts[0].defense;
const d1 = manifest.starts[1].defense;
const { dist, par } = search(d0[0], d0[1]);
const pathSet = new Set<number>();
const pathCells: [number, number][] = [];
let cur = Math.floor(d1[1]) * S + Math.floor(d1[0]);
if (!Number.isFinite(dist[cur]!)) bad('Enemy start defense point is unreachable from player start');
while (cur >= 0 && dist[cur]! > 0) {
  pathSet.add(cur);
  pathCells.push([cur % S, (cur / S) | 0]);
  cur = par[cur]!;
}

manifest.bases.forEach((b, i) => {
  const t = r.tierAt(b.th[0], b.th[1]);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (
        r.isWall(b.th[0] + dx, b.th[1] + dy) ||
        r.isRamp(b.th[0] + dx, b.th[1] + dy) ||
        Math.abs(r.tierAt(b.th[0] + dx, b.th[1] + dy) - t) > 0.05
      ) {
        bad(`Base ${i} (${b.kind}) TH footprint not flat/walkable at (${dx},${dy})`);
        dx = 9;
        break;
      }
    }
  }
  const resources = [
    ...b.minerals.map(p => ['mineral', p] as const),
    ...b.geysers.map(p => ['geyser', p] as const)
  ];
  for (const [k, p] of resources) {
    const ok = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(
      ([dx, dy]) =>
        !r.isWall(p[0] + dx!, p[1] + dy!) &&
        !r.isRamp(p[0] + dx!, p[1] + dy!) &&
        Math.abs(r.tierAt(p[0] + dx!, p[1] + dy!) - t) < 0.05
    );
    if (!ok) bad(`Base ${i} ${k} at (${p[0]},${p[1]}) on wall/ramp/other tier`);
  }
  const d = dist[Math.floor(b.th[1]) * S + Math.floor(b.th[0])]!;
  if (!Number.isFinite(d)) bad(`Base ${i} (${b.kind}) unreachable from player start`);
});

// 4. Validate Doodads
const dooTrans = slop.getFloat32('doodads.transforms');
const dooMeta = slop.getUint16('doodads.meta');
const numDoodads = dooTrans.length / 7;
const kitCounts = new Map<string, number>();
let customModelInstances = 0;

for (let i = 0; i < numDoodads; i++) {
  const x = dooTrans[i * 7]!, y = dooTrans[i * 7 + 1]!, z = dooTrans[i * 7 + 2]!;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    bad(`Doodad ${i} has non-finite transform (${x},${y},${z})`);
    break;
  }
  const palIdx = dooMeta[i * 4]!;
  const def = manifest.doodadPalette[palIdx];
  if (!def) {
    bad(`Doodad ${i} references invalid palette index ${palIdx}`);
    break;
  }
  kitCounts.set(def.propKit, (kitCounts.get(def.propKit) ?? 0) + 1);
  if (def.glbBufferView) customModelInstances++;
}

// 5. Validate Embedded PNGs & GLBs
const pngViews = bvs.filter(v => v.mimeType === 'image/png');
const pngSummary: string[] = [];
for (const pv of pngViews) {
  const bytes = slop.getBytes(pv.name);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isPng) bad(`Invalid PNG signature in ${pv.name}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(16, false);
  const h = dv.getUint32(20, false);
  pngSummary.push(`${pv.name} (${w}x${h}, ${(bytes.byteLength / 1024).toFixed(1)} KB)`);
}

const glbViews = bvs.filter(v => v.mimeType === 'model/gltf-binary');
let totalGlbVerts = 0;
let totalGlbTris = 0;
let totalGlbWithTex = 0;
let totalGlbBytes = 0;

for (const gv of glbViews) {
  const bytes = slop.getBytes(gv.name);
  totalGlbBytes += bytes.byteLength;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint32(0, true);
  const ver = dv.getUint32(4, true);
  const totalLen = dv.getUint32(8, true);
  if (magic !== 0x46546c67 || ver !== 2 || totalLen !== bytes.byteLength) {
    bad(`Invalid GLB header in ${gv.name}`);
    continue;
  }
  const jLen = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jLen)));
  const posAcc = gltf.accessors?.[0];
  if (posAcc?.count) totalGlbVerts += posAcc.count;
  for (const prim of gltf.meshes?.[0]?.primitives ?? []) {
    const idxAcc = gltf.accessors?.[prim.indices];
    if (idxAcc?.count) totalGlbTris += idxAcc.count / 3;
  }
  if (gltf.textures?.length) totalGlbWithTex++;
}

console.log(`\n--- Terrain & Pathing Stats ---`);
console.log(`Elevation   : ${manifest.meta.stats.minHeight} to ${manifest.meta.stats.maxHeight} world units`);
console.log(`Walkable    : ${manifest.meta.stats.walkablePct}% | Water: ${manifest.meta.stats.waterPct}% | Ruins Plaza Bricks: ${manifest.meta.stats.plazaPct}%`);
console.log(`Bases       : ${manifest.bases.length} validated bases | Main-to-Main Dijkstra path: ${pathCells.length} tiles (${dist[Math.floor(d1[1]) * S + Math.floor(d1[0])]!.toFixed(1)} world dist)`);

console.log(`\n--- Doodads & Embedded Assets ---`);
console.log(`Doodads     : ${numDoodads} placed instances across ${manifest.doodadPalette.length} unique types (${customModelInstances} instances use embedded custom GLB models)`);
console.log(`PropKits    : ${[...kitCounts.entries()].map(([k, v]) => `${k}:${v}`).join(', ')}`);
console.log(`Images      : ${pngSummary.join(' | ')}`);
console.log(`Custom GLBs : ${glbViews.length} embedded .glb models (${totalGlbWithTex} textured with embedded BLP->PNGs, ${totalGlbVerts.toLocaleString()} verts, ${Math.round(totalGlbTris).toLocaleString()} tris, ${(totalGlbBytes / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`Custom Units: ${manifest.customUnits.length} unit defs preserved from war3map.w3u`);
console.log(`Validation  : ${problems === 0 ? 'PASSED (0 problems)' : `FAILED (${problems} problems)`}`);

if (process.argv.includes('--ascii')) {
  console.log(`\n--- ASCII Map Preview (step=3 tiles, ~=water, █=wall, /=ramp, .=main-to-main path, T=TownHall) ---`);
  const step = 3;
  const mark = new Map<number, string>();
  manifest.bases.forEach(b => {
    mark.set(Math.floor(b.th[1] / step) * 1000 + Math.floor(b.th[0] / step), 'T');
  });
  for (const [px, py] of pathCells) {
    const key = Math.floor(py / step) * 1000 + Math.floor(px / step);
    if (!mark.has(key)) mark.set(key, '.');
  }
  const lines: string[] = [];
  for (let y = 0; y < S; y += step) {
    let line = '';
    for (let x = 0; x < S; x += step) {
      const m = mark.get(Math.floor(y / step) * 1000 + Math.floor(x / step));
      if (m) { line += m; continue; }
      const wx = x + 0.5, wz = y + 0.5;
      if (r.isLiquid(wx, wz)) line += '~';
      else if (r.isWall(wx, wz)) line += '█';
      else if (r.isRamp(wx, wz)) line += '/';
      else line += String(Math.min(9, Math.max(0, Math.round(r.tierAt(wx, wz)))));
    }
    lines.push(line);
  }
  console.log(lines.join('\n'));
}

if (problems > 0) process.exit(1);
