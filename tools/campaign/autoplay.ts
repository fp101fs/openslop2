// Usage: bun tools/campaign/autoplay.ts <campaign> <missionKey> [difficulty=normal] [--json]
// Plays a data mission headless: the player's army attack-moves along the mission's `testRoute`, waypoint by waypoint, waiting
// at each one until the area is clear (or a timeout). Prints what happened; --json prints one report object (used by tests).
// Runs in its own process because the map layout is fixed per process (src/maps.ts reads the boot map once at import).
const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--saveAt');
const [cid, key, difficulty = 'normal'] = pos;
const asJson = process.argv.includes('--json');
/** --saveAt <sec>: at that mission time, save, load into a fresh world and compare (entities, objectives, stats, timers). */
const saveAt = process.argv.includes('--saveAt') ? +process.argv[process.argv.indexOf('--saveAt') + 1]! : 0;
if (!cid || !key) { console.error('usage: bun tools/campaign/autoplay.ts <campaign> <missionKey> [difficulty]'); process.exit(2); }

// data missions' map id is `<campaign>_<key>`: make it the boot map BEFORE anything imports src/maps.ts
const mapId = `${cid}_${key}`;
(globalThis as any).sessionStorage = { getItem: (k: string) => (k === 'sc2_boot_map' ? mapId : null), setItem() {}, removeItem() {} };
const { makeWorld, instantHits } = await import('../../src/ai/headlessWorld');
const { missionOf } = await import('../../src/campaign/registry');
const { LAYOUT } = await import('../../src/maps');

const m = missionOf(cid, key);
if (!m?.data) { console.error(`not a data mission: ${cid}/${key}`); process.exit(2); }
if (LAYOUT.id !== m.mapId) { console.error(`map ${m.mapId} did not load (got ${LAYOUT.id})`); process.exit(2); }
const d = m.data;
const route = d.paths.find(p => p.id === d.testRoute)?.pts;
if (!route?.length) { console.error('mission has no testRoute path'); process.exit(2); }

const quietLog = console.log; if (asJson) console.log = () => {};
const w: any = await makeWorld({ mode: 'campaign', campaignId: cid, missionKey: key, campaignMissionId: 0, playerFaction: m.playerFaction, enemyFaction: m.enemyFaction, mapId: m.mapId as any, difficulty: difficulty as any });
instantHits(w);
const rt = w.mission;
const dt = 1 / 20;
const log: { t: number; ev: string }[] = [];
const fired = new Set<string>();
const note = (ev: string) => { log.push({ t: Math.round(rt.elapsed), ev }); if (!asJson) quietLog(`${String(Math.round(rt.elapsed)).padStart(4)}s  ${ev}`); };
const maxGroup: Record<string, number> = {};
const typesSeen: Record<string, string[]> = {};

const army = () => w.units.filter((u: any) => u.playerId === 'player' && !u.isDead && !u.scripted && u.type !== 'civilian');
const raynor = () => w.units.find((u: any) => u.missionGroup === d.groups.find(g => g.units.some(u => u.hero))?.id && !u.isDead);
const enemiesNear = (x: number, y: number, r: number) => [...w.units, ...w.buildings].some((e: any) => e.playerId === 'enemy' && !e.isDead && Math.hypot(e.pos.x - x, e.pos.y - y) < r);

