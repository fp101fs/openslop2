import type { Unit } from '../simulation/Unit';

/**
 * Generic "life" layer for units that have no bespoke animator: idle sway, walk bob/roll and attack recoil.
 * Only adjusts the mesh transform (position.y, rotation, a small backwards push) - never gameplay state.
 */
const SKIP = new Set(['marine', 'marauder', 'siege_tank', 'siege_tank_sieged', 'thor', 'thor_ap', 'goliath', 'zergling', 'wraith']);

interface IA { x: number; z: number; t: number; phase: number; recoil: number; cd: number; speed: number }

export class IdleAnimator {
  static apply(u: Unit) {
    const m = u.mesh;
    if (!m || SKIP.has(u.type) || m.userData.rigged || u.isDead || u.burrowed) return;
    let a = m.userData.ia as IA | undefined;
    const now = performance.now() / 1000;
    if (!a) { a = m.userData.ia = { x: u.pos.x, z: u.pos.y, t: now, phase: Math.random() * 6.28, recoil: 0, cd: 0, speed: 0 }; }
    const dt = Math.min(0.1, Math.max(0.001, now - a.t));
    a.t = now;
    const v = Math.hypot(u.pos.x - a.x, u.pos.y - a.z) / dt;
    a.x = u.pos.x; a.z = u.pos.y;
    a.speed += (v - a.speed) * Math.min(1, dt * 10); // smoothed
    if (u.attackCooldown > a.cd + 0.05) a.recoil = 1;
    a.cd = u.attackCooldown;
    a.recoil = Math.max(0, a.recoil - dt * 7);

    const heavy = u.radius > 0.9 ? 0.55 : 1;
    const walking = Math.min(1, a.speed / 1.5);
    a.phase += dt * (2 + walking * (3 + a.speed * 1.6));
    if (u.type === 'mutalisk') {
      const w = (m.userData.wings ||= [m.getObjectByName('wing_l'), m.getObjectByName('wing_r')]) as (import('three').Object3D | undefined)[];
      const f = Math.sin(a.phase * 2.6) * (0.28 + 0.3 * walking);
      if (w[0]) w[0].rotation.z = f;
      if (w[1]) w[1].rotation.z = -f;
    }
    if (u.isFlying) {
      // hovering craft: slow vertical drift + gentle roll
      m.position.y += Math.sin(a.phase * 0.7) * 0.08;
      m.rotation.z += Math.sin(a.phase * 0.5) * 0.03;
      return;
    }
    const idle = 1 - walking;
    if (u.type === 'ultralisk') {
      // heavy beast, simple subtle motion: slow breathing, a ponderous stomp-roll while walking, head-down lunge on attack
      if (m.userData.baseScale === undefined) m.userData.baseScale = m.scale.y;
      const bs = m.userData.baseScale as number;
      m.scale.y = bs * (1 + Math.sin(a.phase * 0.55) * 0.012 * idle + Math.abs(Math.sin(a.phase * 0.5)) * 0.01 * walking);
      m.position.y += Math.abs(Math.sin(a.phase * 0.5)) * 0.05 * walking;
      m.rotation.z += Math.sin(a.phase * 0.5) * 0.035 * walking + Math.sin(a.phase * 0.3) * 0.008 * idle;
      m.rotation.x += Math.sin(a.phase * 0.5 + 1.2) * 0.02 * walking;
      if (a.recoil > 0) {
        const k = Math.sin((1 - a.recoil) * Math.PI) * 0.34;               // out and back
        m.position.x += Math.sin(u.rotation) * k; m.position.z += Math.cos(u.rotation) * k;
        m.rotation.x += Math.sin((1 - a.recoil) * Math.PI) * 0.1;
      }
      return;
    }
    m.position.y += (Math.abs(Math.sin(a.phase)) * 0.07 * walking + Math.sin(a.phase * 0.6) * 0.012 * idle) * heavy;
    m.rotation.z += (Math.sin(a.phase) * 0.05 * walking + Math.sin(a.phase * 0.5) * 0.012 * idle) * heavy;
    m.rotation.x += Math.sin(a.phase * 2) * 0.015 * walking * heavy;
    if (a.recoil > 0) {
      const k = a.recoil * a.recoil * 0.2 * heavy;
      m.position.x -= Math.sin(u.rotation) * k;
      m.position.z -= Math.cos(u.rotation) * k;
      m.rotation.x -= a.recoil * 0.07 * heavy;
    }
  }
}
