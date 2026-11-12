import { defineConfig, type Plugin } from 'vite';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Single-player save games as files: GET /__saves lists <project>/saves/*.openslop2save, GET / PUT / DELETE /__saves/<name> read,
 * write and delete one. Names are letters, digits, '_' and '-' only (see src/save/SaveFiles.ts).
 */
function saveFiles(): Plugin {
  const dir = fileURLToPath(new URL('./saves/', import.meta.url));
  const EXT = '.openslop2save';
  const okName = (n: string) => /^[A-Za-z0-9_-]{1,80}$/.test(n);
  const meta = (head: Buffer) => {
    const lines = head.toString('utf8').split('\n');
    if (!lines[0]?.startsWith('OPENSLOP2SAVE') || lines.length < 3) return null;
    try { return JSON.parse(lines[1]!); } catch { return null; }
  };
  const handler = async (req: any, res: any, next: () => void) => {
    const url = new URL(req.url ?? '', 'http://x');
    if (url.pathname !== '/__saves' && !url.pathname.startsWith('/__saves/')) return next();
    const send = (code: number, body: unknown, type = 'application/json') => {
      res.statusCode = code; res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store');
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    try {
      await fs.mkdir(dir, { recursive: true });
      if (url.pathname === '/__saves') {
        if (req.method !== 'GET') return send(405, { error: 'method' });
        const out: unknown[] = [];
        for (const f of await fs.readdir(dir)) {
          if (!f.endsWith(EXT)) continue;
          const fh = await fs.open(path.join(dir, f), 'r');
          try {
            const buf = Buffer.alloc(4096); const { bytesRead } = await fh.read(buf, 0, 4096, 0);
            const m = meta(buf.subarray(0, bytesRead)); const st = await fh.stat();
            if (m) out.push({ name: f.slice(0, -EXT.length), meta: m, size: st.size });
          } finally { await fh.close(); }
        }
        return send(200, out);
      }
      const name = decodeURIComponent(url.pathname.slice('/__saves/'.length));
      if (!okName(name)) return send(400, { error: 'bad name' });
      const file = path.join(dir, name + EXT);
      if (req.method === 'GET') {
        try { return send(200, await fs.readFile(file), 'application/octet-stream'); } catch { return send(404, { error: 'not found' }); }
      }
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = Buffer.concat(chunks);
        if (!meta(body.subarray(0, 4096))) return send(400, { error: 'not a save file' });
        await fs.writeFile(file + '.tmp', body); await fs.rename(file + '.tmp', file);
        return send(200, { ok: true });
      }
      if (req.method === 'DELETE') { await fs.rm(file, { force: true }); return send(200, { ok: true }); }
      return send(405, { error: 'method' });
    } catch (e) { return send(500, { error: String(e) }); }
  };
  return {
    name: 'openslop2-save-files',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); }
  };
}

/** `.openslop2mission` files are JSON (missions as data, src/campaign/data): import them as modules. */
function openslop2Json(): Plugin {
  return {
    name: 'openslop2-json', enforce: 'pre',
    transform(code, id) {
      if (!/\.openslop2mission$/.test(id)) return null;
      return { code: `export default ${JSON.stringify(JSON.parse(code))};`, map: null };
    }
  };
}

// The multiplayer relay (bun server/relay.ts) listens on 8787; proxy it so the game can use
// same-origin /ws and /api URLs (works for LAN play via http://<your-ip>:5173 too).
const RELAY = process.env.RELAY_URL || 'http://localhost:8787';

// Never let a dead/restarting relay (EPIPE / ECONNREFUSED on the proxied socket) crash the dev server.
const quiet = (proxy: any) => {
  proxy.on('error', () => {});
  proxy.on('proxyReqWs', (_req: any, _sock: any, socket: any) => socket?.on?.('error', () => {}));
  proxy.on('open', (sock: any) => sock?.on?.('error', () => {}));
};

export default defineConfig({
  plugins: [saveFiles(), openslop2Json()],
  server: {
    port: 5173,
    host: true,
    open: false,
    watch: { ignored: ['**/saves/**'] },
    proxy: {
      '/ws': { target: RELAY.replace(/^http/, 'ws'), ws: true, changeOrigin: true, configure: quiet },
      '/api': { target: RELAY, changeOrigin: true, configure: quiet }
    }
  },
  preview: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: RELAY.replace(/^http/, 'ws'), ws: true, changeOrigin: true, configure: quiet },
      '/api': { target: RELAY, changeOrigin: true, configure: quiet }
    }
  },
  build: {
    rollupOptions: { input: { main: 'index.html', landing: 'landing.html' } },
    target: 'esnext',
    chunkSizeWarningLimit: 1000
  }
});
