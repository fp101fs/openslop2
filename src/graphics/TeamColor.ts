import * as THREE from 'three';

/**
 * Player-colour painting, SC2 style: a unit's body stays in neutral colours and only some areas carry the team colour.
 * No model editing: every model keeps its shared geometry and textures, and each (material, team) pair gets one cached clone whose
 * fragment shader is patched (onBeforeCompile) to repaint part of the albedo while keeping its shading detail:
 *   - 'hue'   : texels whose hue lies in a range (the blue paint of Terran armour, the cyan glow of Protoss) become the team colour;
 *   - 'crest' : upward-facing surfaces (back plates, top of the head) are tinted towards the team colour (Zerg, which have no paint);
 *   - 'mask'  : an authored carapace mask (a 'teamMask' vertex attribute, or a mask texture registered with setTeamMaskMap) is painted
 *               fully in the team colour and given a glossier, chitin-like finish (Zergling, Hydralisk).
 * The original materials are never touched, so menus / portraits / anything that does not call `teamize` look exactly as before.
 */
export const TEAM_HEX = { player: 0x3a68e0, enemy: 0xd8352e };

type Mode = { kind: 'hue'; lo: number; hi: number; shift?: number } | { kind: 'crest'; k: number } | { kind: 'mask'; k: number };

const TERRAN_BLUE: Mode = { kind: 'hue', lo: 0.56, hi: 0.72 };
/** Terran units whose paint is red / orange (SCV, Hellion): the hue range wraps round 0, so it is evaluated on a half-turn-shifted hue. */
const TERRAN_RED: Mode = { kind: 'hue', lo: 0.43, hi: 0.6, shift: 0.5 };
const TERRAN_NEUTRAL: Mode = { kind: 'crest', k: 0.85 };
/** Terran structures: their red panels (not the orange hazard stripes) and the Starport's green / teal lights carry the team colour. */
const BLDG_RED: Mode = { kind: 'hue', lo: 0.45, hi: 0.545, shift: 0.5 };
const BLDG_GREEN: Mode = { kind: 'hue', lo: 0.27, hi: 0.56 };
const PROTOSS_GLOW: Mode = { kind: 'hue', lo: 0.47, hi: 0.72 };
const ZERG_CREST: Mode = { kind: 'crest', k: 0.62 };
/** Zerg units with an authored carapace mask; falls back to ZERG_CREST on materials without one. */
const ZERG_MASK: Mode = { kind: 'mask', k: 1.2 };
/** Hand-coloured Zerg models (Overlord, Swarm Host): only a light team tint on the upper surfaces. */
const ZERG_LIGHT: Mode = { kind: 'crest', k: 0.22 };
const ZERG_FAINT: Mode = { kind: 'crest', k: 0.07 };

const MODE_OF: Record<string, Mode> = {
  marine: TERRAN_BLUE, marauder: TERRAN_BLUE, medic: TERRAN_NEUTRAL, siege_tank: TERRAN_BLUE, thor: TERRAN_BLUE, thor_ap: TERRAN_BLUE, goliath: TERRAN_BLUE,
  medivac: TERRAN_BLUE, ghost: TERRAN_NEUTRAL, nova: TERRAN_NEUTRAL, reaper: TERRAN_BLUE, liberator: TERRAN_BLUE, raven: TERRAN_BLUE, battlecruiser: TERRAN_BLUE, hellbat: TERRAN_BLUE, vulture: TERRAN_RED, hellion: TERRAN_RED, firebat: TERRAN_BLUE, scv: TERRAN_RED, banshee: TERRAN_BLUE,
  supply_depot: BLDG_RED, supply_depot_lowered: BLDG_RED, bunker: BLDG_RED, missile_turret: BLDG_RED, nexus: PROTOSS_GLOW, gateway: PROTOSS_GLOW, spawning_pool: ZERG_CREST, hatchery: ZERG_CREST, infestation_pit: ZERG_CREST, hive: ZERG_CREST,
  barracks: BLDG_RED, armory: BLDG_RED, engineering_bay: BLDG_RED, factory: BLDG_RED, command_center: BLDG_RED, orbital_command: BLDG_RED, planetary_fortress: BLDG_RED, starport: BLDG_GREEN,
  zealot: PROTOSS_GLOW, stalker: PROTOSS_GLOW, archon: PROTOSS_GLOW, probe: PROTOSS_GLOW, void_ray: PROTOSS_GLOW, sentry: PROTOSS_GLOW,
  hydralisk: ZERG_MASK, roach: ZERG_MASK, drone: ZERG_MASK, larva: ZERG_MASK, egg: ZERG_MASK, mutalisk: ZERG_CREST, queen: ZERG_CREST, baneling: ZERG_CREST,
  ravager: ZERG_CREST, ultralisk: ZERG_CREST, broodlord: ZERG_CREST, viper: ZERG_CREST, zergling: ZERG_MASK, overlord: ZERG_LIGHT, swarm_host: ZERG_FAINT,
  cyclone: TERRAN_BLUE, odin: TERRAN_BLUE,
  immortal: PROTOSS_GLOW, colossus: PROTOSS_GLOW, carrier: PROTOSS_GLOW, tempest: PROTOSS_GLOW, adept: PROTOSS_GLOW,
  observer: PROTOSS_GLOW, warp_prism: PROTOSS_GLOW, disruptor: PROTOSS_GLOW, phoenix: PROTOSS_GLOW, oracle: PROTOSS_GLOW, mothership: PROTOSS_GLOW,
  infestor: ZERG_CREST, fusion_core: BLDG_RED, ghost_academy: BLDG_RED, sensor_tower: BLDG_RED, refinery: BLDG_RED
};

