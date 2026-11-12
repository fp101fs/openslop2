import { applyDetail } from './DetailTextures';
import * as THREE from 'three';
import { zergSkinMaterial, type ZergSkinProfile } from './ZergSkin';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Skinned, animated unit models (Siege Tank, Thor, Goliath) loaded from slimmed GLBs in public/models/ (see
 * tools/model/slim-glb.py). Each model keeps every clip in its source file (walk, attack, stand, fidgets, dances,
 * morph, spell...), which RiggedAnimator plays. Geometry, textures and materials are shared between instances; each
 * instance gets its own cloned skeleton and AnimationMixer.
 */
export type RigKind = 'larva' | 'siege_tank' | 'thor' | 'goliath' | 'probe' | 'banshee' | 'barracks' | 'command_center' | 'orbital_command' | 'marine' | 'medic' | 'marauder' | 'medivac' | 'hellion' | 'firebat' | 'factory' | 'starport' | 'missile_turret' | 'bunker' | 'refinery' | 'hydralisk' | 'drone' | 'roach' | 'scv' | 'mutalisk' | 'queen' | 'zealot' | 'archon' | 'spawning_pool' | 'nexus' | 'stalker' | 'void_ray' | 'gateway' | 'hatchery' | 'baneling' | 'ravager' | 'ultralisk' | 'broodlord' | 'viper' | 'supply_depot' | 'crane' | 'ghost' | 'reaper' | 'liberator' | 'raven' | 'battlecruiser' | 'armory' | 'engineering_bay' | 'mineral_patch' | 'vespene_geyser' | 'techlab' | 'techlab_barracks' | 'techlab_starport' | 'reactor' | 'mule' | 'cyclone' | 'odin' | 'overlord' | 'swarm_host' | 'immortal' | 'colossus' | 'carrier' | 'tempest' | 'adept' | 'hive' | 'infestation_pit' | 'extractor' | 'hydralisk_den' | 'spine_crawler' | 'roach_warren' | 'baneling_nest' | 'evolution_chamber' | 'lurker_den' | 'spire' | 'greater_spire' | 'nydus_network' | 'ultralisk_cavern' | 'spore_crawler' | 'cybernetics_core' | 'twilight_council' | 'robotics_facility' | 'robotics_bay' | 'templar_archives' | 'dark_shrine' | 'fleet_beacon' | 'shield_battery' | 'pylon' | 'assimilator' | 'forge' | 'photon_cannon' | 'stargate' | 'wraith' | 'viking' | 'widow_mine' | 'creep_tumor' | 'nydus_worm' | 'auto_turret' | 'sentry' | 'egg'
  | 'observer' | 'warp_prism' | 'disruptor' | 'phoenix' | 'oracle' | 'mothership' | 'infestor' | 'fusion_core' | 'ghost_academy' | 'sensor_tower' | 'nova' | 'dominion_transport';

interface RigDef {
  url: string;
  /** Target size of the model in world units: height for walkers, length for the tank. */
  size: { height?: number; length?: number };
  /** Extra yaw so the model faces +Z (the game's forward axis). */
  yaw: number;
  /** Source nodes exposed as muzzle points (renamed muzzle_N so Muzzles.ts finds them). */
  muzzles?: RegExp;
  /** For models with no muzzle node: a point parented to `bone` (offset in that bone's own space, measured at the gun tip) exposed as muzzle_0. */
  muzzleAt?: { bone: string; at: [number, number, number] }[];
  /** The source model ships without a weapon mesh: build a procedural rifle held by this hand bone. */
  gunOn?: string;
  /** GLB of a real weapon to hold at `gunOn` (otherwise a procedural rifle is built) */
  gunUrl?: string;
  /** Extra turn (radians, about the up axis) for the held gun, since the gun is aligned in the bind pose but the hand turns in the idle pose. */
  gunYaw?: number;
  /** Extra downward tilt (radians) for the held gun's muzzle. */
  gunPitch?: number;
  /** Sideways / up shift of the held gun (fraction of its length) so the hand grips it instead of cutting through it. */
  gunShift?: [number, number, number?];
  /** The weapon GLB's muzzle points backwards: turn it end for end. */
  gunFlip?: boolean;
  /** Static (unanimated, vertex-coloured) model from tools/model/build-static.ts: no clips, no mixer. */
  isStatic?: boolean;
  /** Extra multiplier on top of the baked size. */
  scale?: number;
  /** Apply the procedural PBR detail set (needs UVs in the GLB). */
  detail?: boolean;
  /** Static model that is already final (game units, own materials): keep materials and scale exactly as exported. */
  asIs?: boolean;
  /** Brightness multiplier on the vertex colours when `detail` is set. */
  detailTint?: number;
  /** Exaggerate the walk clip's joint rotations (about their first frame) by this factor: the source model's stride is too subtle to read. */
  walkGain?: number;
  /** Emissive intensity override (the exported glow colours wash out to white under the game lighting). */
  emissive?: number;
  /** Hover height above the ground. */
  lift?: number;
  /** Keep the GLB's y=0 as the ground line instead of standing the lowest vertex on it (parts below stay underground). */
  keepGround?: boolean;
  /** Lift the dark parts of the albedo texture (0..1, ~0.3 = clearly lighter shadows). */
  shadowLift?: number;
  /** Crispness: scale saturation by (1 + vivid) and add mid-tone contrast (~0.25 = clearly punchier). */
  vivid?: number;
  /** Hue-shift the blue parts of the texture / base colour to Terran red. */
  blueToRed?: boolean;
  /** Walk clips carry root motion (the source model travels forward): pin the travelling position tracks so the unit walks in place. */
  inPlace?: boolean;
  /** Fit / centre the model on this clip's first frame instead of the bind pose (when the bind pose is splayed out, e.g. the Baneling). */
  fitClip?: string;
  /** Extra clips cut from an existing one (seconds). `slow` stretches the cut in time; `pingPong` plays it forward then back so any slice loops without a jump. */
  subclips?: SubClip[];
  /** Multiply-tint the material of meshes whose name matches (each gets its own material copy), e.g. the Medivac's blue torso. */
  tint?: { mesh: RegExp; color: number }[];
  /** Repaint the texture into the purple Zerg hide with a team-coloured carapace mask, and light it (see ZergSkin.ts). */
  zergSkin?: boolean | ZergSkinProfile;
  /** Bind-pose height range (model units) over which the zergSkin team colour fades in (baked into the mask texture). */
  zergTeamY?: [number, number];
}

