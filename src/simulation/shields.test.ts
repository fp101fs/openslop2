import { test, expect } from 'bun:test';
import { Entity } from './Entity';

class Dummy extends Entity { update() {} }
function stalker() {
  const e = new Dummy('t', 'unit' as any, 'player', { x: 0, y: 0 }, 80, 1);
  e.maxShield = 80; e.shield = 80;
  return e;
}
const run = (e: Entity, secs: number, dt = 0.016) => { for (let t = 0; t < secs; t += dt) e.tickStatus(dt); };

test('no regen during the 7 s delay, then 2 shields/s', () => {
  const e = stalker();
  e.takeDamage(40);
  const after = e.shield;
  run(e, 6.9);
  expect(e.shield).toBe(after);
  run(e, 0.1 + 5); // delay ends, 5 s of regen
  expect(e.shield).toBeGreaterThan(after + 9.5);
  expect(e.shield).toBeLessThan(after + 10.2);
});

test('damage resets the delay and shields cap at max', () => {
  const e = stalker();
  e.takeDamage(40);
  run(e, 6);
  e.takeDamage(1);
  const s = e.shield;
  run(e, 6.9);
  expect(e.shield).toBe(s);
  run(e, 100);
  expect(e.shield).toBe(80);
});
