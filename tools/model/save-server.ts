// Local helper for src/dev/exportModels.ts: writes POST /save?name=<file> bodies into public/models (CORS open, localhost only).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' };
Bun.serve({
  hostname: '127.0.0.1', port: 5300,
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const u = new URL(req.url), name = u.searchParams.get('name') ?? '';
    if (!/^[a-z0-9_]+\.glb$/.test(name)) return new Response('bad name', { status: 400, headers: cors });
    const buf = await req.arrayBuffer(); await Bun.write(`public/models/${name}`, buf);
    return new Response(`saved ${buf.byteLength} bytes`, { headers: cors });
  }
});
console.log('listening on 5300');
