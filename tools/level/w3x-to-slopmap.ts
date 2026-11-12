/**
 * Converts a Warcraft III (.w3x / .w3m) MPQ map archive into a single self-contained Slopcraft 2 .slopmap file.
 *
 * Usage:
 *   bun tools/level/w3x-to-slopmap.ts "<path/to/map.w3x>" ["<path/to/output.slopmap>"]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { parseMDX, decodeBLP, getBLPImageData } from 'war3-model';
import { PNG } from 'pngjs';
import { TIER_HEIGHT, type BaseDef, type PropRule, type Pt, type StartDef } from '../../src/levels/LevelTypes';
import type { Theme } from '../../src/levels/Themes';
import {
  encodeSlopmap,
  type SlopmapChunkInput,
  type SlopmapDoodadDef,
  type SlopmapManifest,
  type SlopmapUnitDef
} from './slopmap';

// ---------------- 1. MPQ Archive Reader (with Vexorian VxOP / SOT key recovery) ----------------

const CRYPT_TABLE = new Uint32Array(0x500);
{
  let seed = 0x00100001;
  for (let i = 0; i < 0x100; i++) {
    let idx = i;
    for (let j = 0; j < 5; j++, idx += 0x100) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp1 = (seed & 0xffff) << 16;
      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp2 = seed & 0xffff;
      CRYPT_TABLE[idx] = (temp1 | temp2) >>> 0;
    }
  }
}

function hashString(str: string, hashType: number): number {
  let seed1 = 0x7fed7fed >>> 0;
  let seed2 = 0xeeeeeeee >>> 0;
  for (let i = 0; i < str.length; i++) {
    let ch = str.charCodeAt(i);
    if (ch >= 97 && ch <= 122) ch -= 32; // toupper
    seed1 = (CRYPT_TABLE[(hashType << 8) + ch]! ^ ((seed1 + seed2) >>> 0)) >>> 0;
    seed2 = (ch + seed1 + seed2 + (seed2 << 5) + 3) >>> 0;
  }
  return seed1;
}

function decryptData(data: Uint8Array, key: number): Uint8Array {
  const out = new Uint8Array(data);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let seed1 = key >>> 0;
  let seed2 = 0xeeeeeeee >>> 0;
  const count = out.byteLength >> 2;
  for (let i = 0; i < count; i++) {
    seed2 = (seed2 + CRYPT_TABLE[0x400 + (seed1 & 0xff)]!) >>> 0;
    const ch = (dv.getUint32(i * 4, true) ^ ((seed1 + seed2) >>> 0)) >>> 0;
    seed1 = (((~seed1 << 21) + 0x11111111) | (seed1 >>> 11)) >>> 0;
    seed2 = (ch + seed2 + (seed2 << 5) + 3) >>> 0;
    dv.setUint32(i * 4, ch, true);
  }
  return out;
}

function recoverKeyFromSot(rawSlice: Uint8Array, numSectors: number, cSize: number): number | null {
  const sotBytes = (numSectors + 1) * 4;
  const dv = new DataView(rawSlice.buffer, rawSlice.byteOffset, rawSlice.byteLength);
  const enc0 = dv.getUint32(0, true);
  const x0 = (enc0 ^ sotBytes) >>> 0;
  for (let low = 0; low < 256; low++) {
    const s2_0 = (0xeeeeeeee + CRYPT_TABLE[0x400 + low]!) >>> 0;
    const k0 = (x0 - s2_0) >>> 0;
    if ((k0 & 0xff) !== low) continue;
    const decSot = decryptData(rawSlice.subarray(0, sotBytes), k0);
    const sdv = new DataView(decSot.buffer, decSot.byteOffset, decSot.byteLength);
    if (sdv.getUint32(0, true) !== sotBytes || sdv.getUint32(numSectors * 4, true) !== cSize) continue;
    let monotonic = true;
    for (let s = 0; s < numSectors; s++) {
      if (sdv.getUint32(s * 4, true) > sdv.getUint32((s + 1) * 4, true)) { monotonic = false; break; }
    }
    if (monotonic) return (k0 + 1) >>> 0;
  }
  return null;
}

interface ExtractedArchive {
  blocks: Map<number, Uint8Array>;
  byName: Map<string, Uint8Array>;
  namedCount: number;
}

function extractMpqArchive(fileBytes: Uint8Array): ExtractedArchive {
  // Locate MPQ\x1a header (either at offset 0 or 512-byte HM3W offset)
  let mpqOffset = 0;
  for (let off = 0; off <= Math.min(2048, fileBytes.byteLength - 32); off += 512) {
    if (
      fileBytes[off] === 0x4d &&
      fileBytes[off + 1] === 0x50 &&
      fileBytes[off + 2] === 0x51 &&
      fileBytes[off + 3] === 0x1a
    ) {
      mpqOffset = off;
      break;
    }
  }
  const raw = fileBytes.subarray(mpqOffset);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const secShift = dv.getUint16(14, true);
  const htOff = dv.getUint32(16, true);
  const btOff = dv.getUint32(20, true);
  const htCnt = dv.getUint32(24, true);
  const btCnt = dv.getUint32(28, true);
  const sectorSize = 512 << secShift;

  const htRaw = decryptData(raw.subarray(htOff, htOff + htCnt * 16), hashString('(hash table)', 3));
  const btRaw = decryptData(raw.subarray(btOff, btOff + btCnt * 16), hashString('(block table)', 3));
  const hdv = new DataView(htRaw.buffer, htRaw.byteOffset, htRaw.byteLength);
  const bdv = new DataView(btRaw.buffer, btRaw.byteOffset, btRaw.byteLength);

  const hashLookup = new Map<string, number>();
  for (let i = 0; i < htCnt; i++) {
    const ha = hdv.getUint32(i * 16, true);
    const hb = hdv.getUint32(i * 16 + 4, true);
    const bi = hdv.getUint32(i * 16 + 12, true);
    if (bi < btCnt) hashLookup.set(`${ha}:${hb}`, bi);
  }

  const blocks = new Map<number, Uint8Array>();
  for (let bi = 0; bi < btCnt; bi++) {
    const fPos = bdv.getUint32(bi * 16, true);
    const cSize = bdv.getUint32(bi * 16 + 4, true);
    const uSize = bdv.getUint32(bi * 16 + 8, true);
    const flags = bdv.getUint32(bi * 16 + 12, true);
    if (!(flags & 0x80000000)) continue;

    const blockData = raw.subarray(fPos, fPos + cSize);
    if (!(flags & 0x00000200)) {
      blocks.set(bi, blockData.subarray(0, uSize));
      continue;
    }

    const numSectors = Math.ceil(uSize / sectorSize);
    const sotBytes = (numSectors + 1) * 4;
    let sotRaw = blockData.subarray(0, sotBytes);
    let key = 0;
    if (flags & 0x00010000) {
      const recovered = recoverKeyFromSot(blockData, numSectors, cSize);
      if (recovered === null) throw new Error(`Failed to recover MPQ key for block ${bi}`);
      key = recovered;
      sotRaw = decryptData(sotRaw, (key - 1) >>> 0);
    }
    const sdv = new DataView(sotRaw.buffer, sotRaw.byteOffset, sotRaw.byteLength);
    const out = new Uint8Array(uSize);
    let written = 0;
    for (let s = 0; s < numSectors; s++) {
      const o0 = sdv.getUint32(s * 4, true);
      const o1 = sdv.getUint32((s + 1) * 4, true);
      let secData: Uint8Array = blockData.subarray(o0, o1);
      const expectedLen = Math.min(sectorSize, uSize - written);
      if (flags & 0x00010000) {
        secData = decryptData(secData, (key + s) >>> 0);
      }
      if (secData.byteLength < expectedLen) {
        const compType = secData[0]!;
        const payload = secData.subarray(1);
        if (compType === 0x02) {
          secData = new Uint8Array(zlib.inflateSync(payload));
        } else {
          throw new Error(`Unsupported MPQ compression 0x${compType.toString(16)} in block ${bi}`);
        }
      }
      out.set(secData.subarray(0, expectedLen), written);
      written += expectedLen;
    }
    blocks.set(bi, out);
  }

  // Harvest candidate filenames from standard WC3 map files + strings embedded in extracted blocks
  const candidates = new Set<string>([
    '(listfile)', '(attributes)',
    'war3map.w3e', 'war3map.w3i', 'war3map.wtg', 'war3map.wct', 'war3map.wts',
    'war3map.j', 'scripts\\war3map.j', 'war3map.shd', 'war3mapMap.blp', 'war3mapMap.tga',
    'war3mapPreview.tga', 'war3mapPreview.blp', 'war3map.mmp', 'war3mapPath.tga',
    'war3map.wpm', 'war3map.doo', 'war3mapUnits.doo', 'war3map.w3r', 'war3map.w3c',
    'war3map.w3s', 'war3map.w3u', 'war3map.w3t', 'war3map.w3a', 'war3map.w3b',
    'war3map.w3d', 'war3map.w3q', 'war3mapMisc.txt', 'war3mapSkin.txt', 'war3mapExtra.txt',
    'war3map.imp'
  ]);

  const pathRegex = /[A-Za-z0-9_.\-/\\ ()']+\.(?:blp|mdx|mdl|tga|mp3|wav|slk|txt|j|w3[a-z]|doo|shd|wpm|mmp|wts|fdf|toc)/gi;
  const latin1 = new TextDecoder('latin1');
  for (const data of blocks.values()) {
    const text = latin1.decode(data);
    const matches = text.match(pathRegex);
    if (!matches) continue;
    for (const rawMatch of matches) {
      const norm = rawMatch.replace(/\\\\/g, '\\').replace(/\//g, '\\');
      candidates.add(norm);
      const dot = norm.lastIndexOf('.');
      if (dot > 0) {
        const stem = norm.slice(0, dot);
        candidates.add(stem + '.mdx');
        candidates.add(stem + '.blp');
        candidates.add(stem + '.tga');
      }
      const base = norm.split('\\').pop()!;
      candidates.add(base);
      candidates.add('war3mapImported\\' + base);
      const baseDot = base.lastIndexOf('.');
      if (baseDot > 0) {
        const baseStem = base.slice(0, baseDot);
        candidates.add('war3mapImported\\' + baseStem + '.mdx');
        candidates.add('war3mapImported\\' + baseStem + '.blp');
      }
    }
  }

  const byName = new Map<string, Uint8Array>();
  const matchedBlocks = new Set<number>();
  for (const cand of candidates) {
    const ha = hashString(cand, 1);
    const hb = hashString(cand, 2);
    const bi = hashLookup.get(`${ha}:${hb}`);
    if (bi !== undefined) {
      const buf = blocks.get(bi);
      if (buf) {
        matchedBlocks.add(bi);
        const key = cand.replace(/\\/g, '/').toLowerCase();
        byName.set(key, buf);
        const baseKey = key.split('/').pop()!;
        if (!byName.has(baseKey)) byName.set(baseKey, buf);
      }
    }
  }

  return { blocks, byName, namedCount: matchedBlocks.size };
}

// ---------------- 2. Parsers for WTS, W3E, WPM, DOO, W3D/W3B/W3U ----------------

function parseWts(buf: Uint8Array | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!buf) return map;
  const text = new TextDecoder('utf-8').decode(buf);
  const re = /STRING\s+(\d+)\s*[\r\n]+\{\s*[\r\n]+([\s\S]*?)[\r\n]+\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(Number(m[1]), m[2]!.trim());
  }
  return map;
}

function resolveTrigStr(val: string | undefined, wts: Map<number, string>): string {
  if (!val) return '';
  const m = /^TRIGSTR_0*(\d+)$/i.exec(val.trim());
  if (m) return wts.get(Number(m[1])) ?? val;
  return val;
}

function parseW3Objects(buf: Uint8Array | undefined, hasLevelCol: boolean): Map<string, Record<string, any>> {
  const out = new Map<string, Record<string, any>>();
  if (!buf || buf.byteLength < 8) return out;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ver = dv.getUint32(0, true);
  let p = 4;
  const dec = new TextDecoder('utf-8');
  const lat = new TextDecoder('latin1');

  for (let t = 0; t < 2; t++) {
    if (p + 4 > buf.byteLength) break;
    const cnt = dv.getUint32(p, true);
    p += 4;
    for (let i = 0; i < cnt; i++) {
      const origId = lat.decode(buf.subarray(p, p + 4));
      const newId = lat.decode(buf.subarray(p + 4, p + 8));
      p += 8;
      const oid = newId !== '\x00\x00\x00\x00' ? newId : origId;
      const sets = ver >= 3 ? dv.getUint32(p, true) : 1;
      if (ver >= 3) p += 4;
      const props: Record<string, any> = { _parent: origId };
      for (let s = 0; s < sets; s++) {
        if (ver >= 3) p += 4; // set flag
        const mcnt = dv.getUint32(p, true);
        p += 4;
        for (let m = 0; m < mcnt; m++) {
          const fid = lat.decode(buf.subarray(p, p + 4));
          const vtype = dv.getUint32(p + 4, true);
          p += 8;
          if (hasLevelCol) p += 8; // level + column
          let val: any;
          if (vtype === 0) {
            val = dv.getInt32(p, true);
            p += 4;
          } else if (vtype === 1 || vtype === 2) {
            val = dv.getFloat32(p, true);
            p += 4;
          } else {
            let end = p;
            while (end < buf.byteLength && buf[end] !== 0) end++;
            val = dec.decode(buf.subarray(p, end));
            p = end + 1;
          }
          p += 4; // end marker
          props[fid] = val;
        }
      }
      out.set(oid, props);
    }
  }
  return out;
}

interface ParsedDooInstance {
  id: string;
  variation: number;
  wc3X: number;
  wc3Y: number;
  wc3Z: number;
  angle: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  flags: number;
  life: number;
}

function parseWar3MapDoo(buf: Uint8Array): ParsedDooInstance[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ver = dv.getUint32(4, true);
  const count = dv.getUint32(12, true);
  const lat = new TextDecoder('latin1');
  const out: ParsedDooInstance[] = [];

  // In patch 1.32+ (ver >= 13 or skinId present), each record has a 4-byte skinId at offset +36.
  // Scan records cleanly:
  let p = 16;
  for (let i = 0; i < count && p + 42 <= buf.byteLength; i++) {
    const id = lat.decode(buf.subarray(p, p + 4));
    const variation = dv.getUint32(p + 4, true);
    const wc3X = dv.getFloat32(p + 8, true);
    const wc3Y = dv.getFloat32(p + 12, true);
    const wc3Z = dv.getFloat32(p + 16, true);
    const angle = dv.getFloat32(p + 20, true);
    const scaleX = dv.getFloat32(p + 24, true);
    const scaleY = dv.getFloat32(p + 28, true);
    const scaleZ = dv.getFloat32(p + 32, true);

    if (ver >= 13) {
      // v13 record: +36..40 skinId, +40..44 rgba, +44 flags, +45 life, +46..50 itemTable, +50..54 itemSetsCount
      const flags = buf[p + 44]!;
      const life = buf[p + 45]!;
      // Locate next record by checking if itemSets are attached or standard 74-byte v13 stride
      let nextP = p + 74;
      const isAscii4 = (off: number) =>
        off + 40 <= buf.byteLength &&
        buf[off] === buf[off + 36] &&
        buf[off + 1] === buf[off + 37] &&
        buf[off + 2] === buf[off + 38] &&
        buf[off + 3] === buf[off + 39] &&
        buf[off]! >= 32 && buf[off]! < 127;
      if (i + 1 < count && !isAscii4(nextP)) {
        // Search forward up to 256 bytes for the next record header where id == skinId
        for (let scan = p + 50; scan < Math.min(buf.byteLength - 40, p + 300); scan++) {
          if (isAscii4(scan)) { nextP = scan; break; }
        }
      }
      out.push({ id, variation, wc3X, wc3Y, wc3Z, angle, scaleX, scaleY, scaleZ, flags, life });
      p = nextP;
    } else {
      const flags = buf[p + 36]!;
      const life = buf[p + 37]!;
      let nextP = p + 42;
      if (ver >= 8) {
        const sets = dv.getUint32(p + 42, true);
        nextP = p + 46;
        for (let s = 0; s < sets; s++) {
          const items = dv.getUint32(nextP, true);
          nextP += 4 + items * 8;
        }
        nextP += 4;
      }
      out.push({ id, variation, wc3X, wc3Y, wc3Z, angle, scaleX, scaleY, scaleZ, flags, life });
      p = nextP;
    }
  }
  return out;
}

// ---------------- 3. Image & 3D Model (BLP/TGA -> PNG, MDX+BLP -> GLB) Converters ----------------

function blpBytesToPng(blpBytes: Uint8Array, opaqueAlpha = false): Uint8Array {
  const ab = blpBytes.buffer.slice(blpBytes.byteOffset, blpBytes.byteOffset + blpBytes.byteLength);
  const blp = decodeBLP(ab);
  const img = getBLPImageData(blp, 0);
  const png = new PNG({ width: blp.width, height: blp.height });
  const src = img.data;
  for (let i = 0; i < src.length; i += 4) {
    png.data[i] = src[i]!;
    png.data[i + 1] = src[i + 1]!;
    png.data[i + 2] = src[i + 2]!;
    png.data[i + 3] = opaqueAlpha ? 255 : src[i + 3]!;
  }
  return new Uint8Array(PNG.sync.write(png));
}

function tgaBytesToPng(tga: Uint8Array): Uint8Array | null {
  if (tga.byteLength < 18) return null;
  const idLen = tga[0]!;
  const colorMapType = tga[1]!;
  const imgType = tga[2]!;
  if (colorMapType !== 0 || (imgType !== 2 && imgType !== 10)) return null;
  const dv = new DataView(tga.buffer, tga.byteOffset, tga.byteLength);
  const width = dv.getUint16(12, true);
  const height = dv.getUint16(14, true);
  const bpp = tga[16]!;
  const desc = tga[17]!;
  const flipY = (desc & 0x20) === 0;
  const bytesPerPixel = bpp >> 3;
  if (bytesPerPixel !== 3 && bytesPerPixel !== 4) return null;

  const png = new PNG({ width, height });
  let p = 18 + idLen;
  const totalPixels = width * height;
  const rgba = new Uint8Array(totalPixels * 4);

  if (imgType === 2) {
    for (let i = 0; i < totalPixels && p + bytesPerPixel <= tga.byteLength; i++) {
      rgba[i * 4] = tga[p + 2]!;
      rgba[i * 4 + 1] = tga[p + 1]!;
      rgba[i * 4 + 2] = tga[p]!;
      rgba[i * 4 + 3] = bytesPerPixel === 4 ? tga[p + 3]! : 255;
      p += bytesPerPixel;
    }
  } else {
    let pix = 0;
    while (pix < totalPixels && p < tga.byteLength) {
      const hdr = tga[p++]!;
      const count = (hdr & 0x7f) + 1;
      if (hdr & 0x80) {
        const b = tga[p]!, g = tga[p + 1]!, r = tga[p + 2]!, a = bytesPerPixel === 4 ? tga[p + 3]! : 255;
        p += bytesPerPixel;
        for (let k = 0; k < count && pix < totalPixels; k++, pix++) {
          rgba[pix * 4] = r; rgba[pix * 4 + 1] = g; rgba[pix * 4 + 2] = b; rgba[pix * 4 + 3] = a;
        }
      } else {
        for (let k = 0; k < count && pix < totalPixels; k++, pix++) {
          rgba[pix * 4] = tga[p + 2]!;
          rgba[pix * 4 + 1] = tga[p + 1]!;
          rgba[pix * 4 + 2] = tga[p]!;
          rgba[pix * 4 + 3] = bytesPerPixel === 4 ? tga[p + 3]! : 255;
          p += bytesPerPixel;
        }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const sy = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x++) {
      const si = (sy * width + x) * 4;
      const di = (y * width + x) * 4;
      png.data[di] = rgba[si]!;
      png.data[di + 1] = rgba[si + 1]!;
      png.data[di + 2] = rgba[si + 2]!;
      png.data[di + 3] = rgba[si + 3]!;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

function fallbackColorForTexPath(texPath: string): [number, number, number, number] {
  const s = texPath.toLowerCase();
  if (/grass|fern|vine|leaf|palm|tree|plant|bush|moss/.test(s)) return [0.24, 0.46, 0.2, 1];
  if (/gold|treasure|coin|lamp|fire|torch/.test(s)) return [0.85, 0.68, 0.22, 1];
  if (/water|fountain|waterfall|ice/.test(s)) return [0.22, 0.55, 0.68, 0.85];
  if (/wood|palisade|fence|barricade|crate|barrel/.test(s)) return [0.45, 0.32, 0.2, 1];
  return [0.52, 0.54, 0.48, 1]; // Sunken ruins stone default
}

/**
 * Converts a Warcraft 3 MDX buffer (+ any available BLP textures in the archive) into a self-contained glTF 2.0 .glb buffer.
 */
