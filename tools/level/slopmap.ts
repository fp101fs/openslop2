/**
 * .slopmap — Single-file self-contained binary map format for Slopcraft 2.
 *
 * Binary layout (little-endian, 4-byte aligned, modeled on glTF 2.0 .glb):
 *   Bytes 0..4   : Magic "SLOP" (0x504F4C53)
 *   Bytes 4..8   : Format version (uint32 = 1)
 *   Bytes 8..12  : JSON manifest byte length (uint32, padded with 0x20 spaces to 4-byte boundary)
 *   Bytes 12..16 : Binary payload byte length (uint32, padded with 0x00 to 4-byte boundary)
 *   Bytes 16 .. 16 + jsonLen : UTF-8 JSON manifest (SlopmapManifest)
 *   Bytes 16 + jsonLen .. end: Packed binary buffer (LevelRaster grids, doodad instance arrays, PNG textures, GLB models)
 */
import type { BaseDef, PropRule, StartDef } from '../../src/levels/LevelTypes';
import type { Theme } from '../../src/levels/Themes';

export const SLOPMAP_MAGIC = 0x504f4c53; // "SLOP"
export const SLOPMAP_VERSION = 1;

export type BufferDType = 'float32' | 'uint8' | 'uint16' | 'uint32' | 'bytes';

export interface SlopmapBufferView {
  name: string;
  byteOffset: number;
  byteLength: number;
  dtype: BufferDType;
  shape: number[];
  mimeType?: string;
}

export interface SlopmapDoodadDef {
  /** 4-char WC3 doodad/destructible ID (e.g. 'ZPvp', 'ZTtc', 'D003'). */
  id: string;
  /** Base WC3 parent ID if custom object (from war3map.w3d / war3map.w3b). */
  parentId: string;
  /** Resolved human-readable name. */
  name: string;
  /** Mapped Slopcraft 2 procedural/GLB PropKit id (from src/levels/PropKits.ts), or 'blocker' for invisible pathing blockers. */
  propKit: string;
  /** Original WC3 or imported MDX model path if specified. */
  mdxPath?: string;
  /** Name of the embedded .glb bufferView in this .slopmap if a custom 3D model is bundled. */
  glbBufferView?: string;
  /** Whether the embedded .glb includes embedded PNG texture(s) from the .w3x archive. */
  hasEmbeddedTexture?: boolean;
  /** Number of instances placed on this map. */
  instanceCount: number;
}

export interface SlopmapUnitDef {
  id: string;
  parentId: string;
  name: string;
  model?: string;
  hp?: number;
  level?: number;
}

export interface SlopmapManifest {
  format: 'slopmap-v1';
  generator: string;
  createdAt: string;
  meta: {
    id: string;
    name: string;
    author: string;
    description: string;
    players: string;
    sourceFormat: 'w3x';
    sourceFile: string;
    tileset: string;
    tilesetName: string;
    /** Square world dimension in Slopcraft 2 tiles (1 unit = 1 tile). */
    size: number;
    /** Half-tile raster resolution (size * 2 + 1). */
    res: number;
    /** Playable bounds of the original WC3 map inside the square [0..size] coordinate space. */
    bounds: {
      widthTiles: number;
      heightTiles: number;
      padX: number;
      padZ: number;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      wc3Offset: [number, number];
    };
    groundTiles: string[];
    cliffTiles: string[];
    stats: {
      walkablePct: number;
      waterPct: number;
      plazaPct: number;
      minHeight: number;
      maxHeight: number;
      totalDoodads: number;
      uniqueDoodadTypes: number;
      embeddedGlbModels: number;
      embeddedPngTextures: number;
      customUnitDefs: number;
    };
  };
  theme: Theme;
  bases: BaseDef[];
  starts: [StartDef, StartDef];
  props: PropRule[];
  doodadPalette: SlopmapDoodadDef[];
  customUnits: SlopmapUnitDef[];
  bufferViews: Record<string, SlopmapBufferView>;
}

export interface SlopmapChunkInput {
  name: string;
  data: Uint8Array | Float32Array | Uint16Array | Uint32Array;
  dtype: BufferDType;
  shape: number[];
  mimeType?: string;
}

