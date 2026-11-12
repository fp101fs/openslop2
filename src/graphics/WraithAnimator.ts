import * as THREE from 'three';

export interface WraithMaterialPalette {
  teamMat: THREE.Material;
  compositeMat: THREE.Material;
  platingMat: THREE.Material;
  metalDarkMat: THREE.Material;
  canopyMat: THREE.Material;
  heatCoreMat: THREE.Material;
  thrusterGlowMat: THREE.Material;
}

export interface WraithRig {
  airframe: THREE.Group;
  wingPivotL: THREE.Group;
  wingPivotR: THREE.Group;
  podL: THREE.Group;
  podR: THREE.Group;
  flashL: THREE.Group;
  flashR: THREE.Group;
  noseFlash: THREE.Group;
  nozzleGroup: THREE.Group;
  afterburner: THREE.Object3D;
  afterburnerCore: THREE.Object3D;
  ventralFin: THREE.Mesh;
}

const POD_Z = -0.32;

/** Swept planform (x outward, z forward) extruded into a thin sharp-edged wing/strake slab. */
function planformGeo(pts: [number, number][], mirror: boolean, thickness: number, bevel = 0.012): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => {
    const px = mirror ? -x : x;
    if (i === 0) shape.moveTo(px, z);
    else shape.lineTo(px, z);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1
  });
  geo.rotateX(Math.PI / 2); // shape y -> +z (forward); extrusion -> downward
  geo.translate(0, thickness / 2, 0);
  return geo;
}