function convertMdxToGlb(
  mdxBytes: Uint8Array,
  title: string,
  byName: Map<string, Uint8Array>,
  pngCache: Map<string, Uint8Array>
): { glb: Uint8Array; hasTexture: boolean } | null {
  try {
    const ab = mdxBytes.buffer.slice(mdxBytes.byteOffset, mdxBytes.byteOffset + mdxBytes.byteLength);
    const model = parseMDX(ab);
    if (!model.Geosets || !model.Geosets.length) return null;

    const findBlp = (imgPath: string): { key: string; bytes: Uint8Array } | null => {
      if (!imgPath) return null;
      const norm = imgPath.replace(/\\/g, '/').toLowerCase();
      const base = norm.split('/').pop()!;
      for (const k of [norm, base, 'war3mapimported/' + base]) {
        const hit = byName.get(k);
        if (hit) return { key: k, bytes: hit };
      }
      return null;
    };

    const geosets = model.Geosets.filter(g => !g.LevelOfDetail && g.Vertices?.length >= 9 && g.Faces?.length >= 3);
    if (!geosets.length) return null;

    const matIds = [...new Set(geosets.map(g => g.MaterialID))];
    const P: number[] = [];
    const UV: number[] = [];
    const IDX = new Map<number, number[]>(matIds.map(i => [i, []]));

    for (const g of geosets) {
      const base = P.length / 3;
      const n = (g.Vertices.length / 3) | 0;
      const ix = IDX.get(g.MaterialID)!;
      const uvArr = g.TVertices?.[0];
      for (let i = 0; i < n; i++) {
        P.push(g.Vertices[i * 3]!, g.Vertices[i * 3 + 1]!, g.Vertices[i * 3 + 2]!);
        UV.push(uvArr ? uvArr[i * 2]! : 0, uvArr ? uvArr[i * 2 + 1]! : 0);
      }
      for (let i = 0; i < g.Faces.length; i++) {
        ix.push(base + g.Faces[i]!);
      }
    }

    const nV = (P.length / 3) | 0;
    if (nV === 0) return null;

    // WC3 Z-up -> Slopcraft 2 Y-up, and scale from WC3 units (128 = 1 tile) to Slopcraft 2 tiles (1.0 = 1 tile)
    const pos = new Float32Array(P.length);
    const min = [1e9, 1e9, 1e9];
    const max = [-1e9, -1e9, -1e9];
    const scale = 1 / 128;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i]! * scale;
      const y = P[i + 2]! * scale;
      const z = -P[i + 1]! * scale;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, pos[i + k]!);
        max[k] = Math.max(max[k]!, pos[i + k]!);
      }
    }
    // Ground model at y=0, centered on X/Z
    const cx = (min[0]! + max[0]!) / 2;
    const cz = (min[2]! + max[2]!) / 2;
    const minY = min[1]!;
    for (let k = 0; k < 3; k++) { min[k] = 1e9; max[k] = -1e9; }
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = pos[i]! - cx;
      pos[i + 1] = pos[i + 1]! - minY;
      pos[i + 2] = pos[i + 2]! - cz;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, pos[i + k]!);
        max[k] = Math.max(max[k]!, pos[i + k]!);
      }
    }

    const nrm = new Float32Array(pos.length);
    for (const ix of IDX.values()) {
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
        const e1x = pos[b]! - pos[a]!, e1y = pos[b + 1]! - pos[a + 1]!, e1z = pos[b + 2]! - pos[a + 2]!;
        const e2x = pos[c]! - pos[a]!, e2y = pos[c + 1]! - pos[a + 1]!, e2z = pos[c + 2]! - pos[a + 2]!;
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        for (const v of [a, b, c]) {
          nrm[v] = nrm[v]! + nx;
          nrm[v + 1] = nrm[v + 1]! + ny;
          nrm[v + 2] = nrm[v + 2]! + nz;
        }
      }
    }
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!) || 1;
      nrm[i] = nrm[i]! / l;
      nrm[i + 1] = nrm[i + 1]! / l;
      nrm[i + 2] = nrm[i + 2]! / l;
    }

    const idx16 = nV < 65536;
    const pad4 = (u8: Uint8Array) => {
      const p = (4 - (u8.byteLength % 4)) % 4;
      if (!p) return u8;
      const out = new Uint8Array(u8.byteLength + p);
      out.set(u8);
      return out;
    };

    const parts: Uint8Array[] = [
      pad4(new Uint8Array(pos.buffer)),
      pad4(new Uint8Array(nrm.buffer)),
      pad4(new Uint8Array(new Float32Array(UV).buffer))
    ];
    const bufferViews: any[] = [
      { buffer: 0, target: 34962 },
      { buffer: 0, target: 34962 },
      { buffer: 0, target: 34962 }
    ];
    const accessors: any[] = [
      { bufferView: 0, componentType: 5126, count: nV, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nV, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: nV, type: 'VEC2' }
    ];
    const images: any[] = [];
    const textures: any[] = [];
    const materials: any[] = [];
    const primitives: any[] = [];
    const texIdxMap = new Map<string, number>();
    let hasTexture = false;

    const addPngTex = (key: string, blpBuf: Uint8Array): number => {
      const existing = texIdxMap.get(key);
      if (existing !== undefined) return existing;
      let png = pngCache.get(key);
      if (!png) {
        png = blpBytesToPng(blpBuf, false);
        pngCache.set(key, png);
      }
      parts.push(pad4(png));
      bufferViews.push({ buffer: 0 });
      images.push({ bufferView: parts.length - 1, mimeType: 'image/png' });
      textures.push({ source: images.length - 1, sampler: 0 });
      const idx = textures.length - 1;
      texIdxMap.set(key, idx);
      hasTexture = true;
      return idx;
    };

    for (const matId of matIds) {
      const ix = IDX.get(matId)!;
      if (!ix.length) continue;
      const idxBuf = idx16 ? new Uint8Array(new Uint16Array(ix).buffer) : new Uint8Array(new Uint32Array(ix).buffer);
      parts.push(pad4(idxBuf));
      bufferViews.push({ buffer: 0, target: 34963 });
      accessors.push({
        bufferView: parts.length - 1,
        componentType: idx16 ? 5123 : 5125,
        count: ix.length,
        type: 'SCALAR'
      });

      const layers = model.Materials?.[matId]?.Layers ?? [];
      let chosenBlp: { key: string; bytes: Uint8Array } | null = null;
      let firstTexPath = '';
      for (const l of layers) {
        const tid = typeof l.TextureID === 'number' ? l.TextureID : -1;
        const imgPath = model.Textures?.[tid]?.Image ?? '';
        if (!firstTexPath && imgPath) firstTexPath = imgPath;
        const hit = findBlp(imgPath);
        if (hit) { chosenBlp = hit; break; }
      }

      if (chosenBlp) {
        try {
          const tIdx = addPngTex(chosenBlp.key, chosenBlp.bytes);
          materials.push({
            pbrMetallicRoughness: { baseColorTexture: { index: tIdx }, metallicFactor: 0.05, roughnessFactor: 0.8 },
            alphaMode: 'MASK',
            alphaCutoff: 0.5,
            doubleSided: true
          });
        } catch {
          materials.push({
            pbrMetallicRoughness: { baseColorFactor: fallbackColorForTexPath(firstTexPath || title), metallicFactor: 0.05, roughnessFactor: 0.85 }
          });
        }
      } else {
        materials.push({
          pbrMetallicRoughness: { baseColorFactor: fallbackColorForTexPath(firstTexPath || title), metallicFactor: 0.05, roughnessFactor: 0.85 }
        });
      }

      primitives.push({
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: accessors.length - 1,
        material: materials.length - 1
      });
    }

    if (!primitives.length) return null;

    let byteOffset = 0;
    for (let i = 0; i < bufferViews.length; i++) {
      bufferViews[i].byteOffset = byteOffset;
      bufferViews[i].byteLength = parts[i]!.byteLength;
      byteOffset += parts[i]!.byteLength;
    }

    const gltfJson: any = {
      asset: { version: '2.0', generator: 'Slopcraft 2 w3x-to-slopmap', extras: { title } },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: title }],
      meshes: [{ name: title, primitives }],
      materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: byteOffset }]
    };
    if (textures.length) {
      gltfJson.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
      gltfJson.textures = textures;
      gltfJson.images = images;
    }

    const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(gltfJson));
    const jsonPad = (4 - (jsonBytesRaw.byteLength % 4)) % 4;
    const jsonChunk = new Uint8Array(jsonBytesRaw.byteLength + jsonPad).fill(0x20);
    jsonChunk.set(jsonBytesRaw);

    const totalLen = 12 + 8 + jsonChunk.byteLength + 8 + byteOffset;
    const glb = new Uint8Array(totalLen);
    const dv = new DataView(glb.buffer);
    dv.setUint32(0, 0x46546c67, true); // "glTF"
    dv.setUint32(4, 2, true);
    dv.setUint32(8, totalLen, true);
    dv.setUint32(12, jsonChunk.byteLength, true);
    dv.setUint32(16, 0x4e4f534a, true); // "JSON"
    glb.set(jsonChunk, 20);
    const binHeaderOff = 20 + jsonChunk.byteLength;
    dv.setUint32(binHeaderOff, byteOffset, true);
    dv.setUint32(binHeaderOff + 4, 0x004e4942, true); // "BIN\0"
    let posOff = binHeaderOff + 8;
    for (const part of parts) {
      glb.set(part, posOff);
      posOff += part.byteLength;
    }
    return { glb, hasTexture };
  } catch {
    return null;
  }
}