const cache = new Map<string, THREE.Material>();
/** Carapace mask textures (team weight in the green channel, sampled with the material's map UVs). Kept out of userData, which clone() JSON-copies. */
const maskMaps = new WeakMap<THREE.Material, THREE.Texture>();
export function setTeamMaskMap(mat: THREE.Material, tex: THREE.Texture) { maskMaps.set(mat, tex); }
export const getTeamMaskMap = (mat: THREE.Material) => maskMaps.get(mat);

function variant(src: THREE.Material, kind: string, mode: Mode, isPlayer: boolean): THREE.Material {
  const maskMap = maskMaps.get(src), maskAttr = !!src.userData.teamMaskAttr;
  if (mode.kind === 'mask' && !maskMap && !maskAttr) mode = ZERG_CREST;
  const key = `${src.uuid}|${kind}|${isPlayer ? 'p' : 'e'}`;
  let m = cache.get(key);
  if (m) return m;
  m = src.clone();
  const c = new THREE.Color().setHex(isPlayer ? TEAM_HEX.player : TEAM_HEX.enemy, THREE.SRGBColorSpace);
  const tc = `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const code = mode.kind === 'mask'
    ? `
      zTeamW = ${maskAttr ? 'vTeamMask' : 'texture2D(teamMaskMap, vMapUv).g'};
      {
        vec3 tcol = ${tc};
        vec3 c0 = diffuseColor.rgb;
        float lum = dot(c0, vec3(0.2126, 0.7152, 0.0722)), tl = dot(tcol, vec3(0.2126, 0.7152, 0.0722));
        // even out the painted mottling under the paint, keep some of its shading
        float shade = mix(0.6, lum / max(tl, 1e-3) * ${mode.k.toFixed(3)}, 0.6);
        diffuseColor.rgb = mix(c0, tcol * clamp(shade, 0.12, 1.4), zTeamW);
      }`
    : mode.kind === 'hue'
    ? `
      {
        vec3 tcol = ${tc};
        float lo = ${mode.lo.toFixed(3)}, hi = ${mode.hi.toFixed(3)};
        vec3 c0 = diffuseColor.rgb;
        float mx = max(max(c0.r, c0.g), c0.b), mn = min(min(c0.r, c0.g), c0.b), d = mx - mn;
        float sat = mx > 1e-4 ? d / mx : 0.0;
        float hue = 0.0;
        if (d > 1e-5) {
          if (mx == c0.r) hue = mod((c0.g - c0.b) / d, 6.0);
          else if (mx == c0.g) hue = (c0.b - c0.r) / d + 2.0;
          else hue = (c0.r - c0.g) / d + 4.0;
          hue /= 6.0;
        }
        hue = fract(hue + ${(mode.kind === 'hue' ? mode.shift ?? 0 : 0).toFixed(3)});
        float inH = smoothstep(lo - 0.03, lo + 0.03, hue) * (1.0 - smoothstep(hi - 0.03, hi + 0.03, hue));
        float k = inH * smoothstep(0.16, 0.38, sat);
        float lum = dot(c0, vec3(0.2126, 0.7152, 0.0722)), tl = dot(tcol, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(c0, tcol * clamp(lum / max(tl, 1e-3), 0.35, 1.8), k * 0.9);
      }`
    : `
      {
        vec3 tcol = ${tc};
        vec3 c0 = diffuseColor.rgb;
        float k = smoothstep(0.38, 0.8, vTeamUp) * ${mode.k.toFixed(3)};
        float lum = dot(c0, vec3(0.2126, 0.7152, 0.0722)), tl = dot(tcol, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(c0, tcol * clamp(lum / max(tl, 1e-3) * 1.4, 0.3, 1.6), k);
      }`;
  const needsUp = mode.kind === 'crest', isMask = mode.kind === 'mask', glow = isMask ? +(src.userData.teamGlow ?? 0) : 0;
  m.onBeforeCompile = shader => {
    if (isMask) {
      if (maskAttr) shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float teamMask;\nvarying float vTeamMask;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTeamMask = teamMask;');
      else shader.uniforms.teamMaskMap = { value: maskMap };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + (maskAttr ? 'varying float vTeamMask;' : 'uniform sampler2D teamMaskMap;'))
        .replace('#include <color_fragment>', 'float zTeamW = 0.0;\n#include <color_fragment>')
        // glossy chitin on the carapace
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.3, zTeamW);');
      // optional glow in the team colour (Egg sacs)
      if (glow > 0) shader.fragmentShader = shader.fragmentShader
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * zTeamW * ${glow.toFixed(3)};`);
    }
    if (needsUp) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vTeamUp;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n  vTeamUp = normalize(mat3(modelMatrix) * objectNormal).y;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTeamUp;');
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + code);
  };
  m.customProgramCacheKey = () => `team|${kind}|${isPlayer ? 'p' : 'e'}|${mode.kind}${maskAttr ? 'a' : ''}${glow ? 'g' + glow : ''}`;
  m.needsUpdate = true;
  cache.set(key, m);
  return m;
}

/** Repaint `root` (a freshly built, instance-owned model) in the team colour. Safe to call for any model; unknown kinds are left alone. */
export function teamize(root: THREE.Object3D, kind: string, isPlayer: boolean) {
  const mode = MODE_OF[kind];
  if (!mode) return;
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.userData.isOutlineHull || o.userData.noTeam) return;
    const mat = m.material;
    if (Array.isArray(mat) || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
    m.material = variant(mat, kind, mode, isPlayer);
  });
}
