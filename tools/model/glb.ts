// ---------- GLB writer ----------
export interface OutPart { name: string; pivot: [number, number, number]; pos: Float32Array; nrm: Float32Array; col: Float32Array; uv?: Float32Array; team?: Float32Array; idx: Uint32Array }
export function writeGlb(parts: OutPart[]): Uint8Array {
  const chunks: Uint8Array[] = [], bvs: any[] = [], accs: any[] = []; let off = 0;
  const add = (arr: ArrayBufferView, target: number, comp: number, type: string, count: number, extra: any = {}) => {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - (u8.length % 4)) % 4;
    chunks.push(u8); if (pad) chunks.push(new Uint8Array(pad));
    bvs.push({ buffer: 0, byteOffset: off, byteLength: u8.length, target }); off += u8.length + pad;
    accs.push({ bufferView: bvs.length - 1, componentType: comp, count, type, ...extra });
    return accs.length - 1;
  };
  const nodes: any[] = [], meshes: any[] = [], rootKids: number[] = [];
  for (const p of parts) {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k]!, p.pos[i + k]!); mx[k] = Math.max(mx[k]!, p.pos[i + k]!); }
    const a = add(p.pos, 34962, 5126, 'VEC3', p.pos.length / 3, { min: mn, max: mx });
    const n = add(p.nrm, 34962, 5126, 'VEC3', p.nrm.length / 3);
    const c = add(p.col, 34962, 5126, 'VEC3', p.col.length / 3);
    const uv = p.uv ? add(p.uv, 34962, 5126, 'VEC2', p.uv.length / 2) : -1;
    const tm = p.team ? add(p.team, 34962, 5126, 'SCALAR', p.team.length) : -1; // custom attribute: three.js loads it as '_teammask'
    const i = add(p.idx, 34963, 5125, 'SCALAR', p.idx.length);
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: a, NORMAL: n, COLOR_0: c, ...(uv >= 0 ? { TEXCOORD_0: uv } : {}), ...(tm >= 0 ? { _TEAMMASK: tm } : {}) }, indices: i, material: 0 }] });
    nodes.push({ name: p.name, mesh: meshes.length - 1, translation: p.pivot });
    rootKids.push(nodes.length - 1);
  }
  nodes.push({ name: 'root', children: rootKids });
  const json = {
    asset: { version: '2.0', generator: 'tools/model/build-static.ts' }, scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes,
    materials: [{ name: 'vc', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.6 } }],
    accessors: accs, bufferViews: bvs, buffers: [{ byteLength: off }]
  };
  let jb = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (jb.length % 4)) % 4;
  if (jp) { const t = new Uint8Array(jb.length + jp).fill(0x20); t.set(jb); jb = t; }
  const total = 12 + 8 + jb.length + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jb, 20);
  const bo = 20 + jb.length; dv.setUint32(bo, off, true); dv.setUint32(bo + 4, 0x004e4942, true);
  let o = bo + 8; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