// ---------------- 4. PropKit Classifier for WC3 Doodads ----------------

function classifyDoodadPropKit(id: string, parentId: string, name: string, mdxPath: string): string {
  const baseId = parentId && parentId !== '\x00\x00\x00\x00' ? parentId : id;
  if (/^YT|^YTp|^Ytl/i.test(baseId) || /pathing\s*blocker/i.test(name)) return 'blocker';
  const s = `${baseId} ${name} ${mdxPath}`.toLowerCase();
  if (/vine|ivy|zpv|creep/.test(s)) return 'alien_vine';
  if (/crystal|gem|obelisk|monolith|rune|zoob/.test(s)) return 'crystal';
  if (/column|pillar|arch|wall|ruin|temple|statue|pedestal|zttw|zsar|muro/.test(s)) return 'pillar';
  if (/palm|tree|canopy|zttc|ltlt/.test(s)) return 'pine';
  if (/dead|stump|cage|bones/.test(s)) return 'deadtree';
  if (/reed|rush|waterplant|cattail|lily|zwsw|zplp/.test(s)) return 'reeds';
  if (/bush|shrub|plant|fern|mushroom|flower|grass|zpsh|zpms|apms/.test(s)) return 'bush';
  if (/spire|cliff|peak|zrrs|zrbs/.test(s)) return 'spire';
  if (/pebble|rubble|debris|pile/.test(s)) return 'pebbles';
  if (/mesa|slab/.test(s)) return 'mesa_rock';
  return 'boulder';
}

