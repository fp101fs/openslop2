/**
 * Converts a Warcraft-3 style MDX (Renn01's StarCraft II building packs on Hive Workshop: Zerg + Protoss) into a game GLB.
 *
 *   bun tools/model/build-zerg-mdx.ts <dir-with-mdx-and-blp> <Model.mdx> <out.glb> <lengthInTiles> "<title>" [yawDeg]
 *   env PACK=protoss|terran|protoss_units|terran_buildings|zerg_units  -> credit that pack thread instead of the Zerg building one
 *   env SKIP=<regex>  -> drop materials whose diffuse texture matches (e.g. terranbuild = the construction scaffold)
 *   env GROUND=keep  -> keep the MDX z=0 as ground instead of lifting the lowest vertex to y=0 (Supply Depot: its lowered body is underground)
 *
 * Parses the MDX (war3-model), takes the bind pose of every geoset (static mesh - the pack's animations are ignored),
 * Z-up -> Y-up, centres on the footprint, scales to `length`, and embeds the diffuse (+ emissive) BLP textures as PNG.
 * One glTF primitive per MDX material. Materials that only hold effect layers (warp planes, lightning, glows) are dropped.
 * Layer 1 of a pack material is the diffuse (its alpha is the team-colour mask - we flatten it onto the RGB),
 * the first additive layer is the emissive glow.
 */
import { parseMDX, decodeBLP, getBLPImageData } from 'war3-model';
import { PNG } from 'pngjs';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

const [dir, mdxName, dst, lenArg, title, yawArg] = process.argv.slice(2);
if (!dir || !mdxName || !dst || !lenArg || !title) { console.error('usage: bun tools/model/build-zerg-mdx.ts <dir> <Model.mdx> <out.glb> <length> <title> [yawDeg]'); process.exit(1); }
const LENGTH = Number(lenArg), YAW = (Number(yawArg ?? 0) * Math.PI) / 180;
const SOURCE = {
  protoss: 'https://www.hiveworkshop.com/threads/protoss-building-pack-starcraft-2.359098/', terran: 'https://www.hiveworkshop.com/threads/terran-unit-pack-starcraft-2.354854/',
  protoss_units: 'https://www.hiveworkshop.com/threads/protoss-unit-pack-starcraft-2.358848/', terran_buildings: 'https://www.hiveworkshop.com/threads/terran-building-pack-starcraft-2.354993/',
  zerg_units: 'https://www.hiveworkshop.com/threads/zerg-unit-pack-remastered-starcraft-2.339339/'
}[process.env.PACK ?? ''] ?? 'https://www.hiveworkshop.com/threads/zerg-building-pack-starcraft-2.339379/';

const SKIP = process.env.SKIP ? new RegExp(process.env.SKIP, "i") : null;
const model = parseMDX(await Bun.file(path.join(dir, mdxName)).arrayBuffer());
const num = (v: unknown) => (typeof v === 'number' ? v : -1);

const pngCache = new Map<string, Buffer>();
async function blpToPng(file: string): Promise<Buffer> {
  const hit = pngCache.get(file); if (hit) return hit;
  const raw = new Uint8Array(await Bun.file(path.join(dir, file)).arrayBuffer()).buffer;
  const blp = decodeBLP(raw);
  const img = getBLPImageData(blp, 0);
  const png = new PNG({ width: blp.width, height: blp.height });
  const src = img.data;
  for (let i = 0; i < src.length; i += 4) { png.data[i] = src[i]!; png.data[i + 1] = src[i + 1]!; png.data[i + 2] = src[i + 2]!; png.data[i + 3] = 255; } // alpha = team mask: drop it
  const out = PNG.sync.write(png); pngCache.set(file, out); return out;
}

// ---- per-material texture choice ----
const imageOf = (id: number) => model.Textures[id]?.Image ?? '';
interface MatInfo { diffuse: string; emissive?: string }
function matInfo(id: number): MatInfo | null {
  const layers = model.Materials[id]!.Layers.map(l => ({ f: l.FilterMode ?? 0, tex: imageOf(num(l.TextureID)) })).filter(l => l.tex.toLowerCase().endsWith('.blp') && existsSync(path.join(dir, l.tex))); // built-in game textures (Textures\white.blp) are not in the pack
  const base = layers.filter(l => l.f <= 2);
  const diffuse = (base.find(l => /diff/i.test(l.tex)) ?? (base.length && layers.every(l => !/(warpplane|lightning|invoque|glow|rays|tron_|emergy|ring|shields3x)/i.test(l.tex)) ? base[0] : undefined))?.tex;
  if (!diffuse) return null; // effect-only material
  if (SKIP && SKIP.test(diffuse)) return null; // env SKIP: construction scaffolds, flares, burrow decals
  return { diffuse, emissive: layers.find(l => l.f >= 3 && /emis/i.test(l.tex))?.tex ?? layers.find(l => l.f >= 3 && !/(lightning|invoque|glow|rays|tron_|emergy|ring|warpplane)/i.test(l.tex))?.tex };
}
const geosets = model.Geosets.filter(g => !g.LevelOfDetail && matInfo(g.MaterialID));
if (!geosets.length) throw new Error('no usable geosets');
const matIds = [...new Set(geosets.map(g => g.MaterialID))];
console.log('materials', matIds.map(i => JSON.stringify(matInfo(i))).join(' '), 'geosets', geosets.length, '/', model.Geosets.length);

