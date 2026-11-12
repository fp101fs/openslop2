import * as THREE from 'three';

/**
 * Procedural animation for the articulated Terran units (SCV, Marauder, Siege Tank / Sieged,
 * Medivac, Banshee). The Marine and Wraith keep their dedicated animators.
 * Everything is driven by cached part references (found by name once per model) so the per-frame cost is
 * a handful of rotations - no allocations and no tree searches.
 */

interface AnimState {
  t: number;
  phase: number;
  lastX: number;
  lastY: number;
  lastRot: number;
  speed: number;
  turn: number;
  recoil: number;      // 0..1, decays
  recoilSide: number;  // which weapon fired last (0/1)
  aimYaw: number;      // world yaw of current target
  aimTimer: number;    // seconds the turret keeps tracking after a shot
  turretYaw: number;
  spin: number;        // barrel spin rate
  p: Record<string, THREE.Object3D | THREE.Object3D[] | undefined>;
  inited: boolean;
}

const TERRAN_ANIMATED = new Set(['scv', 'marauder', 'siege_tank', 'siege_tank_sieged', 'medivac', 'banshee']);

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class TerranAnimator {
  public static handles(type: string): boolean {
    return TERRAN_ANIMATED.has(type);
  }

  private static state(mesh: THREE.Object3D, unit: any): AnimState {
    let s = mesh.userData.tAnim as AnimState | undefined;
    if (!s) {
      s = {
        t: Math.random() * 10, phase: 0, lastX: unit.pos.x, lastY: unit.pos.y, lastRot: unit.rotation, speed: 0, turn: 0,
        recoil: 0, recoilSide: 0, aimYaw: 0, aimTimer: 0, turretYaw: 0, spin: 0, p: {}, inited: false
      };
      mesh.userData.tAnim = s;
    }
    if (!s.inited) {
      s.inited = true;
      const find = (n: string) => mesh.getObjectByName(n) || undefined;
      const all = (prefix: string) => {
        const out: THREE.Object3D[] = [];
        mesh.traverse(o => { if (o.name === prefix || o.name.startsWith(prefix + '_')) out.push(o); });
        return out;
      };
      s.p = {
        body: find('body'), torso: find('torso'), head: find('head'),
        legL: find('leg_l'), legR: find('leg_r'), armL: find('arm_l'), armR: find('arm_r'),
        barrelsL: find('barrels_l'), barrelsR: find('barrels_r'), core: find('core'),
        turret: find('turret'), barrelA: find('barrel_a'), barrelB: find('barrel_b'),
        wheels: all('wheel'), cleatsL: all('cleat_l'), cleatsR: all('cleat_r'),
        drill: find('drill'), boom: find('arm_drill'), torch: find('torch_glow'), beacon: find('beacon'),
        rotors: all('rotor'), podL: find('pod_l'), podR: find('pod_r'), cross: find('cross'), flir: find('flir'),
        light: find('status_light')
      };
    }
    return s;
  }

  /** Called when the unit fires: kicks the recoil and points the turret/arms at the target. */
  public static triggerShoot(unit: any, targetPos?: { x: number; y: number }) {
    const mesh = unit.mesh;
    if (!mesh || mesh.userData.sized || !TERRAN_ANIMATED.has(unit.type)) return;
    const s = this.state(mesh, unit);
    s.recoil = 1;
    s.recoilSide = (((mesh.userData.muzzleShot as number | undefined) ?? -1) + 1) % 2; // matches the muzzle fired next
    if (targetPos) {
      s.aimYaw = Math.atan2(targetPos.x - unit.pos.x, targetPos.y - unit.pos.y);
      s.aimTimer = 1.6;
    }
  }

  public static update(unit: any, dt: number, world: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    if (!mesh || mesh.userData.sized || !TERRAN_ANIMATED.has(unit.type) || dt <= 0) return;
    const s = this.state(mesh, unit);
    const P = s.p;

    // --- motion measurements ---
    s.t += dt;
    const dx = unit.pos.x - s.lastX, dy = unit.pos.y - s.lastY;
    const dist = Math.min(1.5, Math.hypot(dx, dy));
    s.lastX = unit.pos.x; s.lastY = unit.pos.y;
    s.speed += (dist / dt - s.speed) * Math.min(1, dt * 8);
    const dRot = angDiff(unit.rotation, s.lastRot);
    s.lastRot = unit.rotation;
    s.turn += ((dRot / dt) - s.turn) * Math.min(1, dt * 6);
    s.recoil = Math.max(0, s.recoil - dt * 4.5);
    s.aimTimer = Math.max(0, s.aimTimer - dt);
    const ref = Math.max(1, unit.baseSpeed || 3);
    const moving = Math.min(1, s.speed / ref);
    s.phase += dist;
    const body = P.body as THREE.Object3D | undefined;

    switch (unit.type) {
      case 'scv': {
        for (const w of P.wheels as THREE.Object3D[]) w.rotation.x -= dist * 3.4;
        const working = unit.isGathering || unit.currentCommand?.type === 'repair';
        const drill = P.drill as THREE.Object3D | undefined;
        if (drill) drill.rotation.z += dt * (working ? 22 : 1.2);
        const boom = P.boom as THREE.Object3D | undefined;
        if (boom) boom.rotation.x = working ? Math.sin(s.t * 9) * 0.1 : boom.rotation.x * 0.9;
        const torch = P.torch as THREE.Object3D | undefined;
        if (torch) { const k = working ? 1.0 + Math.sin(s.t * 40) * 0.35 + Math.random() * 0.3 : 0.55; torch.scale.setScalar(k); }
        const bc = P.beacon as THREE.Object3D | undefined;
        if (bc) bc.scale.setScalar(0.6 + 0.7 * Math.max(0, Math.sin(s.t * 4)));
        if (body) {
          body.position.y = Math.abs(Math.sin(s.phase * 3.2)) * 0.02 * moving;
          body.rotation.x = -0.03 * moving;
          body.rotation.z = Math.sin(s.phase * 1.6) * 0.012 * moving;
        }
        break;
      }

      case 'marauder': {
        const heavy = false;
        const swing = Math.sin(s.phase * (heavy ? 1.45 : 1.9)) * (heavy ? 0.5 : 0.65) * moving;
        const legL = P.legL as THREE.Object3D | undefined, legR = P.legR as THREE.Object3D | undefined;
        if (legL) legL.rotation.x = swing;
        if (legR) legR.rotation.x = -swing;
        const torso = P.torso as THREE.Object3D | undefined;
        if (torso) {
          const breathe = Math.sin(s.t * (heavy ? 1.4 : 1.8)) * 0.012;
          torso.scale.y = 1 + breathe;
          torso.rotation.y = -swing * 0.22;
          torso.rotation.z = Math.sin(s.phase * (heavy ? 1.45 : 1.9) + Math.PI / 2) * 0.04 * moving;
        }
        const head = P.head as THREE.Object3D | undefined;
        if (head) head.rotation.y = s.aimTimer > 0 ? Math.max(-0.7, Math.min(0.7, angDiff(s.aimYaw, unit.rotation))) * 0.7 : head.rotation.y * 0.92;
        if (body) body.position.y = Math.abs(Math.sin(s.phase * (heavy ? 1.45 : 1.9))) * (heavy ? 0.05 : 0.035) * moving;
        const armL = P.armL as THREE.Object3D | undefined, armR = P.armR as THREE.Object3D | undefined;
        const aiming = s.aimTimer > 0 ? -0.18 : 0;
        const kickL = s.recoilSide === 0 ? s.recoil : 0, kickR = s.recoilSide === 1 ? s.recoil : 0;
        if (armL) { armL.rotation.x = aiming - swing * 0.18 - kickL * 0.28; armL.position.z = -kickL * 0.14; }
        if (armR) { armR.rotation.x = aiming + swing * 0.18 - kickR * 0.28; armR.position.z = -kickR * 0.14; }
        if (heavy) {
          // rotary barrels spin up while firing and wind down afterwards
          s.spin += ((s.aimTimer > 0 ? 18 : 0) - s.spin) * Math.min(1, dt * 5);
          const bl = P.barrelsL as THREE.Object3D | undefined, br = P.barrelsR as THREE.Object3D | undefined;
          if (bl) bl.rotation.z += dt * s.spin;
          if (br) br.rotation.z -= dt * s.spin;
          const core = P.core as THREE.Object3D | undefined;
          if (core) core.scale.setScalar(1 + Math.sin(s.t * 3.2) * 0.12 + s.recoil * 0.2);
        }
        break;
      }

      case 'siege_tank': {
        const spinWheels = dist * 3.2;
        for (const w of P.wheels as THREE.Object3D[]) w.rotation.x -= spinWheels;
        // tread cleats scroll along the track
        const off = (s.phase * 0.9) % 0.2375;
        const slide = (arr: THREE.Object3D[]) => arr.forEach((c, i) => { c.position.z = ((i * 0.2375 + off) % 1.9) - 0.95; });
        slide(P.cleatsL as THREE.Object3D[]); slide(P.cleatsR as THREE.Object3D[]);
        this.aimTurret(unit, s, dt, 5.5);
        const a = P.barrelA as THREE.Object3D | undefined, b = P.barrelB as THREE.Object3D | undefined;
        if (a) a.position.z = 0.15 - (s.recoilSide === 0 ? s.recoil : 0) * 0.35;
        if (b) b.position.z = 0.15 - (s.recoilSide === 1 ? s.recoil : 0) * 0.35;
        if (body) {
          body.position.y = Math.sin(s.phase * 5.0) * 0.012 * moving;
          body.rotation.x = -0.02 * moving + s.recoil * 0.015;
          body.rotation.z = Math.sin(s.phase * 2.3) * 0.012 * moving;
        }
        break;
      }

      case 'siege_tank_sieged': {
        this.aimTurret(unit, s, dt, 3.0);
        const a = P.barrelA as THREE.Object3D | undefined;
        if (a) a.position.z = 0.2 - s.recoil * 0.5;
        if (body) body.position.y = -s.recoil * 0.03;
        const light = P.light as THREE.Object3D | undefined;
        if (light) light.scale.setScalar(0.6 + 0.6 * Math.max(0, Math.sin(s.t * 3.5)));
        break;
      }

      case 'medivac':
      case 'banshee': {
        const rotors = P.rotors as THREE.Object3D[];
        if (unit.type === 'medivac') for (const r of rotors) r.rotation.y += dt * 30;
        if (body) {
          body.position.y = Math.sin(s.t * 2.1 + s.phase * 0.1) * 0.06;
          body.rotation.x = -Math.min(0.22, moving * 0.2) + Math.sin(s.t * 1.7) * 0.012;
          body.rotation.z = Math.max(-0.35, Math.min(0.35, -s.turn * 0.12)) + Math.sin(s.t * 1.3) * 0.014;
        }
        if (unit.type === 'medivac') {
          const tilt = -Math.min(0.5, moving * 0.45);
          const pl = P.podL as THREE.Object3D | undefined, pr = P.podR as THREE.Object3D | undefined;
          if (pl) pl.rotation.x = tilt;
          if (pr) pr.rotation.x = tilt;
          const cross = P.cross as THREE.Object3D | undefined;
          if (cross) cross.scale.setScalar(0.9 + 0.2 * Math.sin(s.t * 3.0));
        } else {
          const flir = P.flir as THREE.Object3D | undefined;
          if (flir) flir.rotation.y = s.aimTimer > 0 ? Math.max(-1.0, Math.min(1.0, angDiff(s.aimYaw, unit.rotation))) : Math.sin(s.t * 0.8) * 0.5;
          const pl = P.podL as THREE.Object3D | undefined, pr = P.podR as THREE.Object3D | undefined;
          if (pl) pl.position.z = 0.35 - (s.recoilSide === 0 ? s.recoil : 0) * 0.2;
          if (pr) pr.position.z = 0.35 - (s.recoilSide === 1 ? s.recoil : 0) * 0.2;
        }
        break;
      }
    }
  }

  /** Turn the turret toward the current target (or back to the hull heading when idle). */
  private static aimTurret(unit: any, s: AnimState, dt: number, rate: number) {
    const turret = s.p.turret as THREE.Object3D | undefined;
    if (!turret) return;
    const want = s.aimTimer > 0 ? angDiff(s.aimYaw, unit.rotation) : 0;
    const diff = angDiff(want, s.turretYaw);
    s.turretYaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
    turret.rotation.y = s.turretYaw;
  }
}
