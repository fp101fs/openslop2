import { teamize, TEAM_HEX } from './TeamColor';
import { buildHoloboardModel } from './CampaignModels';
import { buildReactorModel, buildTechLabModel, buildPlanetaryArmor } from './AddonModels';
import * as THREE from 'three';
import { buildRigged, type RigKind } from './RiggedModels';
import { decorateViking } from './VikingAnimator';
import { UnitType, BuildingType } from '../types';
import { MarineAnimator } from './MarineAnimator';
import { WraithAnimator } from './WraithAnimator';
import { buildZergling } from './ZerglingModel';

/** Re-colour every mesh of `obj` (cloned materials): colour multiplier plus an emissive glow. */
function tintObject(obj: THREE.Object3D, mul: number, emissive: number) {
  obj.traverse(o => {
    const mm = o as THREE.Mesh;
    if (!mm.isMesh || !(mm.material as THREE.MeshStandardMaterial).color) return;
    const nm = (mm.material as THREE.MeshStandardMaterial).clone();
    nm.color.multiplyScalar(mul);
    if (nm.emissive) { nm.emissive = new THREE.Color(emissive); nm.emissiveIntensity = 0.5; }
    mm.material = nm;
  });
}

/** Units without their own model: [base rig, colour multiplier, emissive, scale]. */
const UNIT_ALIAS: Partial<Record<string, [RigKind, number, number, number]>> = {
  civilian: ['marine', 0.62, 0x241508, 0.85], // Liberation Day civilians: a smaller, dull brown Marine (no own model)
};

/** Structures without their own model: [base structure, colour multiplier, emissive, scale]. */
const BUILDING_ALIAS: Partial<Record<string, [BuildingType, number, number, number]>> = {};

export class ModelFactory {
  /** Structure yaw: -45 degrees (a diamond on screen). It was 135; flipped 180 so the models face the right way. */
  static readonly BUILDING_YAW = -Math.PI / 4;
  /** Yaw a placed structure's model is turned by (0 for the GLB buildings that are not rotated). */
  static yawFor(type: string): number {
    return ['refinery', 'spawning_pool', 'nexus', 'gateway', 'hatchery', 'hive', 'infestation_pit', 'extractor', 'hydralisk_den', 'spine_crawler', 'roach_warren', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'cybernetics_core', 'twilight_council', 'robotics_facility', 'robotics_bay', 'templar_archives', 'dark_shrine', 'fleet_beacon', 'shield_battery', 'pylon', 'assimilator', 'forge', 'photon_cannon', 'stargate', 'creep_tumor', 'nydus_worm'].includes(type) ? 0 : ModelFactory.BUILDING_YAW;
  }
  // Shared materials for optimal memory reuse and zero-allocation rendering
  private terranArmorMat: THREE.MeshStandardMaterial;
  private terranAccentMat: THREE.MeshStandardMaterial;
  private terranGlowMat: THREE.MeshBasicMaterial;
  private metalDarkMat: THREE.MeshStandardMaterial;
  
  // High-performance PBR textured materials
  public blueMetalTex: THREE.Texture;
  public blueCompositeTex: THREE.Texture;
  public hullPlatingTex: THREE.Texture;
  public industrialWornTex: THREE.Texture;
  public camoWashTex: THREE.Texture;

  public terranBlueArmorMat: THREE.MeshStandardMaterial;
  private gunMetalMat: THREE.MeshStandardMaterial;
  private turretMat: THREE.MeshStandardMaterial;
  private depotPanelMat: THREE.MeshStandardMaterial;
  private depotTrimMat: THREE.MeshStandardMaterial;
  private depotConcreteMat: THREE.MeshStandardMaterial;
  public terranCompositeMat: THREE.MeshStandardMaterial;
  public terranPlatingMat: THREE.MeshStandardMaterial;
  public terranIndustrialMat: THREE.MeshStandardMaterial;
  public terranCamoMat: THREE.MeshStandardMaterial;

  private zergCarapaceMat: THREE.MeshStandardMaterial;
  private zergFleshMat: THREE.MeshStandardMaterial;
  private zergGlowMat: THREE.MeshBasicMaterial;

  // Protoss ("Red Solaris — The East") shared materials
  private protossArmorMat: THREE.MeshStandardMaterial;
  private protossGoldMat: THREE.MeshStandardMaterial;
  private protossGlowMat: THREE.MeshBasicMaterial;
  private protossPsiBladeMat: THREE.MeshBasicMaterial;
  private enemyArmorMat: THREE.MeshStandardMaterial;

  private mineralMat: THREE.MeshStandardMaterial;
  private geyserMat: THREE.MeshStandardMaterial;

  // Dedicated high-fidelity SCV industrial materials
  private scvSteelMat: THREE.MeshStandardMaterial;
  private scvDarkMat: THREE.MeshStandardMaterial;
  private scvCanopyMat: THREE.MeshStandardMaterial;
  private scvHazardMat: THREE.MeshStandardMaterial;
  private scvWorkLightMat: THREE.MeshBasicMaterial;
  private scvHeatCoreMat: THREE.MeshBasicMaterial;
  private scvThrusterGlowMat: THREE.MeshBasicMaterial;