// ---------------- 5. Main Conversion Pipeline ----------------

const inputW3x = process.argv[2] ?? 'Sunken City v2.5.2b.w3x';
const outputSlopmap =
  process.argv[3] ??
  path.join(path.dirname(inputW3x), path.basename(inputW3x, path.extname(inputW3x)) + '.slopmap');

console.log(`[1/6] Reading MPQ archive: ${inputW3x}`);
const w3xBytes = new Uint8Array(fs.readFileSync(inputW3x));
const archive = extractMpqArchive(w3xBytes);
console.log(`      Extracted ${archive.blocks.size} MPQ blocks (${archive.namedCount} matched by path)`);

const wts = parseWts(archive.byName.get('war3map.wts'));
const w3d = parseW3Objects(archive.byName.get('war3map.w3d'), true);
const w3b = parseW3Objects(archive.byName.get('war3map.w3b'), false);
const w3u = parseW3Objects(archive.byName.get('war3map.w3u'), false);

// Parse war3map.w3e (Terrain)
console.log(`[2/6] Parsing war3map.w3e (terrain) & war3map.wpm (pathing)...`);
const w3e = archive.byName.get('war3map.w3e');
if (!w3e) throw new Error('war3map.w3e not found in archive');
const w3eDv = new DataView(w3e.buffer, w3e.byteOffset, w3e.byteLength);
const lat = new TextDecoder('latin1');
const w3eVer = w3eDv.getUint32(4, true);
const mainTileset = String.fromCharCode(w3e[8]!);
let ep = 13;
const numGTiles = w3eDv.getUint32(ep, true); ep += 4;
const groundTiles: string[] = [];
for (let i = 0; i < numGTiles; i++, ep += 4) groundTiles.push(lat.decode(w3e.subarray(ep, ep + 4)));
const numCTiles = w3eDv.getUint32(ep, true); ep += 4;
const cliffTiles: string[] = [];
for (let i = 0; i < numCTiles; i++, ep += 4) cliffTiles.push(lat.decode(w3e.subarray(ep, ep + 4)));
const mx = w3eDv.getUint32(ep, true);
const my = w3eDv.getUint32(ep + 4, true);
const wc3OffX = w3eDv.getFloat32(ep + 8, true);
const wc3OffY = w3eDv.getFloat32(ep + 12, true);
ep += 16;