let wp = 0, waitT = 0, stuck = '';
let saveCheck: string[] | null = null;
async function checkSave() {
  const THREE = await import('three');
  const { captureGame, restoreGame } = await import('../../src/save/SaveState');
  const { encodeSave, decodeSave } = await import('../../src/save/SaveFiles');
  const app = (x: any) => ({ world: x, renderer: { cameraTarget: new THREE.Vector3(), savedRtsTarget: new THREE.Vector3(), cameraDistance: 30 }, input: { controlGroups: new Map() } });
  const data = await decodeSave(await encodeSave(captureGame(app(w), 'autoplay')));
  const b: any = await makeWorld(data.config);
  const warns: string[] = []; const ow = console.warn; console.warn = (...x: unknown[]) => warns.push(x.join(' '));
  restoreGame(app(b), data);
  console.warn = ow;
  const live = (x: any) => [...x.units, ...x.buildings].filter((e: any) => !e.isDead).map((e: any) => `${e.id}:${e.type}:${e.missionGroup ?? ''}`).sort();
  const objs = (x: any) => [...x.mission.objectives.values()].map((o: any) => `${o.def.id}:${o.status}:${o.progress}`);
  const out: string[] = [];
  const la = live(w), lb = live(b);
  if (JSON.stringify(la) !== JSON.stringify(lb)) out.push(`entities differ ${la.length} vs ${lb.length}: missing ${la.filter(x => !lb.includes(x)).slice(0, 3)} extra ${lb.filter(x => !la.includes(x)).slice(0, 3)}`);
  if (JSON.stringify(objs(w)) !== JSON.stringify(objs(b))) out.push(`objectives differ ${objs(w)} vs ${objs(b)}`);
  if (JSON.stringify(w.mission.stats) !== JSON.stringify(b.mission.stats)) out.push('stats differ');
  if (JSON.stringify(w.mission.state.dm.fired) !== JSON.stringify(b.mission.state.dm.fired)) out.push('fired triggers differ');
  if (w.mission.timers.length !== b.mission.timers.length) {
    const ta = w.mission.timers.map((t: any) => t.id), tb = b.mission.timers.map((t: any) => t.id);
    out.push(`timers ${ta.length} vs ${tb.length}: missing ${ta.filter((x: string) => !tb.includes(x))} extra ${tb.filter((x: string) => !ta.includes(x))}`);
  }
  if (JSON.stringify([...w.missionBlocked.keys()]) !== JSON.stringify([...b.missionBlocked.keys()])) out.push('pathing blockers differ');
  if (warns.length) out.push(`warnings: ${warns.slice(0, 2).join(' | ')}`);
  // the restored copy keeps running without firing again any one-shot trigger that had already fired before the save
  const firedAtSave = { ...b.mission.state.dm.fired };
  instantHits(b); for (let t = 0; t < 5; t += dt) b.update(dt);
  const repeat = new Set(d.triggers.filter(t => t.once === false || t.when.k === 'every').map(t => t.id));
  for (const [id, n] of Object.entries(b.mission.state.dm.fired as Record<string, number>)) if (!repeat.has(id) && firedAtSave[id] && n > firedAtSave[id]) out.push(`trigger ${id} fired again after loading`);
  return out;
}
const LIMIT = 20 * 60;
while (rt.elapsed < LIMIT && !rt.result) {
  const target = route[wp]!;
  if (Math.round(rt.elapsed * 20) % 20 === 0) { // re-issue the move once a second
    for (const u of army()) if (Math.hypot(u.pos.x - target[0], u.pos.y - target[1]) > 3) u.setCommand({ type: 'attack_move', targetPos: { x: target[0], y: target[1] } });
    // enemies left behind a cleared waypoint: hunt the nearest live enemy structure on the way (holoboards, the HQ)
  }
  w.update(dt);
  waitT += dt;
  if (saveAt && !saveCheck && rt.elapsed >= saveAt) { saveCheck = await checkSave(); note(`save/load check: ${saveCheck.length ? saveCheck.join('; ') : 'ok'}`); }
  for (const id of Object.keys(rt.state.dm?.fired ?? {})) if (!fired.has(id)) { fired.add(id); note(`trigger ${id}`); }
  for (const g of d.groups) {
    const list = w.units.concat(w.buildings).filter((e: any) => e.missionGroup === g.id);
    maxGroup[g.id] = Math.max(maxGroup[g.id] ?? 0, list.length);
    for (const e of list) { const t = (typesSeen[g.id] ??= []); if (!t.includes(e.type)) t.push(e.type); }
  }
  const r = raynor();
  if (!r) break;
  if (process.env.TRACE && Math.round(rt.elapsed * 20) % 200 === 0) quietLog(`   t=${Math.round(rt.elapsed)} raynor ${r.pos.x.toFixed(1)},${r.pos.y.toFixed(1)} hp ${Math.round(r.health)} cmd ${r.currentCommand?.type} army ${army().length} target ${target}`);
  const there = Math.hypot(r.pos.x - target[0], r.pos.y - target[1]) < 5;
  if ((there && !enemiesNear(target[0], target[1], 11)) || waitT > 90) {
    if (waitT > 90 && !there) stuck = `waypoint ${wp + 1} (${target}) not reached in 90 s`;
    if (waitT > 90) note(`timeout at waypoint ${wp + 1}`);
    if (wp < route.length - 1) { wp++; waitT = 0; note(`waypoint ${wp + 1}/${route.length}`); }
    else {
      // last waypoint: clear every enemy structure still standing (the objective target)
      const left = w.buildings.find((b: any) => b.playerId === 'enemy' && !b.isDead);
      if (left) for (const u of army()) u.setCommand({ type: 'attack', targetEntityId: left.id });
      waitT = 0;
    }
  }
}
console.log = quietLog;
const objectives = Object.fromEntries([...rt.objectives.values()].map((o: any) => [o.def.id, { status: o.status, progress: o.progress }]));
const report = {
  mission: `${cid}/${key}`, difficulty, result: rt.result, seconds: Math.round(rt.elapsed), waypoint: wp + 1, waypoints: route.length, stuck,
  objectives, stats: { ...rt.stats }, saveCheck, groups: maxGroup, fired: [...fired], log,
  raynorHp: raynor()?.health ?? 0, playerArmy: army().length, types: typesSeen,
  blocked: [...(w.missionBlocked?.keys?.() ?? [])], scripted: w.units.filter((u: any) => u.scripted).length
};
if (asJson) console.log(JSON.stringify(report));
else console.log(`\n${report.result ?? 'unfinished'} in ${report.seconds}s on ${difficulty}; objectives ${JSON.stringify(objectives)}; stats ${JSON.stringify(report.stats)}${stuck ? `; stuck: ${stuck}` : ''}`);
process.exit(0);