// ---- merge geosets, per material ----
const P: number[] = [], UV: number[] = [];
const IDX = new Map<number, number[]>(matIds.map(i => [i, []]));
for (const g of geosets) {
  const base = P.length / 3, n = g.Vertices.length / 3, ix = IDX.get(g.MaterialID)!;
  for (let i = 0; i < n; i++) {
    P.push(g.Vertices[i * 3]!, g.Vertices[i * 3 + 1]!, g.Vertices[i * 3 + 2]!);
    UV.push(g.TVertices[0]![i * 2]!, g.TVertices[0]![i * 2 + 1]!);
  }
  for (let i = 0; i < g.Faces.length; i++) ix.push(base + g.Faces[i]!);
}
// Z-up -> Y-up: (x, y, z) -> (x, z, -y); then yaw about Y
const pos = new Float32Array(P.length);
{
  const c = Math.cos(YAW), s = Math.sin(YAW);
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]!, y = P[i + 2]!, z = -P[i + 1]!;
    pos[i] = x * c + z * s; pos[i + 1] = y; pos[i + 2] = -x * s + z * c;
  }
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i + k]!); max[k] = Math.max(max[k]!, pos[i + k]!); }
  const sc = LENGTH / Math.max(max[0]! - min[0]!, max[2]! - min[2]!), cx = (min[0]! + max[0]!) / 2, cz = (min[2]! + max[2]!) / 2;
  const GROUND_Y = process.env.GROUND === "keep" ? 0 : min[1]!; // keep: the MDX origin stays the ground line (parts below it stay underground)
  for (let i = 0; i < pos.length; i += 3) { pos[i] = (pos[i]! - cx) * sc; pos[i + 1] = (pos[i + 1]! - GROUND_Y) * sc; pos[i + 2] = (pos[i + 2]! - cz) * sc; }
}
const nrm = new Float32Array(pos.length);
for (const ix of IDX.values()) for (let t = 0; t < ix.length; t += 3) {
  const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
  const e1 = [pos[b]! - pos[a]!, pos[b + 1]! - pos[a + 1]!, pos[b + 2]! - pos[a + 2]!], e2 = [pos[c]! - pos[a]!, pos[c + 1]! - pos[a + 1]!, pos[c + 2]! - pos[a + 2]!];
  const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  for (const v of [a, b, c]) { nrm[v] += n[0]!; nrm[v + 1] += n[1]!; nrm[v + 2] += n[2]!; }
}
for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }

// ---- GLB ----
const nV = pos.length / 3, idx16 = nV < 65536;
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const parts: Buffer[] = [pad(Buffer.from(pos.buffer)), pad(Buffer.from(nrm.buffer)), pad(Buffer.from(new Float32Array(UV).buffer))];
const bufferViews: any[] = [0, 1, 2].map(i => ({ buffer: 0, target: 34962, _i: i }));
const accessors: any[] = [];
const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, pos[i + k]!); max[k] = Math.max(max[k]!, pos[i + k]!); }
accessors.push({ bufferView: 0, componentType: 5126, count: nV, type: 'VEC3', min, max }, { bufferView: 1, componentType: 5126, count: nV, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: nV, type: 'VEC2' });
const images: any[] = [], textures: any[] = [], materials: any[] = [], primitives: any[] = [];
const imgIndex = new Map<string, number>();
async function addImage(file: string) {
  let i = imgIndex.get(file);
  if (i === undefined) { parts.push(pad(await blpToPng(file))); bufferViews.push({ buffer: 0 }); images.push({ bufferView: parts.length - 1, mimeType: 'image/png' }); textures.push({ source: images.length - 1, sampler: 0 }); i = textures.length - 1; imgIndex.set(file, i); }
  return i;
}
for (const id of matIds) {
  const info = matInfo(id)!, ix = IDX.get(id)!;
  parts.push(pad(idx16 ? Buffer.from(new Uint16Array(ix).buffer) : Buffer.from(new Uint32Array(ix).buffer))); bufferViews.push({ buffer: 0, target: 34963 });
  accessors.push({ bufferView: parts.length - 1, componentType: idx16 ? 5123 : 5125, count: ix.length, type: 'SCALAR' });
  const d = await addImage(info.diffuse), e = info.emissive ? await addImage(info.emissive) : -1;
  materials.push({ pbrMetallicRoughness: { baseColorTexture: { index: d }, metallicFactor: 0, roughnessFactor: 0.7 }, ...(e >= 0 ? { emissiveTexture: { index: e }, emissiveFactor: [0.8, 0.8, 0.8] } : {}) });
  primitives.push({ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: accessors.length - 1, material: materials.length - 1 });
}
let o = 0; bufferViews.forEach((bv, i) => { bv.byteOffset = o; bv.byteLength = parts[i]!.length; delete bv._i; o += parts[i]!.length; });
const json = {
  asset: { version: '2.0', generator: 'sc2-clone build-zerg-mdx', extras: { title, author: 'Renn01', authorUrl: 'https://www.hiveworkshop.com/members/renn01.300853/', license: 'Fan port of Blizzard Entertainment artwork (Hive Workshop)', source: SOURCE, note: `converted from ${mdxName}, static bind pose` } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: title }],
  meshes: [{ primitives }], materials,
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], textures, images, accessors, bufferViews, buffers: [{ byteLength: o }]
};
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(parts);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const ch = (len: number, type: number) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
await Bun.write(dst, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]));
console.log('wrote', dst, nV, 'verts', [...IDX.values()].reduce((a, b) => a + b.length, 0) / 3, 'tris', ((12 + 16 + js.length + bin.length) / 1024).toFixed(0), 'KB');