const DEFS: Record<RigKind, RigDef> = {
  // scenery only (placed by the Renderer): an inert industrial crane
  crane: { url: 'models/crane.glb', size: { height: 6 }, yaw: 0, shadowLift: 0.2 },
  siege_tank: { url: 'models/siege_tank.glb', size: { length: 2.3 }, yaw: -Math.PI / 2 + 0.478, shadowLift: 0.2,
    // the GLB has no weapon attachment nodes: muzzles sit at the barrel tips, found as the farthest vertices skinned to the two barrel bones
    muzzleAt: [{ bone: 'Object95_11', at: [-0.3679, 0.0897, -0.209] }, { bone: 'Object94_13', at: [-0.3679, -0.0906, -0.209] }] }, // the GLB's hull and barrel axes are both ~27° off +X (measured from the skinned vertices)
  thor: { url: 'models/thor.glb', size: { height: 2.4 }, yaw: 0, shadowLift: 0.12, muzzles: /^Ref_Weapon[ _]0[1-4]/ },
  goliath: { url: 'models/goliath.glb', size: { height: 1.95 }, yaw: 0, muzzles: /^(Ref_Weapon[ _]01|Ref_Weapon_\d+$)/ },
  probe: { url: 'models/probe.glb', size: { length: 0.95 }, yaw: 0, lift: 0.45 },
  banshee: { url: 'models/banshee.glb', size: { length: 2.2 }, yaw: 0 },
  reaper: { url: 'models/reaper.glb', size: { height: 1.3 }, yaw: 0, shadowLift: 0.2, inPlace: true, muzzleAt: [{ bone: 'Ref_Weapon_Right_2', at: [0, 0, 0] }, { bone: 'Ref_Weapon_Left_6', at: [0, 0, 0] }] },
  liberator: { url: 'models/liberator.glb', size: { length: 2.7 }, yaw: 0, shadowLift: 0.15 },
  raven: { url: 'models/raven.glb', size: { length: 2.0 }, yaw: 0, shadowLift: 0.15 },
  battlecruiser: { url: 'models/battlecruiser.glb', size: { length: 4.4 }, yaw: 0, shadowLift: 0.12 },
  // Campaign Nova: "female specops" (one clip: a T-pose frame, then a walk cycle); the stand is a slow, ping-ponged slice of the walk
  nova: { url: 'models/nova.glb', size: { height: 1.35 }, yaw: 0, inPlace: true, muzzleAt: [{ bone: 'R_wrist_046', at: [0, 0, 0] }],
    subclips: [
      { name: 'walk', from: 'tpose_walk', start: 0.134, end: 1.534 }, // one full step cycle (repeats every 1.4 s)
      // legs straight and planted (the first frame), upper body from the arm-passing part of the step at a third of its motion, very slow
      { name: 'stand', from: 'tpose_walk', start: 0.85, end: 1.45, slow: 7, pingPong: true, gain: 0.3, hold: { bones: /hip|leg|knee|ankle|foot|toes|root/i, at: 0 } },
    ] },
  ghost: { url: 'models/ghost.glb', size: { height: 1.35 }, yaw: 0, shadowLift: 0.25, inPlace: true, muzzleAt: [{ bone: 'ValveBipedw_shotgun_end_058', at: [0, 0, 0] }], gunOn: 'ValveBipedBip01_R_Hand_032', gunUrl: 'models/nova_sniper.glb', gunYaw: Math.PI / 2 - 0.3, gunPitch: 0.15, gunShift: [0.04, 0.08, 0.3], gunFlip: true },
  // made by Claude (untextured sculpt), baked with tools/model/build-static.ts: steel, hazard stripes, red panels that take the team colour
  armory: { url: 'models/armory.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.18 },
  mineral_patch: { url: 'models/mineral_patch.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  vespene_geyser: { url: 'models/vespene_geyser.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  techlab: { url: 'models/techlab.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  techlab_barracks: { url: 'models/techlab_barracks.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  techlab_starport: { url: 'models/techlab_starport.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  reactor: { url: 'models/reactor.glb', size: {}, yaw: 0, isStatic: true, asIs: true },
  mule: { url: 'models/mule.glb', size: { length: 1.15 }, yaw: 0, shadowLift: 0.05 },
  // Campaign (Liberation Day): "Armored Cyberpunk Hovertruck Tank" by Jungle Jim (Sketchfab), slimmed; hovers, roof turret. Loaded only by missions that use it.
  dominion_transport: { url: 'models/dominion_transport.glb', size: { length: 3.2 }, yaw: 0, lift: 0.35, shadowLift: 0.15 },
  // Renn01's Terran Building Pack (Hive Workshop), converted with tools/model/build-zerg-mdx.ts; the old model is still in models/engineering_bay.glb
  engineering_bay: { url: 'models/engineering_bay_sc2.glb', size: { length: 2.9 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  barracks: { url: 'models/barracks.glb', size: { length: 3.1 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  // animated Raise_Lower clip (t=2.5 raised, t=0/5 lowered); bind pose = raised, hatch open; the base bottom sits on the ground
  // static model from Renn01's Terran Building Pack (build-zerg-mdx.ts, GROUND=keep); its lower body sits underground and the depot
  // lowers by sinking (RiggedAnimator.updateBuilding). The old animated model is still in models/supply_depot_animated.glb.
  supply_depot: { url: 'models/supply_depot_sc2.glb', size: { length: 2.1 }, yaw: 0, shadowLift: 0.18, vivid: 0.3, keepGround: true },
  command_center: { url: 'models/command_center.glb', size: { length: 4.9 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  orbital_command: { url: 'models/orbital_command.glb', size: { length: 4.9 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  marauder: { url: 'models/marauder.glb', size: { height: 1.5 }, yaw: 0, shadowLift: 0.3 },
  medivac: { url: 'models/medivac.glb', size: { length: 2.3 }, yaw: 0, tint: [{ mesh: /^Object_7$/, color: 0x6f9bff }] },
  hellion: { url: 'models/hellion.glb', size: { length: 1.5 }, yaw: 0, muzzles: /^Ref_Weapon[ _]01/ },
  firebat: { url: 'models/firebat.glb', size: {}, yaw: 0, isStatic: true, scale: 0.7 },
  factory: { url: 'models/factory.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.18, vivid: 0.3, blueToRed: true },
  starport: { url: 'models/starport.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  missile_turret: { url: 'models/missile_turret.glb', size: { length: 1.7 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  bunker: { url: 'models/bunker.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  // Renn01's Terran Building Pack (single smoke stack, like SC2); the code-built one is still in models/refinery.glb
  refinery: { url: 'models/refinery_sc2.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  hydralisk: { url: 'models/hydralisk.glb', size: { height: 1.8 }, yaw: 0, zergSkin: true, zergTeamY: [0.85, 1.1] },
  larva: { url: 'models/larva.glb', size: { length: 1.4 }, yaw: 0, fitClip: 'larva01|larva01', shadowLift: 0.15, zergSkin: 'larva' },
  drone: { url: 'models/drone.glb', size: {}, yaw: 0, isStatic: true, scale: 0.8 },
  roach: { url: 'models/roach.glb', size: { length: 1.6 }, yaw: 0, inPlace: true, zergSkin: 'roach' },
  scv: { url: 'models/scv.glb', size: { height: 1.05 }, yaw: 0 },
  marine: { url: 'models/marine.glb', size: { height: 1.05 }, yaw: 0, muzzleAt: [{ bone: 'mixamorigRightHand_029', at: [-0.4488, 1.9552, 0.1613] }] },
  medic: { url: 'models/medic.glb', size: {}, yaw: 0, isStatic: true, scale: 0.65 },
  mutalisk: { url: 'models/mutalisk.glb', size: { length: 2.2 }, yaw: 0, shadowLift: 0.2 },
  queen: { url: 'models/queen.glb', size: { length: 2.3 }, yaw: 0, shadowLift: 0.14 },
  zealot: { url: 'models/zealot.glb', size: { height: 1.45 }, yaw: 0 },
  archon: { url: 'models/archon.glb', size: { height: 2.4 }, yaw: 0 },
  spawning_pool: { url: 'models/spawning_pool.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.12, vivid: 0.25 },
  nexus: { url: 'models/nexus.glb', size: { length: 5.4 }, yaw: 0, shadowLift: 0.12, vivid: 0.25 },
  stalker: { url: 'models/stalker.glb', size: { height: 1.85 }, yaw: 0 },
  void_ray: { url: 'models/void_ray.glb', size: { length: 2.4 }, yaw: 0 },
  gateway: { url: 'models/gateway.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.12, vivid: 0.25 },
  hatchery: { url: 'models/hatchery.glb', size: { length: 5.6 }, yaw: 0, shadowLift: 0.16, vivid: 0.15 },
  hive: { url: 'models/hive.glb', size: { length: 5.4 }, yaw: 0, shadowLift: 0.16, vivid: 0.15 },
  infestation_pit: { url: 'models/infestation_pit.glb', size: { length: 3.2 }, yaw: 0, shadowLift: 0.12, vivid: 0.15 },
  extractor: { url: 'models/extractor.glb', size: { length: 2.9 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  hydralisk_den: { url: 'models/hydralisk_den.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  baneling_nest: { url: 'models/baneling_nest.glb', size: { length: 2.6 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  evolution_chamber: { url: 'models/evolution_chamber.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  lurker_den: { url: 'models/lurker_den.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  spire: { url: 'models/spire.glb', size: { length: 1.9 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  greater_spire: { url: 'models/greater_spire.glb', size: { length: 2.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  nydus_network: { url: 'models/nydus_network.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  ultralisk_cavern: { url: 'models/ultralisk_cavern.glb', size: { length: 3.2 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  spore_crawler: { url: 'models/spore_crawler.glb', size: { length: 1.8 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  cybernetics_core: { url: 'models/cybernetics_core.glb', size: { length: 2.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  twilight_council: { url: 'models/twilight_council.glb', size: { length: 2.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  robotics_facility: { url: 'models/robotics_facility.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  robotics_bay: { url: 'models/robotics_bay.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  templar_archives: { url: 'models/templar_archives.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  dark_shrine: { url: 'models/dark_shrine.glb', size: { length: 1.9 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  fleet_beacon: { url: 'models/fleet_beacon.glb', size: { length: 2.8 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  shield_battery: { url: 'models/shield_battery.glb', size: { length: 1.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  pylon: { url: 'models/pylon.glb', size: { length: 1.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  assimilator: { url: 'models/assimilator.glb', size: { length: 2.6 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  forge: { url: 'models/forge.glb', size: { length: 2.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  photon_cannon: { url: 'models/photon_cannon.glb', size: { length: 1.7 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  stargate: { url: 'models/stargate.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  wraith: { url: 'models/wraith.glb', size: { length: 1.9 }, yaw: 0 },
  viking: { url: 'models/viking.glb', size: { length: 1.9 }, yaw: 0 },
  widow_mine: { url: 'models/widow_mine.glb', size: { length: 1.0 }, yaw: 0 },
  creep_tumor: { url: 'models/creep_tumor.glb', size: { length: 1.0 }, yaw: 0, shadowLift: 0.05, vivid: 0.3 },
  nydus_worm: { url: 'models/nydus_worm.glb', size: { length: 2.2 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  auto_turret: { url: 'models/auto_turret.glb', size: { length: 0.9 }, yaw: 0 },
  roach_warren: { url: 'models/roach_warren.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  spine_crawler: { url: 'models/spine_crawler.glb', size: { length: 2.4 }, yaw: 0, shadowLift: 0.1, vivid: 0.3 },
  baneling: { url: 'models/baneling.glb', size: { length: 0.9 }, yaw: 0, inPlace: true, fitClip: 'walk_forward_fast', shadowLift: 0.3 },
  ravager: { url: 'models/ravager.glb', size: { length: 1.8 }, yaw: 0, shadowLift: 0.14 },
  // static, recoloured + simplified sculpt (tools/model/build-ultralisk.ts); IdleAnimator breathes / lunges it
  ultralisk: { url: 'models/ultralisk.glb', size: {}, yaw: 0, isStatic: true },
  broodlord: { url: 'models/broodlord.glb', size: { length: 3.4 }, yaw: 0 },
  viper: { url: 'models/viper.glb', size: { length: 2.4 }, yaw: 0 },
  // Sketchfab models (see src/credits/modelCredits.json)
  cyclone: { url: 'models/cyclone.glb', size: { length: 1.7 }, yaw: 0, shadowLift: 0.15, inPlace: true },
  odin: { url: 'models/odin.glb', size: { length: 3.6 }, yaw: 0, shadowLift: 0.12, inPlace: true },
  overlord: { url: 'models/overlord.glb', size: { height: 2.6 }, yaw: 0, lift: 0.6 },
  swarm_host: { url: 'models/swarm_host.glb', size: { length: 2.6 }, yaw: 0 },
  immortal: { url: 'models/immortal.glb', size: { length: 1.9 }, yaw: 0, inPlace: true },
  colossus: { url: 'models/colossus.glb', size: { height: 3.6 }, yaw: 0, inPlace: true, walkGain: 2.6 },
  carrier: { url: 'models/carrier.glb', size: { length: 4.6 }, yaw: 0, lift: 0.5 },
  tempest: { url: 'models/tempest.glb', size: { length: 2.0 }, yaw: 0, lift: 0.5, vivid: 0.35, emissive: 0.9 },
  adept: { url: 'models/adept.glb', size: { height: 1.5 }, yaw: 0, inPlace: true },
  // Renn01's Hive Workshop unit / building packs, converted with tools/model/build-zerg-mdx.ts (static bind pose); the MDX units face +X, so yaw -90°
  sentry: { url: 'models/sentry.glb', size: { length: 1.2 }, yaw: -Math.PI / 2, lift: 0.15, vivid: 0.3, emissive: 0.9 },
  egg: { url: 'models/egg.glb', size: { length: 1.0 }, yaw: 0, shadowLift: 0.15, zergSkin: 'egg' },
  observer: { url: 'models/observer.glb', size: { length: 1.2 }, yaw: -Math.PI / 2, vivid: 0.3, emissive: 0.9 },
  warp_prism: { url: 'models/warp_prism.glb', size: { length: 2.0 }, yaw: -Math.PI / 2, vivid: 0.3, emissive: 0.9 },
  disruptor: { url: 'models/disruptor.glb', size: { length: 1.2 }, yaw: -Math.PI / 2, lift: 0.25, vivid: 0.3, emissive: 0.9 },
  phoenix: { url: 'models/phoenix.glb', size: { length: 1.9 }, yaw: -Math.PI / 2, vivid: 0.3, emissive: 0.9 },
  oracle: { url: 'models/oracle.glb', size: { length: 2.0 }, yaw: -Math.PI / 2, vivid: 0.3, emissive: 0.9 },
  mothership: { url: 'models/mothership.glb', size: { length: 4.6 }, yaw: -Math.PI / 2, lift: 0.5, vivid: 0.3, emissive: 0.9 },
  infestor: { url: 'models/infestor.glb', size: { length: 1.8 }, yaw: -Math.PI / 2, shadowLift: 0.12 },
  fusion_core: { url: 'models/fusion_core.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.18, vivid: 0.3 },
  ghost_academy: { url: 'models/ghost_academy.glb', size: { length: 3.0 }, yaw: 0, shadowLift: 0.4, vivid: 0.3 },
  sensor_tower: { url: 'models/sensor_tower.glb', size: { length: 1.4 }, yaw: 0, shadowLift: 0.4, vivid: 0.3 }
};

interface Template { holder: THREE.Group; clips: Record<string, THREE.AnimationClip> }
const templates = new Map<RigKind, Template>();

/** 'Armature_Attack Superior_full' -> 'attack_superior' */
export const clipKey = (name: string) => name.replace(/^Armature_/, '').replace(/_full$/, '').replace(/[\[\]]/g, '').trim().toLowerCase().replace(/\s+/g, '_');

const baseUrl = () => (import.meta as any).env?.BASE_URL || '/';


const retexCache = new Map<string, THREE.Texture>();

/** Lift shadows / remap blue hues on an albedo texture (once per source texture) and on the material's base colour. */
function retexture(mat: THREE.MeshStandardMaterial, def: RigDef) {
  const lift = def.shadowLift ?? 0, b2r = !!def.blueToRed, vv = def.vivid ?? 0;
  if (!lift && !b2r && !vv) return;
  const hsl = { h: 0, s: 0, l: 0 };
  const shade = (c: THREE.Color) => {
    c.getHSL(hsl);
    if (b2r && hsl.h > 0.52 && hsl.h < 0.74 && hsl.s > 0.2) { hsl.h = 0.995 + (hsl.h - 0.62) * 0.08; hsl.h -= Math.floor(hsl.h); hsl.s = Math.min(1, hsl.s * 1.05); }
    if (lift) hsl.l = hsl.l + (1 - hsl.l) * lift * (1 - hsl.l) * 0.9;
    if (vv) { hsl.s = Math.min(1, hsl.s * (1 + vv)); hsl.l = Math.min(1, Math.max(0, hsl.l + (hsl.l - 0.5) * vv * 0.5)); }
    c.setHSL(hsl.h, hsl.s, hsl.l);
  };
  if (mat.color) shade(mat.color);
  const tex = mat.map;
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!tex || !img || !img.width) return;
  const key = tex.uuid + '|' + lift + '|' + b2r + '|' + vv;
  let out = retexCache.get(key);
  if (!out) {
    const k = Math.min(1, 2048 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h); const px = data.data;
    const col = new THREE.Color();
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]! / 255, g = px[i + 1]! / 255, b = px[i + 2]! / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      let hh = 0, ss = 0;
      if (mx !== mn) {
        const d = mx - mn; ss = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        hh = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
        hh /= 6;
      }
      if (b2r && hh > 0.52 && hh < 0.74 && ss > 0.2) { hh = 0.995 + (hh - 0.62) * 0.08; hh -= Math.floor(hh); ss = Math.min(1, ss * 1.05); }
      let nl = lift ? l + (1 - l) * lift * (1 - l) * 0.9 : l;
      if (vv) { ss = Math.min(1, ss * (1 + vv)); nl = Math.min(1, Math.max(0, nl + (nl - 0.5) * vv * 0.5)); }
      col.setHSL(hh, ss, nl, THREE.NoColorSpace);
      px[i] = Math.round(col.r * 255); px[i + 1] = Math.round(col.g * 255); px[i + 2] = Math.round(col.b * 255);
    }
    ctx.putImageData(data, 0, 0);
    out = new THREE.CanvasTexture(cv);
    out.flipY = tex.flipY; out.colorSpace = tex.colorSpace; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
    out.anisotropy = 4; out.channel = tex.channel; out.needsUpdate = true;
    retexCache.set(key, out);
  }
  mat.map = out;
  mat.needsUpdate = true;
}

/** Source GLB path (relative to public/) of a rigged kind. */
export function rigFile(kind: RigKind): string { return DEFS[kind].url; }


const GUN_FWD = 0.22;
/** Procedural assault rifle for rigs that come without a weapon mesh; held at the hand bone, pointing along the model's forward axis (+Z in bind pose). */
function attachGun(scene: THREE.Group, boneName: string, model?: THREE.Group, yaw = 0, pitch = 0, shift: [number, number, number?] = [0, 0], flip = false) {
  scene.updateMatrixWorld(true);
  let bone: THREE.Object3D | undefined;
  scene.traverse(o => { if (o.name === boneName) bone = o; });
  if (!bone) return;
  const box = new THREE.Box3(); scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) box.expandByObject(o); });
  const h = Math.max(0.1, box.getSize(new THREE.Vector3()).y);
  const L = h * (model ? 0.48 : 0.4); // rifle length
  const gun = new THREE.Group();
  if (model) {
    const m = model.clone(true);
    const gb = new THREE.Box3().setFromObject(m); const gs = gb.getSize(new THREE.Vector3()), gc = gb.getCenter(new THREE.Vector3());
    const k = L / Math.max(gs.x, gs.y, gs.z);
    m.position.sub(gc); const wrap = new THREE.Group(); wrap.add(m); wrap.scale.setScalar(k);
    // the long axis becomes +Z; the stock end sits at the hand
    if (gs.x >= gs.y && gs.x >= gs.z) wrap.rotation.y = flip ? -Math.PI / 2 : Math.PI / 2;
    else if (gs.z < gs.y) wrap.rotation.x = Math.PI / 2;
    else if (flip) wrap.rotation.y = Math.PI;
    wrap.position.set(L * shift[0], L * shift[1], L * (shift[2] ?? GUN_FWD));
    wrap.traverse(o => { (o as THREE.Mesh).castShadow = true; o.frustumCulled = false; });
    const pivot = new THREE.Group(); pivot.rotation.set(pitch, yaw, 0, 'YXZ'); pivot.add(wrap);
    gun.add(pivot);
    gun.name = 'held_gun';
  } else {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f26, metalness: 0.3, roughness: 0.7 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a444e, metalness: 0.3, roughness: 0.65 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2299cc, emissiveIntensity: 1.2 });
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; me.frustumCulled = false; gun.add(me); return me; };
  const t = L * 0.1;
  add(new THREE.BoxGeometry(t * 1.1, t * 1.5, L * 0.5), dark, 0, 0, L * 0.05);            // receiver
  add(new THREE.BoxGeometry(t * 0.9, t * 1.0, L * 0.28), mid, 0, -t * 0.2, -L * 0.3);     // stock
  const barrel = add(new THREE.CylinderGeometry(t * 0.3, t * 0.3, L * 0.45, 8), mid, 0, t * 0.15, L * 0.52); barrel.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(t * 0.8, t * 2.2, t * 1.0), dark, 0, -t * 1.5, L * 0.0);      // grip / magazine
  add(new THREE.BoxGeometry(t * 0.5, t * 0.5, L * 0.3), glow, 0, t * 0.95, L * 0.15);     // sight rail glow
  }
  gun.name = 'procedural_gun';
  // express the gun in the bone's space so it points along world +Z, scaled to model size
  const wq = new THREE.Quaternion(); bone.getWorldQuaternion(wq);
  const ws = new THREE.Vector3(); bone.getWorldScale(ws);
  gun.quaternion.copy(wq.invert()); gun.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  bone.add(gun);
}

interface SubClip {
  name: string; from: string; start: number; end: number;
  /** Stretch the slice in time by this factor. */
  slow?: number;
  /** Play forward then back, so any slice loops without a jump. */
  pingPong?: boolean;
  /** Scale each rotation's motion about the slice's first frame (0.3 = a third of the movement). */
  gain?: number;
  /** Tracks of bones matching `bones` hold the source pose at time `at` instead. */
  hold?: { bones: RegExp; at: number };
}

/** A slice of `src` from `start` to `end` seconds, re-timed to start at 0 (see SubClip for the options). */
function cutClip(src: THREE.AnimationClip, o: SubClip): THREE.AnimationClip {
  const k = o.slow ?? 1, len = o.end - o.start;
  const q0 = new THREE.Quaternion(), q = new THREE.Quaternion();
  const tracks = src.tracks.map(tr => {
    const n = tr.getValueSize(), times: number[] = [], vals: number[] = [];
    const interp = (tr as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant(); // sample the source so every track has keys exactly at the cut points
    const held = o.hold && o.hold.bones.test(tr.name.slice(0, tr.name.lastIndexOf('.')));
    const isQ = n === 4 && tr.name.endsWith('.quaternion');
    if (isQ && o.gain !== undefined) { const v = interp.evaluate(o.start); q0.set(v[0]!, v[1]!, v[2]!, v[3]!); }
    const steps = Math.max(2, Math.ceil(len * 30));
    for (let i = 0; i <= steps; i++) {
      const t = o.start + (len * i) / steps; times.push((t - o.start) * k);
      const v = interp.evaluate(held ? o.hold!.at : t);
      if (isQ && o.gain !== undefined && !held) { q.set(v[0]!, v[1]!, v[2]!, v[3]!); q.copy(q0.clone().slerp(q, o.gain)); vals.push(q.x, q.y, q.z, q.w); }
      else for (let j = 0; j < n; j++) vals.push(v[j]!);
    }
    if (o.pingPong) for (let i = steps - 1; i >= 0; i--) { times.push((2 * len - (len * i) / steps) * k); for (let j = 0; j < n; j++) vals.push(vals[i * n + j]!); }
    const Ctor = tr.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    return new Ctor(tr.name, times, vals);
  });
  return new THREE.AnimationClip(o.name, -1, tracks);
}

const zergMats = new Map<THREE.Material, THREE.MeshStandardMaterial | null>();

function prepare(kind: RigKind, gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }, gunModel?: THREE.Group): Template {
  const def = DEFS[kind];
  const scene = gltf.scene;
  let muzzleN = 0;
  if (def.gunOn) attachGun(scene, def.gunOn, gunModel, def.gunYaw, def.gunPitch, def.gunShift, def.gunFlip);
  scene.traverse(o => {
    if (def.muzzles?.test(o.name)) { o.name = 'muzzle_' + muzzleN++; }
    for (const ma of def.muzzleAt ?? []) if (o.name === ma.bone) { const mz = new THREE.Object3D(); mz.name = 'muzzle_' + muzzleN++; mz.position.set(...ma.at); o.add(mz); }
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh) return;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false; // skinned bounds follow the bind pose; these are few, large units
    m.userData.noSurfaceDetail = true; // textures carry the look; never replace the skinned geometry
    if (def.zergSkin && !Array.isArray(m.material)) {
      const src = m.material as THREE.Material;
      let zm = zergMats.get(src);
      if (zm === undefined) { zm = zergSkinMaterial(src, { geo: m.geometry, y: def.zergTeamY }, def.zergSkin === true ? 'hydralisk' : def.zergSkin); zergMats.set(src, zm); }
      if (zm) m.material = zm;
    }
    const tint = def.tint?.find(t => t.mesh.test(o.name));
    if (tint && !Array.isArray(m.material)) { m.material = (m.material as THREE.Material).clone(); ((m.material as THREE.MeshStandardMaterial).color as THREE.Color).multiply(new THREE.Color(tint.color)); }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      if (!mat || (mat as any).userData.rigTuned) continue;
      (mat as any).userData.rigTuned = true;
      // exported "metallic" materials render near-black without a matching environment: keep them readable
      mat.metalness = Math.min(mat.metalness ?? 0, 0.3);
      mat.roughness = Math.max(mat.roughness ?? 1, 0.55);
      retexture(mat, def);
      if (mat.map) mat.map.anisotropy = def.emissive !== undefined ? 16 : 4;
      if (mat.emissiveMap) mat.emissiveIntensity = 1.0;
      if (def.emissive !== undefined && mat.emissive && !mat.map && mat.emissive.getHex() !== 0) { mat.emissiveIntensity = def.emissive; mat.color.multiplyScalar(0.05); } // white base + glow colour blows out to white
    }
  });

  if (def.isStatic) {
    // already sized, centred and standing on y=0 by the build tool
    scene.traverse(o => { const m = o as THREE.Mesh; if ((m as any).isMesh) { m.castShadow = true; m.frustumCulled = true; m.userData.noSurfaceDetail = true; const mat = m.material as THREE.MeshStandardMaterial;
      const tm = m.geometry.getAttribute('_teammask'); // baked carapace mask (build-static.ts team) -> TeamColor 'mask' mode
      if (tm) { m.geometry.setAttribute('teamMask', tm); m.geometry.deleteAttribute('_teammask'); mat.userData.teamMaskAttr = true; } if (def.asIs) { /* keep the exported materials */ } else if (def.detail) { m.material = mat.clone(); applyDetail(m.material as THREE.MeshStandardMaterial, 0.22, 0.95, def.detailTint); } else { mat.roughness = 0.62; mat.metalness = 0.05; } } });
    if (def.scale && def.scale !== 1) scene.scale.setScalar(def.scale);
    const holder = new THREE.Group(); holder.add(scene); holder.updateMatrixWorld(true);
    return { holder, clips: {} };
  }

  if (def.walkGain) {
    const q0 = new THREE.Quaternion(), q = new THREE.Quaternion(), d = new THREE.Quaternion(), ax = new THREE.Vector3();
    for (const clip of gltf.animations) {
      if (!/walk/i.test(clip.name)) continue;
      for (const tr of clip.tracks) {
        if (!tr.name.endsWith('.quaternion') || !/leg|piston|hip|foot|waist/i.test(tr.name)) continue;
        const v = tr.values; q0.set(v[0]!, v[1]!, v[2]!, v[3]!); const inv = q0.clone().invert();
        for (let i = 0; i < v.length; i += 4) {
          q.set(v[i]!, v[i + 1]!, v[i + 2]!, v[i + 3]!); d.copy(inv).multiply(q); if (d.w < 0) { d.x = -d.x; d.y = -d.y; d.z = -d.z; d.w = -d.w; }
          const ang = 2 * Math.acos(Math.min(1, d.w)); const s = Math.sqrt(Math.max(1e-12, 1 - d.w * d.w)); ax.set(d.x / s, d.y / s, d.z / s);
          d.setFromAxisAngle(ax, ang * def.walkGain); q.copy(q0).multiply(d);
          v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
        }
      }
    }
  }
  const pinned = new Map<string, [number, number, number]>();
  if (def.inPlace) {
    for (const clip of gltf.animations) {
      if (!/walk/i.test(clip.name)) continue;
      for (const tr of clip.tracks) {
        if (!tr.name.endsWith('.position')) continue;
        const v = tr.values; let travel = 0;
        for (let i = 3; i < v.length; i += 3) travel = Math.max(travel, Math.hypot(v[i]! - v[0]!, v[i + 1]! - v[1]!, v[i + 2]! - v[2]!));
        if (travel > 1) {
          // pin to the keyframe closest to the bone's bind position, so the model stays centred
          const node = scene.getObjectByName(tr.name.slice(0, tr.name.lastIndexOf('.')));
          let best = 0, bd = Infinity;
          for (let i = 0; i < v.length; i += 3) {
            const d = node ? Math.hypot(v[i]! - node.position.x, v[i + 1]! - node.position.y, v[i + 2]! - node.position.z) : i;
            if (d < bd) { bd = d; best = i; }
          }
          const bx = v[best]!, by = v[best + 1]!, bz = v[best + 2]!;
          for (let i = 0; i < v.length; i += 3) { v[i] = bx; v[i + 1] = by; v[i + 2] = bz; }
          pinned.set(tr.name, [bx, by, bz]);
        }
      }
    }
  }
  if (def.fitClip) {
    // the other clips (Stand, attacks...) keep the root at its splayed bind position, several tiles off the walk pose: slide their root's x/z onto the pinned one
    for (const clip of gltf.animations) {
      if (/walk/i.test(clip.name)) continue;
      for (const [name, pv] of pinned) {
        const tr = clip.tracks.find(t => t.name === name);
        if (!tr) { clip.tracks.push(new THREE.VectorKeyframeTrack(name, [0], [pv[0], pv[1], pv[2]])); continue; }
        const v = tr.values, dx = pv[0] - v[0]!, dz = pv[2] - v[2]!;
        for (let i = 0; i < v.length; i += 3) { v[i] = v[i]! + dx; v[i + 2] = v[i + 2]! + dz; }
      }
    }
  }
  // yaw, scale to the target size, stand on y=0 centred on x/z
  scene.rotation.y = def.yaw;
  scene.updateMatrixWorld(true);
  if (def.fitClip) {
    const fc = gltf.animations.find(a => clipKey(a.name) === def.fitClip);
    if (fc) { const mx = new THREE.AnimationMixer(scene); mx.clipAction(fc).play(); mx.update(0); mx.stopAllAction(); scene.updateMatrixWorld(true); scene.traverse(o => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh) sm.skeleton.update(); }); }
  }
  let box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const s = def.size.height ? def.size.height / size.y : def.size.length! / Math.max(size.x, size.z);
  scene.scale.setScalar(s);
  scene.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(scene, true);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.set(-c.x, def.keepGround ? 0 : -box.min.y + (def.lift ?? 0), -c.z);

  const holder = new THREE.Group();
  holder.add(scene);
  holder.updateMatrixWorld(true);
  const clips: Record<string, THREE.AnimationClip> = {};
  for (const clip of gltf.animations) clips[clipKey(clip.name)] = clip;
  for (const sc of def.subclips ?? []) { const src = clips[sc.from]; if (src) clips[sc.name] = cutClip(src, sc); }
  return { holder, clips };
}

/** Which faction each model belongs to ('neutral' = scenery / resources every match needs). */
const RACE: Record<'terran' | 'zerg' | 'protoss', RigKind[]> = {
  terran: ['scv', 'command_center', 'supply_depot', 'barracks', 'marine', 'refinery', 'orbital_command', 'marauder', 'medic', 'firebat', 'reaper', 'ghost', 'nova', 'hellion', 'widow_mine', 'cyclone', 'siege_tank', 'thor', 'goliath', 'odin', 'medivac', 'banshee', 'liberator', 'raven', 'viking', 'wraith', 'battlecruiser', 'mule', 'auto_turret', 'fusion_core', 'ghost_academy', 'sensor_tower',
    'factory', 'starport', 'engineering_bay', 'armory', 'bunker', 'missile_turret', 'techlab', 'techlab_barracks', 'techlab_starport', 'reactor'],
  zerg: ['drone', 'larva', 'overlord', 'hatchery', 'queen', 'spawning_pool', 'extractor', 'roach', 'hydralisk', 'baneling', 'ravager', 'mutalisk', 'ultralisk', 'broodlord', 'viper', 'swarm_host', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'spore_crawler', 'evolution_chamber',
    'baneling_nest', 'lurker_den', 'spire', 'greater_spire', 'infestation_pit', 'hive', 'ultralisk_cavern', 'nydus_network', 'nydus_worm', 'creep_tumor', 'infestor', 'egg'],
  protoss: ['probe', 'nexus', 'pylon', 'gateway', 'zealot', 'assimilator', 'cybernetics_core', 'stalker', 'adept', 'forge', 'photon_cannon', 'shield_battery', 'stargate', 'void_ray', 'twilight_council', 'robotics_facility', 'immortal', 'colossus', 'robotics_bay', 'templar_archives',
    'archon', 'dark_shrine', 'fleet_beacon', 'carrier', 'tempest', 'sentry', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership'],
};
const NEUTRAL: RigKind[] = ['mineral_patch', 'vespene_geyser', 'crane'];
type Race = keyof typeof RACE;

const loads = new Map<RigKind, Promise<void>>();
const progress = { done: 0, total: 0 };
/** Loading progress of the current batch (for the loading indicators). */
export const riggedProgress = () => ({ ...progress });
let loader: GLTFLoader | null = null;

/** Called after every model finishes (done / total of the batch), so the loading card can show real progress. */
let onProgress: ((done: number, total: number) => void) | null = null;
export const setRiggedProgressListener = (fn: typeof onProgress) => { onProgress = fn; };

// GLB parsing and model preparation run on the main thread. A small pool plus a pause after each model keeps the page responsive (the loading bar keeps painting) instead of one big freeze.
const POOL = 3;
let active = 0;
const waiting: (() => void)[] = [];
const acquire = () => active < POOL ? (active++, Promise.resolve()) : new Promise<void>(res => waiting.push(() => { active++; res(); }));
const release = () => { active--; waiting.shift()?.(); };
const breathe = () => new Promise<void>(res => setTimeout(res, 0));

/** Load one model (idempotent, shared by everyone who asks). Failures leave the procedural fallback model in place. */
function loadKind(kind: RigKind): Promise<void> {
  let p = loads.get(kind);
  if (p) return p;
  loader ??= new GLTFLoader();
  const ld = loader;
  progress.total++;
  p = (async () => {
    await acquire();
    try {
      const g = await ld.loadAsync(baseUrl() + DEFS[kind].url);
      let gun: THREE.Group | undefined;
      const gu = DEFS[kind].gunUrl;
      if (gu) gun = (await ld.loadAsync(baseUrl() + gu).catch(() => null))?.scene;
      await breathe();
      templates.set(kind, prepare(kind, g, gun));
    } catch (e) {
      console.warn(`Rigged model "${kind}" failed to load, using the fallback model`, e);
    } finally {
      progress.done++;
      onProgress?.(progress.done, progress.total);
      await breathe();
      release();
    }
  })();
  loads.set(kind, p);
  return p;
}

/** Load these models in parallel; resolves when all are ready. */
export const loadRigged = (kinds: RigKind[]): Promise<void> => Promise.all(kinds.map(loadKind)).then(() => {});
/** Load one model (for menu viewers / portraits that need exactly one). */
export const ensureRigged = (kind: RigKind) => loadKind(kind);

const racesOf = (...f: string[]) => [...new Set(f)].filter((r): r is Race => r in RACE);

/**
 * Every model the match can show, loaded in parallel before it starts (behind the "Preparing battlefield" card): both
 * sides' races, or all three when `all` (campaign missions mix races). Nothing streams in mid-match, so there is no lag
 * after launch and no unit ever appears with the procedural fallback model.
 */
export function loadMatchRigged(factions: string[], all = false): Promise<void> {
  const races = all ? (Object.keys(RACE) as Race[]) : racesOf(...factions);
  return loadRigged([...NEUTRAL, ...races.flatMap(r => RACE[r])]).then(() => { ready = true; });
}

/** True once the starting models of the current match are in. */
let ready = false;
export const riggedModelsReady = () => ready;
/** Back-compat for callers that only need the neutral scenery (crane): resolves once the starting set is in. */
export const whenRiggedReady = () => loadRigged(NEUTRAL).then(() => {});

export interface RigInstance { kind: RigKind; holder: THREE.Group; mixer: THREE.AnimationMixer; clips: Record<string, THREE.AnimationClip> }

/** A new animated instance, or null when the model isn't loaded (callers fall back to the procedural model). */
export function buildRigged(kind: RigKind): THREE.Group | null {
  const t = templates.get(kind);
  if (!t) return null;
  const holder = cloneSkinned(t.holder) as THREE.Group;
  if (DEFS[kind].isStatic) { holder.userData.sized = true; return holder; }
  holder.userData.sized = true;
  holder.userData.rigged = { kind, holder, mixer: new THREE.AnimationMixer(holder), clips: t.clips } as RigInstance;
  return holder;
}

export const hasRiggedModel = (kind: RigKind) => templates.has(kind);
/** True when `kind` has a model definition (it can be passed to loadRigged). */
export const hasRigDef = (kind: string): boolean => kind in DEFS;
