import { test, expect } from "bun:test";
import { Entity } from "./Entity";

test("kill is credited to the damage source on lethal hit", () => {
  const a: any = Object.create(Entity.prototype); a.kills = 0; a.playerId = "player";
  const v: any = Object.create(Entity.prototype);
  Object.assign(v, { playerId: "enemy", health: 10, maxHealth: 10, shield: 0, armor: 0, shieldArmor: 0, guardianTimer: 0, components: [], isDead: false });
  Entity.withSource(a, () => v.takeDamage(5));
  expect(a.kills).toBe(0);
  Entity.withSource(a, () => v.takeDamage(50));
  expect(v.isDead).toBe(true);
  expect(a.kills).toBe(1);
});