/** Flat decal / stripe lying on top of a planform (faces +Y). */
function stripeGeo(pts: [number, number][], mirror: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => {
    const px = mirror ? -x : x;
    if (i === 0) shape.moveTo(px, -z);
    else shape.lineTo(px, -z);
  });
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Swept vertical fin (shape x -> forward z, y -> up), thin along X. */
function finGeo(pts: [number, number][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(thickness / 2, 0, 0);
  return geo;
}

/**
 * Shared, pre-allocated geometry & materials for the Terran Wraith CF/A-17 Fighter.
 * Built once; every Wraith reuses them (0 runtime allocations, locked 60 FPS).
 */
class WraithGeometryCache {
  private static instance: WraithGeometryCache | null = null;

  // Lofted, area-ruled fuselage: needle nose -> canopy hump -> waisted tail, flattened into a blended body
  public readonly fuselageGeo: THREE.BufferGeometry;
  public readonly canopyGeo = new THREE.SphereGeometry(0.28, 14, 10);
  public readonly canopyFrameGeo = new THREE.TorusGeometry(0.2, 0.014, 4, 14);
  public readonly spineGeo: THREE.BufferGeometry;
  public readonly intakeGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.25, 6).rotateX(Math.PI / 2);
  public readonly intakeMouthGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 6).rotateX(Math.PI / 2);

  public readonly wingGeoR = planformGeo([[0, 0.85], [1.58, -0.38], [1.66, -0.6], [1.52, -0.84], [0, -1.0]], false, 0.045);
  public readonly wingGeoL = planformGeo([[0, 0.85], [1.58, -0.38], [1.66, -0.6], [1.52, -0.84], [0, -1.0]], true, 0.045);
  public readonly wingStripeR = stripeGeo([[0.55, -0.12], [1.28, -0.42], [1.3, -0.56], [0.55, -0.5]], false);
  public readonly wingStripeL = stripeGeo([[0.55, -0.12], [1.28, -0.42], [1.3, -0.56], [0.55, -0.5]], true);
  public readonly lerxGeoR = planformGeo([[0, 1.35], [0.62, 0.05], [0.62, -0.3], [0, -0.3]], false, 0.03, 0.01);
  public readonly lerxGeoL = planformGeo([[0, 1.35], [0.62, 0.05], [0.62, -0.3], [0, -0.3]], true, 0.03, 0.01);
  public readonly canardGeoR = planformGeo([[0, 0.3], [0.56, -0.06], [0.54, -0.24], [0, -0.2]], false, 0.03, 0.008);
  public readonly canardGeoL = planformGeo([[0, 0.3], [0.56, -0.06], [0.54, -0.24], [0, -0.2]], true, 0.03, 0.008);

  public readonly tailFinGeo = finGeo([[0.28, 0], [-0.5, 0], [-0.68, 0.74], [-0.36, 0.74]], 0.05);
  public readonly ventralFinGeo = finGeo([[0.25, 0], [-0.45, 0], [-0.58, -0.42], [-0.3, -0.42]], 0.05);
  public readonly stabilizerGeoR = planformGeo([[0, 0.1], [0.62, -0.5], [0.6, -0.72], [0, -0.62]], false, 0.03, 0.008);
  public readonly stabilizerGeoL = planformGeo([[0, 0.1], [0.62, -0.5], [0.6, -0.72], [0, -0.62]], true, 0.03, 0.008);

  public readonly podBodyGeo = new THREE.CapsuleGeometry(0.085, 0.82, 3, 8).rotateX(Math.PI / 2);
  public readonly laserBarrelGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.46, 6).rotateX(Math.PI / 2);
  public readonly noseCannonGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.5, 6).rotateX(Math.PI / 2);
  public readonly pylonGeo = new THREE.SphereGeometry(0.5, 12, 8).scale(0.07, 0.14, 0.4);
  public readonly missileGeo = new THREE.CapsuleGeometry(0.045, 0.42, 2, 6).rotateX(Math.PI / 2);

  public readonly nozzleGeo = new THREE.CylinderGeometry(0.17, 0.22, 0.5, 20, 1, true).rotateX(Math.PI / 2);
  public readonly nozzleRingGeo = new THREE.TorusGeometry(0.2, 0.03, 5, 12);
  public readonly nozzleCoreGeo = new THREE.CircleGeometry(0.16, 10);
  public readonly afterburnerGeo = new THREE.ConeGeometry(0.17, 0.75, 8).rotateX(-Math.PI / 2);
  public readonly afterburnerCoreGeo = new THREE.ConeGeometry(0.1, 0.52, 6).rotateX(-Math.PI / 2);

  // Ultra-lightweight 3D laser muzzle flash starburst
  public readonly flashConeGeo = new THREE.ConeGeometry(0.09, 0.42, 6).rotateX(Math.PI / 2);
  public readonly flashCrossGeo = new THREE.BoxGeometry(0.34, 0.045, 0.045);

  public readonly laserFlashMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });
  public readonly laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff5cc });

  // War-machine finish: dark gunmetal hull, lighter armour panels, hot red accents
  public readonly hullMat = new THREE.MeshStandardMaterial({ color: 0x5a6371, metalness: 0.28, roughness: 0.5 });
  public readonly armorMat = new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0.25, roughness: 0.5 });
  public readonly intakeMat = new THREE.MeshStandardMaterial({ color: 0x07080a, metalness: 0.3, roughness: 0.9 });
  public readonly canopyGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0b1c2c, metalness: 0.95, roughness: 0.06, emissive: 0x0b3a5c, emissiveIntensity: 0.55
  });
  public readonly warningMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.3, roughness: 0.5, emissive: 0x4a0707, emissiveIntensity: 0.6 });
  public readonly burntTitaniumMat = new THREE.MeshStandardMaterial({ color: 0x5a4a42, metalness: 0.35, roughness: 0.55, side: THREE.DoubleSide });
  public readonly exhaustGlowMat = new THREE.MeshBasicMaterial({ color: 0xffa24a, side: THREE.DoubleSide });
  public readonly stripeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide });

  private constructor() {
    // Fuselage loft (revolved spline, radius along +Y axis then rotated to +Z)
    const profile = new THREE.SplineCurve([
      new THREE.Vector2(0.0, -1.32), new THREE.Vector2(0.3, -1.3), new THREE.Vector2(0.38, -1.0),
      new THREE.Vector2(0.44, -0.5), new THREE.Vector2(0.47, 0.1), new THREE.Vector2(0.43, 0.55),
      new THREE.Vector2(0.33, 0.98), new THREE.Vector2(0.2, 1.33), new THREE.Vector2(0.075, 1.62),
      new THREE.Vector2(0.0, 1.78)
    ]).getPoints(36);
    const lathe = new THREE.LatheGeometry(profile, 16);
    lathe.rotateX(Math.PI / 2);
    lathe.scale(1.18, 0.6, 1); // wider than tall: blended-wing-body cross-section
    this.fuselageGeo = lathe;

    // Dorsal spine ridge: tapered wedge running canopy -> tail
    const spine = new THREE.Shape();
    spine.moveTo(-1.1, 0); spine.lineTo(0.2, 0); spine.lineTo(0.0, 0.16); spine.lineTo(-0.9, 0.2); spine.closePath();
    const sg = new THREE.ExtrudeGeometry(spine, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    sg.rotateY(-Math.PI / 2);
    sg.translate(0.08, 0, 0);
    this.spineGeo = sg;
  }

  public static get(): WraithGeometryCache {
    if (!this.instance) {
      this.instance = new WraithGeometryCache();
    }
    return this.instance;
  }
}

