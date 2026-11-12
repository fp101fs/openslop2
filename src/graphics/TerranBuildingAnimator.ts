import * as THREE from 'three';

/**
 * Procedural animation for completed Terran structures: pulsing status lights, bay doors that open when a unit
 * pops out, factory weld crane, starport chasing runway lights + radar, refinery pumpjack and flare, depot
 * ventilation hatches, defensive turret recoil and venting smokestacks while producing.
 * All parts are cached by name once per model.
 */

interface BState {
  t: number;
  phase: number;
  open: number;      // 0..1 bay door opening
  recoil: number;
  smokeTimer: number;
  parts: Record<string, THREE.Object3D | undefined>;
  stacks: THREE.Object3D[];
  inited: boolean;
}

const v = new THREE.Vector3();

export class TerranBuildingAnimator {
  private static state(mesh: THREE.Object3D): BState {
    let s = mesh.userData.bAnim as BState | undefined;
    if (!s) {
      s = { t: Math.random() * 20, phase: Math.random() * 6, open: 0, recoil: 0, smokeTimer: 0, parts: {}, stacks: [], inited: false };
      mesh.userData.bAnim = s;
    }
    if (!s.inited) {
      s.inited = true;
      const f = (n: string) => mesh.getObjectByName(n) || undefined;
      s.parts = {
        doorL: f('door_l'), doorR: f('door_r'), bayDoor: f('bay_door'), radar: f('radar'),
        hatchL: f('hatch_l'), hatchR: f('hatch_r'), flare: f('flare'), dome: f('dome'), pumpBeam: f('pump_beam'),
        crane: f('crane'), weld: f('weld'), barrelL: f('barrel_l'), barrelR: f('barrel_r'), podL: f('pod_l'), podR: f('pod_r')
      };
      mesh.traverse(o => { if (o.name === 'stack') s!.stacks.push(o); });
    }
    return s;
  }

  /** Kick weapon recoil (defensive structures). */
  public static triggerShoot(b: any) {
    if (!b.mesh) return;
    this.state(b.mesh).recoil = 1;
  }

  public static update(b: any, dt: number, world: any) {
    const mesh = b.mesh as THREE.Object3D | undefined;
    if (!mesh || !b.isConstructed || dt <= 0) return;
    const type: string = b.type;
    const s = this.state(mesh);
    const P = s.parts;
    s.t += dt;
    s.recoil = Math.max(0, s.recoil - dt * 4);
    const producing = b.queue && b.queue.length > 0;
    const prog = producing ? b.queue[0].progress : 0;

    // --- pulsing status lights (idle breathing, faster/brighter while producing) ---
    const glows = mesh.userData.glows as { mat: THREE.MeshBasicMaterial; base: THREE.Color; chase: number }[] | undefined;
    if (glows) {
      const idleK = 0.78 + 0.22 * Math.sin(s.t * 1.6 + s.phase);
      const busyK = 1.0 + 0.4 * Math.sin(s.t * 7 + s.phase);
      for (const g of glows) {
        let k = producing ? busyK : idleK;
        if (g.chase >= 0) k = 0.3 + 0.7 * Math.max(0, Math.sin(s.t * (producing ? 7 : 4) - g.chase * 1.3));
        g.mat.color.copy(g.base).multiplyScalar(k);
      }
    }

    // --- bay doors: open near unit completion, then close ---
    const wantOpen = producing && prog > 0.8 ? 1 : 0;
    s.open += (wantOpen - s.open) * Math.min(1, dt * 4);
    if (P.bayDoor) P.bayDoor.position.y = (type === 'barracks' ? 0.55 : 0.62) + s.open * 0.85;
    if (P.doorL) P.doorL.position.x = -(type === 'command_center' ? 0.36 : 0.33) - s.open * 0.34;
    if (P.doorR) P.doorR.position.x = (type === 'command_center' ? 0.36 : 0.33) + s.open * 0.34;

    // --- smokestack vents while producing ---
    if (producing && s.stacks.length && world?.particles) {
      s.smokeTimer -= dt;
      if (s.smokeTimer <= 0) {
        s.smokeTimer = 0.45;
        const st = s.stacks[Math.floor(Math.random() * s.stacks.length)]!;
        st.getWorldPosition(v);
        world.particles.spawnDamageSmoke({ x: v.x, y: v.y + 0.5, z: v.z }, false);
      }
    }

    switch (type) {
      case 'supply_depot': {
        // roof hatches slide apart briefly every few seconds to vent
        const cycle = (s.t % 7) / 7;
        const open = Math.max(0, Math.sin(cycle * Math.PI * 2 * 1.0 - 1.2)) ** 3 * 0.1;
        if (P.hatchL) P.hatchL.position.x = -0.4 - open;
        if (P.hatchR) P.hatchR.position.x = 0.4 + open;
        break;
      }
      case 'refinery': {
        if (P.pumpBeam) P.pumpBeam.rotation.z = Math.sin(s.t * 1.8) * 0.32;
        if (P.flare) P.flare.scale.set(1, 0.8 + Math.random() * 0.5 + Math.sin(s.t * 9) * 0.15, 1);
        if (P.dome) P.dome.scale.setScalar(1 + Math.sin(s.t * 1.4) * 0.012);
        break;
      }
      case 'factory': {
        if (P.crane) P.crane.rotation.y = producing ? Math.sin(s.t * 1.1) * 0.8 : P.crane.rotation.y * 0.96;
        if (P.weld) P.weld.scale.setScalar(producing ? 0.7 + Math.random() * 1.2 : 0.4);
        break;
      }
      case 'starport': {
        if (P.radar) P.radar.rotation.y += dt * (producing ? 3.4 : 1.4);
        break;
      }
      case 'bunker': {
        const kick = s.recoil * 0.12;
        if (P.barrelL) P.barrelL.position.z = 0.46 - kick;
        if (P.barrelR) P.barrelR.position.z = 0.46 - kick * 0.8;
        break;
      }
      case 'missile_turret': {
        const kick = s.recoil * 0.18;
        if (P.podL) P.podL.position.z = 0.08 - kick;
        if (P.podR) P.podR.position.z = 0.08 - kick;
        break;
      }
    }
  }
}