const widthTiles = mx - 1;  // 160
const heightTiles = my - 1; // 192
const size = Math.max(widthTiles, heightTiles); // 192 (square Slopcraft 2 playfield)
const padX = Math.floor((size - widthTiles) / 2); // 16
const padZ = Math.floor((size - heightTiles) / 2); // 0
const res = size * 2 + 1; // 385

const vCount = mx * my;
const bytesPerVertex = Math.round((w3e.byteLength - ep) / vCount); // 8 for v12, 7 for v11

const vHeight = new Float32Array(vCount);
const vWaterLevel = new Float32Array(vCount);
const vLayer = new Uint8Array(vCount);
const vTileIdx = new Uint8Array(vCount);
const vWaterFlag = new Uint8Array(vCount);
const vRampFlag = new Uint8Array(vCount);

// Brick / square-slab tiles in Sunken Ruins map to Slopcraft 2's `plaza` shader channel
const plazaTileIndices = new Set<number>();
groundTiles.forEach((tid, idx) => {
  if (/^(Zbkl|Zbks|Ztil|Ksqt|Ibsq|Itbk)$/i.test(tid)) plazaTileIndices.add(idx);
});

for (let i = 0; i < vCount; i++) {
  const vo = ep + i * bytesPerVertex;
  const gh = w3eDv.getUint16(vo, true);
  const wl = w3eDv.getUint16(vo + 2, true);
  const gtFlags = w3e[vo + 4]!;
  const ctLayer = w3e[vo + 6]!;
  const layer = ctLayer & 0x0f;
  const rawGround = (gh - 8192) / 512; // 1 WC3 cliff level (256 units) = ~2.0 world units
  const rawWater = ((wl & 0x3fff) - 8192) / 512 + (layer - 2) * 1.4;
  // Combine base cliff layer + vertex height deformation into Slopcraft 2 elevation
  vLayer[i] = layer;
  vHeight[i] = (layer - 2) * TIER_HEIGHT + rawGround * 0.7;
  vWaterLevel[i] = rawWater;
  vTileIdx[i] = gtFlags & 0x0f;
  vRampFlag[i] = (gtFlags & 0x10) ? 1 : 0;
  vWaterFlag[i] = (gtFlags & 0x40) ? 1 : 0;
}

// Normalize minimum playable height so base tier sits cleanly near 0
let minH = Infinity, maxH = -Infinity;
for (let i = 0; i < vCount; i++) {
  if (vHeight[i]! < minH) minH = vHeight[i]!;
  if (vHeight[i]! > maxH) maxH = vHeight[i]!;
}
const baseShift = -minH;
for (let i = 0; i < vCount; i++) {
  vHeight[i] = vHeight[i]! + baseShift;
  vWaterLevel[i] = vWaterLevel[i]! + baseShift;
}
minH = 0;
maxH += baseShift;