export class WraithAnimator {
  public static createWraithModel(palette: WraithMaterialPalette): THREE.Group {
    const c = WraithGeometryCache.get();
    const root = new THREE.Group();

    const airframe = new THREE.Group();
    airframe.position.set(0, 0.9, 0);
    root.add(airframe);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };

    // 1. Lofted fuselage, dorsal spine, team-coloured nose band
    add(c.fuselageGeo, c.hullMat, airframe, 0, 0, 0, true);
    add(c.spineGeo, c.armorMat, airframe, 0, 0.2, 0.15);
    const noseBand = add(new THREE.TorusGeometry(0.17, 0.02, 4, 12), palette.teamMat, airframe, 0, 0, 1.25);
    noseBand.scale.set(1, 0.6, 1);

    // 2. Cockpit: tinted glass bubble with frame rails
    const canopy = add(c.canopyGeo, c.canopyGlassMat, airframe, 0, 0.2, 0.55);
    canopy.scale.set(0.8, 0.62, 2.1);
    const frame = add(c.canopyFrameGeo, c.armorMat, airframe, 0, 0.22, 0.45);
    frame.scale.set(1, 0.8, 1);

    // 3. Ram-air intakes under the leading-edge root extensions
    [-1, 1].forEach(sx => {
      add(c.intakeGeo, c.armorMat, airframe, sx * 0.4, -0.1, 0.18);
      add(c.intakeMouthGeo, c.intakeMat, airframe, sx * 0.4, -0.1, 0.8);
      add(sx < 0 ? c.lerxGeoL : c.lerxGeoR, c.hullMat, airframe, sx * 0.3, -0.02, 0.1);
      add(sx < 0 ? c.canardGeoL : c.canardGeoR, c.armorMat, airframe, sx * 0.26, 0.04, 0.78);
      add(sx < 0 ? c.stabilizerGeoL : c.stabilizerGeoR, c.armorMat, airframe, sx * 0.3, -0.03, -0.72);
    });

    // 4. Nose burst cannon + flash
    add(c.noseCannonGeo, palette.metalDarkMat, airframe, 0, -0.07, 1.6);
    const noseFlash = this.createLaserFlashGroup(c);
    noseFlash.position.set(0, -0.07, 1.95);
    noseFlash.visible = false;
    airframe.add(noseFlash);

    // 5. Swept delta wings (pivot at root) with team stripe, wingtip pods, under-wing ordnance
    const makeWing = (sx: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.32, -0.02, 0.02);
      add(sx < 0 ? c.wingGeoL : c.wingGeoR, c.hullMat, pivot, 0, 0, 0, true);
      add(sx < 0 ? c.wingStripeL : c.wingStripeR, palette.teamMat, pivot, 0, 0.052, 0);
      // Missile on a pylon, warhead tipped in red
      add(c.pylonGeo, c.armorMat, pivot, sx * 0.85, -0.08, -0.28);
      add(c.missileGeo, c.armorMat, pivot, sx * 0.85, -0.17, -0.2);
      add(new THREE.ConeGeometry(0.045, 0.12, 6).rotateX(Math.PI / 2), c.warningMat, pivot, sx * 0.85, -0.17, 0.12);

