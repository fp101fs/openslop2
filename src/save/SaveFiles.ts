import type { SaveData, SaveMeta } from './SaveState';

/**
 * Save files. Every save is one standalone `<name>.openslop2save` file; names use only letters, digits, '_' and '-'.
 *
 * File layout: a text header line `OPENSLOP2SAVE 1 gz` (or `raw`), one line of JSON with the save's summary (what the Load screen lists),
 * then the match snapshot as JSON, gzip-compressed when the browser can.
 *
 * Where the files live:
 *  - local game server (bun run dev / play.sh): `saves/` in the project folder, through the /__saves endpoint (vite.config.ts);
 *  - anywhere else (the hosted site): the browser's private file system (OPFS), or IndexedDB if that is unavailable.
 * Export / Import on the Load screen copy a file out of / into either place.
 */

export const SAVE_EXT = '.openslop2save';
const MAGIC = 'OPENSLOP2SAVE';
const NAME_MAX = 80;

export interface SaveEntry { name: string; meta: SaveMeta; size: number }

/** Letters, digits, '_' and '-' only: spaces become '_', anything else is dropped. */
export function cleanSaveName(raw: string): string {
  return raw.replace(/\.openslop2save$/i, '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').replace(/_{2,}/g, '_').slice(0, NAME_MAX);
}

// ---------------------------------------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------------------------------------

const te = new TextEncoder(), td = new TextDecoder();

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<any> }): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeSave(data: SaveData): Promise<Uint8Array> {
  const body = te.encode(JSON.stringify(data));
  const gz = typeof CompressionStream !== 'undefined';
  const payload = gz ? await pipe(body, new CompressionStream('gzip')) : body;
  const head = te.encode(`${MAGIC} 1 ${gz ? 'gz' : 'raw'}\n${JSON.stringify(data.meta)}\n`);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head); out.set(payload, head.length);
  return out;
}

/** Header lines of a save file: its format and summary, and where the snapshot starts. */
function readHeader(bytes: Uint8Array): { gz: boolean; meta: SaveMeta; bodyAt: number } | null {
  const nl1 = bytes.indexOf(10);
  if (nl1 < 0) return null;
  const first = td.decode(bytes.subarray(0, nl1)).split(' ');
  if (first[0] !== MAGIC) return null;
  const nl2 = bytes.indexOf(10, nl1 + 1);
  if (nl2 < 0) return null;
  try { return { gz: first[2] === 'gz', meta: JSON.parse(td.decode(bytes.subarray(nl1 + 1, nl2))), bodyAt: nl2 + 1 }; } catch { return null; }
}

export function readMeta(bytes: Uint8Array): SaveMeta | null { return readHeader(bytes)?.meta ?? null; }

export async function decodeSave(bytes: Uint8Array): Promise<SaveData> {
  const h = readHeader(bytes);
  if (!h) throw new Error('Not an OpenSlop II saved game');
  const body = bytes.subarray(h.bodyAt);
  const json = h.gz ? await pipe(body, new DecompressionStream('gzip')) : body;
  return JSON.parse(td.decode(json));
}

// ---------------------------------------------------------------------------------------------------------------------
// Storage backends
// ---------------------------------------------------------------------------------------------------------------------