/** Encode a manifest + binary chunks into a single self-contained .slopmap byte buffer. */
export function encodeSlopmap(
  manifest: Omit<SlopmapManifest, 'bufferViews'>,
  chunks: SlopmapChunkInput[]
): Uint8Array {
  const bufferViews: Record<string, SlopmapBufferView> = {};
  const binParts: Uint8Array[] = [];
  let binOffset = 0;

  for (const ch of chunks) {
    const u8 = new Uint8Array(ch.data.buffer, ch.data.byteOffset, ch.data.byteLength);
    const pad = (4 - (u8.byteLength % 4)) % 4;
    bufferViews[ch.name] = {
      name: ch.name,
      byteOffset: binOffset,
      byteLength: u8.byteLength,
      dtype: ch.dtype,
      shape: ch.shape,
      ...(ch.mimeType ? { mimeType: ch.mimeType } : {})
    };
    binParts.push(u8);
    if (pad > 0) binParts.push(new Uint8Array(pad));
    binOffset += u8.byteLength + pad;
  }

  const fullManifest: SlopmapManifest = { ...manifest, bufferViews };
  const jsonRaw = new TextEncoder().encode(JSON.stringify(fullManifest));
  const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonAlignedLen = jsonRaw.byteLength + jsonPad;

  const totalLen = 16 + jsonAlignedLen + binOffset;
  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, SLOPMAP_MAGIC, true);
  dv.setUint32(4, SLOPMAP_VERSION, true);
  dv.setUint32(8, jsonAlignedLen, true);
  dv.setUint32(12, binOffset, true);

  out.set(jsonRaw, 16);
  if (jsonPad > 0) out.fill(0x20, 16 + jsonRaw.byteLength, 16 + jsonAlignedLen);

  let pos = 16 + jsonAlignedLen;
  for (const part of binParts) {
    out.set(part, pos);
    pos += part.byteLength;
  }
  return out;
}

export interface DecodedSlopmap {
  manifest: SlopmapManifest;
  bin: Uint8Array;
  getFloat32(name: string): Float32Array;
  getUint8(name: string): Uint8Array;
  getUint16(name: string): Uint16Array;
  getBytes(name: string): Uint8Array;
}

/** Decode and validate a .slopmap buffer in memory. */
export function decodeSlopmap(buf: ArrayBuffer | Uint8Array): DecodedSlopmap {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength < 16) throw new Error('File too small to be a .slopmap');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== SLOPMAP_MAGIC) {
    throw new Error(`Invalid .slopmap magic: 0x${magic.toString(16)} (expected 0x${SLOPMAP_MAGIC.toString(16)} "SLOP")`);
  }
  const version = dv.getUint32(4, true);
  if (version !== SLOPMAP_VERSION) {
    throw new Error(`Unsupported .slopmap version: ${version}`);
  }
  const jsonLen = dv.getUint32(8, true);
  const binLen = dv.getUint32(12, true);
  if (16 + jsonLen + binLen > u8.byteLength) {
    throw new Error(`Truncated .slopmap: header expects ${16 + jsonLen + binLen} bytes, got ${u8.byteLength}`);
  }
  const jsonStr = new TextDecoder().decode(u8.subarray(16, 16 + jsonLen));
  const manifest = JSON.parse(jsonStr) as SlopmapManifest;
  const binStart = 16 + jsonLen;
  const bin = u8.subarray(binStart, binStart + binLen);

  const requireView = (name: string): SlopmapBufferView => {
    const bv = manifest.bufferViews[name];
    if (!bv) throw new Error(`Missing bufferView "${name}" in .slopmap`);
    if (bv.byteOffset < 0 || bv.byteOffset + bv.byteLength > bin.byteLength) {
      throw new Error(`Out-of-bounds bufferView "${name}" (${bv.byteOffset}+${bv.byteLength} > ${bin.byteLength})`);
    }
    return bv;
  };

  return {
    manifest,
    bin,
    getFloat32(name: string): Float32Array {
      const bv = requireView(name);
      const slice = bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
      const aligned = (slice.byteOffset % 4 === 0) ? slice : new Uint8Array(slice);
      return new Float32Array(aligned.buffer, aligned.byteOffset, bv.byteLength / 4);
    },
    getUint8(name: string): Uint8Array {
      const bv = requireView(name);
      return bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
    },
    getUint16(name: string): Uint16Array {
      const bv = requireView(name);
      const slice = bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
      const aligned = (slice.byteOffset % 2 === 0) ? slice : new Uint8Array(slice);
      return new Uint16Array(aligned.buffer, aligned.byteOffset, bv.byteLength / 2);
    },
    getBytes(name: string): Uint8Array {
      const bv = requireView(name);
      return bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
    }
  };
}