  constructor() {
    this.terranArmorMat = new THREE.MeshStandardMaterial({
      color: 0x3d5a80,
      metalness: 0.6,
      roughness: 0.4
    });

    this.terranAccentMat = new THREE.MeshStandardMaterial({
      color: 0x293241,
      metalness: 0.8,
      roughness: 0.3
    });

    this.terranGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    this.metalDarkMat = new THREE.MeshStandardMaterial({
      color: 0x1d1e24,
      metalness: 0.9,
      roughness: 0.5
    });

    this.zergCarapaceMat = new THREE.MeshStandardMaterial({
      color: 0x5a189a,
      metalness: 0.2,
      roughness: 0.6
    });

    this.zergFleshMat = new THREE.MeshStandardMaterial({
      color: 0x7b2cbf,
      metalness: 0.1,
      roughness: 0.8
    });

    this.zergGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00
    });

    this.mineralMat = new THREE.MeshStandardMaterial({
      color: 0x00b4d8,
      emissive: 0x0077b6,
      emissiveIntensity: 0.4,
      metalness: 0.3,
      roughness: 0.2
    });

    this.geyserMat = new THREE.MeshStandardMaterial({
      color: 0x2b9348,
      emissive: 0x007f5f,
      emissiveIntensity: 0.5,
      metalness: 0.2,
      roughness: 0.7
    });

    // Procedural Industrial Hazard Warning Stripes Texture (Black & Yellow)
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 128;
    hazardCanvas.height = 128;
    const hctx = hazardCanvas.getContext('2d')!;
    hctx.fillStyle = '#eab308'; // Amber yellow
    hctx.fillRect(0, 0, 128, 128);
    hctx.strokeStyle = '#0f172a'; // Deep charcoal black
    hctx.lineWidth = 18;
    for (let x = -128; x < 256; x += 32) {
      hctx.beginPath();
      hctx.moveTo(x, 0);
      hctx.lineTo(x + 128, 128);
      hctx.stroke();
    }
    const hazardTex = new THREE.CanvasTexture(hazardCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.wrapT = THREE.RepeatWrapping;

    // --- LOAD HIGH-PERFORMANCE 512x512 WEBP TEXTURES ---
    const texLoader = new THREE.TextureLoader();
    const loadTex = (url: string, repX = 1, repY = 1): THREE.Texture => {
      const tex = texLoader.load(url);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repX, repY);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 16;
      return tex;
    };

    this.blueMetalTex = loadTex('/textures/blue_metal.webp', 1, 1);
    this.blueCompositeTex = loadTex('/textures/blue_composite.webp', 1, 1);
    this.hullPlatingTex = loadTex('/textures/hull_plating.webp', 1, 1);
    this.industrialWornTex = loadTex('/textures/industrial_worn.webp', 1, 1);
    this.camoWashTex = loadTex('/textures/camo_wash.webp', 1, 1);

    // Terran Blue Powered Armor (Marines, Marauders, Command Center, Barracks)
    this.terranBlueArmorMat = new THREE.MeshStandardMaterial({
      map: this.blueMetalTex,
      color: 0xc8e4ff,
      metalness: 0.65,
      roughness: 0.35
    });

    // High-Tech Composite Panels (SCV cowl, Helmets, Bridge, Gantries)
    this.terranCompositeMat = new THREE.MeshStandardMaterial({
      map: this.blueCompositeTex,
      color: 0xf0f6ff,
      metalness: 0.55,
      roughness: 0.4
    });

    // Heavy Mechanical Structural Plating (Chassis, Sponsons, Weapons, Outriggers, Hangar doors)
    this.terranPlatingMat = new THREE.MeshStandardMaterial({
      map: this.hullPlatingTex,
      color: 0xdde4ec,
      metalness: 0.75,
      roughness: 0.38
    });

    // Readable (non-black) metals for guns, barrels and turret housings
    this.gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x6a7686, metalness: 0.3, roughness: 0.5 });
    this.turretMat = new THREE.MeshStandardMaterial({ map: this.hullPlatingTex, color: 0x9aa7b8, metalness: 0.3, roughness: 0.5 });

    // Light, clean Supply Depot palette
    this.depotPanelMat = new THREE.MeshStandardMaterial({ map: this.hullPlatingTex, color: 0xf2f6fb, metalness: 0.25, roughness: 0.5 });
    this.depotTrimMat = new THREE.MeshStandardMaterial({ map: this.hullPlatingTex, color: 0xc4d2e2, metalness: 0.4, roughness: 0.4 });
    this.depotConcreteMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.1, roughness: 0.85 });

    // Weathered Industrial Blast Plates (Skid plates, Foundations, Hoppers, Engine decks)
    this.terranIndustrialMat = new THREE.MeshStandardMaterial({
      map: this.industrialWornTex,
      color: 0x9e958c,
      metalness: 0.5,
      roughness: 0.55
    });

    // Camo Wash Accent (Secondary trims, crests)
    this.terranCamoMat = new THREE.MeshStandardMaterial({
      map: this.camoWashTex,
      color: 0xa8bccd,
      metalness: 0.4,
      roughness: 0.5
    });

    this.scvSteelMat = this.terranPlatingMat;
    this.scvDarkMat = this.terranIndustrialMat;

    this.scvCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.45,
      metalness: 0.2,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85
    });

    this.scvHazardMat = new THREE.MeshStandardMaterial({
      map: hazardTex,
      metalness: 0.3,
      roughness: 0.5
    });

    this.scvWorkLightMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb
    });

    this.scvHeatCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf97316
    });

    this.scvThrusterGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });

    // Protoss Solaris Materials (Crimson Armor, Golden Trim, Cyan Psionic Crystals)
    this.protossArmorMat = new THREE.MeshStandardMaterial({
      map: this.hullPlatingTex,
      color: 0xb91c1c,
      metalness: 0.72,
      roughness: 0.28
    });

    this.protossGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0x92400e,
      emissiveIntensity: 0.25,
      metalness: 0.88,
      roughness: 0.2
    });

    this.protossGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });

    this.protossPsiBladeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    this.enemyArmorMat = new THREE.MeshStandardMaterial({
      map: this.blueMetalTex,
      color: 0xee3333,
      metalness: 0.65,
      roughness: 0.4
    });
  }

  // Create 3D Mesh Group for a Unit
  public createUnitModel(type: UnitType, isPlayer: boolean = true): THREE.Group {
    const group = new THREE.Group();
    if (type === 'larva') { // models/larva.glb: one looping wriggle clip, driven by simulation/Larva.ts
      const rig = buildRigged('larva');
      if (rig) { teamize(rig, 'larva', isPlayer); group.add(rig); group.userData.rigged = rig.userData.rigged; group.userData.sized = true; return group; }
    }
    if (type === 'egg') {
      const rig = buildRigged('egg'); // models/egg.glb (Zerg Unit Pack); the primitive egg below is the fallback
      if (rig) { teamize(rig, 'egg', isPlayer); group.add(rig); group.userData.rigged = rig.userData.rigged ?? true; group.userData.sized = true; return group; }
      // leathery, slightly translucent Zerg egg with a darker mottled cap
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.55, metalness: 0.05, emissive: 0x3a2a14, emissiveIntensity: 0.35 }));
      body.name = 'egg'; body.scale.set(0.85, 1.15, 0.85); body.position.y = 0.6; body.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0x8a5a78, roughness: 0.7 }));
      cap.position.y = 0.28; cap.rotation.x = Math.PI; cap.scale.set(1, 0.7, 1);
      group.add(body, cap);
      return group;
    }
    if ((type as string) === 'mule') { // standalone models/mule.glb (falls through to the code-built MULE below if it isn't loaded)
      const rig = buildRigged('mule');
      if (rig) { group.add(rig); group.userData.sized = true; return group; }
    }
    // Skinned, animated models (Siege Tank, Thor, Goliath); the procedural models below are the fallback if they fail to load
    const rigKind: RigKind | null = type === 'siege_tank' || type === 'siege_tank_sieged' ? 'siege_tank' : (['thor', 'goliath', 'marine', 'medic', 'marauder', 'medivac', 'hellion', 'firebat', 'probe', 'banshee', 'hydralisk', 'drone', 'roach', 'scv', 'mutalisk', 'queen', 'zealot', 'archon', 'stalker', 'void_ray', 'baneling', 'ravager', 'ultralisk', 'broodlord', 'viper', 'reaper', 'liberator', 'raven', 'battlecruiser', 'ghost', 'cyclone', 'odin', 'overlord', 'swarm_host', 'immortal', 'colossus', 'carrier', 'tempest', 'adept', 'wraith', 'viking', 'widow_mine', 'auto_turret', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership', 'infestor', 'sentry', 'dominion_transport'] as string[]).includes(type) ? type as RigKind : type === 'dark_templar' || type === 'high_templar' ? 'zealot' : type === 'lurker' ? 'hydralisk' : type === 'overseer' ? 'overlord' : type === 'corruptor' ? 'mutalisk' : type === 'nova' ? 'nova' : type === 'hellbat' ? 'firebat' : type === 'vulture' ? 'hellion' : type === 'thor_ap' ? 'thor' : type === 'viking_assault' ? 'viking' : (UNIT_ALIAS[type]?.[0] ?? null);
    if (rigKind) {
      const rig = buildRigged(rigKind);
      // Units without their own model reuse a base rig with a distinct tint: [colour multiplier, emissive]
      const TINT: Record<string, [number, number]> = { dark_templar: [0.3, 0x3b1d6e], lurker: [0.55, 0x3a2410], overseer: [0.7, 0x0e3b52], corruptor: [0.55, 0x1c4a1c], high_templar: [0.8, 0x6d3fc0] };
      const alias = UNIT_ALIAS[type];
      const tint = TINT[type] ?? (alias ? [alias[1], alias[2]] as [number, number] : undefined);
      if (rig && tint) tintObject(rig, tint[0], tint[1]);
      if (rig && alias && alias[3] !== 1) rig.scale.multiplyScalar(alias[3]);
      if (rig) {
        teamize(rig, rigKind, isPlayer); group.add(rig); group.userData.rigged = rig.userData.rigged; group.userData.sized = true;
        if (rigKind === 'viking') decorateViking(group, rig, type === 'viking_assault'); // Assault Mode legs + Gatling cannon
        return group;
      }
    }
    const teamMat = isPlayer ? this.terranBlueArmorMat : this.enemyArmorMat;

    switch (type) {
      case 'scv': {
        // --- 1. LOWER ARMORED CHASSIS & BELLY SKID PLATE ---
        const skidPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.16, 20), this.scvDarkMat);
        skidPlate.position.set(0, 0.18, 0.05);
        skidPlate.castShadow = true;
        skidPlate.receiveShadow = true;
        group.add(skidPlate);

        // Front Protective Crash Bumper with Industrial Hazard Warning Stripes
        const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.15), this.scvHazardMat);
        frontBumper.position.set(0, 0.22, 0.65);
        frontBumper.castShadow = true;
        group.add(frontBumper);

        // Rear Bumper with Hazard Warning panel
        const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, 0.12), this.scvHazardMat);
        rearBumper.position.set(0, 0.24, -0.55);
        rearBumper.castShadow = true;
        group.add(rearBumper);

        // --- 2. HIGH-TECH ALL-TERRAIN CATERPILLAR TREAD UNITS ---
        [-0.58, 0.58].forEach((xSide) => {
          // Angular Sloped Track Sponson Frame
          const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 1.25), this.scvDarkMat);
          sponson.position.set(xSide, 0.25, 0.05);
          sponson.castShadow = true;
          group.add(sponson);

          // Outer Armored Ballistic Mudguard Shell (Team Color Armor)
          const mudguard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 1.28), teamMat);
          mudguard.position.set(xSide + (xSide > 0 ? 0.1 : -0.1), 0.35, 0.05);
          mudguard.castShadow = true;
          group.add(mudguard);

          // Visible Road Wheels inside treads
          [-0.42, 0, 0.42].forEach((zWheel) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 10), this.scvSteelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.name = 'wheel';
            wheel.position.set(xSide, 0.16, zWheel + 0.05);
            group.add(wheel);
          });

          // Hydraulic Shock Damper Strut connecting tread to chassis
          const shockStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 6), this.scvSteelMat);
          shockStrut.rotation.z = xSide > 0 ? -0.4 : 0.4;
          shockStrut.position.set(xSide * 0.72, 0.42, 0.05);
          group.add(shockStrut);
        });

        // --- 3. SLEEK ANGULAR COCKPIT POD & CANOPY ---
        // Faceted Angular Command Pod (Hexagonal low-drag profile) with Composite Tech Plating
        const podGeo = new THREE.CylinderGeometry(0.42, 0.52, 0.55, 6);
        const pod = new THREE.Mesh(podGeo, this.terranCompositeMat);
        pod.rotation.y = Math.PI / 6; // Orient flat face forward
        pod.position.set(0, 0.65, 0.08);
        pod.castShadow = true;
        group.add(pod);

        // Forward-Raked High-Tech Visor Canopy (Faceted cyan holographic glass)
        const canopyGeo = new THREE.CylinderGeometry(0.3, 0.38, 0.34, 6);
        const canopy = new THREE.Mesh(canopyGeo, this.scvCanopyMat);
        canopy.rotation.y = Math.PI / 6;
        canopy.position.set(0, 0.75, 0.24);
        group.add(canopy);

        // Interior Holographic HUD Core (Visible through glass)
        const hudCore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), this.terranGlowMat);
        hudCore.position.set(0, 0.72, 0.25);
        group.add(hudCore);

        // Titanium Reinforced Roll Cage framing the cockpit
        const rollBarL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), this.scvSteelMat);
        rollBarL.rotation.x = -0.3;
        rollBarL.position.set(-0.35, 0.78, 0.12);
        const rollBarR = rollBarL.clone();
        rollBarR.position.x = 0.35;
        group.add(rollBarL, rollBarR);

        const rollBarCross = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), this.scvSteelMat);
        rollBarCross.rotation.z = Math.PI / 2;
        rollBarCross.position.set(0, 0.98, 0.05);
        group.add(rollBarCross);

        // Dual Roof Work Floodlights
        [-0.22, 0.22].forEach((xLight) => {
          const housing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), this.scvDarkMat);
          housing.position.set(xLight, 0.96, 0.28);
          const lens = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), this.scvWorkLightMat);
          lens.position.set(xLight, 0.96, 0.35);
          group.add(housing, lens);
        });

        // Telemetry Comms Antenna with warning light beacon
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4), this.scvSteelMat);
        antenna.position.set(-0.32, 1.15, -0.22);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this.scvHeatCoreMat);
        beacon.position.set(-0.32, 1.38, -0.22);
        beacon.name = 'beacon';
        group.add(antenna, beacon);

        // --- 4. RIGHT ARM: ARTICULATED TUNGSTEN CORE ROTARY DRILL ---
        // Articulated Shoulder Actuator Turret
        const drillShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.scvSteelMat);
        drillShoulder.position.set(0.58, 0.58, 0.25);
        drillShoulder.castShadow = true;
        group.add(drillShoulder);

        // Hydraulic Upper Arm Boom
        const drillBoom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.42), this.scvDarkMat);
        drillBoom.position.set(0.62, 0.58, 0.48);
        drillBoom.name = 'arm_drill';
        drillBoom.castShadow = true;
        group.add(drillBoom);

        // Hydraulic Piston Cylinder
        const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 6), this.scvSteelMat);
        piston.rotation.x = Math.PI / 2;
        piston.position.set(0.56, 0.68, 0.46);
        group.add(piston);

        // High-Torque Gearbox & Heat Radiator Housing
        const drillGearbox = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.32, 8), this.scvDarkMat);
        drillGearbox.rotation.x = Math.PI / 2;
        drillGearbox.position.set(0.62, 0.58, 0.76);
        drillGearbox.castShadow = true;

        // Internal Amber Heat Dissipation Core
        const heatCore = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 6), this.scvHeatCoreMat);
        heatCore.rotation.x = Math.PI / 2;
        heatCore.position.set(0.62, 0.58, 0.76);

        // Heavy Spiral Diamond Core Drill Bit
        const drillBit = new THREE.Group();
        drillBit.position.set(0.62, 0.58, 1.12);
        drillBit.name = 'drill';
        const drillCone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 6), this.scvSteelMat);
        drillCone.rotation.x = Math.PI / 2;
        drillCone.castShadow = true;
        drillBit.add(drillCone);
        for (let f = 0; f < 3; f++) {
          const flute = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.34), this.scvDarkMat);
          const fa = (f * Math.PI * 2) / 3;
          flute.position.set(Math.cos(fa) * 0.09, Math.sin(fa) * 0.09, 0.02);
          flute.rotation.z = fa;
          drillBit.add(flute);
        }
        group.add(drillGearbox, heatCore, drillBit);

        // --- 5. LEFT ARM: FUSION PLASMA TORCH & MAGNETIC SALVAGE CLAW ---
        // Articulated Shoulder Turret
        const torchShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.scvSteelMat);
        torchShoulder.position.set(-0.58, 0.58, 0.25);
        torchShoulder.castShadow = true;
        group.add(torchShoulder);

        // Utility Forearm Boom
        const torchBoom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.38), this.scvDarkMat);
        torchBoom.position.set(-0.62, 0.58, 0.46);
        torchBoom.castShadow = true;
        group.add(torchBoom);

        // Insulated Heavy Plasma Cutter Nozzle
        const torchHead = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 8), this.scvDarkMat);
        torchHead.rotation.x = Math.PI / 2;
        torchHead.position.set(-0.62, 0.58, 0.72);

        // High-Intensity Cyan Plasma Emitter
        const plasmaEmitter = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.15), this.terranGlowMat);
        plasmaEmitter.position.set(-0.62, 0.58, 0.88);
        plasmaEmitter.name = 'torch_glow';

        // Dual Magnetic Claw Pincers (mounted below torch nozzle)
        [-0.08, 0.08].forEach((xPincer) => {
          const claw = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.24), this.scvSteelMat);
          claw.position.set(-0.62 + xPincer, 0.48, 0.82);
          group.add(claw);
        });
        group.add(torchHead, plasmaEmitter);

        // --- 6. REAR PROPULSION & CARGO STORAGE BED ---
        // Rear Engine Block
        const engineCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.6, 16), teamMat);
        engineCowl.position.set(0, 0.54, -0.32);
        engineCowl.castShadow = true;
        group.add(engineCowl);

        // Dual Turbofan / Micro-Fusion Thruster Exhausts
        [-0.24, 0.24].forEach((xNacelle) => {
          const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.24, 8), this.scvDarkMat);
          exhaust.rotation.x = Math.PI / 2;
          exhaust.position.set(xNacelle, 0.52, -0.56);

          const thrusterGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8), this.scvThrusterGlowMat);
          thrusterGlow.rotation.x = Math.PI / 2;
          thrusterGlow.position.set(xNacelle, 0.52, -0.66);
          group.add(exhaust, thrusterGlow);
        });

        // Magnetic Cargo Rack Brackets (Holds Mineral Crystals & Gas Canisters)
        const cargoRackL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.32), this.scvSteelMat);
        cargoRackL.position.set(-0.28, 0.72, -0.32);
        const cargoRackR = cargoRackL.clone();
        cargoRackR.position.x = 0.28;
        group.add(cargoRackL, cargoRackR);

        break;
      }

      case 'marine': {
        return MarineAnimator.createMarineModel({
          teamMat,
          compositeMat: this.terranCompositeMat,
          platingMat: this.terranPlatingMat,
          industrialMat: this.terranIndustrialMat,
          metalDarkMat: this.metalDarkMat,
          glowMat: this.terranGlowMat,
          visorGlassMat: this.scvCanopyMat,
          heatCoreMat: this.scvHeatCoreMat,
          thrusterGlowMat: this.scvThrusterGlowMat
        });
      }

      case 'marauder': {
        // Articulated Marauder: hip-pivoted legs, swaying torso, independently recoiling shoulder grenade launchers
        const body = new THREE.Group(); body.name = 'body'; group.add(body);
        const torsoG = new THREE.Group(); torsoG.name = 'torso'; torsoG.position.y = 0.8; body.add(torsoG);
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.4, 0.82, 16), teamMat);
        torso.scale.z = 0.8; torso.castShadow = true;
        const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.04), this.terranGlowMat);
        chestGlow.position.set(0, 0.12, 0.36);
        const backpack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.6, 12), this.terranPlatingMat);
        backpack.position.set(0, 0.05, -0.46);
        torsoG.add(torso, chestGlow, backpack);
        const headG = new THREE.Group(); headG.name = 'head'; headG.position.set(0, 0.45, 0); torsoG.add(headG);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), this.terranCompositeMat);
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.1), this.terranGlowMat);
        slit.position.set(0, 0, 0.2);
        headG.add(head, slit);
        for (const side of [-1, 1]) {
          const legG = new THREE.Group(); legG.name = side < 0 ? 'leg_l' : 'leg_r'; legG.position.set(side * 0.35, 0.65, 0);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.65, 14), this.terranPlatingMat);
          leg.position.y = -0.325; leg.castShadow = true;
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.16, 14), this.gunMetalMat);
          foot.position.set(0, -0.58, 0.08);
          legG.add(leg, foot); body.add(legG);

          const armG = new THREE.Group(); armG.name = side < 0 ? 'arm_l' : 'arm_r'; armG.position.set(side * 0.6, 0.98, 0.05);
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), teamMat);
          const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.7, 14), this.terranPlatingMat); gun.rotation.x = Math.PI / 2;
          gun.position.set(0, -0.18, 0.4); gun.castShadow = true;
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.32, 8), this.gunMetalMat);
          tube.rotation.x = Math.PI / 2; tube.position.set(0, -0.18, 0.88);
          const muzzleNode = new THREE.Object3D(); muzzleNode.name = side < 0 ? 'muzzle_l' : 'muzzle_r'; muzzleNode.position.set(0, -0.18, 1.06);
          armG.add(pad, gun, tube, muzzleNode); body.add(armG);
        }
        break;
      }
      case 'siege_tank': {
        // Tracked tank: scrolling tread cleats, spinning road wheels, aiming turret with recoiling twin cannons
        const body = new THREE.Group(); body.name = 'body'; group.add(body);
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 1.8), teamMat);
        chassis.position.y = 0.35; chassis.castShadow = true;
        body.add(chassis);
        for (const side of [-1, 1]) {
          const tread = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 1.9), this.gunMetalMat);
          tread.position.set(side * 0.95, 0.25, 0); body.add(tread);
          for (let i = 0; i < 8; i++) {
            const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.11), this.gunMetalMat);
            cleat.name = side < 0 ? 'cleat_l_' + i : 'cleat_r_' + i;
            cleat.position.set(side * 0.95, 0.46, ((i * 0.2375) % 1.9) - 0.95);
            body.add(cleat);
          }
          for (let w = 0; w < 4; w++) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 10), this.scvSteelMat);
            wheel.name = 'wheel';
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(side * 0.95, 0.22, -0.7 + w * 0.47);
            body.add(wheel);
          }
        }
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 0.6, 0);
        const turretBase = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.turretMat); turretBase.scale.y = 0.55; turretBase.position.y = -0.18;
        turretBase.castShadow = true;
        const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), this.terranCompositeMat);
        hatch.position.set(-0.25, 0.24, -0.2);
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), this.scvSteelMat);
        antenna.position.set(0.4, 0.55, -0.4);
        turret.add(turretBase, hatch, antenna);
        [['a', -0.2], ['b', 0.2]].forEach(([id, x]) => {
          const barrel = new THREE.Group(); barrel.name = 'barrel_' + id; barrel.position.set(x as number, 0.15, 0.15);
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8), this.gunMetalMat);
          tube.rotation.x = Math.PI / 2; tube.position.z = 0.65;
          const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8), this.turretMat);
          brake.rotation.x = Math.PI / 2; brake.position.z = 1.28;
          const muzzleNode = new THREE.Object3D(); muzzleNode.name = 'muzzle_' + id; muzzleNode.position.set(0, 0, 1.4);
          barrel.add(tube, brake, muzzleNode);
          turret.add(barrel);
        });
        body.add(turret);
        // Sculpted hull: sloped glacis wedge, rear engine drums, armoured side skirts, commander cupola, gun mantlet
        const glacis = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.78, 0.5, 4, 1), teamMat);
        glacis.rotation.set(0, Math.PI / 4, Math.PI / 2); glacis.scale.set(1, 1.45, 0.85); glacis.position.set(0, 0.42, 0.88); glacis.castShadow = true; body.add(glacis);
        for (const sd of [-1, 1]) {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 16), this.gunMetalMat);
          drum.rotation.z = Math.PI / 2; drum.position.set(sd * 0.32, 0.72, -0.85); drum.castShadow = true; body.add(drum);
          const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 4, 1), teamMat);
          skirt.rotation.x = Math.PI / 2; skirt.scale.set(0.5, 1, 0.45); skirt.position.set(sd * 1.08, 0.52, 0); body.add(skirt);
        }
        const cupola = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), this.terranCompositeMat);
        cupola.position.set(0, 0.5, -0.1); turret.add(cupola);
        const mantlet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), this.turretMat);
        mantlet.scale.set(1.3, 0.8, 0.9); mantlet.position.set(0, 0.15, 0.45); mantlet.castShadow = true; turret.add(mantlet);
        break;
      }
      case 'siege_tank_sieged': {
        // Deployed tank: stabiliser legs, big shock cannon that recoils, blinking targeting light
        const body = new THREE.Group(); body.name = 'body'; group.add(body);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.8), teamMat);
        base.position.y = 0.2; base.castShadow = true;
        body.add(base);
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2 + Math.PI / 4;
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 1.2), this.gunMetalMat);
          leg.position.set(Math.cos(angle) * 1.3, 0.15, Math.sin(angle) * 1.3);
          leg.rotation.y = -angle;
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 8), this.gunMetalMat);
          foot.position.set(Math.cos(angle) * 1.62, 0.05, Math.sin(angle) * 1.62);
          body.add(leg, foot);
        }
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 0.5, 0);
        const turretDome = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 8), this.turretMat);
        turretDome.castShadow = true;
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), this.scvHeatCoreMat);
        light.name = 'status_light'; light.position.set(0.5, 0.32, -0.4);
        turret.add(turretDome, light);
        const barrel = new THREE.Group(); barrel.name = 'barrel_a'; barrel.position.set(0, 0.3, 0.2); barrel.rotation.x = -0.1;
        const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.4, 8), this.gunMetalMat);
        shock.rotation.x = Math.PI / 2; shock.position.z = 1.2;
        const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.4), this.turretMat);
        muzzleBrake.position.set(0, 0, 2.4);
        const muzzleNode = new THREE.Object3D(); muzzleNode.name = 'muzzle_a'; muzzleNode.position.set(0, 0, 2.65);
        barrel.add(shock, muzzleBrake, muzzleNode);
        turret.add(barrel);
        body.add(turret);
        break;
      }
      case 'medivac': {
        // Dropship: ducted spinning rotors on tilting thruster pods, pulsing heal cross
        const body = new THREE.Group(); body.name = 'body'; group.add(body);
        const hull = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.2, 24), teamMat);
        hull.rotation.x = Math.PI / 2; hull.position.y = 1.0; hull.castShadow = true;
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), this.scvCanopyMat); canopy.scale.set(0.9, 0.6, 1.2);
        canopy.position.set(0, 1.18, 0.45);
        const wing = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 10), this.terranPlatingMat); wing.scale.set(1, 0.1, 0.5);
        wing.position.set(0, 1.0, -0.15);
        body.add(hull, canopy, wing);
        [-1, 1].forEach(side => {
          const podG = new THREE.Group(); podG.name = side < 0 ? 'pod_l' : 'pod_r'; podG.position.set(side * 1.15, 1.0, -0.15);
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.95, 8), this.gunMetalMat);
          pod.rotation.x = Math.PI / 2;
          const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8), this.scvThrusterGlowMat);
          glow.rotation.x = Math.PI / 2; glow.position.z = -0.5;
          const duct = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 14), this.terranPlatingMat);
          duct.rotation.x = Math.PI / 2; duct.position.y = 0.3;
          const rotor = new THREE.Group(); rotor.name = side < 0 ? 'rotor_l' : 'rotor_r'; rotor.position.y = 0.3;
          for (let b = 0; b < 3; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.08), this.scvThrusterGlowMat);
            blade.rotation.y = (b * Math.PI) / 3;
            rotor.add(blade);
          }
          podG.add(pod, glow, duct, rotor);
          body.add(podG);
        });
        const cross = new THREE.Group(); cross.name = 'cross'; cross.position.set(0, 1.48, -0.2);
        const crossMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.18), crossMat), new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.6), crossMat));
        body.add(cross);
        break;
      }
      case 'wraith': {
        return WraithAnimator.createWraithModel({
          teamMat,
          compositeMat: this.terranCompositeMat,
          platingMat: this.terranPlatingMat,
          metalDarkMat: this.metalDarkMat,
          canopyMat: this.scvCanopyMat,
          heatCoreMat: this.scvHeatCoreMat,
          thrusterGlowMat: this.scvThrusterGlowMat
        });
      }

      case 'banshee': {
        // ============================================================
        // TERRAN BANSHEE VTOL ATTACK HELICOPTER GUNSHIP
        // ============================================================
        // Armored Gunship Fuselage Spine
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.7, 8, 20), teamMat); body.rotation.x = Math.PI / 2; body.scale.set(1.2, 1, 0.75);
        body.position.set(0, 0.95, 0.05);
        body.castShadow = true;
        group.add(body);

        // Sloped Tandem Gunner / Pilot Canopy
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), this.scvCanopyMat); canopy.scale.set(0.85, 0.55, 1.2);
        canopy.position.set(0, 1.12, 0.58);
        canopy.rotation.x = 0.18;
        group.add(canopy);

        // Under-nose Targeting FLIR Turret & Twin Backlash Rocket Pods
        const flir = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.metalDarkMat);
        flir.position.set(0, 0.68, 0.95);
        flir.name = 'flir';
        group.add(flir);

        [-0.58, 0.58].forEach(xSide => {
          const podG = new THREE.Group();
          podG.name = xSide < 0 ? 'pod_l' : 'pod_r';
          podG.position.set(xSide, 0.78, 0.35);
          const rocketPod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.85, 8), this.terranPlatingMat);
          rocketPod.rotation.x = Math.PI / 2;
          const muzzleNode = new THREE.Object3D();
          muzzleNode.name = xSide < 0 ? 'muzzle_l' : 'muzzle_r';
          muzzleNode.position.set(0, 0, 0.5);
          podG.add(rocketPod, muzzleNode);
          group.add(podG);
        });

        // Twin Ducted Tilt-Rotor Nacelles with Spinning Rotor Blades
        [-1.25, 1.25].forEach((xRotor, idx) => {
          const strut = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 0.36), this.terranPlatingMat);
          strut.position.set(xRotor * 0.55, 1.05, -0.05);
          const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.24, 12), this.metalDarkMat);
          duct.position.set(xRotor, 1.08, -0.05);

          const rotorGroup = new THREE.Group();
          rotorGroup.position.set(xRotor, 1.16, -0.05);
          rotorGroup.name = idx === 0 ? 'rotor_l' : 'rotor_r';
          const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.03, 0.12), this.scvThrusterGlowMat);
          const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.96), this.scvThrusterGlowMat);
          rotorGroup.add(blade1, blade2);

          group.add(strut, duct, rotorGroup);
        });

        // Twin Boom Tail Stabilizer
        const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 1.1), this.terranPlatingMat);
        tailBoom.position.set(0, 1.02, -1.25);
        const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.32), teamMat);
        tailWing.position.set(0, 1.22, -1.65);
        group.add(tailBoom, tailWing);
        break;
      }

      // --- ZERG FORCES ---
      case 'hellion': {
        // Fast flame buggy: low armoured chassis, cab, fat rear wheels, forward flame nozzle
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.BoxGeometry(0.8, 0.28, 1.5), teamMat, 0, 0.42, 0);
        part(new THREE.BoxGeometry(0.62, 0.3, 0.62), this.scvDarkMat, 0, 0.7, -0.15);
        part(new THREE.BoxGeometry(0.5, 0.14, 0.1), this.scvCanopyMat, 0, 0.78, 0.2);
        for (const sd of [-1, 1]) {
          part(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), this.gunMetalMat, sd * 0.5, 0.3, -0.5, 1, 1, 1, 0, Math.PI / 2);
          part(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12), this.gunMetalMat, sd * 0.46, 0.2, 0.55, 1, 1, 1, 0, Math.PI / 2);
        }
        part(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 10), this.metalDarkMat, 0, 0.5, 0.95, 1, 1, 1, Math.PI / 2, 0);
        part(new THREE.SphereGeometry(0.1, 8, 8), this.terranGlowMat, 0, 0.5, 1.32);
        break;
      }

      case 'thor': {
        // Colossal assault walker: stompy legs, armoured torso, twin shoulder cannons
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        for (const sd of [-1, 1]) {
          part(new THREE.BoxGeometry(0.55, 0.3, 0.9), this.gunMetalMat, sd * 0.55, 0.15, 0.1);       // foot
          part(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 10), this.scvDarkMat, sd * 0.55, 0.8, 0.05); // leg
          part(new THREE.BoxGeometry(0.5, 0.5, 0.55), teamMat, sd * 0.55, 1.4, 0);                  // hip armour
          part(new THREE.BoxGeometry(0.4, 0.4, 0.5), teamMat, sd * 1.05, 2.2, 0);                    // shoulder
          part(new THREE.CylinderGeometry(0.1, 0.12, 1.3, 10), this.metalDarkMat, sd * 1.1, 2.35, 0.75, 1, 1, 1, Math.PI / 2, 0); // cannon
          part(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 8), this.scvDarkMat, sd * 0.95, 1.7, 0.1, 1, 1, 1, 0, 0.2); // arm
        }
        part(new THREE.BoxGeometry(1.4, 1.1, 0.9), teamMat, 0, 1.95, 0);                             // torso
        part(new THREE.BoxGeometry(0.9, 0.4, 0.5), this.terranCompositeMat, 0, 1.5, 0.15);          // belly
        part(new THREE.BoxGeometry(0.55, 0.45, 0.55), this.scvDarkMat, 0, 2.75, 0.05);              // head
        part(new THREE.BoxGeometry(0.4, 0.1, 0.1), this.terranGlowMat, 0, 2.78, 0.33);              // visor
        break;
      }

      case 'mule': {
        // Orbital MULE: boxy hauler with a mining drill and cargo bed
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.BoxGeometry(0.7, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.4 }), 0, 0.45, 0);
        part(new THREE.BoxGeometry(0.55, 0.25, 0.4), this.scvDarkMat, 0, 0.72, -0.2);
        part(new THREE.ConeGeometry(0.16, 0.5, 8), this.gunMetalMat, 0, 0.45, 0.65, 1, 1, 1, Math.PI / 2, 0);
        for (const sd of [-1, 1]) part(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), this.gunMetalMat, sd * 0.42, 0.2, 0, 1, 1, 1, 0, Math.PI / 2);
        break;
      }

      case 'queen': {
        // Hive queen: armoured abdomen, crested thorax, translucent wings, long head crest
        const C = this.zergCarapaceMat, F = this.zergFleshMat, G = this.zergGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.SphereGeometry(0.55, 18, 14), F, 0, 0.7, -0.55, 0.9, 0.85, 1.5);             // abdomen
        for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.5 - i * 0.04, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C, 0, 0.95, -0.2 - i * 0.45, 1, 0.5, 0.5); // plates
        part(new THREE.SphereGeometry(0.38, 14, 12), C, 0, 1.0, 0.35, 1, 1, 1.1);                    // thorax
        part(new THREE.SphereGeometry(0.28, 14, 12), C, 0, 1.45, 0.65, 1, 1.1, 1);                   // head
        part(new THREE.ConeGeometry(0.2, 0.9, 6), C, 0, 1.7, 0.2, 1, 1, 1, -0.9, 0);                 // crest
        for (const sd of [-1, 1]) {
          part(new THREE.SphereGeometry(0.05, 8, 8), G, sd * 0.12, 1.5, 0.88);
          const w = part(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshStandardMaterial({ color: 0xc084fc, transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.3 }), sd * 0.7, 1.35, 0.1, 1, 1, 1, Math.PI / 2 - 0.2, sd * 0.4);
          w.castShadow = false;
          part(new THREE.CylinderGeometry(0.08, 0.04, 0.9, 8), F, sd * 0.5, 0.45, 0.35, 1, 1, 1, 0, sd * 0.6);   // legs
          part(new THREE.CylinderGeometry(0.08, 0.04, 0.9, 8), F, sd * 0.5, 0.45, -0.3, 1, 1, 1, 0, sd * 0.6);
        }
        break;
      }

      case 'sentry': {
        // Hovering support drone: pale shell, gold ring, glowing core and focusing prongs
        const A = this.protossArmorMat, Gd = this.protossGoldMat, Gl = this.protossGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.SphereGeometry(0.42, 18, 14), A, 0, 0.85, 0, 1, 1.25, 1);
        part(new THREE.TorusGeometry(0.5, 0.06, 8, 24), Gd, 0, 0.85, 0, 1, 1, 1, Math.PI / 2, 0);
        part(new THREE.SphereGeometry(0.14, 12, 10), Gl, 0, 0.85, 0.38);
        part(new THREE.ConeGeometry(0.12, 0.5, 6), Gd, 0, 0.3, 0, 1, 1, 1, Math.PI, 0);
        for (const sd of [-1, 1]) part(new THREE.ConeGeometry(0.06, 0.45, 6), Gd, sd * 0.4, 1.0, 0.1, 1, 1, 1, 0.3, -sd * 0.5);
        break;
      }

      case 'drone': {
        // Segmented insectoid worker: thorax + abdomen + head, folded legs, harvesting claws
        const C = this.zergCarapaceMat, F = this.zergFleshMat, G = this.zergGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.SphereGeometry(0.4, 16, 12), C, 0, 0.62, 0.05, 0.85, 0.7, 1.15);        // thorax
        part(new THREE.SphereGeometry(0.38, 16, 12), F, 0, 0.58, -0.5, 0.8, 0.75, 1.3);         // abdomen
        for (let i = 0; i < 3; i++) part(new THREE.TorusGeometry(0.3 - i * 0.04, 0.035, 6, 16), C, 0, 0.6 + i * 0.02, -0.28 - i * 0.22, 1, 0.9, 1, Math.PI / 2 + 0.2); // abdomen ridges
        part(new THREE.SphereGeometry(0.22, 14, 10), C, 0, 0.7, 0.55, 1, 0.9, 1.05);             // head
        part(new THREE.SphereGeometry(0.07, 8, 8), G, -0.12, 0.76, 0.7); part(new THREE.SphereGeometry(0.07, 8, 8), G, 0.12, 0.76, 0.7);
        for (const sd of [-1, 1]) {
          part(new THREE.ConeGeometry(0.07, 0.55, 8), F, sd * 0.22, 0.55, 0.78, 1, 1, 1, Math.PI / 2, -sd * 0.35);   // harvesting pincers
          for (let i = 0; i < 3; i++) {                                                                               // legs
            const z = 0.3 - i * 0.35;
            part(new THREE.CylinderGeometry(0.04, 0.025, 0.55, 6), F, sd * 0.42, 0.3, z, 1, 1, 1, 0, sd * 0.9);
            part(new THREE.CylinderGeometry(0.025, 0.015, 0.4, 6), F, sd * 0.62, 0.12, z, 1, 1, 1, 0, -sd * 0.4);
          }
        }
        break;
      }

      case 'zergling': {
        { const zl = buildZergling(); teamize(zl, 'zergling', isPlayer); group.add(zl); }
        break;
      }

      case 'roach': {
        // Heavy armoured crawler: layered shell plates, acid sac, broad head with mandibles, six chunky legs
        const C = this.zergCarapaceMat, F = this.zergFleshMat, G = this.zergGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.SphereGeometry(0.55, 20, 14), F, 0, 0.45, 0, 1.05, 0.7, 1.45);           // underbody
        for (let i = 0; i < 4; i++) part(new THREE.SphereGeometry(0.62 - i * 0.04, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), C, 0, 0.55 + i * 0.01, 0.55 - i * 0.42, 1.1, 0.55, 0.42); // shell plates
        part(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0x99e205, emissive: 0x4a8a00, emissiveIntensity: 1.4, roughness: 0.4 }), 0, 0.88, -0.35, 1, 0.9, 1.3); // acid sac
        part(new THREE.SphereGeometry(0.3, 14, 10), C, 0, 0.45, 0.85, 1.1, 0.8, 1);                // head
        for (const sd of [-1, 1]) {
          part(new THREE.SphereGeometry(0.06, 8, 8), G, sd * 0.16, 0.55, 1.08);
          part(new THREE.ConeGeometry(0.07, 0.4, 6), F, sd * 0.14, 0.32, 1.12, 1, 1, 1, Math.PI / 2 + 0.2, sd * 0.3);  // mandibles
          for (const z of [0.55, 0, -0.55]) {
            part(new THREE.CylinderGeometry(0.09, 0.06, 0.55, 8), F, sd * 0.62, 0.3, z, 1, 1, 1, 0, sd * 0.8);
            part(new THREE.CylinderGeometry(0.06, 0.04, 0.4, 8), F, sd * 0.82, 0.1, z, 1, 1, 1, 0, -sd * 0.3);
          }
        }
        break;
      }

      case 'hydralisk': {
        // Upright serpent: segmented spine rings, cobra hood, fanged maw, scythe arms, coiled tail
        const C = this.zergCarapaceMat, F = this.zergFleshMat, G = this.zergGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        for (let i = 0; i < 7; i++) part(new THREE.SphereGeometry(0.4 - i * 0.03, 14, 10), i % 2 ? F : C, 0, 0.35 + i * 0.22, -0.05 - i * 0.03, 1, 0.55, 1); // spine segments
        part(new THREE.SphereGeometry(0.22, 14, 10), C, 0, 1.95, 0.12, 0.95, 0.9, 1.25);           // head
        part(new THREE.ConeGeometry(0.5, 0.75, 10), C, 0, 2.1, -0.18, 1.1, 1, 0.35, -0.3, 0);      // cobra hood
        part(new THREE.ConeGeometry(0.1, 0.3, 6), F, 0, 1.85, 0.38, 1, 1, 1, Math.PI / 2 + 0.3, 0); // maw
        part(new THREE.SphereGeometry(0.06, 8, 8), G, -0.1, 2.0, 0.3); part(new THREE.SphereGeometry(0.06, 8, 8), G, 0.1, 2.0, 0.3);
        for (const sd of [-1, 1]) {
          part(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 8), F, sd * 0.42, 1.25, 0.12, 1, 1, 1, 0.5, sd * 0.4);
          part(new THREE.ConeGeometry(0.09, 0.85, 8), C, sd * 0.58, 0.95, 0.42, 1, 1, 1, Math.PI / 2.2, -sd * 0.3); // scythe blade
        }
        for (let i = 0; i < 5; i++) part(new THREE.SphereGeometry(0.3 - i * 0.05, 12, 8), F, Math.sin(i * 0.9) * 0.2, 0.25, -0.4 - i * 0.28, 0.8, 0.55, 1.1); // coiled tail
        break;
      }

      case 'mutalisk': {
        // Winged Zerg Flyer Thorax
        const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 8, 18), this.zergCarapaceMat);
        thorax.rotation.x = Math.PI / 2 + 0.25;
        thorax.position.set(0, 1.0, 0);
        thorax.castShadow = true;
        group.add(thorax);

        // Curled Tail Abdomen
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.9, 6, 14), this.zergFleshMat);
        tail.position.set(0, 0.55, -0.55);
        tail.rotation.x = 0.5;
        group.add(tail);

        // Glowing Bio-Eyes
        const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), this.zergGlowMat);
        eyes.position.set(0, 1.15, 0.65);
        group.add(eyes);

        // Leathery Bat-like Bio-Wings (Animated in Unit.ts)
        const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 10), this.zergFleshMat); wingL.scale.set(1, 0.05, 0.5);
        wingL.position.set(-0.85, 1.15, 0.05);
        wingL.rotation.z = 0.25;
        wingL.name = 'wing_l';

        const wingR = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 10), this.zergFleshMat); wingR.scale.set(1, 0.05, 0.5);
        wingR.position.set(0.85, 1.15, 0.05);
        wingR.rotation.z = -0.25;
        wingR.name = 'wing_r';
        group.add(wingL, wingR);
        break;
      }

      // --- PROTOSS ("RED SOLARIS — THE EAST") FORCES ---
      case 'probe': {
        // Floating Golden/Crimson Robotic Harvester Sphere
        const hull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), this.protossGoldMat);
        hull.scale.set(0.95, 0.75, 1.15);
        hull.position.y = 0.72;
        hull.castShadow = true;
        group.add(hull);

        // Crimson Solaris Crest Fin
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 4), this.protossArmorMat);
        crest.rotation.x = -0.65;
        crest.position.set(0, 0.96, -0.18);
        group.add(crest);

        // Glowing Cyan Psionic Eye Lens
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this.protossGlowMat);
        lens.position.set(0, 0.72, 0.38);
        lens.name = 'drill'; // Pulses during harvesting
        group.add(lens);

        // Floating Side Gravity Fins
        [-0.36, 0.36].forEach(xSide => {
          const fin = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), this.protossArmorMat);
          fin.scale.set(0.25, 1, 1.8); fin.position.set(xSide, 0.68, -0.05);
          fin.rotation.z = xSide > 0 ? -0.35 : 0.35;
          group.add(fin);
        });
        break;
      }

      case 'zealot': {
        // Armoured templar: tapered cuirass, layered gold pauldrons, crested helm, greaves, glowing psi-blades
        const A = this.protossArmorMat, Gd = this.protossGoldMat, Gl = this.protossGlowMat, Bl = this.protossPsiBladeMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.CylinderGeometry(0.36, 0.22, 0.7, 14), A, 0, 0.9, 0);                    // cuirass
        part(new THREE.CylinderGeometry(0.4, 0.38, 0.14, 14), Gd, 0, 0.62, 0);                 // belt
        part(new THREE.SphereGeometry(0.2, 12, 10), Gd, 0, 1.0, 0.18, 1.2, 0.9, 0.5);          // chest plate
        part(new THREE.SphereGeometry(0.08, 10, 8), Gl, 0, 1.0, 0.3);                           // chest core
        part(new THREE.SphereGeometry(0.2, 14, 10), A, 0, 1.36, 0, 1, 1.05, 1);                 // head
        part(new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), Gd, 0, 1.4, -0.02); // helm dome
        part(new THREE.ConeGeometry(0.07, 0.5, 8), Gd, 0, 1.68, -0.18, 1, 1, 1, -0.7, 0);     // helm crest
        part(new THREE.BoxGeometry(0.22, 0.05, 0.1), Gl, 0, 1.35, 0.17);                        // visor
        for (const sd of [-1, 1]) {
          for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.2 - i * 0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), Gd, sd * 0.42, 1.2 - i * 0.07, 0, 1, 0.6, 1, 0, -sd * (0.5 + i * 0.1)); // layered pauldrons
          part(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 10), A, sd * 0.46, 0.92, 0.1, 1, 1, 1, 0.7, 0);       // upper arm
          part(new THREE.CylinderGeometry(0.09, 0.07, 0.34, 10), Gd, sd * 0.46, 0.78, 0.34, 1, 1, 1, Math.PI / 2, 0); // gauntlet
          part(new THREE.ConeGeometry(0.07, 0.95, 6), Bl, sd * 0.46, 0.78, 0.9, 1, 1, 1, Math.PI / 2, 0);        // psi-blade
          part(new THREE.CylinderGeometry(0.11, 0.08, 0.34, 10), A, sd * 0.18, 0.46, 0.04);                       // thigh
          part(new THREE.CylinderGeometry(0.08, 0.1, 0.34, 10), Gd, sd * 0.18, 0.18, 0.1);                        // greave
          part(new THREE.BoxGeometry(0.16, 0.08, 0.28), A, sd * 0.18, 0.04, 0.16);                                // boot
        }
        break;
      }

      case 'stalker': {
        // Quadrupedal walker: sculpted hull with gold crest, glowing void eye, twin cannons, jointed strider legs
        const A = this.protossArmorMat, Gd = this.protossGoldMat, Gl = this.protossGlowMat;
        const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
          const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, 0, rz); o.castShadow = true; group.add(o); return o;
        };
        part(new THREE.SphereGeometry(0.5, 18, 12), A, 0, 0.82, 0, 0.9, 0.7, 1.55);              // hull
        for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.44 - i * 0.04, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), Gd, 0, 0.98 + i * 0.02, 0.35 - i * 0.4, 1, 0.45, 0.4); // crest plates
        part(new THREE.SphereGeometry(0.2, 12, 10), A, 0, 0.85, 0.78, 1, 0.9, 1.1);              // head
        part(new THREE.SphereGeometry(0.1, 12, 10), Gl, 0, 0.88, 0.95);                           // void eye
        part(new THREE.ConeGeometry(0.1, 0.5, 8), Gd, 0, 1.2, -0.5, 1, 1, 1, -0.5, 0);          // dorsal fin
        for (const sd of [-1, 1]) {
          part(new THREE.CylinderGeometry(0.065, 0.085, 0.95, 10), Gd, sd * 0.3, 0.74, 0.7, 1, 1, 1, Math.PI / 2, 0);  // cannon barrel
          part(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), Gl, sd * 0.3, 0.74, 1.2, 1, 1, 1, Math.PI / 2, 0);     // muzzle glow
          for (const fz of [0.5, -0.5]) {
            part(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), Gd, sd * 0.5, 0.58, fz, 1, 1, 1, 0, sd * 0.7);       // thigh
            part(new THREE.CylinderGeometry(0.05, 0.035, 0.7, 8), A, sd * 0.78, 0.25, fz + (fz > 0 ? 0.08 : -0.08), 1, 1, 1, 0, -sd * 0.28); // shin
            part(new THREE.SphereGeometry(0.07, 8, 8), Gl, sd * 0.64, 0.5, fz);                                         // knee light
          }
        }
        break;
      }

      case 'archon': {
        // Solaris Immortal Heavy Assault Strider + Psionic Aura Ring
        const baseChassis = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.45, 8), this.protossArmorMat);
        baseChassis.position.y = 0.55;
        baseChassis.castShadow = true;
        group.add(baseChassis);

        // Rotating Turret Upper Body with Twin Phase Disruptor Cannons
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 0.92, 0);

        const torso = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 8), this.protossGoldMat);
        torso.scale.set(1.15, 0.85, 1.0);
        torso.castShadow = true;
        turret.add(torso);

        const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.protossGlowMat);
        core.position.set(0, 0.1, 0.38);
        turret.add(core);

        // Twin Heavy Phase Disruptor Cannons
        [-0.68, 0.68].forEach(xSide => {
          const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.72, 12), this.protossArmorMat); mount.rotation.x = Math.PI / 2;
          mount.position.set(xSide, 0.05, 0.18);
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.95, 8), this.protossGoldMat);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(xSide, 0.05, 0.68);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), this.protossPsiBladeMat);
          tip.position.set(xSide, 0.05, 1.15);
          turret.add(mount, barrel, tip);
        });

        // Glowing Hardened Plasma Shield Halo Ring
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 16), this.protossPsiBladeMat);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.25;
        turret.add(halo);

        group.add(turret);

        // 4 Heavy Armored Strider Legs
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.62, 12), this.protossGoldMat);
          leg.position.set(Math.cos(ang) * 0.65, 0.31, Math.sin(ang) * 0.65);
          leg.rotation.y = -ang;
          group.add(leg);
        }
        break;
      }

      case 'void_ray': {
        // Solaris Prismatic Beam Capital Cruiser
        const hull = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.35, 24), this.protossArmorMat);
        hull.rotation.x = Math.PI / 2;
        hull.position.set(0, 1.05, 0);
        hull.castShadow = true;
        group.add(hull);

        // Golden Prismatic Focusing Arms (3 radial prongs around the crystal core)
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI * 2) / 3;
          const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1.95, 10), this.protossGoldMat); prong.rotation.x = Math.PI / 2;
          prong.position.set(Math.cos(ang) * 0.56, 1.05 + Math.sin(ang) * 0.42, 0.25);
          group.add(prong);
        }

        // Central Prismatic Flux Crystal Core
        const fluxCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.protossPsiBladeMat);
        fluxCrystal.position.set(0, 1.05, 0.95);
        fluxCrystal.name = 'rotor_l'; // Spins continuously in Unit.ts!
        group.add(fluxCrystal);

        // Swept Solaris Wings
        const wings = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 10), this.protossGoldMat); wings.scale.set(1, 0.07, 0.38);
        wings.position.set(0, 1.05, -0.35);
        group.add(wings);
        break;
      }
    }

    this.wrapBody(group, type);
    return group;
  }

  /** Put the model's parts under a 'body' group (bob / lean / bank pivot) when it does not already have one. */
  private wrapBody(group: THREE.Group, type: string) {
    if (!['scv', 'banshee'].includes(type) || group.getObjectByName('body')) return;
    const body = new THREE.Group();
    body.name = 'body';
    for (const c of [...group.children]) body.add(c);
    group.add(body);
  }

  private static readonly STAGED_TYPES: ReadonlySet<string> = new Set([
    'command_center', 'orbital_command', 'planetary_fortress', 'supply_depot', 'refinery', 'engineering_bay', 'bunker', 'missile_turret', 'factory', 'starport'
  ]);

  /**
   * Terran Refinery: the Barracks model as the maroon, green-lit machine hall, plus the SC2 refinery's tall grey
   * gas tanks with brass clamps, one big black stack that glows green, and a black feed pipe. Null until the Barracks GLB is loaded.
   */
  /**
   * Armory from the baked GLB. Construction (Building.updateConstructionVisuals): a concrete slab goes down first, the hull rises
   * inside a hazard-striped scaffold (corner posts + rails), and the scaffold comes off when it finishes.
   */
  private buildArmory(isPlayer = true): THREE.Group | null {
    const rig = buildRigged('armory');
    if (!rig) return null;
    // PBR model with an explicit player-colour mesh (Armory_TEAMCOLOR_BLUE): give it its own material in the owner's colour
    // (the textures keep the panel relief); the green light mesh glows.
    rig.traverse(o => {
      const m = o as THREE.Mesh;
      if (!(m as any).isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      if (/TEAMCOLOR/i.test(m.name)) { mat.color.setHex(isPlayer ? TEAM_HEX.player : TEAM_HEX.enemy, THREE.SRGBColorSpace); mat.metalness = 0.35; mat.roughness = 0.55; }
      else if (/Lights_Green/i.test(m.name)) { mat.emissive.setHex(0x55ff22); mat.emissiveMap = mat.map; mat.emissiveIntensity = 1.6; mat.color.setHex(0x9dff6a); }
      m.material = mat;
    });
    const g = new THREE.Group();
    const sx = 3.0, sz = 2.39, hgt = 1.78;
    const s0 = new THREE.Group(); s0.name = 'stage_0_foundation'; // no concrete slab: the hull stands directly on the ground
    // 22%: a steel core block goes up inside the scaffold; 70%: the finished hull grows out of it
    const core = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.55, 0.8, sz * 0.55), new THREE.MeshStandardMaterial({ color: 0x6c7480, roughness: 0.6, metalness: 0.45 }));
    core.position.y = 0.5; core.castShadow = true;
    const s1 = new THREE.Group(); s1.name = 'stage_core'; s1.add(core);
    const s3 = new THREE.Group(); s3.name = 'stage_3_hangar'; s3.add(rig);
    const scaffold = new THREE.Group(); scaffold.name = 'stage_scaffold';
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, hgt + 0.2, 4), this.scvHazardMat);
      post.position.set(cx * (sx * 0.45), (hgt + 0.2) / 2, cz * (sz * 0.46));
      scaffold.add(post);
    }
    for (const zz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.9, 0.05, 0.05), this.scvHazardMat); r.position.set(0, hgt + 0.2, zz * (sz * 0.46)); scaffold.add(r); }
    for (const xx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, sz * 0.92), this.scvHazardMat); r.position.set(xx * (sx * 0.45), hgt * 0.55, 0); scaffold.add(r); }
    g.add(s0, s1, s3, scaffold);
    g.userData.rigged = true; g.userData.sized = true;
    g.rotation.y += ModelFactory.BUILDING_YAW;
    return g;
  }

  /**
   * The Extractor GLB comes as four named parts; wrap them in the construction stages Building.updateConstructionVisuals reveals:
   * ground plates + claws (0), first pod (1), second pod (2), the ridged body in front (3). Each grows up out of the ground.
   */
  private stageExtractor(rig: THREE.Group) {
    const stages: [string[], string][] = [[['base', 'base2'], 'stage_0_foundation'], [['pod_a'], 'stage_1_lower'], [['pod_b'], 'stage_2_upper'], [['ridge'], 'stage_3_hangar']];
    for (const [names, stage] of stages) {
      const g = new THREE.Group(); g.name = stage;
      let parent: THREE.Object3D | null = null;
      for (const n of names) {
        const node = rig.getObjectByName(n);
        if (!node || !node.parent) continue;
        parent = node.parent; parent.add(g); g.add(node);
      }
    }
  }

  private buildEngineeringBay(isPlayer = true): THREE.Group | null {
    const rig = buildRigged('engineering_bay');
    if (!rig) return null;
    teamize(rig, 'engineering_bay', isPlayer);
    const g = new THREE.Group();
    const sx = 2.9, sz = 2.9, hgt = 1.5;
    const s0 = new THREE.Group(); s0.name = 'stage_0_foundation'; // no concrete slab: the hull stands directly on the ground
    // 22%: a steel core block goes up inside the scaffold; 70%: the finished hull grows out of it
    const core = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.55, 0.8, sz * 0.55), new THREE.MeshStandardMaterial({ color: 0x6c7480, roughness: 0.6, metalness: 0.45 }));
    core.position.y = 0.5; core.castShadow = true;
    const s1 = new THREE.Group(); s1.name = 'stage_core'; s1.add(core);
    const s3 = new THREE.Group(); s3.name = 'stage_3_hangar'; s3.add(rig);
    const scaffold = new THREE.Group(); scaffold.name = 'stage_scaffold';
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, hgt + 0.2, 4), this.scvHazardMat);
      post.position.set(cx * (sx * 0.45), (hgt + 0.2) / 2, cz * (sz * 0.46));
      scaffold.add(post);
    }
    for (const zz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.9, 0.05, 0.05), this.scvHazardMat); r.position.set(0, hgt + 0.2, zz * (sz * 0.46)); scaffold.add(r); }
    for (const xx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, sz * 0.92), this.scvHazardMat); r.position.set(xx * (sx * 0.45), hgt * 0.55, 0); scaffold.add(r); }
    g.add(s0, s1, s3, scaffold);
    g.userData.rigged = true; g.userData.sized = true;
    g.rotation.y += ModelFactory.BUILDING_YAW;
    return g;
  }

  /** Refinery from Renn01's Terran Building Pack (`models/refinery_sc2.glb`); its red panels take the owner's colour. Falls back to the live build if the file isn't loaded. */
  private buildRefinery(isPlayer = true): THREE.Group | null {
    const rig = buildRigged('refinery');
    if (!rig) return this.buildRefineryProcedural(isPlayer);
    teamize(rig, 'refinery', isPlayer);
    const g = new THREE.Group();
    g.add(rig);
    g.userData.sized = true;
    return g;
  }

  private buildRefineryProcedural(isPlayer = true): THREE.Group | null {
    const rig = buildRigged('barracks');
    if (!rig) return null;
    // own materials, tinted maroon: the shared Barracks materials must stay blue/grey
    rig.traverse(o => {
      const m = o as THREE.Mesh;
      if (!(m as any).isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(x => {
        const c = (x as THREE.MeshStandardMaterial).clone();
        c.metalness = Math.min(c.metalness ?? 0, 0.25);
        return c;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0]!;
    });
    teamize(rig, 'barracks', isPlayer); // the hall's panels take the owner's colour
    const g = new THREE.Group();
    const hall = new THREE.Group();
    hall.add(rig);
    hall.scale.set(0.8, 0.7, 0.8);
    hall.position.set(0, 0, 0.35);
    g.add(hall);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.55, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.5, metalness: 0.5 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x9c7430, roughness: 0.4, metalness: 0.8 });
    const hazard = new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.6, metalness: 0.2 });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x12d44a) });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    };

    // two tall gas tanks (rear-left, right), each with a recessed panel, hazard band and brass clamp
    for (const [x, z, h] of [[-1.55, -0.9, 1.9], [1.6, 0.35, 1.7]] as const) {
      add(new THREE.BoxGeometry(0.62, h, 0.62), steel, x, h / 2, z);
      add(new THREE.BoxGeometry(0.66, 0.1, 0.66), dark, x, h - 0.05, z);
      add(new THREE.BoxGeometry(0.64, 0.07, 0.64), hazard, x, h - 0.28, z);
      add(new THREE.BoxGeometry(0.34, 0.5, 0.04), dark, x, h * 0.55, z + 0.32);
      add(new THREE.BoxGeometry(0.70, 0.22, 0.2), brass, x, 0.55, z + 0.3);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10), dark, x * 0.75, 0.9, z + 0.1).rotation.z = 0.5;
    }
    // central stack: black cylinder, flared rim and a glowing green throat
    const stack = add(new THREE.CylinderGeometry(0.62, 0.7, 1.5, 18), dark, 0, 1.15, -0.55);
    stack.name = 'stack';
    add(new THREE.TorusGeometry(0.62, 0.14, 10, 22), steel, 0, 1.92, -0.55).rotation.x = Math.PI / 2;
    const throat = add(new THREE.CircleGeometry(0.5, 20), green, 0, 1.93, -0.55);
    throat.rotation.x = -Math.PI / 2; throat.name = 'throat';
    add(new THREE.CylinderGeometry(0.66, 0.66, 0.16, 18), steel, 0, 0.45, -0.55);
    // black feed pipe from the stack to the hall roof
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 1.5, -0.1), new THREE.Vector3(0.1, 1.85, 0.25), new THREE.Vector3(0.0, 1.7, 0.6), new THREE.Vector3(0.0, 1.2, 0.8)
    ]), 16, 0.07, 8), dark);
    pipe.castShadow = true; g.add(pipe);
    g.userData.sized = true;
    return g;
  }

  // Create 3D Mesh Group for a Structure (Terran structures get multi-phase construction stages)
  public createBuildingModel(type: BuildingType, isPlayer: boolean = true, host?: BuildingType): THREE.Group {
    const alias = BUILDING_ALIAS[type];
    if (alias) { // structures without their own model: a tinted, rescaled copy of a related one
      const g = this.createBuildingModel(alias[0], isPlayer, host);
      tintObject(g, alias[1], alias[2]);
      g.scale.multiplyScalar(alias[3]);
      return g;
    }
    if (type === 'holoboard') return buildHoloboardModel(isPlayer);
    if (type === 'techlab') return buildTechLabModel(isPlayer, host);
    if (type === 'reactor') return buildReactorModel(isPlayer);
    if (type === 'planetary_fortress') {
      const rig = buildRigged('command_center');
      if (rig) {
        const g = new THREE.Group();
        teamize(rig, 'planetary_fortress', isPlayer);
        g.add(rig); g.userData.rigged = rig.userData.rigged ?? true; g.userData.sized = true;
        rig.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rig); const sz = box.getSize(new THREE.Vector3());
        g.add(buildPlanetaryArmor(Math.max(sz.x, sz.z), sz.y));
        g.rotation.y += ModelFactory.BUILDING_YAW;
        return g;
      }
    }
    if ((['barracks', 'command_center', 'orbital_command', 'factory', 'starport', 'missile_turret', 'bunker', 'fusion_core', 'ghost_academy', 'sensor_tower'] as string[]).includes(type)) {
      const rig = buildRigged(type as RigKind);
      if (rig) {
        const g = new THREE.Group();
        teamize(rig, type, isPlayer);
        g.add(rig); g.userData.rigged = rig.userData.rigged ?? true; g.userData.sized = true;
        g.rotation.y += ModelFactory.BUILDING_YAW;
        return g;
      }
    }
    if (type === 'armory') {
      const g = this.buildArmory(isPlayer);
      if (g) return g;
    }
    if (type === 'engineering_bay') {
      const g = this.buildEngineeringBay(isPlayer);
      if (g) return g;
    }
    if (type === 'refinery') {
      const g = this.buildRefinery(isPlayer);
      if (g) return g;
    }
    if (type === 'supply_depot' || type === 'supply_depot_lowered') {
      const rig = buildRigged('supply_depot');
      if (rig) {
        const g = new THREE.Group();
        teamize(rig, 'supply_depot', isPlayer);
        g.add(rig); g.userData.rigged = rig.userData.rigged ?? true; g.userData.sized = true; g.userData.depotRig = rig;
        g.rotation.y += ModelFactory.BUILDING_YAW; // same yaw as the other Terran structures
        return g;
      }
    }
    if (['spawning_pool', 'nexus', 'gateway', 'hatchery', 'hive', 'infestation_pit', 'extractor', 'hydralisk_den', 'spine_crawler', 'roach_warren', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'cybernetics_core', 'twilight_council', 'robotics_facility', 'robotics_bay', 'templar_archives', 'dark_shrine', 'fleet_beacon', 'shield_battery', 'pylon', 'assimilator', 'forge', 'photon_cannon', 'stargate', 'creep_tumor', 'nydus_worm'].includes(type)) {
      const rig = buildRigged(type as RigKind);
      if (rig && type === 'extractor') this.stageExtractor(rig);
      if (rig) {
        const g = new THREE.Group();
        teamize(rig, type, isPlayer);
        g.add(rig); g.userData.rigged = rig.userData.rigged ?? true; g.userData.sized = true;
        return g;
      }
    }
    const group = this.buildBuildingRaw(type, isPlayer);
    if (ModelFactory.STAGED_TYPES.has(type)) this.applyConstructionStages(group, type);
    else if (type === 'barracks') this.fitBarracksSlab(group);
    if (ModelFactory.STAGED_TYPES.has(type) || type === 'barracks') this.cloneGlows(group);
    group.rotation.y += ModelFactory.BUILDING_YAW; // buildings sit on the 135deg (= 45deg the other way) tile grid
    const k = ModelFactory.PROCEDURAL_SCALE[type];
    if (k) { // size pass: keep procedural structures in proportion with the GLB ones (footprint-based)
      const outer = new THREE.Group();
      group.scale.setScalar(k);
      outer.add(group);
      return outer;
    }
    return group;
  }

  private static readonly PROCEDURAL_SCALE: Partial<Record<string, number>> = {
    roach_warren: 0.8, extractor: 0.8, overlord_pod: 0.82, spine_crawler: 0.75, stargate: 0.78, forge: 0.92, assimilator: 0.92
  };

  /**
   * Splits a finished building into the same phases the Barracks uses:
   * concrete slab -> lower structure -> upper structure -> tech/details, plus corner scaffold posts.
   * Building.updateConstructionVisuals() reveals the stages as buildProgress rises.
   */
  /** Give each building its own copies of the emissive materials so lights can pulse independently. */
  private cloneGlows(group: THREE.Group) {
    const glows: { mat: THREE.MeshBasicMaterial; base: THREE.Color; chase: number }[] = [];
    group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !(m.material as any)?.isMeshBasicMaterial) return;
      const mat = (m.material as THREE.MeshBasicMaterial).clone();
      m.material = mat;
      glows.push({ mat, base: mat.color.clone(), chase: (m.userData.chase as number) ?? -1 });
    });
    group.userData.glows = glows;
  }

  /** Buildings that either carry their own base plate or are round: no extra rectangular slab is added. */
  private static readonly NO_SLAB: ReadonlySet<string> = new Set([
    'command_center', 'orbital_command', 'planetary_fortress', 'engineering_bay', 'refinery', 'bunker', 'missile_turret'
  ]);

  /** Shrink the Barracks' concrete slab to exactly the building body's outline (no overhang). */
  private fitBarracksSlab(group: THREE.Group) {
    const s0 = group.getObjectByName('stage_0_foundation');
    if (!s0) return;
    group.updateMatrixWorld(true);
    const body = new THREE.Box3();
    for (const n of ['stage_1_lower', 'stage_2_upper', 'stage_3_hangar', 'stage_4_tech']) {
      const o = group.getObjectByName(n);
      if (o) body.expandByObject(o);
    }
    const slab = s0.children[0] as THREE.Mesh | undefined;
    if (!slab || body.isEmpty()) return;
    slab.geometry = new THREE.BoxGeometry(body.max.x - body.min.x, 0.14, body.max.z - body.min.z);
    slab.position.set((body.max.x + body.min.x) / 2, 0.07, (body.max.z + body.min.z) / 2);
    // drop the corner hazard pads that stuck out past the body
    for (const c of [...s0.children].slice(1)) s0.remove(c);
  }

  private applyConstructionStages(group: THREE.Group, type: string = '') {
    if (group.getObjectByName('stage_0_foundation')) return;
    const kids = [...group.children];
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const height = Math.max(1.2, box.max.y);
    const tmp = new THREE.Box3();

    const infos = kids.map(k => {
      tmp.setFromObject(k);
      return { k, min: tmp.min.y, max: tmp.max.y, mid: (tmp.min.y + tmp.max.y) / 2 };
    });

    const stage0 = new THREE.Group(); stage0.name = 'stage_0_foundation';

    // Concrete slab sized EXACTLY to the building body (never larger, so nothing overhangs).
    // Round / self-based buildings (and the Command Center) get no extra slab.
    const body = new THREE.Box3();
    for (const i of infos) if (i.max > 0.34) body.expandByObject(i.k);
    if (!ModelFactory.NO_SLAB.has(type) && !body.isEmpty()) {
      const bw = body.max.x - body.min.x;
      const bd = body.max.z - body.min.z;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.14, bd), this.terranIndustrialMat);
      slab.position.set((body.max.x + body.min.x) / 2, 0.07, (body.max.z + body.min.z) / 2);
      slab.receiveShadow = true;
      stage0.add(slab);
    }
    const sx = body.isEmpty() ? 2 : Math.max(1.4, body.max.x - body.min.x);
    const sz = body.isEmpty() ? 2 : Math.max(1.4, body.max.z - body.min.z);
    const cxm = body.isEmpty() ? 0 : (body.max.x + body.min.x) / 2;
    const czm = body.isEmpty() ? 0 : (body.max.z + body.min.z) / 2;

    const stage1 = new THREE.Group(); stage1.name = 'stage_1_lower';
    const stage2 = new THREE.Group(); stage2.name = 'stage_2_upper';
    const stage4 = new THREE.Group(); stage4.name = 'stage_4_tech';

    // Thin base plates join the foundation; the rest are split into thirds by height
    const rest: typeof infos = [];
    for (const i of infos) {
      if (i.max <= 0.34) stage0.add(i.k); else rest.push(i);
    }
    rest.sort((a, b) => a.mid - b.mid);
    const n = rest.length;
    rest.forEach((i, idx) => {
      const f = n <= 1 ? 0 : idx / n;
      (f < 0.45 ? stage1 : f < 0.78 ? stage2 : stage4).add(i.k);
    });

    const scaffold = new THREE.Group(); scaffold.name = 'stage_scaffold';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, height, 4), this.scvHazardMat);
      post.position.set(cxm + cx! * (sx / 2 - 0.05), height / 2, czm + cz! * (sz / 2 - 0.05));
      scaffold.add(post);
    });
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(sx - 0.1, 0.05, 0.05), this.scvHazardMat);
    topRail.position.set(cxm, height, czm + sz / 2 - 0.05);
    const topRail2 = topRail.clone(); topRail2.position.set(cxm, height, czm - (sz / 2 - 0.05));
    scaffold.add(topRail, topRail2);

    group.add(stage0, stage1, stage2, stage4, scaffold);
  }

  private buildBuildingRaw(type: BuildingType, isPlayer: boolean = true): THREE.Group {
    const group = new THREE.Group();
    const teamMat = isPlayer ? this.terranBlueArmorMat : this.enemyArmorMat;

    switch (type) {
      case 'command_center': {
        // ============================================================
        // HYPER-REALISTIC FUTURISTIC TERRAN COMMAND CENTER / HEADQUARTERS
        // ============================================================

        // --- 1. SUBTERRANEAN FOUNDATION & BLAST DEFLECTORS ---
        const foundation = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.32, 3.9), this.scvDarkMat);
        foundation.position.y = 0.16;
        foundation.receiveShadow = true;
        foundation.castShadow = true;
        group.add(foundation);

        // Subterranean Steel Intake Skirt
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.45, 8), this.scvDarkMat);
        skirt.position.y = 0.42;
        skirt.rotation.y = Math.PI / 8;
        skirt.receiveShadow = true;
        group.add(skirt);

        // --- 2. 4 HEAVY HYDRAULIC OUTRIGGER LANDING PYLONS ---
        const cornerCoords = [
          { x: -1.82, z: -1.82, rotY: Math.PI / 4 },
          { x: 1.82, z: -1.82, rotY: -Math.PI / 4 },
          { x: -1.82, z: 1.82, rotY: (3 * Math.PI) / 4 },
          { x: 1.82, z: 1.82, rotY: (-3 * Math.PI) / 4 }
        ];

        cornerCoords.forEach(c => {
          // Heavy Ground Footpad with Hazard Warning Stripes
          const footpad = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.72), this.scvHazardMat);
          footpad.position.set(c.x, 0.08, c.z);
          footpad.castShadow = true;
          footpad.receiveShadow = true;
          group.add(footpad);

          // Hydraulic Piston Housing
          const pylonLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), this.scvSteelMat);
          pylonLeg.position.set(c.x * 0.82, 0.52, c.z * 0.82);
          pylonLeg.castShadow = true;
          group.add(pylonLeg);

          // Diagonal Armored Reinforcement Strut
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.85), this.metalDarkMat);
          brace.position.set(c.x * 0.72, 0.58, c.z * 0.72);
          brace.rotation.y = c.rotY;
          brace.rotation.x = 0.5;
          brace.castShadow = true;
          group.add(brace);
        });

        // --- 3. LOWER FORTRESS HULL (OCTAGONAL SLOPED COMPOSITE ARMOR) ---
        // Lower Hull Body (Faceted fortress profile)
        const lowerHull = new THREE.Mesh(new THREE.CylinderGeometry(2.32, 2.65, 0.95, 8), teamMat);
        lowerHull.position.y = 0.95;
        lowerHull.rotation.y = Math.PI / 8;
        lowerHull.castShadow = true;
        lowerHull.receiveShadow = true;
        group.add(lowerHull);

        // Sloped Ballistic Composite Armor Plates on 4 cardinal faces
        const armorPlateN = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 0.18), this.terranCompositeMat);
        armorPlateN.position.set(0, 1.05, -1.8);
        armorPlateN.castShadow = true;
        const armorPlateS = armorPlateN.clone();
        armorPlateS.position.z = 1.8;
        const armorPlateW = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 3.3), this.terranCompositeMat);
        armorPlateW.position.set(-1.8, 1.05, 0);
        const armorPlateE = armorPlateW.clone();
        armorPlateE.position.x = 1.8;
        group.add(armorPlateN, armorPlateS, armorPlateW, armorPlateE);

        // --- 4. 4 RECESSED VTOL LIFT-OFF THRUSTERS (FLIGHT CAPABILITY) ---
        const thrusterPositions = [
          { x: -1.35, z: -1.35 },
          { x: 1.35, z: -1.35 },
          { x: -1.35, z: 1.35 },
          { x: 1.35, z: 1.35 }
        ];

        thrusterPositions.forEach(tp => {
          // Thruster Cowling
          const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.7, 8), this.scvDarkMat);
          cowl.position.set(tp.x, 0.65, tp.z);
          cowl.castShadow = true;
          // Plasma Nozzle Glow Interior
          const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.25, 8), this.scvThrusterGlowMat);
          nozzle.position.set(tp.x, 0.38, tp.z);
          group.add(cowl, nozzle);
        });

        // --- 5. MAIN VEHICLE AIRLOCK BAY (FRONT SCV ENTRANCE & EXIT) ---
        // Recessed Bay Frame
        const bayFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 0.35), this.metalDarkMat);
        bayFrame.position.set(0, 0.88, 1.82);
        bayFrame.castShadow = true;
        group.add(bayFrame);

        // Double Armored Sliding Blast Doors
        const blastDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.15), this.scvSteelMat);
        blastDoorL.position.set(-0.36, 0.84, 1.92);
        const blastDoorR = blastDoorL.clone();
        blastDoorR.position.x = 0.36;
        blastDoorL.name = 'door_l';
        blastDoorR.name = 'door_r';
        group.add(blastDoorL, blastDoorR);

        // Overhead Hazard Striped Caution Lintel
        const bayLintel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.15, 0.22), this.scvHazardMat);
        bayLintel.position.set(0, 1.32, 1.92);
        group.add(bayLintel);

        // Airlock Staging Floodlights
        [-0.7, 0.7].forEach(lx => {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), this.scvWorkLightMat);
          lamp.position.set(lx, 1.32, 2.02);
          group.add(lamp);
        });

        // --- 6. RESOURCE RECEPTION HOPPER & CONVEYOR CHUTE (RIGHT FLANK) ---
        const hopperHousing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.4), this.scvDarkMat);
        hopperHousing.position.set(1.88, 0.85, 0.1);
        hopperHousing.castShadow = true;
        group.add(hopperHousing);

        // Glowing Blue Mineral Processing Sieve
        const mineralSieve = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 1.1), this.scvCanopyMat);
        mineralSieve.position.set(1.92, 1.05, 0.1);
        group.add(mineralSieve);

        // Guide Rails
        const hopperRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 1.4), this.scvSteelMat);
        hopperRail.position.set(2.25, 1.12, 0.1);
        group.add(hopperRail);

        // --- 7. UPPER CITADEL LEVEL & OPERATIONS TIER ---
        const upperCitadel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.85, 2.7), teamMat);
        upperCitadel.position.y = 1.82;
        upperCitadel.castShadow = true;
        upperCitadel.receiveShadow = true;
        group.add(upperCitadel);

        // Armored Roof Parapet / Battlement rim
        const parapetN = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.22, 0.14), this.terranPlatingMat);
        parapetN.position.set(0, 2.32, -1.35);
        const parapetS = parapetN.clone();
        parapetS.position.z = 1.35;
        const parapetW = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 2.85), this.terranPlatingMat);
        parapetW.position.set(-1.35, 2.32, 0);
        const parapetE = parapetW.clone();
        parapetE.position.x = 1.35;
        group.add(parapetN, parapetS, parapetW, parapetE);

        // --- 8. CANTILEVERED COMMAND BRIDGE & OBSERVATION VISOR ---
        // Command Bridge Hull with Composite Tech Plating
        const bridgePod = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 0.85), this.terranCompositeMat);
        bridgePod.position.set(0, 2.15, 1.25);
        bridgePod.castShadow = true;
        group.add(bridgePod);

        // Forward Panoramic Observation Visor (Glowing Cyan Glass)
        const bridgeVisor = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.28, 0.25), this.scvCanopyMat);
        bridgeVisor.position.set(0, 2.18, 1.62);
        group.add(bridgeVisor);

        // Armored Sun-Visor Brow above Bridge
        const bridgeBrow = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.12, 0.45), this.scvSteelMat);
        bridgeBrow.position.set(0, 2.42, 1.42);
        group.add(bridgeBrow);

        // Tactical Holo-Table Ambient Core (Glow inside bridge)
        const holoCore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 8), this.terranGlowMat);
        holoCore.position.set(0, 2.15, 1.25);
        group.add(holoCore);

        // --- 9. ROOFTOP HELIPAD & VTOL DRONE DECK ---
        // Raised Helipad Platform
        const helipad = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 12), this.scvDarkMat);
        helipad.position.set(0.65, 2.3, -0.45);
        group.add(helipad);

        // Helipad Glowing Ring
        const heliRing = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.62, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
        heliRing.rotation.x = -Math.PI / 2;
        heliRing.position.set(0.65, 2.34, -0.45);
        group.add(heliRing);

        // Helipad 'H' Marking
        const heliH1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.44), this.scvWorkLightMat);
        heliH1.position.set(0.53, 2.34, -0.45);
        const heliH2 = heliH1.clone();
        heliH2.position.x = 0.77;
        const heliHBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.08), this.scvWorkLightMat);
        heliHBar.position.set(0.65, 2.34, -0.45);
        group.add(heliH1, heliH2, heliHBar);

        // --- 10. ROTATING 3D PHASED-ARRAY RADAR DISH & SENSORS ---
        const radar = new THREE.Group();
        radar.name = 'radar'; // Enables dynamic rotation in game loop!
        radar.position.set(-0.82, 2.32, -0.65);

        // Radar Gimbal Turret Base
        const radarTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.28, 8), this.scvSteelMat);
        radarTurret.position.y = 0.14;
        radarTurret.castShadow = true;
        radar.add(radarTurret);

        // Angular Parabolic Sensor Dish
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.15, 0.24, 12), this.scvSteelMat);
        dish.rotation.x = 0.45;
        dish.position.set(0, 0.52, 0.05);
        dish.castShadow = true;

        // Sub-Reflector Feed Horn Spire
        const feedHorn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), this.terranGlowMat);
        feedHorn.rotation.x = -0.45;
        feedHorn.position.set(0, 0.62, 0.26);

        radar.add(dish, feedHorn);
        group.add(radar);

        // --- 11. ORBITAL UPLINK SPIRE & NAVIGATION BEACON ---
        const commMast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.4, 6), this.scvSteelMat);
        commMast.position.set(-1.1, 2.9, 0.5);
        commMast.castShadow = true;
        group.add(commMast);

        const commSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), this.scvSteelMat);
        commSpire.position.set(-1.1, 3.8, 0.5);
        group.add(commSpire);

        // Flashing Warning Strobe
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), this.scvHeatCoreMat);
        beacon.position.set(-1.1, 4.15, 0.5);
        group.add(beacon);

        // --- 12. HEAVY INDUSTRIAL TWIN COOLING TOWERS ---
        [-0.45, -0.05].forEach((stackX) => {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.85, 8), this.scvDarkMat);
          stack.position.set(stackX, 2.5, -1.05);
          stack.castShadow = true;

          // Exhaust Grille Lip
          const stackLip = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12), this.scvSteelMat);
          stackLip.rotation.x = Math.PI / 2;
          stackLip.position.set(stackX, 2.92, -1.05);

          // Internal Thermal Glow
          const heatGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8), this.scvHeatCoreMat);
          heatGlow.position.set(stackX, 2.85, -1.05);

          stack.name = 'stack';
          group.add(stack, stackLip, heatGlow);
        });

        break;
      }

      case 'supply_depot': {
        // Light-armoured storage vault: pale steel body, team-colour belt, cyan-lit sliding hatch
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.78, 1.64), this.depotPanelMat);
        body.position.y = 0.53;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const belt = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.16, 1.70), teamMat);
        belt.position.y = 0.46;
        group.add(belt);

        // Corner buttress posts
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz]) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), this.depotTrimMat);
          post.position.set(cx! * 0.80, 0.59, cz! * 0.80);
          post.castShadow = true;
          group.add(post);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), this.terranGlowMat);
          cap.position.set(cx! * 0.80, 1.06, cz! * 0.80);
          group.add(cap);
        });

        // Twin sliding roof hatches with a glowing seam
        const hatchL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 1.44), this.depotTrimMat);
        hatchL.position.set(-0.40, 0.96, 0);
        const hatchR = hatchL.clone();
        hatchR.position.x = 0.40;
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1.44), this.terranGlowMat);
        seam.position.set(0, 0.97, 0);
        hatchL.name = 'hatch_l';
        hatchR.name = 'hatch_r';
        group.add(hatchL, hatchR, seam);

        // Front chevron panel + roof beacon
        const chevron = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.04), this.terranAccentMat);
        chevron.position.set(0, 0.6, 0.84);
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 6), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
        beacon.position.set(0.55, 1.16, 0.55);
        group.add(chevron, beacon);
        break;
      }

      case 'supply_depot_lowered': {
        // Retracted flush with the ground plate
        const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), this.depotConcreteMat);
        plate.position.y = 0.06;
        plate.receiveShadow = true;
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.5), this.depotPanelMat);
        hatch.position.y = 0.14;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.12), this.terranGlowMat);
        stripe.position.y = 0.18;
        group.add(plate, hatch, stripe);
        break;
      }

      case 'refinery': {
        // Dome over geyser
        const dome = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 1.6, 10), teamMat);
        dome.position.y = 0.8;
        dome.castShadow = true;
        group.add(dome);

        // Gas Burner Chimney
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 8), this.metalDarkMat);
        chimney.position.set(0.4, 1.8, 0.3);
        const flare = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0x55ff55 }));
        flare.position.set(0.4, 2.6, 0.3);
        flare.name = 'flare';
        dome.name = 'dome';
        group.add(chimney, flare);

        // Pumpjack: rocking walking-beam that pumps gas out of the geyser
        const pump = new THREE.Group();
        pump.name = 'pump';
        pump.position.set(-0.9, 1.3, -0.9);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), this.metalDarkMat);
        post.position.y = -0.45;
        const beam = new THREE.Group();
        beam.name = 'pump_beam';
        const beamBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), this.terranPlatingMat);
        const weight = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.2), this.terranAccentMat);
        weight.position.set(-0.55, 0.0, 0);
        const headNode = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), this.terranGlowMat);
        headNode.position.set(0.58, 0, 0);
        beam.add(beamBar, weight, headNode);
        pump.add(post, beam);
        group.add(pump);
        break;
      }

      case 'barracks': {
        // ============================================================
        // PROGRESSIVE MULTI-STAGE TERRAN INFANTRY BARRACKS
        // Stage 0: Concrete slab / foundation
        // Stage 1: First box (lower structural bay)
        // Stage 2: Second box (upper assembly module)
        // Stage 3: Hangar doors & rooftop gantry box
        // Stage 4: Tech communications mast, beacons & status lights
        // Scaffold: Construction framing visible while under construction
        // ============================================================

        // --- STAGE 0: Concrete Slab / Blast Foundation ---
        const stage0Group = new THREE.Group();
        stage0Group.name = 'stage_0_foundation';

        // Concrete foundation slab
        const foundation = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.22, 2.95), this.terranIndustrialMat);
        foundation.position.y = 0.11;
        foundation.receiveShadow = true;
        foundation.castShadow = true;
        stage0Group.add(foundation);

        // 4 Corner foundation anchor pads with hazard markings
        const padOffsets = [
          { x: -1.35, z: -1.35 },
          { x: 1.35, z: -1.35 },
          { x: -1.35, z: 1.35 },
          { x: 1.35, z: 1.35 }
        ];
        padOffsets.forEach(po => {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), this.scvHazardMat);
          pad.position.set(po.x, 0.24, po.z);
          stage0Group.add(pad);
        });
        group.add(stage0Group);

        // --- STAGE 1: First Box (Lower Structural Bay) ---
        const stage1Group = new THREE.Group();
        stage1Group.name = 'stage_1_lower';

        const lowerBox = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.72, 2.7), teamMat);
        lowerBox.position.y = 0.58;
        lowerBox.castShadow = true;
        lowerBox.receiveShadow = true;

        // Armored corner pillars
        padOffsets.forEach(po => {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), this.metalDarkMat);
          col.position.set(po.x * 0.94, 0.58, po.z * 0.94);
          stage1Group.add(col);
        });
        stage1Group.add(lowerBox);
        group.add(stage1Group);

        // --- STAGE 2: Second Box (Upper Assembly Module) ---
        const stage2Group = new THREE.Group();
        stage2Group.name = 'stage_2_upper';

        const upperBox = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.68, 2.55), teamMat);
        upperBox.position.y = 1.28;
        upperBox.castShadow = true;
        upperBox.receiveShadow = true;

        // Front & side reinforced composite plating
        const plateF = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 0.08), this.terranCompositeMat);
        plateF.position.set(0, 1.32, 1.30);
        stage2Group.add(upperBox, plateF);
        group.add(stage2Group);

        // --- STAGE 3: Hangar Doors & Rooftop Gantry Box ---
        const stage3Group = new THREE.Group();
        stage3Group.name = 'stage_3_hangar';

        // Assembly Hangar Doors (Hull Plating)
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.2), this.terranPlatingMat);
        door.position.set(0, 0.55, 1.35);
        door.name = 'bay_door';
        const doorGlow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.05), this.terranGlowMat);
        doorGlow.position.set(0, 1.05, 1.45);

        // Rooftop Gantry Box (Composite Tech Plating)
        const gantry = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.38, 1.7), this.terranCompositeMat);
        gantry.position.y = 1.76;
        gantry.castShadow = true;
        stage3Group.add(door, doorGlow, gantry);
        group.add(stage3Group);

        // --- STAGE 4: Tech Communications Mast, Beacons & Lights ---
        const stage4Group = new THREE.Group();
        stage4Group.name = 'stage_4_tech';

        const commMast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), this.terranPlatingMat);
        commMast.position.set(-0.7, 2.25, -0.5);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), this.terranGlowMat);
        beacon.position.set(-0.7, 2.72, -0.5);

        // Dual roof turbine exhaust vents
        for (let i = 0; i < 2; i++) {
          const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.25, 8), this.metalDarkMat);
          vent.position.set(0.6, 2.05, -0.4 + i * 0.8);
          stage4Group.add(vent);
        }
        stage4Group.add(commMast, beacon);
        group.add(stage4Group);

        // --- STAGE SCAFFOLD: Construction Frame Beams (hidden once constructed) ---
        const stageScaffold = new THREE.Group();
        stageScaffold.name = 'stage_scaffold';
        padOffsets.forEach(po => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 4), this.scvHazardMat);
          post.position.set(po.x * 1.02, 1.05, po.z * 1.02);
          stageScaffold.add(post);
        });
        group.add(stageScaffold);
        break;
      }

      case 'armory': {
        // Vehicle & ship weapons foundry: slab, heavy gantry hall, chimney stacks and a glowing forge slit
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, 2.9), this.scvDarkMat);
        pad.position.y = 0.15; pad.castShadow = true; pad.receiveShadow = true; group.add(pad);
        const hall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 1.9), teamMat);
        hall.position.set(0, 0.9, 0); hall.castShadow = true; group.add(hall);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 2.1), this.terranCompositeMat);
        roof.position.set(0, 1.6, 0); group.add(roof);
        for (const sd of [-1, 1]) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.2, 10), this.metalDarkMat);
          stack.position.set(sd * 0.8, 2.25, -0.4); stack.castShadow = true; group.add(stack);
        }
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.1), this.terranGlowMat);
        door.position.set(0, 0.75, 0.97); group.add(door);
        const crane = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.8), this.gunMetalMat);
        crane.position.set(0, 1.85, 0.2); group.add(crane);
        break;
      }

      case 'engineering_bay': {
        // ============================================================
        // TACTICAL COMMAND MATRIX / ENGINEERING BAY
        // ============================================================
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.32, 2.85), this.scvDarkMat);
        pad.position.y = 0.16;
        pad.castShadow = true;
        pad.receiveShadow = true;
        group.add(pad);

        // Octagonal Armored R&D Core
        const labCore = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.32, 1.25, 8), teamMat);
        labCore.position.y = 0.82;
        labCore.rotation.y = Math.PI / 8;
        labCore.castShadow = true;
        group.add(labCore);

        // Holographic AI Subroutine Matrix Dome
        const holoRing = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.22, 8), this.terranCompositeMat);
        holoRing.position.y = 1.52;
        const holoDome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), this.scvCanopyMat);
        holoDome.scale.set(1.0, 0.55, 1.0);
        holoDome.position.y = 1.65;
        group.add(holoRing, holoDome);

        // Rotating Satellite Uplink & AI Telemetry Array ('turret' for gentle idle spin)
        const dishGroup = new THREE.Group();
        dishGroup.position.set(0, 1.92, 0);
        dishGroup.name = 'turret';
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.36, 6), this.terranPlatingMat);
        const dish = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.24, 8), this.terranCompositeMat);
        dish.rotation.x = -0.65;
        dish.position.set(0, 0.22, 0.12);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), this.terranGlowMat);
        emitter.position.set(0, 0.32, 0.24);
        dishGroup.add(mast, dish, emitter);
        group.add(dishGroup);

        break;
      }

      case 'bunker': {
        // ============================================================
        // FORTIFIED ARMORED DEFENSE BUNKER
        // ============================================================
        const baseSlab = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.62, 0.38, 8), this.scvDarkMat);
        baseSlab.position.y = 0.19;
        baseSlab.rotation.y = Math.PI / 8;
        baseSlab.castShadow = true;
        baseSlab.receiveShadow = true;
        group.add(baseSlab);

        // Sloped Ferro-Concrete & Titanium Casemate
        const casemate = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.38, 0.78, 8), teamMat);
        casemate.position.y = 0.72;
        casemate.rotation.y = Math.PI / 8;
        casemate.castShadow = true;
        group.add(casemate);

        //Glowing 360° Firing Slit Visor Band
        const firingSlit = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.18, 0.14, 8), this.terranGlowMat);
        firingSlit.position.y = 0.86;
        firingSlit.rotation.y = Math.PI / 8;
        group.add(firingSlit);

        // Armored Roof Cap & Blast Shields
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.14, 0.24, 8), this.terranCompositeMat);
        roof.position.y = 1.2;
        roof.rotation.y = Math.PI / 8;
        group.add(roof);

        // 4 Heavy Blast Buttresses
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.85, 0.52), this.terranPlatingMat);
          buttress.position.set(Math.cos(ang) * 1.22, 0.58, Math.sin(ang) * 1.22);
          buttress.rotation.y = -ang;
          buttress.castShadow = true;
          group.add(buttress);
        }

        // Automated Roof Twin Gauss Sentry Turret
        const turret = new THREE.Group();
        turret.position.set(0, 1.35, 0);
        turret.name = 'turret';
        const turretHousing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.56), this.terranPlatingMat);
        turretHousing.position.y = 0.12;
        const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.68, 6), this.metalDarkMat);
        barrelL.rotation.x = Math.PI / 2;
        barrelL.position.set(-0.14, 0.14, 0.46);
        const barrelR = barrelL.clone();
        barrelR.position.x = 0.14;
        barrelL.name = 'barrel_l';
        barrelR.name = 'barrel_r';
        const optic = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), this.scvHeatCoreMat);
        optic.position.set(0, 0.24, 0.26);
        const bmL = new THREE.Object3D(); bmL.name = 'muzzle_l'; bmL.position.set(-0.14, 0.14, 0.82);
        const bmR = new THREE.Object3D(); bmR.name = 'muzzle_r'; bmR.position.set(0.14, 0.14, 0.82);
        turret.add(turretHousing, barrelL, barrelR, optic, bmL, bmR);
        group.add(turret);
        break;
      }

      case 'missile_turret': {
        // ============================================================
        // PHALANX LONGBOLT SAM & PERIMETER DEFENSE TURRET
        // ============================================================
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.95, 0.42, 8), this.scvDarkMat);
        base.position.y = 0.21;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.62, 0.72, 8), teamMat);
        pedestal.position.y = 0.76;
        pedestal.castShadow = true;
        group.add(pedestal);

        // Rotating 360° Twin SAM Pod & Radar Gimbal
        const turret = new THREE.Group();
        turret.position.set(0, 1.24, 0);
        turret.name = 'turret';

        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.48), this.terranCompositeMat);
        turret.add(yoke);

        // Twin Longbolt Missile Pods (Left & Right)
        [-0.46, 0.46].forEach(xSide => {
          const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.78), this.terranPlatingMat);
          pod.position.set(xSide, 0.08, 0.08);
          pod.rotation.x = -0.18; // Angled slightly skyward
          pod.name = xSide < 0 ? 'pod_l' : 'pod_r';
          pod.castShadow = true;
          const warheads = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.06), this.scvHeatCoreMat);
          warheads.position.set(xSide, 0.14, 0.46);
          warheads.rotation.x = -0.18;
          const mNode = new THREE.Object3D();
          mNode.name = xSide < 0 ? 'muzzle_l' : 'muzzle_r';
          mNode.position.set(xSide, 0.2, 0.52);
          turret.add(pod, warheads, mNode);
        });

        // Top Doppler Tracking Radar Dish
        const radar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.1), this.terranGlowMat);
        radar.position.set(0, 0.38, -0.08);
        turret.add(radar);

        group.add(turret);
        break;
      }

      case 'factory': {
        // Vehicle factory: team-colour assembly hall, sliding vehicle bay door, swinging weld crane, venting smokestacks
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.8), teamMat);
        body.position.y = 0.8;
        body.castShadow = true;
        group.add(body);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.12), this.gunMetalMat);
        frame.position.set(0, 0.62, 1.42);
        const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.16), this.terranPlatingMat);
        bayDoor.position.set(0, 0.62, 1.5);
        bayDoor.name = 'bay_door';
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.2), this.scvHazardMat);
        lintel.position.set(0, 1.26, 1.5);
        group.add(frame, bayDoor, lintel);
        for (let i = 0; i < 2; i++) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8), this.gunMetalMat);
          stack.position.set(-0.8 + i * 0.6, 2.1, -0.8);
          stack.name = 'stack';
          const lip = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 12), this.scvSteelMat);
          lip.rotation.x = Math.PI / 2;
          lip.position.set(-0.8 + i * 0.6, 2.7, -0.8);
          group.add(stack, lip);
        }
        // Weld crane on the roof: swings over the roof deck while building vehicles
        const crane = new THREE.Group();
        crane.name = 'crane';
        crane.position.set(0.6, 1.6, 0.2);
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), this.turretMat);
        mast.position.y = 0.45;
        const jib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.14), this.terranPlatingMat);
        jib.position.set(-0.45, 0.9, 0);
        const weld = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), this.scvHeatCoreMat);
        weld.position.set(-1.0, 0.78, 0);
        weld.name = 'weld';
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), this.scvSteelMat);
        cable.position.set(-1.0, 0.88, 0);
        crane.add(mast, jib, cable, weld);
        group.add(crane);
        // Status light bar
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.06), this.terranGlowMat);
        bar.position.set(0, 1.64, 1.2);
        group.add(bar);
        break;
      }
      case 'starport': {
        // Launch pad: tall control tower with spinning radar, chasing runway lights, hangar doors that part for launches
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.8, 2.8), teamMat);
        pad.position.y = 0.4;
        pad.castShadow = true;
        group.add(pad);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 2.4), this.gunMetalMat);
        roof.position.y = 0.85;
        group.add(roof);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), this.turretMat);
        tower.position.set(0.9, 1.2, -0.9);
        tower.castShadow = true;
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), this.terranGlowMat);
        beacon.position.set(0.9, 2.1, -0.9);
        group.add(tower, beacon);
        const radar = new THREE.Group();
        radar.name = 'radar';
        radar.position.set(0.9, 2.3, -0.9);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.1), this.terranPlatingMat);
        const dishR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.05, 0.1, 8), this.terranCompositeMat);
        dishR.rotation.z = Math.PI / 2;
        dishR.position.x = 0.35;
        radar.add(arm, dishR);
        group.add(radar);
        // Hangar doors on the front face
        for (const side of [-1, 1]) {
          const hd = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.1), this.terranPlatingMat);
          hd.name = side < 0 ? 'door_l' : 'door_r';
          hd.position.set(side * 0.33, 0.38, 1.43);
          group.add(hd);
        }
        // Runway lights that chase toward the front
        for (let i = 0; i < 4; i++) {
          for (const side of [-1, 1]) {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.28), new THREE.MeshBasicMaterial({ color: 0xffbb00 }));
            strip.position.set(side * 0.8, 0.92, -0.9 + i * 0.6);
            strip.userData.chase = i;
            group.add(strip);
          }
        }
        // Landing-pad ring on the roof
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 20), this.terranGlowMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(-0.1, 0.92, 0.2);
        group.add(ring);
        break;
      }

      case 'hatchery': {
        // Massive Pulsing Organic Hive
        const hive = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 8), this.zergCarapaceMat);
        hive.scale.set(1.1, 0.6, 1.1);
        hive.position.y = 0.9;
        hive.castShadow = true;
        group.add(hive);

        // Vent Openings / Breathing chimneys
        for (let i = 0; i < 3; i++) {
          const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.8, 6), this.zergFleshMat);
          const angle = (i * Math.PI * 2) / 3;
          vent.position.set(Math.cos(angle) * 1.1, 1.4, Math.sin(angle) * 1.1);
          const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 4, 4), this.zergGlowMat);
          glow.position.set(Math.cos(angle) * 1.1, 1.7, Math.sin(angle) * 1.1);
          group.add(vent, glow);
        }
        break;
      }

      case 'overlord_pod': {
        // Pulsing bio-sac anchored by flesh tendrils
        const sac = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), this.zergFleshMat);
        sac.position.y = 1.05;
        sac.scale.set(1, 1.2, 1);
        sac.castShadow = true;
        group.add(sac);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), this.zergGlowMat);
        core.position.y = 1.1;
        group.add(core);
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2;
          const root = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), this.zergCarapaceMat);
          root.position.set(Math.cos(ang) * 0.6, 0.35, Math.sin(ang) * 0.6);
          root.rotation.z = Math.cos(ang) * 0.6;
          root.rotation.x = -Math.sin(ang) * 0.6;
          group.add(root);
        }
        break;
      }

      case 'spawning_pool': {
        // Pool Rim
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.35, 8, 16), this.zergCarapaceMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.3;
        rim.castShadow = true;
        group.add(rim);

        // Bubbling Genetic Acid Pool
        const acid = new THREE.Mesh(
          new THREE.CircleGeometry(1.1, 16),
          new THREE.MeshBasicMaterial({ color: 0x76c893 })
        );
        acid.rotation.x = -Math.PI / 2;
        acid.position.y = 0.25;
        group.add(acid);
        break;
      }

      case 'roach_warren': {
        // Spiky burrow mound
        const mound = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 7), this.zergCarapaceMat);
        mound.position.y = 0.7;
        mound.castShadow = true;
        group.add(mound);

        // Spikes jutting out
        for (let i = 0; i < 4; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 4), this.zergFleshMat);
          const angle = (i * Math.PI) / 2;
          spike.rotation.z = -0.5;
          spike.rotation.y = angle;
          spike.position.set(Math.cos(angle) * 0.9, 0.9, Math.sin(angle) * 0.9);
          group.add(spike);
        }
        break;
      }

      case 'hydralisk_den': {
        // Tower of tall organic bio-spikes
        const center = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 1.6, 7), this.zergCarapaceMat);
        center.position.y = 0.8;
        center.castShadow = true;
        group.add(center);

        // Needle spires
        for (let i = 0; i < 5; i++) {
          const spire = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.2, 5), this.zergFleshMat);
          const angle = (i * Math.PI * 2) / 5;
          spire.position.set(Math.cos(angle) * 0.8, 1.4, Math.sin(angle) * 0.8);
          group.add(spire);
        }
        break;
      }

      case 'spine_crawler': {
        // ============================================================
        // OUTLANDS SPINE CRAWLER BIO-DEFENSE COLONY
        // ============================================================
        const rootBase = new THREE.Mesh(new THREE.SphereGeometry(0.92, 8, 7), this.zergCarapaceMat);
        rootBase.scale.set(1.0, 0.48, 1.0);
        rootBase.position.y = 0.32;
        rootBase.castShadow = true;
        group.add(rootBase);

        // Chitinous Anchoring Root Claws
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.65, 5), this.zergFleshMat);
          claw.position.set(Math.cos(ang) * 0.78, 0.25, Math.sin(ang) * 0.78);
          claw.rotation.z = -Math.cos(ang) * 0.6;
          claw.rotation.x = Math.sin(ang) * 0.6;
          group.add(claw);
        }

        // Articulated Whip-like Striking Tendril ('turret' rotates toward target)
        const turret = new THREE.Group();
        turret.position.set(0, 0.55, 0);
        turret.name = 'turret';

        const stalkLower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.95, 7), this.zergFleshMat);
        stalkLower.position.set(0, 0.45, -0.1);
        stalkLower.rotation.x = -0.22;
        stalkLower.castShadow = true;

        const stalkUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.85, 7), this.zergCarapaceMat);
        stalkUpper.position.set(0, 1.15, 0.08);
        stalkUpper.rotation.x = 0.42;
        stalkUpper.castShadow = true;

        const impalerHead = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, 6), this.zergGlowMat);
        impalerHead.rotation.x = Math.PI / 2 + 0.15;
        impalerHead.position.set(0, 1.42, 0.52);

        turret.add(stalkLower, stalkUpper, impalerHead);
        group.add(turret);
        break;
      }

      case 'extractor': {
        // Zerg Geyser Cap
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 8), this.zergCarapaceMat);
        cap.scale.set(1.0, 0.7, 1.0);
        cap.position.y = 0.7;
        cap.castShadow = true;
        group.add(cap);

        // Gas Vent Chimney
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.9, 6), this.zergFleshMat);
        vent.position.y = 1.3;
        const gasGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0x55ff55 }));
        gasGlow.position.y = 1.7;
        group.add(vent, gasGlow);
        break;
      }

      // --- PROTOSS ("RED SOLARIS — THE EAST") STRUCTURES ---
      case 'nexus': {
        // Grand Solaris Pyramidal Citadel with Floating Khaydarin Crystal Core
        const foundation = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.95, 0.42, 4), this.protossArmorMat);
        foundation.position.y = 0.21;
        foundation.rotation.y = Math.PI / 4;
        foundation.castShadow = true;
        foundation.receiveShadow = true;
        group.add(foundation);

        // Stepped Golden Pyramid Body
        const pyramidLower = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.85, 4), this.protossGoldMat);
        pyramidLower.position.y = 1.15;
        pyramidLower.rotation.y = Math.PI / 4;
        pyramidLower.castShadow = true;
        group.add(pyramidLower);

        // 4 Swept Crimson Solaris Corner Buttresses
        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.35, 1.45), this.protossArmorMat);
          wing.position.set(Math.cos(ang) * 1.65, 0.78, Math.sin(ang) * 1.65);
          wing.rotation.y = -ang;
          wing.rotation.x = 0.35;
          wing.castShadow = true;
          group.add(wing);

          const crystalNode = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.protossGlowMat);
          crystalNode.position.set(Math.cos(ang) * 1.85, 1.45, Math.sin(ang) * 1.85);
          group.add(crystalNode);
        }

        // Rotating Apex Khaydarin Crystal & Psionic Halo ('radar' rotates in Building.ts)
        const apexGroup = new THREE.Group();
        apexGroup.name = 'radar';
        apexGroup.position.set(0, 2.55, 0);

        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 0), this.protossPsiBladeMat);
        crystal.scale.set(0.85, 1.45, 0.85);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.06, 6, 16), this.protossGoldMat);
        ring.rotation.x = Math.PI / 2 + 0.25;
        apexGroup.add(crystal, ring);
        group.add(apexGroup);
        break;
      }

      case 'pylon': {
        // Floating Khaydarin Psionic Crystal Monolith
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.92, 0.28, 6), this.protossArmorMat);
        pedestal.position.y = 0.14;
        pedestal.castShadow = true;
        group.add(pedestal);

        // Rotating Floating Crystal & Golden Containment Claws
        const crystalGroup = new THREE.Group();
        crystalGroup.name = 'radar';
        crystalGroup.position.set(0, 1.25, 0);

        const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), this.protossPsiBladeMat);
        coreCrystal.scale.set(0.75, 1.65, 0.75);
        crystalGroup.add(coreCrystal);

        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI * 2) / 3;
          const claw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.22), this.protossGoldMat);
          claw.position.set(Math.cos(ang) * 0.62, 0, Math.sin(ang) * 0.62);
          claw.rotation.y = -ang;
          crystalGroup.add(claw);
        }

        group.add(crystalGroup);
        break;
      }

      case 'assimilator': {
        // Solaris Vespene Harvester Arch over Geyser
        const dome = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.65, 1.35, 8), this.protossArmorMat);
        dome.position.y = 0.68;
        dome.castShadow = true;
        group.add(dome);

        const arch1 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 6, 16, Math.PI), this.protossGoldMat);
        arch1.position.y = 1.15;
        const arch2 = arch1.clone();
        arch2.rotation.y = Math.PI / 2;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), this.protossPsiBladeMat);
        core.position.y = 1.95;
        group.add(arch1, arch2, core);
        break;
      }

      case 'gateway': {
        // Dimensional Warp Portal Structure
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.55, 0.36, 8), this.protossArmorMat);
        base.position.y = 0.18;
        base.castShadow = true;
        group.add(base);

        // Twin Tall Golden Warp Arch Pillars
        [-1.05, 1.05].forEach(xPillar => {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.15, 0.58), this.protossGoldMat);
          pillar.position.set(xPillar, 1.15, 0);
          pillar.rotation.z = xPillar > 0 ? 0.15 : -0.15;
          pillar.castShadow = true;
          group.add(pillar);
        });

        // Glowing Dimensional Warp Vortex Core
        const vortex = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16), this.protossPsiBladeMat);
        vortex.rotation.x = Math.PI / 2;
        vortex.position.set(0, 1.25, 0);
        vortex.name = 'radar';
        group.add(vortex);
        break;
      }

      case 'forge': {
        // Solaris Cybernetic Matrix & Upgrade Foundry
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.55, 6), this.protossArmorMat);
        base.position.y = 0.28;
        base.castShadow = true;
        group.add(base);

        // 3 Golden Conduits converging on a spinning plasma forge core
        for (let i = 0; i < 3; i++) {
          const ang = (i * Math.PI * 2) / 3;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, 0.55), this.protossGoldMat);
          arm.position.set(Math.cos(ang) * 0.92, 0.95, Math.sin(ang) * 0.92);
          arm.rotation.y = -ang;
          arm.castShadow = true;
          group.add(arm);
        }

        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 1.45, 0);
        const anvil = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), this.protossGlowMat);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 12), this.protossGoldMat);
        ring.rotation.x = Math.PI / 3;
        turret.add(anvil, ring);
        group.add(turret);
        break;
      }

      case 'photon_cannon': {
        // Automated Antimatter Defense Cannon (Ground & Air)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.95, 0.42, 6), this.protossArmorMat);
        base.position.y = 0.21;
        base.castShadow = true;
        group.add(base);

        for (let i = 0; i < 4; i++) {
          const ang = (i * Math.PI) / 2 + Math.PI / 4;
          const claw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.32), this.protossGoldMat);
          claw.position.set(Math.cos(ang) * 0.62, 0.68, Math.sin(ang) * 0.62);
          claw.rotation.y = -ang;
          group.add(claw);
        }

        // Floating Antimatter Sphere ('turret' tracks enemies)
        const turret = new THREE.Group();
        turret.name = 'turret';
        turret.position.set(0, 1.32, 0);

        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 10), this.protossPsiBladeMat);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 6, 12), this.protossGoldMat);
        halo.rotation.x = Math.PI / 2;
        turret.add(sphere, halo);
        group.add(turret);
        break;
      }

      case 'stargate': {
        // Orbital Fleet Warp Conduit
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.55, 0.35, 8), this.protossArmorMat);
        pad.position.y = 0.18;
        pad.castShadow = true;
        group.add(pad);

        // Giant Floating Orbital Warp Ring
        const ringGroup = new THREE.Group();
        ringGroup.name = 'radar';
        ringGroup.position.set(0, 1.65, 0);

        const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.18, 8, 18), this.protossGoldMat);
        outerRing.rotation.x = Math.PI / 3;
        const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), this.protossPsiBladeMat);
        ringGroup.add(outerRing, innerCore);
        group.add(ringGroup);
        break;
      }
    }

    return group;
  }

  private mineralVariants?: THREE.MeshStandardMaterial[];

  /** Hex-prism crystal with a pointed (asymmetric, jittered) tip - every call yields a unique faceted shard. */
  private makeCrystalGeo(h: number, r: number): THREE.BufferGeometry {
    const pts = [
      new THREE.Vector2(r * 0.55, 0), new THREE.Vector2(r, h * 0.06), new THREE.Vector2(r * 0.96, h * 0.45),
      new THREE.Vector2(r * 0.72, h * 0.76), new THREE.Vector2(0.001, h)
    ];
    const geo = new THREE.LatheGeometry(pts, 6);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const jx = (Math.random() - 0.5) * r * 0.9, jz = (Math.random() - 0.5) * r * 0.9;
    const sx = 0.75 + Math.random() * 0.5, sz = 0.75 + Math.random() * 0.5;
    const memo = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      let d = memo.get(key);
      if (!d) { d = [(Math.random() - 0.5) * r * 0.28, (Math.random() - 0.5) * h * 0.06, (Math.random() - 0.5) * r * 0.28]; memo.set(key, d); }
      const t = y / h; // shear the upper part sideways so the tip leans off-axis
      x = x * sx + d[0] * (y > 0.01 ? 1 : 0) + jx * t * t;
      z = z * sz + d[2] * (y > 0.01 ? 1 : 0) + jz * t * t;
      pos.setXYZ(i, x, y + (y > 0.01 ? d[1] : 0), z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Create Mineral Patch (translucent-looking faceted blue crystal cluster; unique every time)
  public createMineralPatch(): THREE.Group {
    const glb = this.mineralPatchFromGlb();
    if (glb) return glb;
    const group = new THREE.Group();
    if (!this.mineralVariants) {
      const mk = (color: number, emissive: number) => new THREE.MeshStandardMaterial({
        color, emissive, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.12, flatShading: true
      });
      this.mineralVariants = [mk(0x2a64ec, 0x0f3cb4), mk(0x3578f2, 0x1448c0), mk(0x4a8cf6, 0x1a54c8)]; // close shades, subtle variation
    }
    const mats = this.mineralVariants;
    const count = 13 + Math.floor(Math.random() * 4); // 13-16 crystals: a full, dense field (they vanish as it is mined out)
    const a0 = Math.random() * Math.PI * 2;
    const crystals: { m: THREE.Mesh; h: number }[] = [];
    for (let i = 0; i < count; i++) {
      const centre = i < 2;
      const ring = i < 2 ? 0 : i < 7 ? 1 : 2;           // core, inner ring, outer shards
      const ang = a0 + (i / count) * Math.PI * 2 * 1.7 + (Math.random() - 0.5) * 0.8;
      const rad = ring === 0 ? Math.random() * 0.18 : ring === 1 ? 0.3 + Math.random() * 0.28 : 0.58 + Math.random() * 0.3;
      const h = ring === 0 ? 1.9 + Math.random() * 0.9 : ring === 1 ? 1.1 + Math.random() * 1.1 : 0.45 + Math.random() * 0.8;
      const r = ring === 0 ? 0.3 + Math.random() * 0.1 : ring === 1 ? 0.2 + Math.random() * 0.14 : 0.12 + Math.random() * 0.12;
      const crystal = new THREE.Mesh(this.makeCrystalGeo(h, r), mats[Math.floor(Math.random() * mats.length)]);
      crystal.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      const lean = centre ? 0.08 : 0.12 + Math.random() * 0.3;
      crystal.rotation.set(Math.sin(ang) * lean, Math.random() * Math.PI, -Math.cos(ang) * lean);
      crystal.castShadow = ring < 2;
      group.add(crystal);
      crystals.push({ m: crystal, h });
    }
    // tallest crystals last to vanish as the patch is mined out
    group.userData.crystals = crystals.sort((x, y) => y.h - x.h).map(c => c.m);
    return group;
  }

  /** Mineral patch from models/mineral_patch.glb: one sample field, varied per patch by a random spin, squash and 0-2 missing small crystals. */
  private mineralPatchFromGlb(): THREE.Group | null {
    const rig = buildRigged('mineral_patch');
    if (!rig) return null;
    const group = new THREE.Group();
    rig.rotation.y = Math.random() * Math.PI * 2;
    rig.scale.set(0.92 + Math.random() * 0.16, 0.85 + Math.random() * 0.3, 0.92 + Math.random() * 0.16);
    const found: { m: THREE.Mesh; h: number }[] = [];
    rig.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => { const sm = mt as THREE.MeshStandardMaterial; if (!sm.flatShading) { sm.flatShading = true; sm.needsUpdate = true; } });
      m.geometry.computeBoundingBox();
      found.push({ m, h: m.geometry.boundingBox!.max.y });
    });
    found.sort((a, b) => b.h - a.h);
    for (let i = 0, drop = Math.floor(Math.random() * 3); i < drop && found.length > 8; i++) found.pop()!.m.removeFromParent();
    group.add(rig);
    group.userData.crystals = found.map(c => c.m); // tallest first; they vanish last as the patch is mined out
    return group;
  }

  private geyserGroundTex?: THREE.CanvasTexture;
  private gasPuffTex?: THREE.CanvasTexture;

  /** Soft scorched-earth patch whose alpha fades to nothing at the rim, so it melts into whatever terrain is below. */
  private getGeyserGroundTex(): THREE.CanvasTexture {
    if (this.geyserGroundTex) return this.geyserGroundTex;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!, img = g.createImageData(N, N);
    const h = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x: number, y: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - w) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * w;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x / N - 0.5) * 2, dy = (y / N - 0.5) * 2, r = Math.hypot(dx, dy);
      const n = vn(x * 0.06, y * 0.06) * 0.55 + vn(x * 0.17, y * 0.17) * 0.3 + vn(x * 0.5, y * 0.5) * 0.15;
      const edge = 0.5 + n * 0.5; // noisy, irregular boundary
      const a = Math.max(0, Math.min(1, (edge - r * 0.95) / 0.45));
      const shade = 0.55 + n * 0.45;
      const i = (y * N + x) * 4;
      // neutral earth: warm grey-brown, a touch darker toward the centre (scorch)
      const k = shade * (0.62 + 0.38 * Math.min(1, r * 1.3));
      img.data[i] = 112 * k; img.data[i + 1] = 98 * k; img.data[i + 2] = 86 * k;
      img.data[i + 3] = 255 * a * a * (3 - 2 * a);
    }
    g.putImageData(img, 0, 0);
    this.geyserGroundTex = new THREE.CanvasTexture(c);
    this.geyserGroundTex.colorSpace = THREE.SRGBColorSpace;
    return this.geyserGroundTex;
  }

  private getGasPuffTex(): THREE.CanvasTexture {
    if (this.gasPuffTex) return this.gasPuffTex;
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    grad.addColorStop(0, 'rgba(150,255,140,0.85)'); grad.addColorStop(0.45, 'rgba(90,220,90,0.4)'); grad.addColorStop(1, 'rgba(60,200,70,0)');
    g.fillStyle = grad; g.fillRect(0, 0, N, N);
    this.gasPuffTex = new THREE.CanvasTexture(c);
    this.gasPuffTex.colorSpace = THREE.SRGBColorSpace;
    return this.gasPuffTex;
  }

  /** Rocky volcanic vent cone: noise-displaced, ridged, with a crater lip. Vertex-coloured in neutral earth tones. */
  private makeVentGeo(r: number, h: number, seed: number): THREE.BufferGeometry {
    const geo = new THREE.CylinderGeometry(r * 0.52, r, h, 28, 10, true);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const hash = (a: number, b: number) => { const v = Math.sin(a * 12.9898 + b * 78.233 + seed * 3.7) * 43758.5453; return v - Math.floor(v); };
    const sm = (a: number, b: number) => {
      const ai = Math.floor(a), bi = Math.floor(b), af = a - ai, bf = b - bi, u = af * af * (3 - 2 * af), w = bf * bf * (3 - 2 * bf);
      return (hash(ai, bi) * (1 - u) + hash(ai + 1, bi) * u) * (1 - w) + (hash(ai, bi + 1) * (1 - u) + hash(ai + 1, bi + 1) * u) * w;
    };
    const dark = new THREE.Color(0x3f3730), mid = new THREE.Color(0x6a5d50), light = new THREE.Color(0x8b7d6c), rust = new THREE.Color(0x7a4e38);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = y / h + 0.5; // 0 base .. 1 rim
      const ang = Math.atan2(z, x);
      const rad = Math.hypot(x, z);
      const bump = 1 + (sm(ang * 2.2 + 5, t * 5) - 0.5) * 0.34 + Math.sin(ang * 7 + seed) * 0.05 + (sm(ang * 9, t * 14) - 0.5) * 0.08;
      const flare = 1 + Math.pow(1 - t, 3) * 0.35; // skirt widens at the base so it settles into the ground
      const nr = rad * bump * flare;
      x = Math.cos(ang) * nr; z = Math.sin(ang) * nr;
      y += (sm(ang * 3, t * 3) - 0.5) * h * 0.12;
      pos.setXYZ(i, x, y, z);
      const n = sm(ang * 5 + t * 3, t * 8);
      c.copy(dark).lerp(mid, Math.min(1, t * 1.4 + n * 0.35)).lerp(light, Math.max(0, t - 0.55) * 1.2 * n);
      c.lerp(rust, Math.max(0, sm(ang * 2 + 9, t * 6) - 0.62) * 1.6 * (1 - t * 0.6));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Create Vespene Geyser: three weathered volcanic vents venting soft green gas, on a scorched patch that fades into the terrain
  public createVespeneGeyser(): THREE.Group {
    const rig = buildRigged('vespene_geyser');
    if (rig) {
      // models/vespene_geyser.glb has the cones, throats, rubble and ground patch; the drifting gas puffs (sprites) are animated here
      const g = new THREE.Group(); g.add(rig);
      rig.traverse(o => {
        const m = o as THREE.Mesh, mt = m.isMesh ? m.material as THREE.MeshStandardMaterial : null;
        if (mt && mt.map && mt.transparent) { mt.depthWrite = false; mt.polygonOffset = true; mt.polygonOffsetFactor = -2; mt.polygonOffsetUnits = -2; m.renderOrder = 1; m.receiveShadow = true; m.castShadow = false; }
      });
      const puffMat = (op: number) => new THREE.SpriteMaterial({ map: this.getGasPuffTex(), transparent: true, depthWrite: false, opacity: op });
      for (const v of [{ x: -0.62, z: 0.1, r: 0.86, h: 1.15, seed: 1 }, { x: 0.75, z: -0.5, r: 0.74, h: 0.95, seed: 2 }, { x: 0.12, z: 0.95, r: 0.58, h: 0.66, seed: 3 }]) {
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.Sprite(puffMat(0.5));
          sp.raycast = () => {}; sp.userData.noOutline = true;
          const phase = k / 5 + v.seed * 0.17;
          sp.onBeforeRender = () => {
            const t = ((performance.now() * 0.00028 + phase) % 1);
            const sz = v.r * (0.9 + t * 2.4);
            sp.scale.set(sz, sz * 1.25, 1);
            sp.position.set(v.x + Math.sin(t * 6 + phase * 9) * 0.12, v.h + 0.15 + t * 2.6, v.z + Math.cos(t * 5 + phase * 7) * 0.12);
            (sp.material as THREE.SpriteMaterial).opacity = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 1.3;
          };
          g.add(sp);
        }
      }
      return g;
    }
    const group = new THREE.Group();
    // scorched-earth patch (alpha-faded rim)
    const patchMat = new THREE.MeshStandardMaterial({
      map: this.getGeyserGroundTex(), transparent: true, depthWrite: false, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), patchMat);
    patch.rotation.x = -Math.PI / 2; patch.position.y = 0.04; patch.receiveShadow = true; patch.renderOrder = 1;
    group.add(patch);

    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
    const glowCol = new THREE.Color(0x6dff6d).multiplyScalar(1.25);
    const glow = new THREE.MeshBasicMaterial({ color: glowCol });
    const puffMat = (op: number) => new THREE.SpriteMaterial({ map: this.getGasPuffTex(), transparent: true, depthWrite: false, opacity: op });

    const vents = [
      { x: -0.62, z: 0.1, r: 0.86, h: 1.15, seed: 1 },
      { x: 0.75, z: -0.5, r: 0.74, h: 0.95, seed: 2 },
      { x: 0.12, z: 0.95, r: 0.58, h: 0.66, seed: 3 }
    ];
    for (const v of vents) {
      const cone = new THREE.Mesh(this.makeVentGeo(v.r, v.h, v.seed), rockMat);
      cone.position.set(v.x, v.h / 2 - 0.02, v.z);
      cone.castShadow = true; cone.receiveShadow = true;
      group.add(cone);
      // dark throat + faint green glow deep inside
      const throat = new THREE.Mesh(new THREE.CircleGeometry(v.r * 0.5, 20), dark);
      throat.rotation.x = -Math.PI / 2; throat.position.set(v.x, v.h - 0.03, v.z);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(v.r * 0.34, 18), glow);
      hole.rotation.x = -Math.PI / 2; hole.position.set(v.x, v.h - 0.02, v.z);
      group.add(throat, hole);
      // soft drifting gas puffs (billboards that rise, grow and fade in a loop)
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Sprite(puffMat(0.5));
        sp.raycast = () => {}; sp.userData.noOutline = true;
        const phase = k / 5 + v.seed * 0.17;
        sp.onBeforeRender = () => {
          const t = ((performance.now() * 0.00028 + phase) % 1);
          const sz = v.r * (0.9 + t * 2.4);
          sp.scale.set(sz, sz * 1.25, 1);
          sp.position.set(v.x + Math.sin(t * 6 + phase * 9) * 0.12, v.h + 0.15 + t * 2.6, v.z + Math.cos(t * 5 + phase * 7) * 0.12);
          (sp.material as THREE.SpriteMaterial).opacity = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 1.3;
        };
        sp.material = puffMat(0.5);
        group.add(sp);
      }
    }
    // half-buried rubble + pebbles tying the vents into the ground
    for (let i = 0; i < 12; i++) {
      const a = i * 0.83 + 0.3, rr = 1.2 + ((i * 7) % 5) * 0.2, sz = 0.08 + ((i * 5) % 4) * 0.045;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(sz, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x5e5348).offsetHSL(0, 0, ((i * 13) % 7 - 3) * 0.012), roughness: 1 }));
      rock.scale.set(1.2, 0.6, 1);
      rock.position.set(Math.cos(a) * rr, sz * 0.2, Math.sin(a) * rr);
      rock.rotation.y = i;
      rock.castShadow = true;
      group.add(rock);
    }
    return group;
  }
}

export const modelFactory = new ModelFactory();
