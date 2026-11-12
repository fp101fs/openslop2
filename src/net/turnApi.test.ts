import { test, expect } from 'bun:test';
import { createHmac } from 'node:crypto';
import { GET } from '../../api/turn';

const KEYS = ['CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'TURN_URLS', 'TURN_SECRET', 'TURN_USERNAME', 'TURN_CREDENTIAL'];
async function withEnv(env: Record<string, string>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { await fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
const req = new Request('http://x/api/turn');

test('not configured: 503 so the client keeps its built-in servers', () => withEnv({}, async () => {
  const res = await GET(req);
  expect(res.status).toBe(503);
}));

test('coturn shared secret: time-limited REST credentials', () => withEnv({ TURN_URLS: 'turn:t.example.com:3478, turns:t.example.com:5349', TURN_SECRET: 's3cret' }, async () => {
  const res = await GET(req);
  expect(res.status).toBe(200);
  const { iceServers } = await res.json() as any;
  const s = iceServers[0];
  expect(s.urls).toEqual(['turn:t.example.com:3478', 'turns:t.example.com:5349']);
  const [expiry, name] = s.username.split(':');
  expect(name).toBe('openslop2');
  expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000 + 23 * 3600);
  expect(s.credential).toBe(createHmac('sha1', 's3cret').update(s.username).digest('base64'));
}));

test('fixed credentials pass through', () => withEnv({ TURN_URLS: 'turn:a:3478', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' }, async () => {
  const { iceServers } = await (await GET(req)).json() as any;
  expect(iceServers).toEqual([{ urls: ['turn:a:3478'], username: 'u', credential: 'p' }]);
}));