// Parse war3map.wpm (640 x 768 sub-tiles, 4 sub-tiles per WC3 tile)
const wpm = archive.byName.get('war3map.wpm');
if (!wpm) throw new Error('war3map.wpm not found in archive');
const wpmDv = new DataView(wpm.buffer, wpm.byteOffset, wpm.byteLength);
const pw = wpmDv.getUint32(8, true);
const ph = wpmDv.getUint32(12, true);
const wpmCells = wpm.subarray(16, 16 + pw * ph);

// Build Slopcraft 2 LevelRaster arrays at `res = 385 x 385` (0.5-tile step)
const nCells = res * res;
const rHeight = new Float32Array(nCells);
const rTier = new Float32Array(nCells);
const rWall = new Uint8Array(nCells);
const rBlocked = new Uint8Array(nCells);
const rRamp = new Uint8Array(nCells);
const rRampT = new Float32Array(nCells);
const rLiquid = new Uint8Array(nCells);
const rPlaza = new Float32Array(nCells);
const rCliffW = new Float32Array(nCells);
const rRoad = new Float32Array(nCells);
const rBiome = new Float32Array(nCells);
const rTileId = new Uint8Array(nCells);
const rWaterDepth = new Float32Array(nCells);

function sampleVertexBilinear(arr: Float32Array, wx: number, wy: number): number {
  const cx = Math.max(0, Math.min(mx - 1.001, wx));
  const cy = Math.max(0, Math.min(my - 1.001, wy));
  const ix = cx | 0, iy = cy | 0;
  const tx = cx - ix, ty = cy - iy;
  const i = iy * mx + ix;
  const a = arr[i]! + (arr[i + 1]! - arr[i]!) * tx;
  const b = arr[i + mx]! + (arr[i + mx + 1]! - arr[i + mx]!) * tx;
  return a + (b - a) * ty;
}

let walkableCount = 0;
let waterCount = 0;
let plazaCount = 0;

for (let iz = 0; iz < res; iz++) {
  for (let ix = 0; ix < res; ix++) {
    const idx = iz * res + ix;
    const x = ix * 0.5;
    const z = iz * 0.5;
    // Map Slopcraft 2 (x, z) -> WC3 tile coordinates (wx, wy)
    const wx = x - padX;
    const wy = heightTiles - (z - padZ);
    const inBounds = wx >= 1 && wx <= widthTiles - 1 && wy >= 1 && wy <= heightTiles - 1;

    const h = sampleVertexBilinear(vHeight, wx, wy);
    const wl = sampleVertexBilinear(vWaterLevel, wx, wy);
    rHeight[idx] = h;
    rTier[idx] = h / TIER_HEIGHT;

    const vx = Math.max(0, Math.min(mx - 1, Math.round(wx)));
    const vy = Math.max(0, Math.min(my - 1, Math.round(wy)));
    const vi = vy * mx + vx;
    const tid = vTileIdx[vi]!;
    rTileId[idx] = tid;

    if (plazaTileIndices.has(tid)) {
      rPlaza[idx] = 1;
      rBiome[idx] = 0;
      plazaCount++;
    } else {
      rPlaza[idx] = 0;
      rBiome[idx] = 1;
    }

    if (!inBounds) {
      rBlocked[idx] = 1;
      rWall[idx] = 1;
      continue;
    }

    // Sample the 2x2 WC3 pathing sub-tiles corresponding to this 0.5-tile cell
    const sx0 = Math.max(0, Math.min(pw - 2, Math.floor(wx * 4)));
    const sy0 = Math.max(0, Math.min(ph - 2, Math.floor(wy * 4)));
    let blockedSub = 0;
    let waterSub = 0;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const pb = wpmCells[(sy0 + dy) * pw + (sx0 + dx)]!;
        if (pb & 0x02) blockedSub++; // 0x02 = No Walk
        if ((pb & 0x40) === 0) waterSub++; // 0x40 = No Water (0 means water present)
      }
    }

    const depth = Math.max(0, wl - h);
    const isWater = (vWaterFlag[vi] === 1 && depth > 0.05) || (waterSub >= 2 && depth > 0.02);
    if (isWater) {
      rLiquid[idx] = 1;
      rWaterDepth[idx] = Math.max(0.15, depth);
      waterCount++;
    }

    if (blockedSub >= 3) {
      rBlocked[idx] = 1;
      rWall[idx] = 1;
    } else {
      walkableCount++;
      if (vRampFlag[vi] === 1) {
        rRamp[idx] = 1;
        rRampT[idx] = 0.5;
        rRoad[idx] = 1;
      }
    }
  }
}

// Compute cliff weights & ramp masks from height gradients
for (let iz = 1; iz < res - 1; iz++) {
  for (let ix = 1; ix < res - 1; ix++) {
    const i = iz * res + ix;
    const l = rHeight[i - 1]!, r = rHeight[i + 1]!;
    const u = rHeight[i - res]!, d = rHeight[i + res]!;
    const slope = Math.hypot(r - l, d - u);
    const cw = Math.max(0, Math.min(1, (slope - 0.18) / 0.45));
    rCliffW[i] = rBlocked[i] && !rLiquid[i] ? Math.max(cw, 0.85) : cw;
    // Walkable sloped corridors act as ramps in Slopcraft 2
    if (!rWall[i] && slope > 0.22) {
      rRamp[i] = 1;
      rRampT[i] = 0.5;
      rRoad[i] = Math.max(rRoad[i]!, 0.8);
    }
  }
}

// ---------------- 6. Auto-Place & Validate Slopcraft 2 Bases on Largest Walkable Network ----------------

console.log(`[3/6] Computing connected walkable graph & placing skirmish/campaign bases...`);
const S = size;
const tileWalk = new Uint8Array(S * S);
for (let z = 4; z < S - 4; z++) {
  for (let x = 4; x < S - 4; x++) {
    let ok = true;
    for (let sz = 0; sz <= 2 && ok; sz++) {
      for (let sx = 0; sx <= 2; sx++) {
        const ri = Math.round((z + sz * 0.5) * 2) * res + Math.round((x + sx * 0.5) * 2);
        if (rWall[ri]) { ok = false; break; }
      }
    }
    if (ok) tileWalk[z * S + x] = 1;
  }
}

// Find largest 4-connected walkable component so all placed bases are mutually reachable
const comp = new Int32Array(S * S).fill(-1);
let bestComp = -1, bestCompCount = 0, nextComp = 0;
for (let i = 0; i < S * S; i++) {
  if (!tileWalk[i] || comp[i] >= 0) continue;
  const q = [i];
  comp[i] = nextComp;
  let cnt = 0;
  while (q.length) {
    const cur = q.pop()!;
    cnt++;
    const cx = cur % S, cz = (cur / S) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx!, nz = cz + dz!;
      if (nx >= 0 && nx < S && nz >= 0 && nz < S) {
        const ni = nz * S + nx;
        if (tileWalk[ni] && comp[ni] < 0) { comp[ni] = nextComp; q.push(ni); }
      }
    }
  }
  if (cnt > bestCompCount) { bestCompCount = cnt; bestComp = nextComp; }
  nextComp++;
}

function isFlatClearing(cx: number, cz: number, radius: number): boolean {
  if (cx < radius + 4 || cz < radius + 4 || cx >= S - radius - 4 || cz >= S - radius - 4) return false;
  if (comp[cz * S + cx] !== bestComp) return false;
  const h0 = rHeight[cz * 2 * res + cx * 2]!;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx, tz = cz + dz;
      if (!tileWalk[tz * S + tx] || comp[tz * S + tx] !== bestComp) return false;
      const h = rHeight[tz * 2 * res + tx * 2]!;
      if (Math.abs(h - h0) > 0.35) return false;
    }
  }
  return true;
}

