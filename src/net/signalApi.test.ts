import { test, expect, beforeEach } from 'bun:test';
import { GET, POST } from '../../api/signal';
import { MemorySignalStore, setSignalStore } from '../../api/_lib/signalStore';

const call = async (body: unknown) => {
  const res = await POST(new Request('http://x/api/signal', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json() as any };
};

beforeEach(() => setSignalStore(new MemorySignalStore()));

test('not configured: 503 so clients keep the PeerJS broker', async () => {
  setSignalStore(null);
  expect((await GET(new Request('http://x/api/signal'))).status).toBe(503);
  expect((await call({ op: 'claim' })).status).toBe(503);
});

test('configured: GET says v1', async () => {
  expect(await (await GET(new Request('http://x/api/signal'))).json()).toMatchObject({ v: 1 });
});

test('claim: a room id is exclusive, random ids are handed out', async () => {
  const a = await call({ op: 'claim', id: 'svg-ABCD' });
  expect(a.status).toBe(200);
  expect(a.data.id).toBe('svg-ABCD');
  expect((await call({ op: 'claim', id: 'svg-ABCD' })).status).toBe(409);
  const b = await call({ op: 'claim' });
  expect(b.status).toBe(200);
  expect(b.data.id).toMatch(/^p[0-9a-f]{14}$/);
  expect((await call({ op: 'claim', id: 'bad id!' })).status).toBe(400);
});

test('handshake: offer reaches the host, answer reaches the guest, inbox drains', async () => {
  const host = (await call({ op: 'claim', id: 'svg-ROOM' })).data;
  const guest = (await call({ op: 'claim' })).data;
  expect((await call({ op: 'send', id: guest.id, token: guest.token, to: host.id, msg: { t: 'offer', cid: 'c1', sdp: 'o' } })).status).toBe(200);
  const got = await call({ op: 'poll', id: host.id, token: host.token });
  expect(got.data.msgs).toEqual([{ t: 'offer', cid: 'c1', sdp: 'o', from: guest.id }]);
  expect((await call({ op: 'poll', id: host.id, token: host.token })).data.msgs).toEqual([]);
  await call({ op: 'send', id: host.id, token: host.token, to: guest.id, msg: { t: 'answer', cid: 'c1', sdp: 'a' } });
  expect((await call({ op: 'poll', id: guest.id, token: guest.token })).data.msgs[0]).toMatchObject({ t: 'answer', from: 'svg-ROOM' });
});

test('sender cannot be spoofed: from is set by the server and needs the token', async () => {
  const host = (await call({ op: 'claim', id: 'svg-HOST' })).data;
  const guest = (await call({ op: 'claim' })).data;
  expect((await call({ op: 'send', id: guest.id, token: 'nope', to: host.id, msg: { t: 'offer' } })).status).toBe(410);
  await call({ op: 'send', id: guest.id, token: guest.token, to: host.id, msg: { t: 'offer', from: 'svg-EVIL' } });
  expect((await call({ op: 'poll', id: host.id, token: host.token })).data.msgs[0].from).toBe(guest.id);
});

test('unknown peer: 404 peer-unavailable; wrong token on poll: 410', async () => {
  const g = (await call({ op: 'claim' })).data;
  const r = await call({ op: 'send', id: g.id, token: g.token, to: 'svg-NONE', msg: { t: 'offer' } });
  expect(r.status).toBe(404);
  expect(r.data.error).toBe('peer-unavailable');
  expect((await call({ op: 'poll', id: g.id, token: 'x' })).status).toBe(410);
});

test('release frees the id for the next host', async () => {
  const a = (await call({ op: 'claim', id: 'svg-FREE' })).data;
  expect((await call({ op: 'release', id: 'svg-FREE', token: 'wrong' })).status).toBe(200);
  expect((await call({ op: 'claim', id: 'svg-FREE' })).status).toBe(409);
  await call({ op: 'release', id: 'svg-FREE', token: a.token });
  expect((await call({ op: 'claim', id: 'svg-FREE' })).status).toBe(200);
});

test('oversized messages are refused', async () => {
  const h = (await call({ op: 'claim', id: 'svg-BIGM' })).data;
  const g = (await call({ op: 'claim' })).data;
  expect((await call({ op: 'send', id: g.id, token: g.token, to: h.id, msg: { sdp: 'x'.repeat(20000) } })).status).toBe(413);
});
