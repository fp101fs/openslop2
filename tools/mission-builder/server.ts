/**
 * SC2 Mission Builder: standalone editor for `.opensc2mission` files.   bun run mission-builder  ->  http://localhost:5210
 * The page (index.html, bundled by Bun) imports the game's own map builder, rasteriser, unit registry and validator from src/;
 * models, icons, portraits and audio are served straight from public/ (nothing is copied). The API reads and writes mission
 * files under src/campaign/campaigns/<campaign>/missions/ only, always in the canonical format (serialize.ts).
 * Env: PORT (5210), GAME_URL (http://localhost:5200, the Vite dev server used by Playtest and the 3D preview).
 */
import index from './index.html';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { stringifyMission } from '../../src/campaign/data/serialize';

const EXT = '.opensc2mission';
const okId = (s: string) => /^[a-z0-9_]{1,60}$/.test(s);

export interface MissionInfo { campaign: string; key: string; title: string; order: number; data: boolean; file?: string }

/** Every mission file under <root>/src/campaign/campaigns/*\/missions. */
export async function listMissionFiles(root: string): Promise<MissionInfo[]> {
  const base = join(root, 'src/campaign/campaigns');
  if (!existsSync(base)) return [];
  const out: MissionInfo[] = [];
  for (const c of readdirSync(base)) {
    const dir = join(base, c, 'missions');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(EXT)) continue;
      try {
        const d = JSON.parse(await Bun.file(join(dir, f)).text());
        out.push({ campaign: c, key: d.key, title: d.title, order: d.order, data: true, file: `src/campaign/campaigns/${c}/missions/${f}` });
      } catch { out.push({ campaign: c, key: f.slice(0, -EXT.length), title: `${f} (unreadable)`, order: 999, data: true }); }
    }
  }
  return out.sort((a, b) => a.campaign.localeCompare(b.campaign) || a.order - b.order);
}

const fileOf = (root: string, c: string, k: string) => join(root, 'src/campaign/campaigns', c, 'missions', `${k}${EXT}`);

/** API + static handler; separate from Bun.serve so tests can run it against a temp folder. */
export function makeApi(root: string, gameUrl: string) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  return {
    '/api/config': () => json({ gameUrl }),
    '/api/missions': async () => {
      const files = await listMissionFiles(root);
      // hand-coded missions (no .opensc2mission yet) are listed read-only, so the editor can show their maps
      let code: MissionInfo[] = [];
      try {
        const { CAMPAIGNS } = await import('../../src/campaign/registry');
        code = CAMPAIGNS.flatMap(c => c.missions.filter(m => !m.data).map(m => ({ campaign: c.id, key: m.key, title: m.title, order: m.order, data: false })));
      } catch { /* registry unavailable (tests) */ }
      return json([...files, ...code]);
    },
    '/api/mission/:campaign/:key': {
      GET: async (req: Request & { params: Record<string, string> }) => {
        const { campaign, key } = req.params;
        if (!okId(campaign!) || !okId(key!)) return json({ error: 'bad id' }, 400);
        const f = Bun.file(fileOf(root, campaign!, key!));
        if (!(await f.exists())) return json({ error: 'not found' }, 404);
        return new Response(await f.text(), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      },
      PUT: async (req: Request & { params: Record<string, string> }) => {
        const { campaign, key } = req.params;
        if (!okId(campaign!) || !okId(key!)) return json({ error: 'bad id' }, 400);
        let d: any;
        try { d = await req.json(); } catch { return json({ error: 'not JSON' }, 400); }
        if (d?.version !== 1 || d.key !== key || d.campaign !== campaign) return json({ error: 'key / campaign / version do not match the file name' }, 400);
        mkdirSync(join(root, 'src/campaign/campaigns', campaign!, 'missions'), { recursive: true });
        const text = stringifyMission(d);
        await Bun.write(fileOf(root, campaign!, key!), text);
        return json({ ok: true, bytes: text.length, file: `src/campaign/campaigns/${campaign}/missions/${key}${EXT}` });
      }
    }
  };
}

/** Static files the page needs from the game: public/ (models, icons, portraits, audio, textures) and docs/ (reference maps). */
export async function serveStatic(root: string, pathname: string): Promise<Response | null> {
  const p = decodeURIComponent(pathname);
  const from = p.startsWith('/docs/') ? join(root, 'docs') : join(root, 'public');
  const rel = p.startsWith('/docs/') ? p.slice('/docs/'.length) : p.slice(1);
  const full = resolve(from, normalize(rel));
  if (!full.startsWith(resolve(from) + '/')) return null; // no escaping the folder
  const f = Bun.file(full);
  return (await f.exists()) ? new Response(f) : null;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '../..');
  const port = Number(process.env.PORT ?? 5210);
  const gameUrl = process.env.GAME_URL ?? 'http://localhost:5200';
  Bun.serve({
    port,
    routes: { '/': index, ...makeApi(root, gameUrl) } as any,
    async fetch(req) {
      return (await serveStatic(root, new URL(req.url).pathname)) ?? new Response('Not found', { status: 404 });
    },
    // no hot reload: the page imports the game's level list, which imports the mission files, so a Save would reload the
    // editor (and lose its undo history). Reload the page by hand after changing editor code.
    development: { hmr: false, console: true }
  });
  console.log(`SC2 Mission Builder → http://localhost:${port}   (game for Playtest: ${gameUrl})`);
}