/**
 * Drop-in LevelRaster implementation backed directly by a decoded .slopmap's binary arrays.
 * Implements the exact same properties and methods as `LevelRaster` in `src/levels/LevelRaster.ts`.
 */
export class SlopmapRaster {
  readonly size: number;
  readonly res: number;
  readonly tier: Float32Array;
  readonly ramp: Uint8Array;
  readonly rampT: Float32Array;
  readonly blocked: Uint8Array;
  readonly liquid: Uint8Array;
  readonly plaza: Float32Array;
  readonly height: Float32Array;
  readonly wall: Uint8Array;
  readonly cliffW: Float32Array;
  readonly road: Float32Array;
  readonly biome: Float32Array;
  readonly tileId: Uint8Array;
  readonly waterDepth: Float32Array;

  constructor(readonly slop: DecodedSlopmap) {
    this.size = slop.manifest.meta.size;
    this.res = slop.manifest.meta.res;
    this.height = slop.getFloat32('raster.height');
    this.tier = slop.getFloat32('raster.tier');
    this.wall = slop.getUint8('raster.wall');
    this.blocked = slop.getUint8('raster.blocked');
    this.ramp = slop.getUint8('raster.ramp');
    this.rampT = slop.getFloat32('raster.rampT');
    this.liquid = slop.getUint8('raster.liquid');
    this.plaza = slop.getFloat32('raster.plaza');
    this.cliffW = slop.getFloat32('raster.cliffW');
    this.road = slop.getFloat32('raster.road');
    this.biome = slop.getFloat32('raster.biome');
    this.tileId = slop.getUint8('raster.tileId');
    this.waterDepth = slop.getFloat32('raster.waterDepth');
  }

  private idx(x: number, z: number) {
    const ix = Math.max(0, Math.min(this.res - 1, Math.round(x * 2)));
    const iz = Math.max(0, Math.min(this.res - 1, Math.round(z * 2)));
    return iz * this.res + ix;
  }

  private bil(a: Float32Array, x: number, z: number) {
    const res = this.res;
    const fx = Math.max(0, Math.min(res - 1.001, x * 2));
    const fz = Math.max(0, Math.min(res - 1.001, z * 2));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * res + ix;
    const h0 = a[i]! + (a[i + 1]! - a[i]!) * tx;
    const h1 = a[i + res]! + (a[i + res + 1]! - a[i + res]!) * tx;
    return h0 + (h1 - h0) * tz;
  }

  heightAt(x: number, z: number) { return this.bil(this.height, x, z); }
  isWall(x: number, z: number) { return this.wall[this.idx(x, z)] === 1; }
  isRamp(x: number, z: number) { return this.ramp[this.idx(x, z)] === 1; }
  rampT01(x: number, z: number) { return this.rampT[this.idx(x, z)]!; }
  cliffWeight(x: number, z: number) { return this.bil(this.cliffW, x, z); }
  roadWeight(x: number, z: number) { return this.bil(this.road, x, z); }
  biomeWeight(x: number, z: number) { return this.bil(this.biome, x, z); }
  isLiquid(x: number, z: number) { return this.liquid[this.idx(x, z)] === 1; }
  tierAt(x: number, z: number) { return this.tier[this.idx(x, z)]!; }
  tileIdAt(x: number, z: number) { return this.tileId[this.idx(x, z)]!; }
  waterDepthAt(x: number, z: number) { return this.bil(this.waterDepth, x, z); }
}