function makeClearedBase(cx: number, cz: number, face: number, kind: BaseDef['kind']): BaseDef {
  // Flatten & clear any wall flags in a 9-tile radius around the base so TH + minerals + geysers pass strict level checks
  const baseH = rHeight[cz * 2 * res + cx * 2]!;
  const baseT = baseH / TIER_HEIGHT;
  for (let iz = (cz - 9) * 2; iz <= (cz + 9) * 2; iz++) {
    for (let ix = (cx - 9) * 2; ix <= (cx + 9) * 2; ix++) {
      if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
      const dist = Math.hypot(ix * 0.5 - cx, iz * 0.5 - cz);
      if (dist <= 8.5) {
        const ri = iz * res + ix;
        rHeight[ri] = baseH;
        rTier[ri] = baseT;
        rWall[ri] = 0;
        rBlocked[ri] = 0;
        rRamp[ri] = 0;
        rLiquid[ri] = 0;
      }
    }
  }
  const minerals: Pt[] = [];
  for (let k = -3; k <= 3; k++) {
    const a = face + k * 0.22;
    const r = 6.2 - (Math.abs(k) % 2) * 0.5;
    minerals.push([+(cx + Math.cos(a) * r).toFixed(2), +(cz + Math.sin(a) * r).toFixed(2)]);
  }
  const geysers: Pt[] = [
    [+(cx + Math.cos(face - 0.95) * 6.5).toFixed(2), +(cz + Math.sin(face - 0.95) * 6.5).toFixed(2)],
    [+(cx + Math.cos(face + 0.95) * 6.5).toFixed(2), +(cz + Math.sin(face + 0.95) * 6.5).toFixed(2)]
  ];
  return { th: [cx, cz], face: +face.toFixed(3), kind, minerals, geysers };
}

const candidateSpots: [number, number][] = [];
for (let z = 18; z < S - 18; z += 3) {
  for (let x = 24; x < S - 24; x += 3) {
    if (isFlatClearing(x, z, 1)) candidateSpots.push([x, z]);
  }
}
if (candidateSpots.length < 2) {
  for (let z = 18; z < S - 18; z += 2) {
    for (let x = 24; x < S - 24; x += 2) {
      if (comp[z * S + x] === bestComp) candidateSpots.push([x, z]);
    }
  }
}

// Pick well-separated clearings across the dungeon network (south-west start, north-east enemy start, plus expansions)
const chosenSpots: [number, number][] = [];
if (candidateSpots.length >= 2) {
  candidateSpots.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1]));
  chosenSpots.push(candidateSpots[0]!);
  candidateSpots.sort(
    (a, b) =>
      Math.hypot(b[0] - chosenSpots[0]![0], b[1] - chosenSpots[0]![1]) -
      Math.hypot(a[0] - chosenSpots[0]![0], a[1] - chosenSpots[0]![1])
  );
  chosenSpots.push(candidateSpots[0]!);
  for (const spot of candidateSpots) {
    if (chosenSpots.length >= 6) break;
    if (chosenSpots.every(s => Math.hypot(s[0] - spot[0], s[1] - spot[1]) >= 28)) {
      chosenSpots.push(spot);
    }
  }
}

const bases: BaseDef[] = chosenSpots.map((pt, idx) => {
  const kind: BaseDef['kind'] = idx < 2 ? 'main' : idx < 4 ? 'natural' : 'third';
  const face = Math.atan2(S / 2 - pt[1], S / 2 - pt[0]) + Math.PI;
  return makeClearedBase(pt[0], pt[1], face, kind);
});

const starts: [StartDef, StartDef] = [
  { base: 0, defense: [bases[0]!.th[0], bases[0]!.th[1]] },
  { base: 1, defense: [bases[1]!.th[0], bases[1]!.th[1]] }
];

// ---------------- 7. Convert Placed Doodads & Custom MDX Models -> Embedded GLBs ----------------

console.log(`[4/6] Parsing war3map.doo & converting custom MDX models + BLP textures to GLB...`);
const dooBytes = archive.byName.get('war3map.doo');
if (!dooBytes) throw new Error('war3map.doo not found in archive');
const rawDoodads = parseWar3MapDoo(dooBytes);

const countsById = new Map<string, number>();
for (const d of rawDoodads) countsById.set(d.id, (countsById.get(d.id) ?? 0) + 1);

