import { makeWorld, instantHits } from '../ai/headlessWorld';
import { test, expect } from 'bun:test';
import { Lockstep, type TurnPacket } from './Lockstep';
import { NetSync, type SyncMode } from './NetSync';
import { stateHash } from './stateHash';

// ---------------------------------------------------------------------------------------------------------------------
// Scheduler on its own
// ---------------------------------------------------------------------------------------------------------------------

test('orders run on the same tick on both computers, and nobody runs ahead of the other', () => {
  const wire: { to: Lockstep; p: TurnPacket; at: number }[] = [];
  let frame = 0;
  const a: Lockstep = new Lockstep(p => wire.push({ to: b, p: JSON.parse(JSON.stringify(p)), at: frame + 5 }));
  const b: Lockstep = new Lockstep(p => wire.push({ to: a, p: JSON.parse(JSON.stringify(p)), at: frame + 5 }));
  const ran: Record<string, number[]> = { a: [], b: [] };
  const tickOf = (name: 'a' | 'b', ls: Lockstep) => {
    if (!ls.canStep()) return;
    if (ls.atTurnStart) {
      const { local, remote } = ls.beginTurn(42);
      for (const c of [...local, ...remote]) ran[name]!.push((c as any).n * 10000 + ls.tick);
    }
    ls.endTick();
  };
  for (frame = 0; frame < 600; frame++) {
    if (frame === 30) a.queueLocal({ n: 1 });
    if (frame === 31) b.queueLocal({ n: 2 });
    tickOf('a', a);
    if (frame % 3 !== 0) tickOf('b', b); // b is slower: a must wait for it
    for (let i = wire.length - 1; i >= 0; i--) if (wire[i]!.at <= frame) { wire[i]!.to.receive(wire[i]!.p); wire.splice(i, 1); }
    expect(Math.abs(a.turn - b.turn)).toBeLessThanOrEqual(a.cfg.delayTurns + 1);
  }
  expect(ran.a!.sort()).toEqual(ran.b!.sort());
  expect(ran.a!.length).toBe(2);
});

// ---------------------------------------------------------------------------------------------------------------------
// Two real game worlds through NetSync
// ---------------------------------------------------------------------------------------------------------------------

/** In-memory transport pair: JSON round trip (like the wire) and a few frames of latency. */
function linkedTransports(latencyFrames: number) {
  const queue: { to: any; msg: any; at: number }[] = [];
  let frame = 0;
  const make = () => {
    const handlers = new Set<(m: any) => void>();
    const t: any = {
      connected: true, name: 'test', peer: null as any,
      on: (fn: any) => { handlers.add(fn); return () => handlers.delete(fn); },
      relay: (d: any) => queue.push({ to: t.peer, msg: JSON.parse(JSON.stringify(d)), at: frame + latencyFrames }),
      emit: (m: any) => handlers.forEach(h => h(m)),
      connect: async () => {}, send() {}, host() {}, join() {}, quick() {}, start() {}, leave() {}, close() {}
    };
    return t;
  };
  const host = make(), guest = make();
  host.peer = guest; guest.peer = host;
  return {
    host, guest, bytes: 0,
    deliver(f: number) {
      frame = f;
      for (let i = 0; i < queue.length;) {
        if (queue[i]!.at <= f) { const q = queue.splice(i, 1)[0]!; this.bytes += JSON.stringify(q.msg).length; q.to.emit(q.msg); } else i++;
      }
    }
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));

