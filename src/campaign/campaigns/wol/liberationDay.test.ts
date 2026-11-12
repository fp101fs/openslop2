import { test, expect } from 'bun:test';

/** Plays Liberation Day headless (tools/campaign/autoplay.ts, its own process so the mission's map is the boot map) and checks
 *  the research-backed beats: drop pods, cutscene, 61 civilians, all 6 holoboards, Vikings landing, the point of no return, victory. */
const play = async (difficulty: string) => {
  // --saveAt 125: after the camp (civilians out, way back closed) save, reload into a fresh world and compare
  const p = Bun.spawn(['bun', 'tools/campaign/autoplay.ts', 'wol', 'liberation_day', difficulty, '--json', '--saveAt', '125'], { stdout: 'pipe', stderr: 'ignore' });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return JSON.parse(out.trim().split('\n').pop()!);
};

for (const [difficulty, enemies] of [['easy', { road1: 2, road2: 1, camp: 4, hq_guard: 3, vikings: 2 }], ['normal', { road1: 2, road2: 1, camp: 5, hq_guard: 5, vikings: 2 }]] as const) {
  test(`Liberation Day plays to victory on ${difficulty}`, async () => {
    const r = await play(difficulty);
    expect(r.stuck).toBe('');
    expect(r.saveCheck).toEqual([]);
    expect(r.result).toBe('victory');
    expect(r.objectives.hq.status).toBe('done');
    expect(r.objectives.raynor.status).toBe('done');
    expect(r.objectives.boards).toEqual({ status: 'done', progress: 6 });
    for (const [g, n] of Object.entries(enemies)) expect(r.groups[g]).toBe(n);
    expect(r.groups.square).toBe(9);
    expect(r.groups.pods).toBe(9);              // 3 drop pods × 3 Marines
    expect(r.groups.civilians).toBe(61);
    expect(r.scripted).toBeGreaterThan(0);      // civilians follow Raynor, unselectable
    expect(r.types.vikings).toContain('viking_assault');
    expect(r.types.camp).toContain('dominion_transport');
    expect(r.blocked).toContain('r_corridor');
    expect(r.fired).toEqual(expect.arrayContaining(['camp_cutscene', 'square_approach', 'pods', 'hb1_view', 'point_of_no_return', 'hq_gate', 'victory']));
    expect(typeof r.stats.civiliansLost).toBe('number');
    expect(r.seconds).toBeLessThan(6 * 60);
  }, 300000);
}
