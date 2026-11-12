import * as THREE from 'three';

/**
 * Procedural zergling animation for the sculpted rig (ZerglingModel.ts): a bounding gallop with a swaying spine, whipping
 * 4-segment tail, alternating hind legs and scything arms, a head that stays level; a lunge-and-snap on attack; and a
 * twitchy, breathing idle. Driven purely from the unit's measured motion, so it always matches ground speed.
 * All poses are offsets from the rig's rest pose (zero rotation), so they can be tuned independently of the mesh.
 */
interface ZState {
  t: number; phase: number; lastX: number; lastY: number; lastRot: number;
  speed: number; moving: number; turn: number; attack: number; inited: boolean;
  p: Record<string, THREE.Object3D | undefined>; tail: THREE.Object3D[]; bodyY: number; bodyZ: number;
  lod: THREE.LOD | null; level: number; rigs: Record<number, { p: Record<string, THREE.Object3D | undefined>; tail: THREE.Object3D[]; bodyY: number; bodyZ: number }>;
}

const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class ZerglingAnimator {
  private static state(mesh: THREE.Object3D, unit: any): ZState {
    let s = mesh.userData.zlAnim as ZState | undefined;
    if (!s) {
      s = { t: Math.random() * 20, phase: Math.random() * 6, lastX: unit.pos.x, lastY: unit.pos.y, lastRot: unit.rotation, speed: 0, moving: 0, turn: 0, attack: 0, inited: false, p: {}, tail: [], bodyY: 0, bodyZ: 0, lod: null, level: 0, rigs: {} };
      mesh.userData.zlAnim = s;
    }
    if (!s.inited) {
      s.inited = true;
      s.lod = mesh.userData.zlLod || (mesh.getObjectByProperty('isLOD', true) as THREE.LOD | undefined) || null;
      mesh.userData.zlLod = s.lod;
    }
    return s;
  }

  /** Joint lookup for one LOD level's rig (cached). Levels without joints (the static mesh) yield no body. */
  private static rig(s: ZState, level: number) {
    let r = s.rigs[level];
    if (!r) {
      const root = (s.lod?.userData.zlRigs as THREE.Object3D[] | undefined)?.[level];
      const f = (n: string) => root?.getObjectByName(n) || undefined;
      r = {
        p: {
          body: f('zl_body'), head: f('zl_head'), jaw: f('zl_jaw'),
          legL: f('zl_leg_l'), legR: f('zl_leg_r'), footL: f('zl_foot_l'), footR: f('zl_foot_r'),
          armL: f('zl_arm_l'), armR: f('zl_arm_r')
        },
        tail: [], bodyY: 0, bodyZ: 0
      };
      if (r.p.body) { r.bodyY = r.p.body.position.y; r.bodyZ = r.p.body.position.z; }
      for (let i = 0; i < 6; i++) { const t = f('zl_tail' + i); if (t) r.tail.push(t); }
      s.rigs[level] = r;
    }
    return r;
  }


  public static handles(type: string) { return type === 'zergling'; }

  /** Called when the zergling lands a hit: lunge, slash and snap. */
  public static triggerAttack(unit: any) {
    if (!unit.mesh || unit.type !== 'zergling') return;
    this.state(unit.mesh, unit).attack = 1;
  }

  public static update(unit: any, dt: number, _world: any) {
    const mesh = unit.mesh as THREE.Object3D | undefined;
    if (!mesh || unit.type !== 'zergling' || dt <= 0) return;
    const s = this.state(mesh, unit);
    s.t += dt;
    const dx = unit.pos.x - s.lastX, dy = unit.pos.y - s.lastY;
    const dist = Math.min(1.5, Math.hypot(dx, dy));
    s.lastX = unit.pos.x; s.lastY = unit.pos.y;
    s.speed += (dist / dt - s.speed) * Math.min(1, dt * 9);
    s.turn += ((angDiff(unit.rotation, s.lastRot) / dt) - s.turn) * Math.min(1, dt * 7);
    s.lastRot = unit.rotation;
    const ref = Math.max(1, unit.baseSpeed || 4);
    const targetMove = Math.min(1.25, s.speed / ref);
    s.moving += (targetMove - s.moving) * Math.min(1, dt * 10);
    const m = s.moving;
    s.attack = Math.max(0, s.attack - dt * 3.2);
    const a = s.attack, aw = Math.sin(Math.PI * (1 - a)) * (a > 0 ? 1 : 0); // 0 -> 1 -> 0 over the strike
    s.phase += dist * 4.4 + dt * 1.2 * (m < 0.05 ? 0 : 0);
    const ph = s.phase;
    const breathe = Math.sin(s.t * 2.4);

    // Only the LOD level that is showing gets posed (the static far level needs no animation)
    s.level = s.lod ? s.lod.getCurrentLevel() : 0;
    const R = this.rig(s, s.level);
    const P = R.p;
    if (!P.body) return;
    s.bodyY = R.bodyY; s.bodyZ = R.bodyZ; s.tail = R.tail;

    const rot = (o: THREE.Object3D | undefined, x: number, y: number, z: number) => { if (o) o.rotation.set(x, y, z); };

    // ---- body bounce (two peaks per stride), lunge on attack, lean into turns ----
    const body = P.body!;
    body.position.y = s.bodyY + 0.03 * Math.cos(ph * 2) * m + breathe * 0.004 - aw * 0.04;
    body.position.z = s.bodyZ + aw * 0.16;
    body.rotation.set(0.05 * Math.sin(ph * 2 + 0.6) * m + aw * 0.2, 0.05 * Math.sin(ph) * m, Math.max(-0.2, Math.min(0.2, -s.turn * 0.04)) + Math.sin(ph) * 0.03 * m);

    // head counter-rotates so the gaze stays steady, with idle look-around; jaw snaps on attack
    const look = (1 - Math.min(1, m * 2)) * Math.sin(s.t * 0.8) * 0.35;
    rot(P.head, -0.06 * Math.sin(ph * 2 + 1.0) * m + aw * 0.12 + breathe * 0.012, look * 0.5 - 0.05 * Math.sin(ph) * m, 0);
    if (P.jaw) P.jaw.rotation.x = 0.04 + 0.05 * Math.sin(ph * 2) * m + aw * 0.65 + (m < 0.1 ? 0.04 * Math.max(0, Math.sin(s.t * 1.3)) : 0);

    // ---- tail: wave lags behind the spine, whips harder with speed ----
    s.tail.forEach((seg, i) => {
      const lag = i * 0.8;
      seg.rotation.set(0.05 * Math.sin(ph * 2 - lag) * m + 0.015 * Math.sin(s.t * 1.7 + i * 0.5), (0.26 * m + 0.07) * Math.sin(ph - lag - 0.9) + Math.sin(s.t * 0.9 + i * 0.6) * 0.04, 0);
    });

    // ---- hind legs: alternating swing, foot counter-rotates and lifts while the leg recovers ----
    const leg = (hip: THREE.Object3D | undefined, foot: THREE.Object3D | undefined, p: number) => {
      const sw = Math.sin(p), recover = Math.max(0, -Math.cos(p));
      const a = 0.62 * sw * Math.min(1, m * 1.15) - aw * 0.22;
      if (hip) hip.rotation.set(a, 0, 0);
      if (foot) foot.rotation.set(-a * 0.7 - 0.35 * recover * Math.min(1, m * 1.2), 0, 0);
    };
    leg(P.legL, P.footL, ph);
    leg(P.legR, P.footR, ph + Math.PI);

    // ---- scythe arms: counter-swing the legs, sweep forward and rake on attack ----
    const arm = (sh: THREE.Object3D | undefined, p: number, side: number) => {
      const sw = Math.sin(p);
      if (sh) sh.rotation.set(-0.42 * sw * Math.min(1, m * 1.1) - aw * 0.95 + Math.sin(s.t * 1.6 + side) * 0.03, side * aw * 0.2, side * (0.04 + aw * 0.22));
    };
    arm(P.armL, ph + Math.PI, -1);
    arm(P.armR, ph, 1);
  }
}