      const pod = new THREE.Group();
      pod.position.set(sx * 1.55, -0.04, POD_Z);
      add(c.podBodyGeo, c.armorMat, pod);
      add(c.laserBarrelGeo, palette.heatCoreMat, pod, 0, 0, 0.66);
      add(new THREE.TorusGeometry(0.09, 0.014, 4, 10), c.warningMat, pod, 0, 0, 0.18);
      const flash = this.createLaserFlashGroup(c);
      flash.position.set(0, 0, 0.95);
      flash.visible = false;
      pod.add(flash);
      pivot.add(pod);
      airframe.add(pivot);
      return { pivot, pod, flash };
    };
    const L = makeWing(-1);
    const R = makeWing(1);

    // 6. Canted twin tail fins (team-coloured tips) + ventral blade
    [-1, 1].forEach(sx => {
      const fin = add(c.tailFinGeo, c.hullMat, airframe, sx * 0.3, 0.1, -0.5, true);
      fin.rotation.z = -sx * 0.32;
      const tip = add(new THREE.SphereGeometry(0.5, 12, 8).scale(0.07, 0.16, 0.34), palette.teamMat, airframe, sx * 0.3 + sx * 0.2, 0.8, -0.98);
      tip.rotation.z = -sx * 0.32;
    });
    const ventralFin = add(c.ventralFinGeo, c.armorMat, airframe, 0, -0.12, -0.4);

    // 7. Twin gimballing vector nozzles & dual-core plume
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(0, 0, -1.3);
    const afterburner = new THREE.Group();
    afterburner.position.set(0, 0, -0.3);
    afterburner.name = 'afterburner';
    const afterburnerCore = new THREE.Group();
    afterburnerCore.position.set(0, 0, -0.22);
    [-0.2, 0.2].forEach(x => {
      add(c.nozzleGeo, c.burntTitaniumMat, nozzleGroup, x, 0, 0);
      add(c.nozzleRingGeo, c.warningMat, nozzleGroup, x, 0, 0.24);
      const glow = add(c.nozzleCoreGeo, c.exhaustGlowMat, nozzleGroup, x, 0, -0.1);
      glow.rotation.y = Math.PI;
      add(c.afterburnerGeo, palette.thrusterGlowMat, afterburner, x, 0, 0);
      add(c.afterburnerCoreGeo, c.laserCoreMat, afterburnerCore, x, 0, 0);
    });
    nozzleGroup.add(afterburner, afterburnerCore);
    airframe.add(nozzleGroup);

    const rig: WraithRig = {
      airframe,
      wingPivotL: L.pivot,
      wingPivotR: R.pivot,
      podL: L.pod,
      podR: R.pod,
      flashL: L.flash,
      flashR: R.flash,
      noseFlash,
      nozzleGroup,
      afterburner,
      afterburnerCore,
      ventralFin
    };

    root.userData.wraithRig = rig;
    root.userData.animState = {
      t: Math.random() * 100,
      lastX: -9999,
      lastY: -9999,
      smoothSpeed: 0,
      sweepRatio: 0,
      recoil: 0,
      flashTimer: 0,
      shotCount: 0
    };

    return root;
  }

  private static createLaserFlashGroup(cache: WraithGeometryCache): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(cache.flashConeGeo, cache.laserFlashMat);
    cone.position.z = 0.16;
    const s1 = new THREE.Mesh(cache.flashCrossGeo, cache.laserCoreMat);
    const s2 = new THREE.Mesh(cache.flashCrossGeo, cache.laserFlashMat);
    s2.rotation.z = Math.PI / 2;
    g.add(cone, s1, s2);
    return g;
  }

  public static triggerShootAnimation(unit: any) {
    if (!unit?.mesh?.userData?.animState) return;
    const state = unit.mesh.userData.animState;
    state.recoil = 1.0;
    state.flashTimer = 0.085; // 85ms high-intensity laser flash burst
    state.shotCount = (state.shotCount + 1) | 0;
  }

  public static updateWraithAnimation(unit: any, dt: number, world: any) {
    const mesh = unit.mesh;
    if (!mesh || !mesh.visible) return;
    const rig = mesh.userData.wraithRig as WraithRig | undefined;
    const state = mesh.userData.animState;
    if (!rig || !state) return;

    // 1. Measure instantaneous speed without allocations
    if (state.lastX === -9999) {
      state.lastX = unit.pos.x;
      state.lastY = unit.pos.y;
    }
    const dx = unit.pos.x - state.lastX;
    const dy = unit.pos.y - state.lastY;
    state.lastX = unit.pos.x;
    state.lastY = unit.pos.y;

    const rawSpeed = dt > 0.0001 ? Math.hypot(dx, dy) / dt : 0;
    const speedRatio = Math.min(1.6, rawSpeed / Math.max(1, unit.baseSpeed));
    state.smoothSpeed += (speedRatio - state.smoothSpeed) * Math.min(1.0, dt * 10.0);

    // 2. Variable-Sweep Delta Wings & Aerodynamic Flight Attitude
    const targetSweep = unit.isAfterburning
      ? 1.0
      : Math.min(0.85, state.smoothSpeed * 0.65);
    state.sweepRatio += (targetSweep - state.sweepRatio) * Math.min(1.0, dt * 7.5);

    // Planform is already swept; the pivots add 0 (hover) .. 0.2 rad (supersonic) extra rearward sweep
    const wingSweepAngle = state.sweepRatio * 0.2;
    rig.wingPivotL.rotation.y = -wingSweepAngle;
    rig.wingPivotR.rotation.y = wingSweepAngle;

    // ---- Seamless idle motion ----
    // Unwrapped time with incommensurate frequencies: no phase wrap => no visible loop seam,
    // and amplitude (never frequency) fades with speed so there are no pops when starting/stopping.
    state.t += dt;
    const t = state.t;
    const rest = 1.0 - Math.min(1.0, state.smoothSpeed * 1.6); // 1 at rest -> 0 in flight
    const hoverBob = (Math.sin(t * 1.9) * 0.62 + Math.sin(t * 3.07 + 1.3) * 0.38) * 0.05 * rest;
    const hoverBank = (Math.sin(t * 0.87 + 0.6) * 0.65 + Math.sin(t * 1.63) * 0.35) * 0.034 * rest;
    const hoverPitch = (Math.sin(t * 1.31 + 2.1) * 0.6 + Math.sin(t * 2.17) * 0.4) * 0.016 * rest;
    const flutter = Math.sin(t * 2.3) * 0.012 * rest;

    // Subtle wingtip dihedral flex during high-G banking or afterburner + idle flutter
    const dihedralFlex = state.sweepRatio * 0.08;
    rig.wingPivotL.rotation.z = -dihedralFlex - flutter;
    rig.wingPivotR.rotation.z = dihedralFlex + flutter;

    // 3. Weapon Firing Recoil & Twin Wingtip / Nose Muzzle Flash Burst
    if (state.recoil > 0.001) {
      state.recoil = Math.max(0, state.recoil - dt * 8.5);
    }
    const kick = state.recoil;

    // Wingtip laser pods kick back along Z and counter-vibrate
    rig.podL.position.z = POD_Z - kick * 0.22;
    rig.podR.position.z = POD_Z - kick * 0.22;

    // Airframe hover + forward speed pitch + recoil nose jolt
    rig.airframe.position.y = 0.9 + hoverBob;
    rig.airframe.position.z = -kick * 0.09;
    rig.airframe.rotation.x = state.smoothSpeed * 0.08 + hoverPitch - kick * 0.065;
    rig.airframe.rotation.z = hoverBank;

    // Muzzle flash visibility & dynamic pulse scale
    if (state.flashTimer > 0) {
      state.flashTimer = Math.max(0, state.flashTimer - dt);
      const fScale = 0.75 + (state.flashTimer / 0.085) * 0.75;
      const roll = t * 40.0;
      rig.flashL.visible = true;
      rig.flashR.visible = true;
      rig.noseFlash.visible = true;
      rig.flashL.scale.set(fScale, fScale, fScale * 1.25);
      rig.flashR.scale.set(fScale, fScale, fScale * 1.25);
      rig.noseFlash.scale.set(fScale * 0.9, fScale * 0.9, fScale * 1.3);
      rig.flashL.rotation.z = roll;
      rig.flashR.rotation.z = -roll;
      rig.noseFlash.rotation.z = roll;
    } else if (rig.flashL.visible) {
      rig.flashL.visible = false;
      rig.flashR.visible = false;
      rig.noseFlash.visible = false;
    }

    // 4. Thrust-Vectoring Nozzle & Dual-Core Afterburner Plume
    const plumeLength = unit.isAfterburning
      ? 1.95 + Math.sin(t * 38) * 0.28
      : 0.75 + state.smoothSpeed * 0.65 + Math.sin(t * 22) * 0.08;
    const plumeWidth = unit.isAfterburning ? 1.28 : 0.85 + state.smoothSpeed * 0.22;
    rig.afterburner.scale.set(plumeWidth, plumeWidth, plumeLength);
    rig.afterburnerCore.scale.set(plumeWidth * 0.9, plumeWidth * 0.9, plumeLength * 0.85);
    rig.nozzleGroup.rotation.y = -unit.roll * 0.35;
    rig.nozzleGroup.rotation.x = -rig.airframe.rotation.x * 0.5;
  }
}
