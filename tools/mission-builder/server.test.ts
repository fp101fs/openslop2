import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApi, listMissionFiles, serveStatic } from './server';
import { blankMission } from './src/store';

const root = mkdtempSync(join(tmpdir(), 'mb-'));
mkdirSync(join(root, 'src/campaign/campaigns/wol/missions'), { recursive: true });
mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/icons/a.png'), 'png');
writeFileSync(join(root, 'package.json'), '{}');
const api: any = makeApi(root, 'http://game');
const req = (method: string, body: unknown, params: Record<string, string>) => Object.assign(new Request('http://x/', { method, body: body === undefined ? undefined : JSON.stringify(body) }), { params });

test('save, list and load a mission file (canonical format)', async () => {
  const d = blankMission('wol', 'test_mission', 'Test');
  const r = await api['/api/mission/:campaign/:key'].PUT(req('PUT', d, { campaign: 'wol', key: 'test_mission' }));
  expect(r.status).toBe(200);
  const text = readFileSync(join(root, 'src/campaign/campaigns/wol/missions/test_mission.opensc2mission'), 'utf8');
  expect(JSON.parse(text)).toEqual(d);
  expect(text).toContain('"th": [20, 108]'); // points on one line
  expect((await listMissionFiles(root)).map(m => m.key)).toEqual(['test_mission']);
  const g = await api['/api/mission/:campaign/:key'].GET(req('GET', undefined, { campaign: 'wol', key: 'test_mission' }));
  expect(await g.json()).toEqual(d);
});

test('rejects bad ids, mismatched files, missing files and path escapes', async () => {
  const bad = await api['/api/mission/:campaign/:key'].PUT(req('PUT', blankMission('wol', 'a', 'A'), { campaign: 'wol', key: 'b' }));
  expect(bad.status).toBe(400);
  expect((await api['/api/mission/:campaign/:key'].GET(req('GET', undefined, { campaign: '../x', key: 'a' }))).status).toBe(400);
  expect((await api['/api/mission/:campaign/:key'].GET(req('GET', undefined, { campaign: 'wol', key: 'nope' }))).status).toBe(404);
  expect(await serveStatic(root, '/icons/a.png')).not.toBeNull();
  expect(await serveStatic(root, '/../package.json')).toBeNull();
  expect(await serveStatic(root, '/%2e%2e/package.json')).toBeNull();
});