const sortedIds = [...countsById.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
const idToPaletteIdx = new Map<string, number>(sortedIds.map((id, idx) => [id, idx]));

const pngCache = new Map<string, Uint8Array>();
const glbChunks: SlopmapChunkInput[] = [];
const doodadPalette: SlopmapDoodadDef[] = [];
let embeddedGlbCount = 0;

for (const id of sortedIds) {
  const objDef = w3d.get(id) ?? w3b.get(id);
  const parentId = objDef?._parent ?? id;
  const rawName = resolveTrigStr(objDef?.dnam ?? objDef?.bnam, wts) || id;
  const rawMdx = (objDef?.dfil ?? objDef?.bfil ?? '') as string;
  const propKit = classifyDoodadPropKit(id, parentId, rawName, rawMdx);

  let glbBufferView: string | undefined;
  let hasEmbeddedTexture = false;

  if (rawMdx) {
    const normMdx = rawMdx.replace(/\\/g, '/').replace(/\.mdl$/i, '.mdx').toLowerCase();
    const baseMdx = normMdx.split('/').pop()!;
    const mdxBytes =
      archive.byName.get(normMdx) ??
      archive.byName.get(baseMdx) ??
      archive.byName.get('war3mapimported/' + baseMdx);
    if (mdxBytes) {
      const converted = convertMdxToGlb(mdxBytes, `${id}_${rawName}`, archive.byName, pngCache);
      if (converted) {
        glbBufferView = `models.${id}`;
        hasEmbeddedTexture = converted.hasTexture;
        glbChunks.push({
          name: glbBufferView,
          data: converted.glb,
          dtype: 'bytes',
          shape: [converted.glb.byteLength],
          mimeType: 'model/gltf-binary'
        });
        embeddedGlbCount++;
      }
    }
  }

  doodadPalette.push({
    id,
    parentId,
    name: rawName,
    propKit,
    ...(rawMdx ? { mdxPath: rawMdx.replace(/\\/g, '/') } : {}),
    ...(glbBufferView ? { glbBufferView, hasEmbeddedTexture } : {}),
    instanceCount: countsById.get(id) ?? 0
  });
}

// Pack all 11,749 doodad instances into binary Float32Array (transforms) + Uint16Array (meta)
const dooTransforms = new Float32Array(rawDoodads.length * 7);
const dooMeta = new Uint16Array(rawDoodads.length * 4);

for (let i = 0; i < rawDoodads.length; i++) {
  const d = rawDoodads[i]!;
  const x = (d.wc3X - wc3OffX) / 128 + padX;
  const z = heightTiles - (d.wc3Y - wc3OffY) / 128 + padZ;
  const ix = Math.max(0, Math.min(res - 1, Math.round(x * 2)));
  const iz = Math.max(0, Math.min(res - 1, Math.round(z * 2)));
  const y = rHeight[iz * res + ix]!;

  const tOff = i * 7;
  dooTransforms[tOff] = x;
  dooTransforms[tOff + 1] = y;
  dooTransforms[tOff + 2] = z;
  dooTransforms[tOff + 3] = d.angle;
  dooTransforms[tOff + 4] = d.scaleX;
  dooTransforms[tOff + 5] = d.scaleY;
  dooTransforms[tOff + 6] = d.scaleZ;

  const mOff = i * 4;
  dooMeta[mOff] = idToPaletteIdx.get(d.id) ?? 0;
  dooMeta[mOff + 1] = d.variation & 0xffff;
  dooMeta[mOff + 2] = d.flags & 0xffff;
  dooMeta[mOff + 3] = d.life & 0xffff;
}

// Summarize custom units from war3map.w3u
const customUnits: SlopmapUnitDef[] = [];
for (const [uid, props] of w3u.entries()) {
  const uname = resolveTrigStr(props.unam ?? props.utub, wts) || uid;
  customUnits.push({
    id: uid,
    parentId: props._parent ?? uid,
    name: uname,
    ...(props.umdl ? { model: String(props.umdl).replace(/\\/g, '/') } : {}),
    ...(typeof props.uhpm === 'number' ? { hp: props.uhpm } : {}),
    ...(typeof props.ulev === 'number' ? { level: props.ulev } : {})
  });
}

// Convert minimap (war3mapMap.blp) & preview (war3mapPreview.tga) to embedded PNGs
console.log(`[5/6] Encoding embedded minimap & preview PNGs...`);
const imageChunks: SlopmapChunkInput[] = [];
const minimapBlp = archive.byName.get('war3mapmap.blp');
if (minimapBlp) {
  const png = blpBytesToPng(minimapBlp, true);
  imageChunks.push({ name: 'images.minimap', data: png, dtype: 'bytes', shape: [png.byteLength], mimeType: 'image/png' });
}
const previewTga = archive.byName.get('war3mappreview.tga');
if (previewTga) {
  const png = tgaBytesToPng(previewTga);
  if (png) {
    imageChunks.push({ name: 'images.preview', data: png, dtype: 'bytes', shape: [png.byteLength], mimeType: 'image/png' });
  }
}

// Sunken Ruins Theme (compatible with src/levels/Themes.ts)
const sunkenRuinsTheme: Theme = {
  id: 'sunken_ruins',
  ground: [0x1c2818, 0x425632, 0x869e5c],
  clearing: [0x2c3630, 0x5c6e62, 0x9eb2a4], // ancient temple stone bricks (Zbkl/Ztil)
  cliff: [0x18221c, 0x3c5246, 0x7a9686],
  rampTint: 0x98b09c,
  background: 0x0e1814,
  meadow: 0x18261c,
  sun: 0xfff2d6,
  hemiSky: 0xa6d2c8,
  hemiGround: 0x263828,
  ambient: 0xb8d4c2,
  grass: { low: 0x24461e, high: 0x76b84c, density: 0.65 },
  minimap: [[58, 82, 46], [116, 138, 124], [28, 42, 34]],
  liquid: 0x1c788c,
  liquidOpacity: 0.76,
  foliage: [0x3c2c1e, 0x1e4c24, 0x5ca238]
};

const propsRules: PropRule[] = [
  { kit: 'pillar', zone: 'plaza', density: 1.4, scale: [0.9, 1.35] },
  { kit: 'pine', zone: 'massif', density: 4.5, scale: [0.85, 1.4] },
  { kit: 'bush', zone: 'open', density: 2.2, scale: [0.8, 1.3] },
  { kit: 'boulder', zone: 'cliff', density: 3.0, scale: [0.8, 1.4] },
  { kit: 'reeds', zone: 'border', density: 2.5, scale: [0.9, 1.3] }
];

const allChunks: SlopmapChunkInput[] = [
  { name: 'raster.height', data: rHeight, dtype: 'float32', shape: [res, res] },
  { name: 'raster.tier', data: rTier, dtype: 'float32', shape: [res, res] },
  { name: 'raster.wall', data: rWall, dtype: 'uint8', shape: [res, res] },
  { name: 'raster.blocked', data: rBlocked, dtype: 'uint8', shape: [res, res] },
  { name: 'raster.ramp', data: rRamp, dtype: 'uint8', shape: [res, res] },
  { name: 'raster.rampT', data: rRampT, dtype: 'float32', shape: [res, res] },
  { name: 'raster.liquid', data: rLiquid, dtype: 'uint8', shape: [res, res] },
  { name: 'raster.plaza', data: rPlaza, dtype: 'float32', shape: [res, res] },
  { name: 'raster.cliffW', data: rCliffW, dtype: 'float32', shape: [res, res] },
  { name: 'raster.road', data: rRoad, dtype: 'float32', shape: [res, res] },
  { name: 'raster.biome', data: rBiome, dtype: 'float32', shape: [res, res] },
  { name: 'raster.tileId', data: rTileId, dtype: 'uint8', shape: [res, res] },
  { name: 'raster.waterDepth', data: rWaterDepth, dtype: 'float32', shape: [res, res] },
  { name: 'doodads.transforms', data: dooTransforms, dtype: 'float32', shape: [rawDoodads.length, 7] },
  { name: 'doodads.meta', data: dooMeta, dtype: 'uint16', shape: [rawDoodads.length, 4] },
  ...imageChunks,
  ...glbChunks
];

const manifest: Omit<SlopmapManifest, 'bufferViews'> = {
  format: 'slopmap-v1',
  generator: 'tools/level/w3x-to-slopmap.ts',
  createdAt: new Date().toISOString(),
  meta: {
    id: 'sunken_city',
    name: wts.get(1) ?? 'Sunken City v2.5.2b',
    author: wts.get(4) ?? 'SpasMaster [$M]',
    description: wts.get(3) ?? '',
    players: wts.get(2) ?? '3',
    sourceFormat: 'w3x',
    sourceFile: path.basename(inputW3x),
    tileset: mainTileset,
    tilesetName: 'Sunken Ruins',
    size,
    res,
    bounds: {
      widthTiles,
      heightTiles,
      padX,
      padZ,
      minX: padX,
      maxX: padX + widthTiles,
      minZ: padZ,
      maxZ: padZ + heightTiles,
      wc3Offset: [wc3OffX, wc3OffY]
    },
    groundTiles,
    cliffTiles,
    stats: {
      walkablePct: +((walkableCount / (widthTiles * 2 * heightTiles * 2)) * 100).toFixed(2),
      waterPct: +((waterCount / (widthTiles * 2 * heightTiles * 2)) * 100).toFixed(2),
      plazaPct: +((plazaCount / nCells) * 100).toFixed(2),
      minHeight: +minH.toFixed(2),
      maxHeight: +maxH.toFixed(2),
      totalDoodads: rawDoodads.length,
      uniqueDoodadTypes: doodadPalette.length,
      embeddedGlbModels: embeddedGlbCount,
      embeddedPngTextures: pngCache.size + imageChunks.length,
      customUnitDefs: customUnits.length
    }
  },
  theme: sunkenRuinsTheme,
  bases,
  starts,
  props: propsRules,
  doodadPalette,
  customUnits
};

console.log(`[6/6] Packing single-file .slopmap binary container -> ${outputSlopmap}`);
const slopBytes = encodeSlopmap(manifest, allChunks);
await Bun.write(outputSlopmap, slopBytes);
console.log(
  `Done! Wrote ${outputSlopmap} (${(slopBytes.byteLength / (1024 * 1024)).toFixed(2)} MB, ${Object.keys(allChunks).length} binary chunks, ${embeddedGlbCount} embedded GLBs, ${pngCache.size + imageChunks.length} embedded PNGs)`
);