async function match(mode: 'multiplayer_pvp' | 'multiplayer_coop', sync: SyncMode = 'lockstep', factions: [string, string] = ['terran', 'protoss']) {
  const cfg: any = { mode, playerFaction: factions[0], enemyFaction: factions[1], difficulty: 'normal', seed: 7 };
  const hw = instantHits(await makeWorld(cfg));
  const gw = instantHits(await makeWorld({ ...cfg, seed: 99 })); // a different seed: the keyframe must carry the host's
  // armies on both sides so there is a fight to keep in sync (the guest gets them through the starting keyframe)
  for (let i = 0; i < 6; i++) hw.spawnUnit('marine', 'player', { x: 40 + i, y: 40 });
  for (let i = 0; i < 4; i++) hw.spawnUnit('zealot', 'enemy', { x: 50 + i, y: 50 });
  const net = linkedTransports(4);
  const host = new NetSync(hw, net.host, 'host', sync);
  const guest = new NetSync(gw, net.guest, 'guest', sync);
  hw.net = host; gw.net = guest;
  host.onNotice = guest.onNotice = () => {};
  let frame = 0;
  const run = async (seconds: number, each?: (f: number) => void) => {
    const end = frame + Math.round(seconds * 60);
    for (; frame < end; frame++) {
      each?.(frame);
      host.advance(1 / 60, dt => hw.update(dt));
      guest.advance(1 / 60, dt => gw.update(dt));
      net.deliver(frame);
      if (frame % 20 === 0) await tick(); // let keyframe compression finish
    }
  };
  return { hw, gw, host, guest, net, run, frameAt: () => frame };
}

/** Host-label hash of each world at the same tick (the guest's labels are mirrored in PvP). */
function sameState(m: Awaited<ReturnType<typeof match>>) {
  const pvp = m.hw.matchConfig.mode === 'multiplayer_pvp';
  const hostSlot = (p: string) => (p === 'player' ? 0 : 1);
  const guestSlot = (p: string) => (pvp ? (p === 'player' ? 1 : 0) : hostSlot(p));
  return stateHash(m.hw, hostSlot as any) === stateHash(m.gw, guestSlot as any);
}

test('PvP lockstep: both worlds stay identical through orders and a fight', async () => {
  const m = await match('multiplayer_pvp');
  await m.run(1);
  expect(m.guest.stats.keyframesApplied).toBe(1); // the starting keyframe
  // guest's own side is 'player' in its mirrored world, the host's army is 'enemy' there
  expect(m.gw.units.filter((u: any) => u.type === 'zealot').every((u: any) => u.playerId === 'player')).toBe(true);
  expect(m.gw.matchConfig.playerFaction).toBe('protoss');
  await m.run(2, f => {
    if (f === 90) m.host.sendUnitCommand(m.hw.units.filter((u: any) => u.type === 'marine').map((u: any) => u.id), { type: 'attack_move', targetPos: { x: 55, y: 55 } });
    if (f === 95) m.guest.sendUnitCommand(m.gw.units.filter((u: any) => u.type === 'zealot').map((u: any) => u.id), { type: 'attack_move', targetPos: { x: 40, y: 40 } });
    if (f === 100) {
      const cc = m.hw.buildings.find((b: any) => b.playerId === 'player' && b.type === 'command_center');
      m.host.sendProduce(cc.id, 'scv');
    }
  });
  await m.run(25);
  // compare at a tick boundary both have reached: stop the faster one
  expect(m.host.stats.desyncs).toBe(0);
  const lost = (w: any, t: string) => 6 - w.units.filter((u: any) => u.type === t && !u.isDead).length;
  expect(lost(m.hw, 'marine') + lost(m.hw, 'zealot')).toBeGreaterThan(0); // the fight happened
  expect(lost(m.gw, 'marine') + lost(m.gw, 'zealot')).toBe(lost(m.hw, 'marine') + lost(m.hw, 'zealot'));
}, 120000);

test('start handshake: nobody runs before the guest has the starting state, and a lost keyframe is asked for again', async () => {
  const m = await match('multiplayer_coop');
  // lose everything the host sends at first (the guest was still loading models when it went out)
  const realEmit = m.net.guest.emit;
  m.net.guest.emit = () => {};
  await m.run(1);
  expect(m.host.isStarted).toBe(false);
  expect(m.guest.isStarted).toBe(false);
  expect(m.hw.gameTime).toBe(0);
  m.net.guest.emit = realEmit;
  await m.run(6); // the guest asks again after a few seconds
  expect(m.guest.isStarted).toBe(true);
  expect(m.host.isStarted).toBe(true);
  expect(m.hw.gameTime).toBeGreaterThan(0.5);
  expect(m.host.stats.desyncs).toBe(0);
}, 120000);