interface Backend {
  /** Shown on the Load screen so the player knows where the files are. */
  where: string;
  list(): Promise<SaveEntry[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, bytes: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
}

/** The local game server writes real files to <project>/saves/. */
const serverBackend: Backend = {
  where: 'saves/ folder of the game',
  async list() {
    const r = await fetch('/__saves', { cache: 'no-store' });
    if (!r.ok) throw new Error(`List failed (${r.status})`);
    return r.json();
  },
  async read(name) {
    const r = await fetch(`/__saves/${encodeURIComponent(name)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'Saved game not found' : `Read failed (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  },
  async write(name, bytes) {
    const r = await fetch(`/__saves/${encodeURIComponent(name)}`, { method: 'PUT', body: bytes as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } });
    if (!r.ok) throw new Error(`Save failed (${r.status})`);
  },
  async remove(name) {
    const r = await fetch(`/__saves/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`Delete failed (${r.status})`);
  }
};

/** Browser private file system: real files, kept per site by the browser. */
function opfsBackend(): Backend {
  const dir = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('saves', { create: true });
  return {
    where: 'browser storage',
    async list() {
      const d = await dir(), out: SaveEntry[] = [];
      for await (const [fname, h] of (d as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind !== 'file' || !fname.endsWith(SAVE_EXT)) continue;
        const f = await (h as FileSystemFileHandle).getFile();
        const meta = readMeta(new Uint8Array(await f.slice(0, 4096).arrayBuffer()));
        if (meta) out.push({ name: fname.slice(0, -SAVE_EXT.length), meta, size: f.size });
      }
      return out;
    },
    async read(name) {
      const f = await (await (await dir()).getFileHandle(name + SAVE_EXT)).getFile();
      return new Uint8Array(await f.arrayBuffer());
    },
    async write(name, bytes) {
      const h = await (await dir()).getFileHandle(name + SAVE_EXT, { create: true });
      const w = await (h as any).createWritable();
      await w.write(bytes); await w.close();
    },
    async remove(name) { await (await dir()).removeEntry(name + SAVE_EXT).catch(() => {}); }
  };
}

/** Last resort (older Safari without writable OPFS files): each file's bytes in IndexedDB. */
function idbBackend(): Backend {
  const db = () => new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('openslop2-saves', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await db();
    return new Promise<T>((res, rej) => { const q = fn(d.transaction('files', mode).objectStore('files')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  };
  return {
    where: 'browser storage',
    async list() {
      const keys = await tx('readonly', s => s.getAllKeys()) as string[];
      const out: SaveEntry[] = [];
      for (const k of keys) {
        if (!k.endsWith(SAVE_EXT)) continue;
        const b = await tx('readonly', s => s.get(k)) as Uint8Array;
        const meta = b && readMeta(b);
        if (meta) out.push({ name: k.slice(0, -SAVE_EXT.length), meta, size: b.length });
      }
      return out;
    },
    async read(name) {
      const b = await tx('readonly', s => s.get(name + SAVE_EXT)) as Uint8Array | undefined;
      if (!b) throw new Error('Saved game not found');
      return b;
    },
    async write(name, bytes) { await tx('readwrite', s => s.put(bytes, name + SAVE_EXT)); },
    async remove(name) { await tx('readwrite', s => s.delete(name + SAVE_EXT)); }
  };
}

let backendP: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  return backendP ??= (async () => {
    try {
      const r = await fetch('/__saves', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return serverBackend;
    } catch { /* no local server */ }
    try {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('saves', { create: true });
      const probe = await d.getFileHandle('.probe', { create: true });
      if (typeof (probe as any).createWritable === 'function') { await d.removeEntry('.probe').catch(() => {}); return opfsBackend(); }
    } catch { /* no OPFS */ }
    return idbBackend();
  })();
}

// ---------------------------------------------------------------------------------------------------------------------
// API used by the Save / Load screens
// ---------------------------------------------------------------------------------------------------------------------

export async function saveLocation(): Promise<string> { return (await backend()).where; }

/** Every save, newest first. */
export async function listSaves(): Promise<SaveEntry[]> {
  const list = await (await backend()).list();
  return list.sort((a, b) => b.meta.savedAt - a.meta.savedAt);
}

export async function writeSave(data: SaveData): Promise<void> {
  const name = cleanSaveName(data.meta.name);
  if (!name) throw new Error('Enter a name for the saved game');
  data.meta.name = name;
  await (await backend()).write(name, await encodeSave(data));
}

export async function readSave(name: string): Promise<SaveData> {
  return decodeSave(await (await backend()).read(name));
}

export async function deleteSave(name: string): Promise<void> { await (await backend()).remove(name); }

/** Download a save as a standalone .openslop2save file. */
export async function exportSave(name: string): Promise<void> {
  const bytes = await (await backend()).read(name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  a.download = name + SAVE_EXT;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Copy an .openslop2save file into the saves list (renamed `_2`, `_3`, ... if that name is taken). Returns its name. */
export async function importSave(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = readMeta(bytes);
  if (!meta) throw new Error(`${file.name} is not an OpenSlop II saved game`);
  const b = await backend();
  const taken = new Set((await b.list()).map(e => e.name));
  const base = cleanSaveName(file.name) || cleanSaveName(meta.name) || 'Imported';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
  await b.write(name, bytes);
  return name;
}