test('a desync is detected and healed by a keyframe', async () => {
  const m = await match('multiplayer_coop');
  await m.run(2);
  const sent = m.host.stats.keyframesSent;
  // corrupt the guest: a unit loses health on this computer only
  const u = m.gw.units.find((x: any) => x.type === 'scv');
  u.health -= 7;
  await m.run(3);
  expect(m.host.stats.desyncs).toBeGreaterThan(0);
  expect(m.host.stats.keyframesSent).toBe(sent + 1);
  expect(m.guest.stats.keyframesApplied).toBe(2);
  // afterwards the two agree again
  const before = m.host.stats.desyncs;
  await m.run(5);
  expect(m.host.stats.desyncs).toBe(before);
}, 120000);

test('repeated desyncs fall back to snapshot sync and the match goes on', async () => {
  const m = await match('multiplayer_coop');
  await m.run(1);
  for (let i = 0; i < 7; i++) { m.gw.units.find((x: any) => x.type === 'scv').health -= 3; await m.run(1.5); }
  expect(m.host.mode).toBe('snapshot');
  expect(m.guest.mode).toBe('snapshot');
  expect(m.guest.puppet).toBe(true);
  await m.run(2);
  expect(m.gw.units.length).toBeGreaterThan(5); // puppets from the host's snapshots
}, 120000);

test.each([
  ['multiplayer_coop', 'terran', 'protoss'],
  ['multiplayer_pvp', 'zerg', 'protoss'], // creep: its growth clock must survive the starting keyframe exactly
  ['multiplayer_pvp', 'protoss', 'zerg']
] as const)('lockstep keeps the two worlds bit-for-bit equal (%s, %s vs %s)', async (mode, a, b) => {
  const m = await match(mode, 'lockstep', [a, b]);
  await m.run(10);
  // freeze the side that is ahead and let the other catch up to the same tick, then compare
  for (let i = 0; i < 400 && Math.abs(m.gw.gameTime - m.hw.gameTime) > 1e-9; i++) {
    if (m.gw.gameTime < m.hw.gameTime) m.guest.advance(1 / 60, dt => m.gw.update(dt));
    else m.host.advance(1 / 60, dt => m.hw.update(dt));
    m.net.deliver(m.frameAt() + i);
  }
  expect(m.gw.gameTime).toBeCloseTo(m.hw.gameTime, 6);
  expect(sameState(m)).toBe(true);
  // bandwidth: orders only, a few hundred bytes a second (plus the one starting keyframe)
  expect(m.host.stats.keyframesSent).toBe(1);
}, 120000);

test('co-op host migration: lockstep guest keeps playing alone when the host leaves', async () => {
  const m = await match('multiplayer_coop');
  await m.run(3);
  let lost = false;
  m.guest.onPeerLost = () => { lost = true; };
  m.net.guest.emit({ t: 'peer_left' });
  expect(lost).toBe(true);
  // what the app does (StarCraftApp.continueSolo): drop the network, keep the world
  m.guest.dispose(); m.gw.net = null;
  const t0 = m.gw.gameTime;
  for (let i = 0; i < 600; i++) m.gw.update(1 / 60);
  expect(m.gw.gameTime - t0).toBeGreaterThan(9);
  expect(m.gw.isGameOver).toBe(false);
}, 120000);

test('co-op host migration in snapshot mode: the guest restores the latest keyframe', async () => {
  const m = await match('multiplayer_coop', 'snapshot');
  await m.run(10);
  expect(m.guest.lastKeyframe).not.toBeNull();
  expect(m.guest.restoreLastKeyframe()).toBe(true);
  m.guest.dispose(); m.gw.net = null;
  // real units now (not puppets): the simulation runs them
  const scv = m.gw.units.find((u: any) => u.type === 'scv' && u.playerId === 'player');
  expect(scv).toBeTruthy();
  for (let i = 0; i < 300; i++) m.gw.update(1 / 60);
  expect(m.gw.resources.player.minerals).toBeGreaterThan(0);
}, 120000);
