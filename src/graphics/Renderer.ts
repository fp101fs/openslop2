import * as THREE from 'three';
import { Outline } from './Outline';
import { MAP_SIZE, UNIT_CONFIGS, BUILDING_CONFIGS } from '../config';
import { LAYOUT } from '../maps';
import { themeOf, Theme } from '../levels/Themes';
import { rasterFor } from '../levels/LevelRaster';
import { bakeRoads, roadEdgeDist, ROAD_MAX_D, ROAD_MAX_H } from './RoadSurface';
import { buildLevelProps } from '../levels/LevelScenery';
import { ProceduralGrassSystem } from './ProceduralGrass';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { getBrightness } from '../settings';
import { createScenery, applyFogOfWar } from './Scenery';
import { whenRiggedReady, buildRigged } from './RiggedModels';
import { PerformanceProfiler } from '../utils/PerformanceProfiler';
import { modelFactory } from './ModelFactory';
import type { UnitType, BuildingType, FactionType } from '../types';

/** The default 1v1 map is dressed as a space-station deck: riveted plates instead of grass, oddball plates in the bases. */
const STATION_MAP = !LAYOUT.level && LAYOUT.id === 'standard';

// Asphalt roads (theme roadStyle 'asphalt'), spliced into the terrain shader only on those levels. tRoadCoords is a DataTexture
// (row 0 = world z 0) while vMapUv.y runs the other way, hence the flip. roadD = metres from the centre line, roadH = half width.
const ASPHALT_PREP = `
          vec4 roadC = texture2D( tRoadCoords, vec2( vMapUv.x, 1.0 - vMapUv.y ) );
          float roadH = roadC.a * ${ROAD_MAX_D.toFixed(1)}, roadD = roadC.r * ${ROAD_MAX_D.toFixed(1)};
          vec2 roadP = vMapUv * uMapSize;
          float roadEdgeN = ( cliffNoise( roadP * 1.3 ) - 0.5 ) * 0.45 + ( cliffNoise( roadP * 5.0 + 3.0 ) - 0.5 ) * 0.22;
          float roadOut = roadD - roadH - roadEdgeN;   // < 0 on the asphalt
          float roadY = roadC.g * ${ROAD_MAX_H.toFixed(1)};
          // dirt on the flat verges at road level (the trench walls keep their rock, the plateau above keeps its sand)
          float roadShoulder = roadH > 0.05 ? 1.0 - smoothstep( 7.0, 9.0, roadOut + roadEdgeN * 3.0 ) : 0.0;
          roadShoulder *= 1.0 - smoothstep( 0.35, 0.8, abs( vStW.y - roadY ) + roadEdgeN * 0.4 );
          rampWeight *= 1.0 - roadShoulder;   // no cobbled ramp stone under the road or its dirt
          float dirtW = 0.0, dirtBump = 0.0;
`;
// dirt goes in before the cliff paint (so the walls stay rock), asphalt after it
const ASPHALT_DIRT = `
          if ( roadShoulder > 0.001 ) {
            // red-brown Mar Sara dirt: clods and pebbles, darker packed lip against the asphalt
            float dn = cliffNoise( roadP * 0.45 ) * 0.45 + cliffNoise( roadP * 1.9 + 7.0 ) * 0.35 + cliffNoise( roadP * 8.0 ) * 0.2;
            vec3 dirt = mix( vec3( 0.14, 0.065, 0.045 ), vec3( 0.38, 0.18, 0.12 ), dn );
            vec3 clod = cliffCellular( roadP * 2.6 + vec2( cliffNoise( roadP * 1.1 ), cliffNoise( roadP * 1.1 + 9.0 ) ) * 0.7 );
            float clodGap = ( 1.0 - smoothstep( 0.0, 0.1, clod.y - clod.x ) ) * smoothstep( 0.45, 0.7, cliffNoise( roadP * 0.9 + 4.0 ) );
            dirt *= 0.84 + 0.3 * clod.z;
            dirt = mix( dirt, dirt * 0.6, clodGap * 0.3 );
            dirt *= 0.78 + 0.44 * cliffHash( floor( roadP * 18.0 ) );   // grit
            dirt *= 0.8 + 0.4 * smoothstep( 0.2, 0.8, cliffNoise( roadP * 4.5 + 13.0 ) * 0.6 + cliffNoise( roadP * 13.0 ) * 0.4 );   // mottling
            dirt *= 0.9 + 0.2 * cliffNoise( roadP * 22.0 );
            dirt = mix( dirt, vec3( 0.5, 0.36, 0.26 ), smoothstep( 0.82, 0.95, cliffHash( floor( roadP * 6.0 ) ) ) * 0.35 );   // pale pebbles
            dirt *= 1.0 - 0.4 * ( 1.0 - smoothstep( 0.0, 0.7, roadOut ) );
            dirtW = roadShoulder * smoothstep( 0.0, 0.25, roadShoulder + cliffNoise( roadP * 2.7 ) * 0.35 - 0.2 );
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, dirt, dirtW );
            dirtBump = ( 1.0 - clodGap ) * 0.6 + clod.z * 0.3 + cliffNoise( roadP * 14.0 ) * 0.2;
            rampBump = dirtBump; rampWt = dirtW * 0.8;
          }
`;
const ASPHALT_PAVE = `
          if ( roadOut < 0.1 ) {

            // asphalt: grey grit, broad patching, crack networks in places, crumbling edge, worn dashed centre line
            float asph = 1.0 - smoothstep( -0.05, 0.05, roadOut );
            float an = cliffNoise( roadP * 2.5 ) * 0.4 + cliffNoise( roadP * 9.0 ) * 0.3 + cliffHash( floor( roadP * 36.0 ) ) * 0.3;
            vec3 asCol = mix( vec3( 0.085, 0.088, 0.094 ), vec3( 0.17, 0.17, 0.175 ), an );
            asCol *= 0.82 + 0.36 * cliffNoise( roadP * 0.3 + 11.0 );
            vec3 ck = cliffCellular( roadP * 0.55 + vec2( cliffNoise( roadP * 2.2 ), cliffNoise( roadP * 2.2 + 4.0 ) ) * 0.25 );
            float crackAA = max( fwidth( ck.y - ck.x ), 0.004 );
            float crackLn = 1.0 - smoothstep( 0.012, 0.012 + crackAA * 1.5, ck.y - ck.x );
            float crackM = smoothstep( 0.6, 0.74, cliffNoise( roadP * 0.18 + 2.0 ) ) * smoothstep( 0.3, 0.6, cliffNoise( roadP * 0.9 + 6.0 ) );
            float crack = crackLn * crackM;
            asCol = mix( asCol, vec3( 0.03, 0.028, 0.03 ), crack * 0.85 );
            asCol *= 1.0 - 0.3 * ( 1.0 - smoothstep( -0.5, 0.0, roadOut ) );   // dark worn edge
            float cosA = roadC.b * 2.0 - 1.0;
            float lineAA = max( fwidth( roadD ), 0.02 );
            float lineW = ( 1.0 - smoothstep( 0.11 - lineAA, 0.11 + lineAA, roadD ) ) * smoothstep( -0.05, 0.12, cosA - 0.05 );
            lineW *= 0.55 + 0.45 * smoothstep( 0.25, 0.6, cliffNoise( roadP * 3.0 + 5.0 ) );   // paint worn off in places
            asCol = mix( asCol, vec3( 0.62, 0.61, 0.55 ), lineW * ( 1.0 - crack * 0.7 ) );
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, asCol, asph );

            float asphBump = an * 0.15 - crack * 0.6 + smoothstep( -0.4, 0.0, roadOut ) * 0.3;
            rampBump = mix( dirtBump, asphBump, asph );
            rampWt = max( dirtW * 0.8, asph * 0.7 );
            cliffWt *= 1.0 - asph;
          }
`;

export class Renderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public webglRenderer: THREE.WebGLRenderer;
  public container: HTMLElement;
  public terrainMesh!: THREE.Mesh;
  public dirLight!: THREE.DirectionalLight;
  private envTex: THREE.Texture | null = null;
  private sceneryRoot: THREE.Group | null = null;
  private grassMesh: THREE.InstancedMesh | null = null;
  private grassFullCount = 0;
  private lowTier = false;
  public ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private theme: Theme | null = LAYOUT.level ? themeOf(LAYOUT.level.theme) : null;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private shadowFrame = 0;
  private updateInstancedGrass: ((dt: number) => void) | null = null;
  public fogUniform: { value: THREE.Texture | null } = { value: null };

  // Camera control parameters
  public cameraTarget: THREE.Vector3 = new THREE.Vector3(25, 0, 25);
  public cameraDistance: number = 46 / 1.85;
  /** Camera yaw around the target (45deg like SC2: ground grids and buildings appear as diamonds). 0 = looking straight down -Z. */
  public cameraYaw: number = 0; // axis-aligned like SC2: square minimap + upright view trapezoid
  public cameraAngle: number = 56 * (Math.PI / 180); // 56 degrees pitch, matching the SC2 default camera
  /** Zoom read-out: percent = ZOOM_REF / camera distance (100% = the old default distance of 46). Default 185%, closest 500%, farthest 50%. */
  public static readonly ZOOM_REF = 46;
  public static readonly DEFAULT_DISTANCE = 46 / 1.85;
  public minZoom: number = Renderer.ZOOM_REF / 5;
  public maxZoom: number = Renderer.ZOOM_REF / 0.5;

  // First-Person (FPS) & Third-Person (TPS) View Modes
  public viewMode: 'rts' | 'fps' | 'tps' = 'rts';
  /** 0 = cockpit camera, 1 = chase camera; eased towards the current view mode so switching glides. */
  private tpsBlend = 0;
  private _chasePos = new THREE.Vector3();
  public get isFpsMode(): boolean {
    return this.viewMode === 'fps' || this.viewMode === 'tps';
  }
  public get isThirdPerson(): boolean {
    return this.viewMode === 'tps';
  }
  public fpsUnit: any = null;
  public fpsYaw: number = 0;
  public fpsPitch: number = 0;
  public fpsTransition: number = 0; // 0 = RTS, 1 = FPS/TPS
  public targetFpsTransition: number = 0;
  public savedRtsTarget: THREE.Vector3 = new THREE.Vector3(25, 0, 25);
  public savedRtsDistance: number = 32;

  // Third-Person Follow Camera offsets
  public tpsFollowDist: number = 5.2; // Distance behind the unit
  public tpsFollowHeight: number = 2.4; // Height above unit
  public tpsShoulderOffset: number = 0.6; // Slight right-shoulder offset for action angle

  // Reusable scratch vectors to eliminate per-frame GC allocations in updateCameraPosition
  private readonly _rtsPos = new THREE.Vector3();
  private readonly _rtsLookAt = new THREE.Vector3();
  private readonly _eyePos = new THREE.Vector3();
  private readonly _lookDir = new THREE.Vector3();
  private readonly _goalCamPos = new THREE.Vector3();
  private readonly _viewLookAt = new THREE.Vector3();
  private readonly _blendedPos = new THREE.Vector3();
  private readonly _blendedLookAt = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc4e8); // Dark sci-fi space atmosphere
    this.scene.fog = new THREE.FogExp2(0x94b4d8, 0.001); // Soft distant sky atmospheric haze (no ground washout)

    // Setup Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 400);
    this.updateCameraPosition();

    // Setup WebGL2 Renderer optimized for Apple Silicon Metal & Windows DirectX
    this.webglRenderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    
    // Pixel ratio: Clamp to 1.5 for Retina display crispness on M1 MacBook Air while staying well within 16.67ms VSync budget
    this.webglRenderer.setPixelRatio(Renderer.pixelRatioFor(Renderer.loadQuality()));
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.shadowMap.enabled = true;
    this.webglRenderer.shadowMap.type = Renderer.pixelRatioFor(Renderer.loadQuality()) >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.1;

    this.container.appendChild(this.webglRenderer.domElement);
    PerformanceProfiler.get().setRenderer(this.webglRenderer);

    this.setupLighting();
    this.setBrightness(getBrightness());
    this.setupTerrain();
    if (STATION_MAP) {   // the station hangs in space: dark void past the hull, grey-blue bounce instead of green grass bounce
      this.scene.background = new THREE.Color(0x070a10);
      this.scene.fog = new THREE.FogExp2(0x070a10, 0.001);
      this.hemiLight.groundColor.set(0x4a525c);
    }
    this.setupPostProcessing();
    this.applyLowTier(Renderer.loadQuality() === 'low');

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  /** Options > Brightness (50..150%): scales the tone-mapping exposure (keeps blacks and highlights from clipping, unlike a
   *  flat brightness filter) and lifts the ambient fill a little so shadowed areas open up too on dim screens. */
  public setBrightness(pct: number) {
    const f = Math.max(0.5, Math.min(1.5, pct / 100));
    this.webglRenderer.toneMappingExposure = 1.1 * f;
    if (this.ambientLight) this.ambientLight.intensity = 0.75 * (0.5 + 0.5 * f);
  }

  private setupLighting() {
    // Warm natural daylight ambient light (no dull gray tint)
    // Image-based lighting so metallic hulls pick up soft reflections (PBR-ish look) - generated once, tiny cost
    const pmrem = new THREE.PMREMGenerator(this.webglRenderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
    this.ambientLight = new THREE.AmbientLight(0xdde8d5, 0.75);
    this.scene.add(this.ambientLight);

    // Sky/ground hemisphere: cool blue skylight from above, warm green bounce from the grass below
    this.hemiLight = new THREE.HemisphereLight(0xb4d4ff, 0x6f8a3a, 0.85);
    this.scene.add(this.hemiLight);

    // Primary directional sunlight with power-of-two 1024x1024 shadow map
    this.dirLight = new THREE.DirectionalLight(0xffe6bd, 2.1);
    this.dirLight.position.set(40, 70, 30);
    this.dirLight.castShadow = true;
    
    // Power-of-two 1024x1024 shadow camera tightly framing the active camera viewport (-42..+42)
    const shadowRes = Renderer.pixelRatioFor(Renderer.loadQuality()) >= 2 ? 2048 : 1024;
    this.dirLight.shadow.mapSize.width = shadowRes;
    this.dirLight.shadow.mapSize.height = shadowRes;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 150;
    this.dirLight.shadow.camera.left = -64;
    this.dirLight.shadow.camera.right = 64;
    this.dirLight.shadow.camera.top = 64;
    this.dirLight.shadow.camera.bottom = -64;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.radius = 3;
    this.dirLight.shadow.normalBias = 0.03;

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Warm sky fill light
    const fillLight = new THREE.DirectionalLight(0x7da4e8, 0.7);
    fillLight.position.set(-30, 20, -30);
    this.scene.add(fillLight);
  }

  private setupTerrain() {
    // Generate terrain plane with high-ground plateaus, ramps & rolling hills (160x160 resolution for crisp cliff contours)
    const geometry = ProceduralGrassSystem.createTerrainGeometry(MAP_SIZE, LAYOUT.level ? MAP_SIZE * 2 : Math.round(MAP_SIZE * 1.34));

    // Procedural seamless textures:
    // 1. Vibrant grass with rich lime greens, light greens & emeralds (100% seamless)
    const grassTexture = ProceduralGrassSystem.generateSeamlessGrassTexture(1024);
    const grassNormalMap = ProceduralGrassSystem.generateSeamlessGrassNormalMap(1024);

    // 2. Seamless dirt/sand texture (super light beige sand matching reference image)
    const sandTexture = ProceduralGrassSystem.generateSeamlessSandTexture(1024);
    const sandNormalMap = ProceduralGrassSystem.generateSeamlessSandNormalMap(1024);

    // 3. Macro Biome & Rolling Hill Elevation Mask (R = grass/sand biome, G = hill shade, B = cliff/ramp mask)
    const biomeMask = ProceduralGrassSystem.generateBiomeMaskTexture(MAP_SIZE > 150 ? 1536 : 1024, MAP_SIZE);
    const rampMask = ProceduralGrassSystem.generateRampMaskTexture(MAP_SIZE > 150 ? 2048 : 1024, MAP_SIZE);

    // Anisotropic filtering keeps the ground crisp at the camera's oblique angle (three clamps to the GPU maximum)
    for (const t of [grassTexture, sandTexture, grassNormalMap, sandNormalMap]) t.anisotropy = 16;

    // Initialize 1x1 white fallback fog texture until FogOfWar attaches its live texture
    const fallbackFogData = new Uint8Array([255, 255, 255, 255]);
    const fallbackFogTex = new THREE.DataTexture(fallbackFogData, 1, 1, THREE.RGBAFormat);
    fallbackFogTex.needsUpdate = true;
    this.fogUniform.value = fallbackFogTex;

    const whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); whiteTex.needsUpdate = true;
    // asphalt roads (only themes that ask for them, e.g. Mar Sara): the shader code below is left out entirely otherwise
    const roads = this.theme?.roadStyle === 'asphalt' && LAYOUT.level ? bakeRoads(LAYOUT.level.ops, MAP_SIZE, (x, z) => ProceduralGrassSystem.getTerrainHeight(x, z)) : null;
    ProceduralGrassSystem.noGrassAt = roads ? (x, z) => roadEdgeDist(roads, x, z) < 4.2 : null;
    const terrainUniforms = {
      tGrass: { value: grassTexture },
      tSand: { value: sandTexture },
      tGrassNormal: { value: grassNormalMap },
      tSandNormal: { value: sandNormalMap },
      tBiomeMask: { value: biomeMask },
      tRampMask: { value: rampMask },
      tFogMap: this.fogUniform,
      uTiling: { value: 18.0 * MAP_SIZE / 120 },
      uMapSize: { value: MAP_SIZE },
      uThemeOn: { value: this.theme ? 1.0 : 0.0 },
      uGP: { value: this.palette(this.theme?.ground) },
      uCP: { value: this.palette(this.theme?.clearing) },
      uKP: { value: this.palette(this.theme?.cliff) },
      tCliffTex: { value: whiteTex },
      tGroundTex: { value: whiteTex },
      uTexOn: { value: new THREE.Vector2(0, 0) },
      tPlateTex: { value: whiteTex as THREE.Texture },
      uPlateOn: { value: 0 },
      tOddTex: { value: whiteTex as THREE.Texture },
      uOddOn: { value: 0 },
      tGroundPlates: { value: whiteTex as THREE.Texture },
      uGroundOn: { value: 0 },
      // station map: bulkhead walls instead of rock cliffs, no cobbled ramps (3D metal ramps are separate meshes)
      uStation: { value: STATION_MAP ? 1 : 0 },
      uWallC: { value: this.stationWallCentres() }
    };
    // the road texture borrows the station-only oddball slot (uOddOn stays 0 here): a 17th sampler would pass the 16-unit limit
    if (roads) terrainUniforms.tOddTex.value = roads.texture;
    // photo textures sampled from the level's source scene (cliff rock / natural ground), blended over the palette
    const baseUrl = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
    const loadTex = (url: string | undefined, uniform: { value: THREE.Texture }, flag: 'x' | 'y') => {
      if (!url) return;
      new THREE.TextureLoader().load(baseUrl + url, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
        uniform.value = t; terrainUniforms.uTexOn.value[flag] = 1;
      });
    };
    loadTex(this.theme?.cliffTex, terrainUniforms.tCliffTex, 'x');
    loadTex(this.theme?.groundTex, terrainUniforms.tGroundTex, 'y');
    // photo deck-plate atlas (4x4 cells, grout on every cell edge): each floor plate samples one random cell in one of 8 orientations.
    // Until it loads the procedural plates show.
    new THREE.TextureLoader().load(baseUrl + 'textures/floor/deck_plates.webp', t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.needsUpdate = true;
      terrainUniforms.tPlateTex.value = t; terrainUniforms.uPlateOn.value = 1;
    });
    // oddball plates mixed into the deck (2x2 atlas: hex panel, lit panel / grate, circuit plate), on the station map only
    // the large calm hull-panel ground that replaces grass (seamless, plain repeat)
    if (STATION_MAP) {
      const tl = new THREE.TextureLoader();
      tl.load(baseUrl + 'textures/floor/deck_oddballs.webp', t => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.needsUpdate = true;
        terrainUniforms.tOddTex.value = t; terrainUniforms.uOddOn.value = 1;
      });
      tl.load(baseUrl + 'textures/floor/station_panels.jpg', t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.needsUpdate = true;
        terrainUniforms.tGroundPlates.value = t; terrainUniforms.uGroundOn.value = 1;
      });
    }

    // Base material is lush spring grass; splatted with very light beige sand in base clearings & trails
    const material = new THREE.MeshStandardMaterial({
      map: grassTexture,
      normalMap: grassNormalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.85,
      metalness: 0.02,
      fog: false
    });

    // Custom PBR shader splatting: blends warm golden sand in base clearings, stratified basalt cliff walls,
    // engineered tactical ramps, and elevation-shaded rolling grass hills + StarCraft II 3-state Fog of War
    material.onBeforeCompile = (shader) => {
      shader.uniforms.tGrass = terrainUniforms.tGrass;
      shader.uniforms.tSand = terrainUniforms.tSand;
      shader.uniforms.tGrassNormal = terrainUniforms.tGrassNormal;
      shader.uniforms.tSandNormal = terrainUniforms.tSandNormal;
      shader.uniforms.tBiomeMask = terrainUniforms.tBiomeMask;
      shader.uniforms.tRampMask = terrainUniforms.tRampMask;
      shader.uniforms.tFogMap = terrainUniforms.tFogMap;
      shader.uniforms.uTiling = terrainUniforms.uTiling;
      shader.uniforms.uMapSize = terrainUniforms.uMapSize;
      shader.uniforms.uThemeOn = terrainUniforms.uThemeOn;
      shader.uniforms.uGP = terrainUniforms.uGP;
      shader.uniforms.uCP = terrainUniforms.uCP;
      shader.uniforms.uKP = terrainUniforms.uKP;
      shader.uniforms.tCliffTex = terrainUniforms.tCliffTex;
      shader.uniforms.tGroundTex = terrainUniforms.tGroundTex;
      shader.uniforms.uTexOn = terrainUniforms.uTexOn;
      shader.uniforms.tPlateTex = terrainUniforms.tPlateTex;
      shader.uniforms.uPlateOn = terrainUniforms.uPlateOn;
      shader.uniforms.tOddTex = terrainUniforms.tOddTex;
      shader.uniforms.uOddOn = terrainUniforms.uOddOn;
      shader.uniforms.tGroundPlates = terrainUniforms.tGroundPlates;
      shader.uniforms.uGroundOn = terrainUniforms.uGroundOn;
      shader.uniforms.uStation = terrainUniforms.uStation;
      shader.uniforms.uWallC = terrainUniforms.uWallC;
      // world position + geometric slope for the station walls (terrain mesh is unrotated, so object normal = world normal)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStW;\nvarying float vStNy;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvStNy = normalize( objectNormal ).y;');

      // 1. Declare terrain splatting uniforms inside common shader definitions
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass;
        uniform sampler2D tSand;
        uniform sampler2D tGrassNormal;
        uniform sampler2D tSandNormal;
        uniform sampler2D tBiomeMask;
        uniform sampler2D tRampMask;
        uniform sampler2D tFogMap;
        uniform float uTiling;
        uniform float uMapSize;
        uniform float uThemeOn;
        uniform vec3 uGP[3];
        uniform vec3 uCP[3];
        uniform vec3 uKP[3];
        uniform sampler2D tCliffTex;
        uniform sampler2D tGroundTex;
        uniform vec2 uTexOn;
        uniform sampler2D tPlateTex;
        uniform float uPlateOn;
        uniform sampler2D tOddTex;
        uniform float uOddOn;
        uniform sampler2D tGroundPlates;
        uniform float uGroundOn;
        uniform float uStation;
        uniform vec4 uWallC[4];${roads ? '\n        #define tRoadCoords tOddTex' : ''}
        varying vec3 vStW;
        varying float vStNy;
        vec3 wallGlow = vec3( 0.0 );
        float wallRough = 0.5;
        float wallMetal = 0.5;
        vec3 plateGlow = vec3( 0.0 );
        float plateWt = 0.0;
        // station map: whole plates are either base deck or outer panel, decided at the plate centre (crisp, grid-aligned edge)
        float deckAt( vec2 sid ) {
          vec2 c = ( sid + 0.5 ) * 2.2;
          vec2 w = vec2( c.x + c.y, c.y - c.x ) * 0.70710678;
          return step( textureLod( tBiomeMask, w / uMapSize, 0.0 ).r, 0.22 );   // explicit LOD: also called inside branches
        }
        float plateBump = 0.0;
        float plateRough = 0.85;
        float plateMetal = 0.02;
        vec3 gradMap( vec3 col, vec3 p[3] ) {
          float t = clamp( ( dot( col, vec3( 0.299, 0.587, 0.114 ) ) - 0.06 ) / 0.5, 0.0, 1.0 );
          return t < 0.5 ? mix( p[0], p[1], t * 2.0 ) : mix( p[1], p[2], ( t - 0.5 ) * 2.0 );
        }
        float cliffWt = 0.0;
        float cliffHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float cliffNoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( cliffHash( i ), cliffHash( i + vec2( 1.0, 0.0 ) ), f.x ),
                      mix( cliffHash( i + vec2( 0.0, 1.0 ) ), cliffHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
        }
        float cliffBump = 0.0;
        float rampWt = 0.0;
        float rampBump = 0.0;
        vec3 cliffCellular( vec2 p ) {
          vec2 ip = floor( p ), fp = fract( p );
          float d1 = 8.0, d2 = 8.0, id = 0.0;
          for ( int j = -1; j <= 1; j++ ) for ( int i = -1; i <= 1; i++ ) {
            vec2 g = vec2( float( i ), float( j ) );
            vec2 o = vec2( cliffHash( ip + g ), cliffHash( ip + g + 17.3 ) );
            float d = length( g + o * 0.85 + 0.075 - fp );
            if ( d < d1 ) { d2 = d1; d1 = d; id = cliffHash( ip + g + 3.7 ); } else if ( d < d2 ) d2 = d;
          }
          return vec3( d1, d2, id );
        }
        `
      );

      // 2. Replace #include <map_fragment> to blend sand, grass, tactical ramps, basalt cliffs, and SC2 Fog of War
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec2 tileUv = vMapUv * uTiling;
          vec4 colGrass = texture2D( tGrass, tileUv );
          vec4 colSand = texture2D( tSand, tileUv );
          vec4 maskSample = texture2D( tBiomeMask, vMapUv );
          cliffWt = 0.0; cliffBump = 0.0; rampWt = 0.0; rampBump = 0.0;
          float biomeVal = maskSample.r;
          float hillShade = smoothstep( 0.0, 1.0, maskSample.g );
          float cliffRampVal = maskSample.b;
          float biomeBlend = smoothstep( 0.20, 0.45, biomeVal );

          // Rolling hills elevation & shadow contrast:
          float hillMask = smoothstep( 0.30, 0.80, biomeVal );
          vec3 valleyShade = vec3( 0.38, 0.48, 0.34 );
          vec3 hilltopShade = vec3( 1.04, 1.05, 1.00 );
          vec3 rollingHillTint = mix( valleyShade, hilltopShade, hillShade );
          colGrass.rgb *= mix( vec3( 0.86, 0.90, 0.84 ), rollingHillTint, hillMask );

          // Lush, saturated greens with mossy/dirt blotches broken up by low-frequency texture noise
          float blotchA = texture2D( tGrass, tileUv * 0.11, 6.0 ).g;
          float blotchB = texture2D( tSand, tileUv * 0.07 + 0.37, 6.0 ).r;
          colGrass.rgb = mix( colGrass.rgb, colGrass.rgb * vec3( 0.62, 0.95, 0.42 ) * 1.18, smoothstep( 0.42, 0.62, blotchA ) * 0.8 ); // moss / deep green
          colGrass.rgb = mix( colGrass.rgb, vec3( 0.34, 0.27, 0.15 ) * ( 0.7 + colSand.r * 0.6 ), smoothstep( 0.60, 0.70, blotchB ) * hillMask * 0.8 ); // bare dirt patches
          colGrass.rgb *= vec3( 0.86, 1.10, 0.74 );
          if ( uThemeOn > 0.5 ) colGrass.rgb = gradMap( colGrass.rgb, uGP );
          if ( uTexOn.y > 0.5 ) {
            vec3 gt = texture2D( tGroundTex, tileUv * 0.35 ).rgb * 0.5 + texture2D( tGroundTex, tileUv * 0.09 + 0.3 ).rgb * 0.5;
            colGrass.rgb = mix( colGrass.rgb, gt * ( 0.75 + 0.5 * dot( colGrass.rgb, vec3( 0.333 ) ) ), 0.6 );
          }

          // Clearings: weathered stone-slab tiles (core) fading into packed earth (edges / trail), moss in the grout
          vec2 slabUv = vMapUv * uMapSize / 2.2;
          slabUv = vec2( slabUv.x - slabUv.y, slabUv.x + slabUv.y ) * 0.70710678; // tile grid at 45deg: squares read as diamonds on screen
          vec2 slabId = floor( slabUv );
          vec2 slabF0 = fract( slabUv );
          float slabRnd = fract( sin( dot( slabId, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          float slabRnd2 = fract( sin( dot( slabId, vec2( 39.346, 11.135 ) ) ) * 24634.6345 );
          // a few plates are knocked off-kilter: rotated a few degrees about their centre (wider seam on one side, a clipped corner on the other),
          // lit across their face as if tilted; one in ~30 also sits a hair proud of the floor (bright lip on its lit sides, dark rim opposite)
          float askew = step( 0.80, slabRnd2 );
          float proud = askew * step( 0.82, fract( slabRnd * 9.7 + slabRnd2 * 3.1 ) );
          float ang = ( fract( slabRnd * 7.3 + slabRnd2 ) - 0.5 ) * 0.22 * askew;
          vec2 sp = slabF0 - 0.5;
          sp = vec2( cos( ang ) * sp.x - sin( ang ) * sp.y, sin( ang ) * sp.x + cos( ang ) * sp.y ) * mix( 1.0, 1.05, askew );
          vec2 slabF = sp + 0.5;
          float tiltK = ( sp.x * 0.7 - sp.y * 0.5 ) * askew;
          float edgeD = min( min( slabF.x, 1.0 - slabF.x ), min( slabF.y, 1.0 - slabF.y ) );
          float grout = 1.0 - smoothstep( 0.0, 0.05, edgeD );
          float inset = smoothstep( 0.055, 0.075, edgeD ) * ( 1.0 - smoothstep( 0.085, 0.105, edgeD ) );
          // dark gunmetal deck plates (SC2 Terran floor): each plate a little lighter / bluer / warmer than its neighbours
          vec3 slabCol = mix( vec3( 0.036, 0.039, 0.047 ), vec3( 0.062, 0.067, 0.079 ), slabRnd );
          slabCol *= mix( vec3( 0.93, 0.98, 1.08 ), vec3( 1.07, 1.02, 0.94 ), slabRnd2 );
          slabCol *= 0.88 + colSand.g * 0.3 + ( blotchA - 0.5 ) * 0.25;
          slabCol *= 1.0 + tiltK * 0.55;
          slabCol *= 1.0 + proud * 0.22;
          slabCol = mix( slabCol, vec3( 0.100, 0.108, 0.125 ), inset * 0.6 );
          slabCol += proud * vec3( 0.11, 0.12, 0.14 ) * ( smoothstep( 0.0, 0.07, edgeD ) < 1.0 && ( slabF.x < 0.5 || slabF.y > 0.5 ) ? 1.0 - smoothstep( 0.04, 0.11, edgeD ) : 0.0 );   // thin raised bevel line near each edge
          slabCol = mix( slabCol, vec3( 0.012, 0.013, 0.017 ), grout * 0.95 );    // dark seams between plates
          // Photo deck plates, layered so no two plates or regions match:
          //  base   - one random cell of the 4x4 photo atlas in one of 8 orientations (128 variants per plate)
          //  tone   - per-plate brightness / hue drift;  macro - broad grime and clean (foot-traffic) regions from world noise
          //  seams  - dirt and occlusion collecting along plate edges, scuffed bare-metal lips here and there
          //  stains - occasional glossy oil spot;  grain - fine noise up close only (fades before it can alias)
          //  PBR    - roughness / metalness / relief follow the same masks (plateRough / plateMetal / plateBump)
          vec2 sdx = dFdx( slabUv ), sdy = dFdy( slabUv );
          vec2 pw = vMapUv * uMapSize;
          float grainK = 1.0 - smoothstep( 0.35, 1.0, max( length( dFdx( pw ) ), length( dFdy( pw ) ) ) * 40.0 );
          plateBump = 0.0; plateRough = 0.85; plateMetal = 0.02;
          // Each pixel shows either a base-deck plate or the outer ground, never both: decide once and only build that one.
          // (station: whole plates via deckAt; other maps: the clearing slabs are fully hidden once biomeBlend reaches 1)
          float isDeck = uGroundOn > 0.5 ? deckAt( slabId ) : step( biomeVal, 0.45 );
          if ( uPlateOn > 0.5 && isDeck > 0.5 ) {
            float h3 = fract( sin( dot( slabId, vec2( 63.7, 157.3 ) ) ) * 31718.927 );
            float h4 = fract( sin( dot( slabId, vec2( 271.9, 19.1 ) ) ) * 17431.113 );
            float pick = floor( h3 * 16.0 );
            vec2 cellO = vec2( mod( pick, 4.0 ), floor( pick / 4.0 ) );
            float ori = floor( h4 * 8.0 ), rk = mod( ori, 4.0 );
            float rc = rk < 0.5 ? 1.0 : ( rk > 1.5 && rk < 2.5 ? -1.0 : 0.0 );
            float rs = rk > 0.5 && rk < 1.5 ? 1.0 : ( rk > 2.5 ? -1.0 : 0.0 );
            mat2 R = mat2( rc, rs, -rs, rc );
            if ( ori > 3.5 ) R = R * mat2( -1.0, 0.0, 0.0, 1.0 );
            vec2 tq = R * ( clamp( slabF, 0.0, 1.0 ) - 0.5 ) + 0.5;
            vec3 pc = textureGrad( tPlateTex, ( cellO + tq ) * 0.25, ( R * sdx ) * 0.25, ( R * sdy ) * 0.25 ).rgb;
            // oddball plates (~8%): a whole hex-frame panel, a vent grate, a circuit-etched plate, or (rarely) a lit panel
            float odd = fract( sin( dot( slabId, vec2( 5.13, 97.71 ) ) ) * 52183.371 );
            float oddK = -1.0;
            if ( uOddOn > 0.5 && odd < 0.08 ) {
              oddK = odd < 0.028 ? 0.0 : ( odd < 0.052 ? 1.0 : ( odd < 0.072 ? 2.0 : 3.0 ) );   // hex panel / grate / circuit / lights
              vec2 qo = oddK < 0.5 ? vec2( 0.0, 0.5 ) : ( oddK < 1.5 ? vec2( 0.0, 0.0 ) : ( oddK < 2.5 ? vec2( 0.5, 0.0 ) : vec2( 0.5, 0.5 ) ) );
              float ws = oddK > 1.5 && oddK < 2.5 ? 0.5 : 1.0;                 // circuit: a random half-size window of its 2x2 repeat
              vec2 wo = ws < 1.0 ? vec2( fract( odd * 71.3 ), fract( odd * 37.9 ) ) * 0.5 : vec2( 0.0 );
              pc = textureGrad( tOddTex, qo + ( wo + tq * ws ) * 0.5, ( R * sdx ) * 0.5 * ws, ( R * sdy ) * 0.5 * ws ).rgb;
              if ( oddK > 0.5 && oddK < 1.5 ) { pc = min( pc, vec3( 0.32 ) ); pc = mix( vec3( dot( pc, vec3( 0.333 ) ) ), pc, 0.5 ) * 0.4 * smoothstep( 0.02, 0.32, pc ); }   // grate: clip the photo's star glints, deepen the holes                       // the grate photo is bright bare steel
              if ( oddK > 2.5 ) plateGlow = pc * smoothstep( 0.30, 0.75, max( pc.r, max( pc.g, pc.b ) ) ) * 2.2;
            }
            float pl = dot( pc, vec3( 0.299, 0.587, 0.114 ) );
            float seamLine = 1.0 - smoothstep( 0.006, 0.02, pl );   // the photo's own grout / sub-panel lines

            float nA = cliffNoise( pw * 0.16 ) * 0.6 + cliffNoise( pw * 0.43 + 3.3 ) * 0.4;
            float nB = cliffNoise( pw * 1.6 + 11.0 );
            float grime = smoothstep( 0.48, 0.80, nA * 0.75 + nB * 0.25 );
            float wear = smoothstep( 0.55, 0.85, cliffNoise( pw * 0.27 + 40.0 ) * 0.75 + nB * 0.25 ) * ( 1.0 - grime );
            // grain only shows up close (every use is scaled by grainK), so skip its noise at normal zoom
            float grain = grainK > 0.0 ? cliffNoise( mod( pw * 37.0, 256.0 ) ) * 0.55 + cliffNoise( mod( pw * 91.0, 256.0 ) + 7.0 ) * 0.45 : 0.5;

            vec3 col = mix( vec3( pl ), pc, 0.45 ) * vec3( 0.96, 0.99, 1.06 ) * 1.4;   // pull the photo's olive cast toward neutral gunmetal
            col *= mix( 0.84, 1.16, slabRnd ) * mix( vec3( 0.97, 0.99, 1.04 ), vec3( 1.04, 1.0, 0.95 ), slabRnd2 );
            col *= mix( 1.0, 0.68, grime );
            col = mix( col, col * vec3( 1.10, 1.0, 0.80 ), grime * 0.6 );   // grime reads faintly brown
            col *= 1.0 + wear * 0.28;
            float seamAO = 1.0 - smoothstep( 0.0, 0.10, edgeD );
            col *= 1.0 - seamAO * ( 0.25 + 0.25 * nB );
            float lip = smoothstep( 0.012, 0.02, edgeD ) * ( 1.0 - smoothstep( 0.022, 0.04, edgeD ) );
            float scuff = lip > 0.0 ? lip * smoothstep( 0.55, 0.8, cliffNoise( pw * 5.0 + slabRnd * 9.0 ) ) : 0.0;
            col += scuff * vec3( 0.045, 0.047, 0.05 );
            vec2 oc = vec2( fract( h3 * 7.1 ), fract( h4 * 5.3 ) ) * 0.5 + 0.25;
            float oil = step( 0.93, fract( h3 * 31.7 + h4 ) );   // ~7% of plates carry an oil spot: only they need its noise
            if ( oil > 0.0 ) oil *= 1.0 - smoothstep( 0.12, 0.32, length( slabF - oc ) + ( cliffNoise( pw * 3.1 ) - 0.5 ) * 0.18 );
            col = mix( col, col * vec3( 0.42, 0.40, 0.38 ), oil * 0.8 );
            col *= 1.0 + ( grain - 0.5 ) * 0.22 * grainK;
            col *= 1.0 + tiltK * 0.55 + proud * 0.18;
            col = mix( col, vec3( 0.01, 0.011, 0.014 ), 1.0 - smoothstep( -0.006, 0.004, edgeD ) );   // gap round knocked-askew plates
            slabCol = col;

            plateRough = clamp( 0.62 + grime * 0.24 - wear * 0.2 - oil * 0.38 + seamLine * 0.2 + ( grain - 0.5 ) * 0.12 * grainK, 0.18, 1.0 );
            plateMetal = clamp( 0.32 + wear * 0.22 - grime * 0.2 + scuff * 0.4, 0.0, 0.8 );
            plateBump = ( 1.0 - seamLine ) * 0.25 * grainK - seamAO * 0.12 + grain * 0.06 * grainK + oil * 0.04 + proud * 0.3;
            if ( oddK > -0.5 ) {
              plateBump += smoothstep( 0.01, 0.12, pl ) * 0.35 * grainK * ( oddK > 0.5 && oddK < 1.5 ? 0.0 : 1.0 );   // embossed relief (not on the fine grate mesh: it sparkles)
              if ( oddK > 0.5 && oddK < 1.5 ) { plateMetal = 0.45; plateRough = 0.68 + grime * 0.2; }
              if ( oddK > 2.5 ) plateGlow *= 1.0 - grime * 0.5;
            }
          }

          // Station ground (default map, replaces grass): large calm hull panels (seamless photo, ~10 units per repeat) on the
          // same 45deg grid as the base plates. Repeats are hidden by per-repeat tone drift plus the broad grime / wear layers;
          // the photo's green cast is pulled toward neutral gunmetal and it sits a touch darker than the base deck.
          vec2 gB = slabUv * 0.25 - vec2( 0.06, 0.068 );   // photo seams at x=264px / y=341px fall on deck plate lines
          vec3 groundCol = vec3( 0.0 );
          float groundRough = 0.7, groundMetal = 0.3, groundBump = 0.0;
          if ( uGroundOn > 0.5 && isDeck < 0.5 ) {
            vec3 gp = textureGrad( tGroundPlates, gB, sdx * 0.25, sdy * 0.25 ).rgb;   // explicit gradients: this branch varies per plate
            float gl = dot( gp, vec3( 0.299, 0.587, 0.114 ) );
            vec2 gId = floor( gB );
            float g1 = fract( sin( dot( gId, vec2( 17.13, 61.7 ) ) ) * 23142.61 );
            float g2 = fract( sin( dot( gId, vec2( 83.9, 7.31 ) ) ) * 51731.47 );
            float nG = cliffNoise( pw * 0.11 + 21.0 ) * 0.65 + cliffNoise( pw * 0.37 + 5.0 ) * 0.35;
            float nGB = cliffNoise( pw * 1.3 + 17.0 );
            float gGrime = smoothstep( 0.50, 0.82, nG * 0.75 + nGB * 0.25 );
            float gWear = smoothstep( 0.58, 0.85, cliffNoise( pw * 0.2 + 60.0 ) * 0.75 + nGB * 0.25 ) * ( 1.0 - gGrime );
            float gGrain = grainK > 0.0 ? cliffNoise( mod( pw * 33.0, 256.0 ) + 2.0 ) * 0.55 + cliffNoise( mod( pw * 87.0, 256.0 ) + 9.0 ) * 0.45 : 0.5;
            float gSeam = 1.0 - smoothstep( 0.02, 0.045, gl );
            vec3 c = mix( vec3( gl ), gp, 0.35 ) * vec3( 0.95, 0.99, 1.05 ) * 0.78;
            c *= mix( 0.92, 1.08, g1 ) * mix( vec3( 0.98, 0.99, 1.03 ), vec3( 1.02, 1.0, 0.97 ), g2 );
            c *= mix( 1.0, 0.66, gGrime );
            c = mix( c, c * vec3( 1.12, 1.0, 0.78 ), gGrime * 0.55 );
            c *= 1.0 + gWear * 0.3;
            c *= 1.0 + ( gGrain - 0.5 ) * 0.2 * grainK;
            c *= mix( 0.62, 1.04, hillShade * hillMask + ( 1.0 - hillMask ) * 0.85 );   // baked valley / hilltop shading of the old lawn
            groundCol = c;
            groundRough = clamp( 0.58 + gGrime * 0.26 - gWear * 0.22 + gSeam * 0.2 + ( gGrain - 0.5 ) * 0.12 * grainK, 0.2, 1.0 );
            groundMetal = clamp( 0.36 + gWear * 0.22 - gGrime * 0.22, 0.0, 0.8 );
            groundBump = -gSeam * 0.3 * grainK + gGrain * 0.05 * grainK;   // panel seams sink
            // where an outer panel meets a base-deck plate: continue the deck's seam line and a little shadow on this side
            vec2 eo = slabF0 - 0.5;
            vec2 nd = abs( eo.x ) > abs( eo.y ) ? vec2( sign( eo.x ), 0.0 ) : vec2( 0.0, sign( eo.y ) );
            float dEdge = 0.5 - max( abs( eo.x ), abs( eo.y ) );
            float nDeck = dEdge < 0.15 ? deckAt( slabId + nd ) : 0.0;
            float bSeam = nDeck * ( 1.0 - smoothstep( 0.008, 0.028, dEdge ) );
            groundCol *= 1.0 - nDeck * ( 1.0 - smoothstep( 0.0, 0.12, dEdge ) ) * 0.35;
            groundCol = mix( groundCol, vec3( 0.01, 0.011, 0.014 ), bSeam );
            groundBump -= bSeam * 0.3;
            colGrass.rgb = groundCol;
          }
          vec3 dirtCol = mix( vec3( 0.26, 0.20, 0.11 ), vec3( 0.42, 0.33, 0.20 ), colSand.r );
          if ( uGroundOn > 0.5 ) dirtCol = groundCol * 0.62;   // station: a grimy margin where the base deck meets the outer plates, not earth
          float edgeMix = smoothstep( 0.10, 0.32, biomeVal );
          if ( uGroundOn > 0.5 ) { edgeMix = 1.0 - isDeck; biomeBlend = edgeMix; }
          vec3 clearingCol = mix( slabCol, dirtCol, edgeMix );
          if ( uThemeOn > 0.5 ) clearingCol = gradMap( clearingCol, uCP );
          vec4 sampledDiffuseColor = vec4( mix( clearingCol, colGrass.rgb, biomeBlend ), 1.0 );

          plateWt = uPlateOn * step( uThemeOn, 0.5 ) * ( 1.0 - edgeMix ) * ( 1.0 - biomeBlend );
          if ( uGroundOn > 0.5 ) {
            float gw = max( edgeMix, biomeBlend );
            plateRough = mix( plateRough, groundRough, gw );
            plateMetal = mix( plateMetal, groundMetal, gw );
            plateBump = mix( plateBump, groundBump, gw );
            plateGlow *= 1.0 - gw;
            plateWt = 1.0;
            // deck and panel relief differ, so fade both to zero at plate edges (a jump there shows as a serrated line)
            plateBump *= smoothstep( 0.0, 0.035, 0.5 - max( abs( slabF0.x - 0.5 ), abs( slabF0.y - 0.5 ) ) );
          }

          // Fine detail overlay: same ground textures re-sampled at 5x frequency, centred on their (very blurred) mean,
          // so close-up ground shows crisp grain instead of only the broad dune/lawn waves.
          if ( uGroundOn < 0.5 ) {   // station map: plateWt is 1 everywhere, so skip these four fetches (uniform branch keeps mip selection safe)
            vec2 fineUv = tileUv * 5.0;
            vec3 fineSand = texture2D( tSand, fineUv ).rgb - texture2D( tSand, fineUv, 9.0 ).rgb;
            vec3 fineGrass = texture2D( tGrass, fineUv ).rgb - texture2D( tGrass, fineUv, 9.0 ).rgb;
            vec3 fineDetail = mix( fineSand, fineGrass, biomeBlend );
            sampledDiffuseColor.rgb *= 1.0 + dot( fineDetail, vec3( 0.333 ) ) * 1.1 * ( 1.0 - plateWt );   // sand grain stays off the metal plates
          }

          // Ramp: weathered flagstone road set in packed earth - cobbles with dark joints, domed relief, worn centre,
          // fine grit - fading organically into the surrounding ground at both mouths and along the edges.
          vec4 rampSample = texture2D( tRampMask, vMapUv );
          float rampWeight = rampSample.r;
          rampWt = 0.0; rampBump = 0.0;${roads ? ASPHALT_PREP : ''}
          if ( rampWeight > 0.003 && uStation < 0.5 ) {
            vec2 rp = vMapUv * uMapSize;
            float fringe = ( cliffNoise( rp * 2.1 ) - 0.5 ) * 0.4 * sin( clamp( rampWeight, 0.0, 1.0 ) * 3.14159 );
            float rw = smoothstep( 0.0, 0.9, clamp( rampWeight + fringe, 0.0, 1.0 ) );
            vec3 cell = cliffCellular( rp * 2.8 + vec2( cliffNoise( rp * 0.8 ), cliffNoise( rp * 0.8 + 5.0 ) ) * 0.6 );
            float joint = smoothstep( 0.0, 0.09, cell.y - cell.x ) * 0.8 + 0.2;
            float dome = 1.0 - smoothstep( 0.0, 0.6, cell.x );
            float tone = cliffHash( vec2( cell.z * 91.7, cell.z * 13.1 ) );
            vec3 stoneCol = mix( vec3( 0.36, 0.31, 0.25 ), vec3( 0.55, 0.49, 0.41 ), tone * 0.5 + cliffNoise( rp * 5.0 ) * 0.5 );
            stoneCol = mix( stoneCol, vec3( 0.40, 0.42, 0.36 ), smoothstep( 0.7, 1.0, cliffNoise( rp * 1.1 + 3.0 ) ) * 0.5 ); // lichen-grey stones
            vec3 jointCol = vec3( 0.30, 0.24, 0.17 ) * ( 0.8 + 0.4 * cliffNoise( rp * 9.0 ) );
            vec3 rampCol = mix( jointCol, stoneCol, joint );
            if ( uThemeOn > 0.5 ) rampCol = gradMap( rampCol * 1.15, uCP );
            rampCol *= 0.88 + 0.2 * dome;
            rampCol *= 0.9 + 0.2 * cliffNoise( rp * 24.0 );
            // moss creeping in from the edges
            rampCol = mix( rampCol, vec3( 0.25, 0.36, 0.15 ), ( 1.0 - smoothstep( 0.3, 0.8, rampWeight ) ) * 0.45 * cliffNoise( rp * 3.3 + 8.0 ) );
            // melt into the surrounding ground colour near the mouths/edges
            rampCol = mix( sampledDiffuseColor.rgb * 0.9, rampCol, smoothstep( 0.0, 0.7, rampWeight ) );
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, rampCol, rw );
            rampWt = rw;
            rampBump = dome * 0.7 + joint * 0.25 + cliffNoise( rp * 12.0 ) * 0.15;
          }

${roads ? ASPHALT_DIRT : ''}
          // Impassable cliff walls: dark blue-grey craggy slate with vertical fissures, lit ridges and mossy crevices
          float cliffWeight = smoothstep( 0.05, 0.55, cliffRampVal );
          // station: walls follow the real cliff mask plus anything steep (ramp trough sides), never the flat ramp mouths
          if ( uStation > 0.5 ) cliffWeight = max( smoothstep( 0.62, 0.74, cliffRampVal ), 1.0 - smoothstep( 0.70, 0.82, vStNy ) );
          cliffWt = cliffWeight;
          if ( cliffWeight > 0.01 && uStation > 0.5 ) {
            // Bulkhead walls: dark steel panels wrapped round the nearest plateau / mesa (along = arc length), rows by height,
            // recessed seams with a bright bevel lip, corner rivets, grime streaks running down, a kick plate at the foot
            // and a lit trim line just under the lip, broken at every panel seam.
            vec2 q = vStW.xz; vec4 wc = uWallC[0]; float bd = 1e9;
            for ( int i = 0; i < 4; i++ ) { float d = abs( length( q - uWallC[i].xy ) - uWallC[i].z ); if ( d < bd ) { bd = d; wc = uWallC[i]; } }
            vec2 rel = q - wc.xy;
            float circ = 6.2831853 * wc.z;
            float pw = circ / floor( circ / 2.4 + 0.5 );
            float along = ( atan( rel.y, rel.x ) + 3.14159265 ) * wc.z;
            float hy = vStW.y, top = max( wc.w, 0.5 ), rh = top / 3.0;
            float ax = along / pw, ry = hy / rh;
            vec2 pid = vec2( floor( ax ), floor( ry ) );
            float fx = fract( ax ), fy = fract( ry );
            float pr = cliffHash( pid + 0.37 );
            float seamD = min( min( fx, 1.0 - fx ) * pw, min( fy, 1.0 - fy ) * rh * 1.6 );
            float seam = 1.0 - smoothstep( 0.025, 0.06, seamD );
            float bevel = smoothstep( 0.05, 0.07, seamD ) * ( 1.0 - smoothstep( 0.08, 0.12, seamD ) );
            vec2 cd = vec2( min( fx, 1.0 - fx ) * pw, min( fy, 1.0 - fy ) * rh * 1.6 );
            float rivet = 1.0 - smoothstep( 0.03, 0.05, length( cd - 0.16 ) );
            float photo = dot( texture2D( tGroundPlates, vec2( along, hy * 1.6 ) * 0.11 + pid * 0.37 ).rgb, vec3( 0.333 ) );
            float streak = cliffNoise( vec2( along * 2.3, hy * 0.35 ) ) * 0.6 + cliffNoise( vec2( along * 7.0, hy * 0.9 ) ) * 0.4;
            vec3 wcol = mix( vec3( 0.06, 0.066, 0.076 ), vec3( 0.11, 0.118, 0.13 ), pr ) * ( 0.65 + photo * 0.7 );
            wcol *= mix( 0.62, 1.0, smoothstep( 0.0, top * 0.75, hy ) ) * ( 1.0 - smoothstep( 0.55, 0.85, streak ) * 0.35 );
            wcol += bevel * vec3( 0.06, 0.065, 0.07 ) + rivet * vec3( 0.07, 0.075, 0.08 );
            float kick = 1.0 - smoothstep( 0.22, 0.26, hy );
            float hz = step( 0.5, fract( ( along + hy ) * 1.4 ) );
            wcol = mix( wcol, mix( vec3( 0.025 ), vec3( 0.32, 0.24, 0.05 ), hz ) * ( 0.6 + photo * 0.6 ), kick * step( 0.04, hy ) * 0.85 );
            wcol = mix( wcol, vec3( 0.012, 0.013, 0.016 ), seam * 0.92 );
            float tAA = max( fwidth( hy ), 0.004 );
            float trim = smoothstep( -tAA, tAA, 0.035 - abs( hy - ( top - 0.32 ) ) ) * ( 1.0 - smoothstep( 0.03, 0.07, tAA ) ) * smoothstep( 0.18, 0.28, min( fx, 1.0 - fx ) * pw );
            wcol = mix( wcol, vec3( 0.35, 0.6, 0.75 ), trim );
            wallGlow = vec3( 0.2, 0.6, 0.85 ) * trim * 0.55 * cliffWeight;
            cliffBump = ( 1.0 - seam ) * 0.5 + bevel * 0.15 + rivet * 0.25 + photo * 0.08;
            wallRough = clamp( 0.48 + smoothstep( 0.55, 0.85, streak ) * 0.25 + seam * 0.3, 0.2, 1.0 );
            wallMetal = 0.4 - seam * 0.25;
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, wcol, cliffWeight );
          } else if ( cliffWeight > 0.01 ) {
            vec2 cp = vMapUv * uMapSize; // world units
            float w1 = cliffNoise( cp * 0.9 );
            vec2 wp = cp + vec2( w1, cliffNoise( cp * 0.9 + 7.3 ) ) * 1.2; // domain warp = irregular, craggy edges
            float n1 = clamp( cliffNoise( wp * 0.55 ) * 0.7 + cliffNoise( wp * 1.3 ) * 0.3, 0.0, 0.999 );
            float n2 = cliffNoise( wp * 2.6 + 3.1 );
            float n3 = cliffNoise( wp * 7.0 + 9.7 );
            // chunky layered rock blocks separated by dark cracks
            float blocks = n1 * 4.0;
            float bf = fract( blocks );
            float crack = 1.0 - smoothstep( 0.0, 0.10, bf ) * ( 1.0 - smoothstep( 0.90, 1.0, bf ) );
            float tier = floor( blocks ) / 4.0;
            cliffBump = tier * 1.4 + bf * 0.4 + n2 * 0.5 + n3 * 0.25;
            vec3 slateDark = vec3( 0.06, 0.09, 0.12 );
            vec3 slateMid = vec3( 0.20, 0.27, 0.31 );
            vec3 slateLight = vec3( 0.50, 0.57, 0.60 );
            vec3 cliffCol = mix( slateDark, slateMid, tier * 0.6 + n2 * 0.5 );
            cliffCol = mix( cliffCol, slateLight, smoothstep( 0.55, 0.95, bf * 0.5 + n3 * 0.6 ) * 0.55 );
            cliffCol *= 1.0 - crack * 0.65;
            cliffCol = mix( cliffCol, vec3( 0.15, 0.24, 0.13 ), smoothstep( 0.62, 0.85, n2 ) * 0.35 );
            if ( uThemeOn > 0.5 ) cliffCol = gradMap( cliffCol * 1.3, uKP );
            if ( uTexOn.x > 0.5 ) {
              vec3 ct = texture2D( tCliffTex, cp * 0.07 ).rgb;
              cliffCol = mix( cliffCol, ct * ( 0.55 + 0.9 * dot( cliffCol, vec3( 0.333 ) ) ) * 1.15, 0.7 );
            }
            sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, cliffCol, cliffWeight );
          }

${roads ? ASPHALT_PAVE : ''}
          // how much of this pixel is bare deck plate (drives the plate roughness / metalness / relief below)
          plateWt *= ( 1.0 - rampWt ) * ( 1.0 - cliffWt );

          // Baked elevation shading along the ramp (darker side walls, lower end sits in the plateau's shade)
          sampledDiffuseColor.rgb *= mix( 1.0, rampSample.g, 1.0 );

          // StarCraft II 3-State Fog of War (pre-smoothed 240x240 C² quintic texture + hardware bilinear filtering):
          float fogB = texture2D( tFogMap, vMapUv ).r;

          vec3 sc2Shroud = vec3( 0.04, 0.06, 0.10 );
          vec3 sc2Explored = vec3( 0.38, 0.44, 0.56 );
          vec3 sc2Visible = vec3( 1.0, 1.0, 1.0 );
          vec3 fogTint = fogB < 0.42
            ? mix( sc2Shroud, sc2Explored, smoothstep( 0.0, 0.42, fogB ) )
            : mix( sc2Explored, sc2Visible, smoothstep( 0.42, 1.0, fogB ) );
          sampledDiffuseColor.rgb *= fogTint;
          plateGlow *= fogTint * plateWt;   // lit oddball panels go dark under fog of war
          wallGlow *= fogTint;

          #ifdef DECODE_VIDEO_TEXTURE
            sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
          #endif
          diffuseColor *= sampledDiffuseColor;
        #endif`
      );

      // 3. Replace #include <normal_fragment_maps> to blend normal maps across biomes
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#if defined( USE_NORMALMAP_TANGENTSPACE )
          vec2 tileUvN = vNormalMapUv * uTiling;
          vec3 nGrass = texture2D( tGrassNormal, tileUvN ).xyz * 2.0 - 1.0;
          vec3 nSand = texture2D( tSandNormal, tileUvN ).xyz * 2.0 - 1.0;
          float biomeValN = texture2D( tBiomeMask, vNormalMapUv ).r;
          float biomeBlendN = smoothstep( 0.20, 0.45, biomeValN );
          vec3 mapN = normalize( mix( nSand, nGrass, biomeBlendN ) );
          mapN.xy *= normalScale * ( 1.0 - plateWt );   // no sand ripples on metal deck plates
          normal = normalize( tbn * mapN );
        #endif
        if ( cliffWt > 0.01 ) {
          // Rugged rock relief: bump the shading normal by the screen-space gradient of the crag height
          vec3 q0 = dFdx( -vViewPosition ), q1 = dFdy( -vViewPosition );
          vec3 r1 = cross( q1, normal ), r2 = cross( normal, q0 );
          float det = dot( q0, r1 );
          vec2 dH = vec2( dFdx( cliffBump ), dFdy( cliffBump ) );
          vec3 grad = sign( det ) * ( dH.x * r1 + dH.y * r2 );
          normal = normalize( abs( det ) * normal - 0.9 * cliffWt * grad );
        }
        if ( rampWt > 0.01 ) {
          vec3 q0r = dFdx( -vViewPosition ), q1r = dFdy( -vViewPosition );
          vec3 r1r = cross( q1r, normal ), r2r = cross( normal, q0r );
          float detr = dot( q0r, r1r );
          vec2 dHr = vec2( dFdx( rampBump ), dFdy( rampBump ) );
          vec3 gradr = sign( detr ) * ( dHr.x * r1r + dHr.y * r2r );
          normal = normalize( abs( detr ) * normal - 0.5 * rampWt * gradr );
        }
        if ( plateWt > 0.01 ) {
          vec3 q0p = dFdx( -vViewPosition ), q1p = dFdy( -vViewPosition );
          vec3 r1p = cross( q1p, normal ), r2p = cross( normal, q0p );
          float detp = dot( q0p, r1p );
          vec2 dHp = vec2( dFdx( plateBump ), dFdy( plateBump ) );
          vec3 gradp = sign( detp ) * ( dHp.x * r1p + dHp.y * r2p );
          normal = normalize( abs( detp ) * normal - 0.35 * plateWt * gradp );
        }`
      );
      // deck plates: semi-metallic, with roughness / metalness following grime, wear, oil and seams
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix( roughnessFactor, plateRough, plateWt );
          if ( uStation > 0.5 ) roughnessFactor = mix( roughnessFactor, wallRough, cliffWt );`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix( metalnessFactor, plateMetal, plateWt );
          if ( uStation > 0.5 ) metalnessFactor = mix( metalnessFactor, wallMetal, cliffWt );`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += plateGlow + wallGlow;`);
    };

    if (STATION_MAP) this.buildStationRamps(geometry);
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    // 3D Instanced Grass Blades (Swaying naturally in the wind on GPU, 1 single draw call)
    const gTheme = this.theme?.grass;
    const grassObj = ProceduralGrassSystem.createInstancedGrass(MAP_SIZE, gTheme === null || STATION_MAP ? 0 : Math.round(2400 * (MAP_SIZE / 120) ** 2 * (gTheme?.density ?? 1)), this.fogUniform, gTheme ?? undefined);
    this.scene.add(grassObj.mesh);
    this.updateInstancedGrass = grassObj.update;
    this.grassMesh = grassObj.mesh;
    this.grassFullCount = grassObj.mesh.count;

    if (LAYOUT.level && this.theme) {
      this.sceneryRoot = this.createLevelScenery(grassTexture);
    } else {
      this.sceneryRoot = createScenery(MAP_SIZE, this.fogUniform, grassTexture);
    }
    this.scene.add(this.sceneryRoot);
    if (!LAYOUT.level) this.placeCrane();

    // Add border perimeter barriers (levels have their own rock rim)
    if (!LAYOUT.level) this.createPerimeterWalls();
  }

  /**
   * Station map: each carved ramp becomes a 3D metal wedge. The deck's vertices sample getTerrainHeight (the same height
   * the simulation puts units at) over the whole walkable width, so units stand exactly on it; side skirts and end faces
   * close the wedge down below the floor. The visual terrain (not the simulation) is tucked under the deck so it cannot
   * poke through or z-fight, and where the ramp stands proud of the cliff the old blended shoulder drops to the plain
   * cliff profile so the wedge's side plating shows.
   */
  private buildStationRamps(terrain: THREE.BufferGeometry) {
    const PG = ProceduralGrassSystem;
    const sm = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
    const halfCore = (u: number) => 2.5 + 1.6 * Math.min(1, 1 - sm((u - 15) / 3) + sm((u - 20) / 3));   // = rampHalfCore
    const walkHalf = (u: number) => { const h = halfCore(u); return h + 0.65 * (1.5 + 0.8 * (h - 2.5) / 1.6); };   // onRamp edge
    const W = (u: number) => walkHalf(u) + 0.04;   // the height function is flat out to walkHalf (FLAT_RAMPS)
    const U0 = 14.9, U1 = 23.0, LIFT = 0.02, BOTTOM = -0.3;
    const cliffProfile = (x: number, z: number, p: { x: number; y: number; h?: number }) => {
      const d = Math.hypot(x - p.x, z - p.y) + PG.noise.noise(x * 0.18, z * 0.18) * 0.35, h = p.h ?? PG.HIGH_GROUND_HEIGHT;
      return d <= 18 ? h : d >= 20.8 ? 0 : h * (1 - sm((d - 18) / 2.8));
    };

    // 1. visual terrain: sink under the deck, drop the proud shoulders to the plain cliff
    const pos = terrain.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + MAP_SIZE / 2, z = pos.getZ(i) + MAP_SIZE / 2;
      for (const p of LAYOUT.plateaus) {
        const dx = x - p.x, dz = z - p.y, u = dx * p.dx + dz * p.dy, v = Math.abs(dx * p.dy - dz * p.dx);
        if (u < U0 - 1 || u > U1 + 1) continue;
        const w = W(u);
        if (u > U0 + 0.3 && u < U1 - 0.3 && v < w - 0.1) pos.setY(i, pos.getY(i) - 0.15);
        // beside the lower part the cliff steps back to the floor (a notch), so the wedge stands free and its side plating shows
        else if (v >= w - 0.1 && v < w + 1.9 && u > 18.2 && PG.isCliffWall(x, z)) pos.setY(i, Math.min(pos.getY(i), 0));
        else if (v >= w - 0.1 && v < w + 3 && PG.isCliffWall(x, z)) pos.setY(i, Math.min(pos.getY(i), cliffProfile(x, z, p)));
      }
    }
    terrain.computeVertexNormals();

    // 2. the wedges
    const NU = 100, NV = 40;   // NV even so the centre line is a vertex row (keeps the edge-distance attribute exact)
    const deckPos: number[] = [], deckUv: number[] = [], deckEdge: number[] = [], deckIdx: number[] = [];
    const sidePos: number[] = [], sideUv: number[] = [];
    for (const p of LAYOUT.plateaus) {
      const nx = -p.dy, nz = p.dx;
      const at = (u: number, v: number) => [p.x + p.dx * u + nx * v, p.y + p.dy * u + nz * v] as const;
      const top = (u: number, v: number) => { const [x, z] = at(u, v); return [x, PG.getTerrainHeight(x, z) + LIFT, z] as const; };
      const base = deckPos.length / 3;
      for (let i = 0; i <= NU; i++) {
        const u = U0 + (U1 - U0) * i / NU, w = W(u);
        for (let k = 0; k <= NV; k++) {
          const v = w * (k / NV * 2 - 1), [x, y, z] = top(u, v);
          deckPos.push(x, y, z); deckUv.push(v, u); deckEdge.push(w - Math.abs(v));
        }
      }
      for (let i = 0; i < NU; i++) for (let k = 0; k < NV; k++) {
        const a = base + i * (NV + 1) + k, b = a + NV + 1;
        deckIdx.push(a, a + 1, b, a + 1, b + 1, b);
      }
      // side skirts (both edges) and the two end faces, straight down to below the floor
      const quad = (a: readonly number[], b: readonly number[], ua: number, ub: number) => {
        const a0 = [a[0]!, BOTTOM, a[2]!], b0 = [b[0]!, BOTTOM, b[2]!];
        sidePos.push(...a, ...a0, ...b, ...b, ...a0, ...b0);
        sideUv.push(ua, a[1]!, ua, BOTTOM, ub, b[1]!, ub, b[1]!, ua, BOTTOM, ub, BOTTOM);
      };
      for (let i = 0; i < NU; i++) {
        const u0 = U0 + (U1 - U0) * i / NU, u1 = U0 + (U1 - U0) * (i + 1) / NU;
        quad(top(u0, W(u0)), top(u1, W(u1)), u0, u1);
        quad(top(u1, -W(u1)), top(u0, -W(u0)), -u1, -u0);
      }
      for (const [u, sgn] of [[U0, 1], [U1, -1]] as const) for (let k = 0; k < NV; k++) {
        const w = W(u), v0 = w * (k / NV * 2 - 1), v1 = w * ((k + 1) / NV * 2 - 1);
        quad(top(u, v0 * sgn), top(u, v1 * sgn), v0, v1);
      }
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUv, 2));
    deckGeo.setAttribute('aEdge', new THREE.Float32BufferAttribute(deckEdge, 1));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
    sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
    sideGeo.computeVertexNormals();

    const baseUrl = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
    // deck: the steel grate quadrant of the oddball atlas, cropped once into its own repeating texture
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8c949e, metalness: 0.65, roughness: 0.5 });
    new THREE.ImageLoader().load(baseUrl + 'textures/floor/deck_oddballs.webp', img => {
      const hS = img.height / 2, wS = img.width / 2, cv = document.createElement('canvas');
      cv.width = cv.height = 1024;
      cv.getContext('2d')!.drawImage(img, 0, hS, wS, hS, 0, 0, 1024, 1024);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.repeat.set(1 / 1.8, 1 / 1.8);
      deckMat.map = t; deckMat.needsUpdate = true;
    });
    applyFogOfWar(deckMat, this.fogUniform, MAP_SIZE);
    const deckHook = deckMat.onBeforeCompile;
    deckMat.onBeforeCompile = (sh, r) => {
      deckHook.call(deckMat, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;\nvarying vec2 vDeckUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvDeckUv = uv;');
      // grate darkened toward gunmetal; yellow / black hazard trim along both edges with a dark kerb line. Every edge is
      // anti-aliased by its screen footprint (fwidth) so nothing crawls while the camera pans. The guide lights are real
      // stud meshes (below), not shader dots: geometry gets MSAA, shader dots don't, and they twinkled.
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vEdge;\nvarying vec2 vDeckUv;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float l = dot( diffuseColor.rgb, vec3( 0.333 ) );
            diffuseColor.rgb = mix( vec3( l ), diffuseColor.rgb, 0.4 ) * 0.55;
            float sx = ( vDeckUv.y * 0.70710678 + vDeckUv.x * 0.70710678 * sign( vDeckUv.x ) ) * 1.5;
            float sw = max( fwidth( sx ), 1e-4 );
            float tri = abs( fract( sx ) - 0.5 ) * 2.0;                       // 0..1 triangle wave
            float stripe = mix( smoothstep( 0.5 - sw, 0.5 + sw, tri ), 0.5, smoothstep( 0.25, 0.6, sw ) );   // grey out once stripes are sub-pixel
            float ew = max( fwidth( vEdge ), 1e-4 );
            float trim = 1.0 - smoothstep( 0.31 - ew, 0.31 + ew, vEdge );
            diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.03, 0.03, 0.03 ), vec3( 0.62, 0.45, 0.06 ), stripe ), trim );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.055, 0.06 ), 1.0 - smoothstep( 0.06 - ew, 0.06 + ew, vEdge ) );
          }`);
    };
    deckMat.customProgramCacheKey = () => 'station-ramp-deck';
    // sides: hull panel photo with a riveted truss pattern laid over it
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x7c838c, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
    new THREE.TextureLoader().load(baseUrl + 'textures/floor/station_panels.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(0.4, 0.4);
      sideMat.map = t; sideMat.needsUpdate = true;
    });
    applyFogOfWar(sideMat, this.fogUniform, MAP_SIZE);
    const sideHook = sideMat.onBeforeCompile;
    sideMat.onBeforeCompile = (sh, r) => {
      sideHook.call(sideMat, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSideUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSideUv = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSideUv;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float l = dot( diffuseColor.rgb, vec3( 0.333 ) );
            diffuseColor.rgb = mix( vec3( l ), diffuseColor.rgb, 0.3 ) * 0.5;
            vec2 c = vSideUv / 0.9;
            float bay = abs( fract( c.x ) - 0.5 );
            float d1 = abs( fract( c.x + c.y ) - 0.5 ), d2 = abs( fract( c.x - c.y ) - 0.5 );
            float beam = max( 1.0 - smoothstep( 0.42, 0.46, bay ), 1.0 - smoothstep( 0.04, 0.08, min( d1, d2 ) ) );
            float chord = 1.0 - smoothstep( 0.06, 0.1, abs( vSideUv.y - 0.12 ) );
            diffuseColor.rgb *= 0.55;
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.21, 0.23 ), max( beam * 0.85, chord ) );
          }`);
    };
    sideMat.customProgramCacheKey = () => 'station-ramp-side';
    // guide-light studs just inside each hazard trim, every 1.2 m, tilted to the deck slope (one instanced mesh)
    const studM: THREE.Matrix4[] = [];
    const sd = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
    for (const p of LAYOUT.plateaus) {
      const nx = -p.dy, nz = p.dx;
      for (let u = U0 + 0.6; u < U1 - 0.3; u += 1.2) for (const sg of [-1, 1]) {
        const v = sg * (W(u) - 0.45), x = p.x + p.dx * u + nx * v, z = p.y + p.dy * u + nz * v;
        const hA = PG.getTerrainHeight(x - p.dx * 0.2, z - p.dy * 0.2), hB = PG.getTerrainHeight(x + p.dx * 0.2, z + p.dy * 0.2);
        nrm.set(-p.dx * (hB - hA) / 0.4, 1, -p.dy * (hB - hA) / 0.4).normalize();
        sd.position.set(x, PG.getTerrainHeight(x, z) + LIFT, z); sd.quaternion.setFromUnitVectors(up, nrm); sd.updateMatrix();
        studM.push(sd.matrix.clone());
      }
    }
    const studMat = new THREE.MeshStandardMaterial({ color: 0x3f7f94, emissive: 0x3ccfff, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.0 });
    applyFogOfWar(studMat, this.fogUniform, MAP_SIZE, true);
    const studGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12).translate(0, 0.025, 0);
    const studs = new THREE.InstancedMesh(studGeo, studMat, studM.length);
    studM.forEach((m, i) => studs.setMatrixAt(i, m));
    studs.computeBoundingSphere();
    studs.name = 'stationRampLights'; studs.userData.noOutline = true; (studs as any).raycast = () => {};
    this.scene.add(studs);
    const deck = new THREE.Mesh(deckGeo, deckMat), sides = new THREE.Mesh(sideGeo, sideMat);
    deck.receiveShadow = true; sides.receiveShadow = true; sides.castShadow = true;
    for (const m of [deck, sides]) { m.name = 'stationRamp'; m.userData.noOutline = true; (m as any).raycast = () => {}; this.scene.add(m); }
  }

  /** Station walls wrap round these (x, z, nominal wall radius, top height): the plateaus and the choke mesas. */
  private stationWallCentres(): THREE.Vector4[] {
    const c = [
      ...LAYOUT.plateaus.map(p => new THREE.Vector4(p.x, p.y, 19.4, p.h ?? ProceduralGrassSystem.HIGH_GROUND_HEIGHT)),
      ...LAYOUT.mesas.map(m => new THREE.Vector4(m.x, m.y, 4.5, 2.85)),
    ].slice(0, 4);
    while (c.length < 4) c.push(new THREE.Vector4(-1e4, -1e4, 1, 1));
    return c;
  }

  private palette(t?: [number, number, number]): THREE.Color[] {
    const tri = t ?? [0x000000, 0x808080, 0xffffff];
    return tri.map(h => new THREE.Color(h));
  }

  /** Scenery for a data-driven level: themed outer ground plus the level's prop rules (rocks, crystals...) scattered on the terrain. */
  private createLevelScenery(_grassTexture: THREE.Texture): THREE.Group {
    const th = this.theme!, def = LAYOUT.level!;
    const root = new THREE.Group();
    const big = MAP_SIZE + 160;
    const meadow = new THREE.Mesh(new THREE.PlaneGeometry(big, big), new THREE.MeshStandardMaterial({ color: th.meadow, roughness: 1, metalness: 0 }));
    applyFogOfWar(meadow.material as THREE.Material, this.fogUniform, MAP_SIZE);
    const r = rasterFor(def);
    const hasLiquid = r.liquid.some(v => v === 1);
    meadow.rotation.x = -Math.PI / 2; meadow.position.set(MAP_SIZE / 2, hasLiquid ? -3 : -0.8, MAP_SIZE / 2); meadow.receiveShadow = true;
    root.add(meadow);
    if (hasLiquid) {
      // water / lava / acid sheet: only shows inside the pits (everything else stands above it)
      const lm = new THREE.MeshStandardMaterial({ color: th.liquid, emissive: th.liquid, emissiveIntensity: (th.liquidOpacity ?? 0.8) > 0.88 ? 0.55 : 0.12, transparent: true, opacity: th.liquidOpacity ?? 0.8, roughness: 0.12, metalness: 0.15 });
      applyFogOfWar(lm, this.fogUniform, MAP_SIZE);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE), lm);
      water.rotation.x = -Math.PI / 2; water.position.set(MAP_SIZE / 2, -0.55, MAP_SIZE / 2); water.name = 'levelLiquid';
      root.add(water);
    }
    const detail = new THREE.Group(); detail.name = 'sceneryDetail';
    root.userData.detail = detail; root.add(detail);
    buildLevelProps(def, th, r, this.fogUniform, (x, z) => r.heightAt(x, z)).then(g => detail.add(g)).catch(e => console.warn('level props failed', e));
    // theme the lighting / sky
    this.scene.background = new THREE.Color(th.background);
    this.scene.fog = new THREE.FogExp2(th.background, 0.001);
    this.hemiLight.color.set(th.hemiSky); this.hemiLight.groundColor.set(th.hemiGround);
    this.ambientLight.color.set(th.ambient);
    this.dirLight.color.set(th.sun);
    return root;
  }

  /** Inert StarCraft II industrial crane as map scenery, parked beside the lowland trail away from both bases. */
  private placeCrane() {
    const spots: [number, number, number][] = [[0.14, 0.62, 2.4], [0.86, 0.38, -0.7]];
    whenRiggedReady().then(() => {
      for (const [fx, fz, yaw] of spots) {
        const crane = buildRigged('crane');
        if (!crane || !this.sceneryRoot) return;
        crane.position.set(fx * MAP_SIZE, 0, fz * MAP_SIZE);
        crane.rotation.y = yaw;
        crane.traverse(o => { const m = o as THREE.Mesh; if ((m as any).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        crane.name = 'sceneryCrane';
        this.sceneryRoot.add(crane);
      }
    });
  }

  private setupPostProcessing() {
    const w = window.innerWidth, h = window.innerHeight, pr = this.webglRenderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.webglRenderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom only catches over-bright pixels (emissive glow lights, muzzle flashes, energy blades)
    // Bloom runs at half resolution (blur is soft anyway) - big saving at high pixel ratios
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(Math.max(2, w >> 1), Math.max(2, h >> 1)), 0.6, 0.55, 1.0);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    // Cheap SC2-style grade (after tone mapping): gentle S-curve contrast, saturation lift, warm highlights / cool shadows, vignette
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(l), c, 1.14);
          c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);
          c *= mix(vec3(0.96, 1.0, 1.05), vec3(1.05, 1.0, 0.95), l);
          vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
  }

  public setFogTexture(tex: THREE.DataTexture) {
    this.fogUniform.value = tex;
  }

  private createPerimeterWalls() {
    if (STATION_MAP) { this.createStationPerimeter(); return; }
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4a4f48,
      roughness: 0.9,
      metalness: 0.2
    });

    const createWall = (w: number, h: number, d: number, x: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, h / 2, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    createWall(MAP_SIZE + 4, 3, 2, MAP_SIZE / 2, -1);
    createWall(MAP_SIZE + 4, 3, 2, MAP_SIZE / 2, MAP_SIZE + 1);
    createWall(2, 3, MAP_SIZE + 4, -1, MAP_SIZE / 2);
    createWall(2, 3, MAP_SIZE + 4, MAP_SIZE + 1, MAP_SIZE / 2);
  }

  /** Station map edge: dark bulkhead walls with ribs, a lit trim strip on the inner face and a railing on top. */
  private createStationPerimeter() {
    const S = MAP_SIZE, H = 3;
    const body = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5, metalness: 0.6 });
    const rib = new THREE.MeshStandardMaterial({ color: 0x4a515a, roughness: 0.45, metalness: 0.65 });
    const rail = new THREE.MeshStandardMaterial({ color: 0x4a515a, roughness: 0.45, metalness: 0.65 });
    applyFogOfWar(rail, this.fogUniform, S);
    const glow = new THREE.MeshStandardMaterial({ color: 0x8fe6ff, emissive: 0x2ec8ff, emissiveIntensity: 0.8, roughness: 0.3 });
    applyFogOfWar(body, this.fogUniform, S); applyFogOfWar(glow, this.fogUniform, S); applyFogOfWar(rib, this.fogUniform, S, true);
    const g = new THREE.Group(); g.name = 'stationPerimeter';
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; g.add(m);
    };
    // [centre x, centre z, length, along-x?, inward normal x, inward normal z]
    const sides: [number, number, number, boolean, number, number][] = [
      [S / 2, -1, S + 4, true, 0, 1], [S / 2, S + 1, S + 4, true, 0, -1], [-1, S / 2, S + 4, false, 1, 0], [S + 1, S / 2, S + 4, false, -1, 0]];
    const ribM: THREE.Matrix4[] = [];
    const d = new THREE.Object3D();
    for (const [cx, cz, len, alongX, nx, nz] of sides) {
      const bx = (w: number, h: number, t: number) => alongX ? new THREE.BoxGeometry(w, h, t) : new THREE.BoxGeometry(t, h, w);
      add(bx(len, H, 2), body, cx, H / 2, cz);
      add(bx(len, 0.3, 2.3), body, cx, 0.15, cz);                                        // kick plate
      add(bx(len, 0.12, 0.06), glow, cx + nx * 1.02, 2.45, cz + nz * 1.02);                 // lit trim line
      add(bx(len, 0.12, 0.12), rail, cx + nx * 0.85, H + 0.75, cz + nz * 0.85);              // top rail
      add(bx(len, 0.08, 0.08), rail, cx + nx * 0.85, H + 0.4, cz + nz * 0.85);               // mid rail
      for (let t = -len / 2 + 1.5; t < len / 2; t += 3) {                                    // ribs + rail posts
        const x = alongX ? cx + t : cx, z = alongX ? cz : cz + t;
        d.position.set(x + nx * 1.03, H / 2, z + nz * 1.03); d.scale.set(1, 1, 1); d.rotation.set(0, alongX ? 0 : Math.PI / 2, 0); d.updateMatrix(); ribM.push(d.matrix.clone());
        d.position.set(x + nx * 0.85, H + 0.4, z + nz * 0.85); d.scale.set(0.6, 0.27, 0.6); d.updateMatrix(); ribM.push(d.matrix.clone());
      }
    }
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 3, 0.1), rib, ribM.length);
    ribM.forEach((m, i) => ribs.setMatrixAt(i, m));
    ribs.computeBoundingSphere();
    g.add(ribs);
    g.traverse(o => { o.userData.noOutline = true; (o as any).raycast = () => {}; });
    this.scene.add(g);
  }

  public enterFpsMode(unit: any) {
    if (!unit || unit.isDead) return;
    this.viewMode = 'fps';
    this.tpsBlend = 0;
    this.setupViewTransition(unit);
  }

  public enterThirdPersonMode(unit: any) {
    if (!unit || unit.isDead) return;
    this.viewMode = 'tps';
    this.tpsBlend = 1;
    this.setupViewTransition(unit);
  }

  /** Hot-swap possession to another unit while staying in the current view mode (camera glides over). */
  public swapViewUnit(unit: any) {
    if (!unit || unit.isDead || !this.isFpsMode) return;
    const old = this.fpsUnit;
    if (old?.mesh) old.mesh.visible = true;
    this.fpsUnit = unit;
    this.fpsYaw = unit.rotation;
    this.fpsPitch = 0;
    if (unit.mesh) unit.mesh.visible = this.viewMode === 'tps';
  }

  public toggleFpsTps() {
    if (!this.fpsUnit || this.fpsUnit.isDead) return;
    this.viewMode = this.viewMode === 'fps' ? 'tps' : 'fps';
    if (this.fpsUnit.mesh) {
      this.fpsUnit.mesh.visible = this.viewMode === 'tps';
    }
  }

  private setupViewTransition(unit: any) {
    this.fpsUnit = unit;
    this.savedRtsTarget.copy(this.cameraTarget);
    this.savedRtsDistance = this.cameraDistance;

    // Center RTS camera target onto the unit immediately for a smooth, focused zoom
    this.cameraTarget.set(unit.pos.x, unit.height, unit.pos.y);
    this.targetFpsTransition = 1.0;

    // Precisely inherit where the unit is already looking in the battlefield
    this.fpsYaw = unit.rotation;
    // Level horizontal gaze directly into the battlefield (what the unit sees)
    this.fpsPitch = 0.0;
  }

  public exitFpsMode() {
    this.targetFpsTransition = 0.0;
    if (this.fpsUnit && this.fpsUnit.mesh) {
      this.fpsUnit.mesh.visible = true;
    }
  }

  public updateCameraPosition(dt: number = 0.016) {
    // 1. Smoothly update View Transition factor (0 = RTS, 1 = FPS / TPS)
    if (Math.abs(this.fpsTransition - this.targetFpsTransition) > 0.001) {
      const lerpSpeed = this.isFpsMode ? 5.5 : 6.5;
      this.fpsTransition += (this.targetFpsTransition - this.fpsTransition) * Math.min(1, dt * lerpSpeed);
    } else {
      this.fpsTransition = this.targetFpsTransition;
      if (this.fpsTransition === 0) {
        this.viewMode = 'rts';
        this.fpsUnit = null;
      }
    }

    // Keep the shadow frustum centred on what the camera is looking at (snapped to 2 units to avoid shimmer)
    if (this.dirLight) {
      const sx = Math.round(this.cameraTarget.x / 2) * 2, sz = Math.round(this.cameraTarget.z / 2) * 2;
      this.dirLight.target.position.set(sx, 0, sz);
      this.dirLight.position.set(sx + 40, 70, sz + 30);
    }

    // 2. RTS Camera Position & Look Target (zero allocations)
    const yOffset = this.cameraDistance * Math.sin(this.cameraAngle);
    const zOffset = this.cameraDistance * Math.cos(this.cameraAngle);
    const rtsPos = this._rtsPos.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * zOffset,
      this.cameraTarget.y + yOffset,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * zOffset
    );
    const rtsLookAt = this._rtsLookAt.copy(this.cameraTarget);

    // 3. First-Person (FPS) or Third-Person (TPS) Camera Position & Look Target
    if (this.fpsUnit && this.fpsTransition > 0) {
      // Check if unit died
      if (this.fpsUnit.isDead) {
        this.exitFpsMode();
      }

      const u = this.fpsUnit;
      const eyeHeight = u.isFlying
        ? 1.15
        : u.type.includes('tank')
          ? 1.6
          : u.type === 'scv'
              ? 1.25
              : 1.45;
      const forwardOffset = u.isFlying ? 0.55 : u.type === 'scv' ? 0.35 : 0.25;

      const sinYaw = Math.sin(this.fpsYaw);
      const cosYaw = Math.cos(this.fpsYaw);
      const cosPitch = Math.cos(this.fpsPitch);
      const sinPitch = Math.sin(this.fpsPitch);

      // Eye / cockpit position located at unit's visor
      const eyePos = this._eyePos.set(
        u.pos.x + sinYaw * forwardOffset,
        u.height + eyeHeight,
        u.pos.y + cosYaw * forwardOffset
      );

      // Look direction vector
      const lookDir = this._lookDir.set(
        sinYaw * cosPitch,
        sinPitch,
        cosYaw * cosPitch
      ).normalize();

      // Camera Goal Position based on View Mode
      const goalCamPos = this._goalCamPos;
      this.tpsBlend += ((this.viewMode === 'tps' ? 1 : 0) - this.tpsBlend) * Math.min(1, dt * 3.2);
      if (Math.abs(this.tpsBlend - (this.viewMode === 'tps' ? 1 : 0)) < 0.002) this.tpsBlend = this.viewMode === 'tps' ? 1 : 0;
      if (this.tpsBlend > 0) {
        // Third-Person Chase Camera: Crimson Skies wide camera for aircraft, centered for vehicles, shoulder for infantry
        const isVehicle = u.isFlying || u.type === 'scv' || u.type.includes('tank');
        const shoulder = isVehicle ? 0.0 : this.tpsShoulderOffset;
        const dist = u.isFlying ? Math.max(this.tpsFollowDist, 6.8) : isVehicle ? Math.max(this.tpsFollowDist, 5.8) : this.tpsFollowDist;
        const h = u.isFlying ? Math.max(this.tpsFollowHeight, 2.7) : isVehicle ? Math.max(this.tpsFollowHeight, 2.6) : this.tpsFollowHeight;
        this._chasePos.set(
          u.pos.x - sinYaw * dist + cosYaw * shoulder,
          u.height + h,
          u.pos.y - cosYaw * dist - sinYaw * shoulder
        );
        // ease-in-out so the glide from cockpit to chase view starts and ends gently
        const k = this.tpsBlend * this.tpsBlend * (3 - 2 * this.tpsBlend);
        goalCamPos.lerpVectors(eyePos, this._chasePos, k);
      } else {
        // First-Person Cockpit / Visor camera
        goalCamPos.copy(eyePos);
      }

      // Look target is projected into the battlefield along the line of sight (what the unit is seeing)
      const viewLookAt = this._viewLookAt.copy(eyePos).addScaledVector(lookDir, 40);

      // Smoothly interpolate between overhead RTS perspective and active unit perspective
      const blendedPos = this._blendedPos.lerpVectors(rtsPos, goalCamPos, this.fpsTransition);
      const blendedLookAt = this._blendedLookAt.lerpVectors(rtsLookAt, viewLookAt, this.fpsTransition);

      this.camera.position.copy(blendedPos);
      this.camera.lookAt(blendedLookAt);

      // IL-2 / Ace Combat Cockpit Horizon Roll when banking or flying with wing damage in 1st-person
      if (this.tpsBlend < 1 && u.isFlying) {
        const totalRoll = (u.roll || 0) * 0.42 + u.getWingRollBias();
        this.camera.rotateZ(-totalRoll * this.fpsTransition * (1 - this.tpsBlend));
      }

      // Unit mesh visibility:
      // In TPS mode, unit is ALWAYS visible so player sees their unit in action!
      // In FPS mode, unit mesh is hidden once fully inside the cockpit to avoid clipping into head geometry.
      if (u.mesh) {
        u.mesh.visible = this.tpsBlend > 0.3 || this.fpsTransition < 0.85;
      }
    } else {
      // Standard RTS Camera
      this.camera.position.copy(rtsPos);
      this.camera.lookAt(rtsLookAt);
    }

    // Update directional shadow light
    if (this.dirLight) {
      this.dirLight.position.set(
        this.camera.position.x + 40,
        70,
        this.camera.position.z + 30
      );
      this.dirLight.target.position.copy(this.cameraTarget);
      this.dirLight.target.updateMatrixWorld();
    }
  }

  /** Pan in SCREEN space (+x right, +z down); rotated by the camera yaw into world space. */
  public panCamera(deltaX: number, deltaZ: number) {
    const c = Math.cos(this.cameraYaw), sn = Math.sin(this.cameraYaw);
    const wx = deltaX * c + deltaZ * sn, wz = -deltaX * sn + deltaZ * c;
    this.cameraTarget.x = Math.max(10, Math.min(MAP_SIZE - 10, this.cameraTarget.x + wx));
    this.cameraTarget.z = Math.max(10, Math.min(MAP_SIZE - 10, this.cameraTarget.z + wz));
    this.updateCameraPosition();
  }

  public zoomCamera(deltaZoom: number) {
    this.cameraDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.cameraDistance + deltaZoom));
    this.updateCameraPosition();
  }

  public setCameraTarget(x: number, z: number) {
    this.cameraTarget.x = Math.max(10, Math.min(MAP_SIZE - 10, x));
    this.cameraTarget.z = Math.max(10, Math.min(MAP_SIZE - 10, z));
    this.updateCameraPosition();
  }

  public render(dt: number = 0.016) {
    if (this.updateInstancedGrass) {
      PerformanceProfiler.get().start('grass');
      this.updateInstancedGrass(dt);
      PerformanceProfiler.get().end('grass');
    }
    this.rampRatio(performance.now());
    this.runTierQueue(performance.now());
    PerformanceProfiler.get().start('gpu');
    // Shadow map is re-rendered every other frame (30Hz); the previous map is reused in between
    this.webglRenderer.shadowMap.autoUpdate = false;
    this.webglRenderer.shadowMap.needsUpdate = !this.shadowsOff && (this.shadowFrame++ & 1) === 0;
    { const sz = this.webglRenderer.getDrawingBufferSize(new THREE.Vector2()); Outline.setResolution(sz.x, sz.y, this.webglRenderer.getPixelRatio()); }
    if (this.composer) this.composer.render(dt); else this.webglRenderer.render(this.scene, this.camera);
    PerformanceProfiler.get().end('gpu');
    if (this.warmGroup && this.warmFramesLeft > 0 && --this.warmFramesLeft === 0) this.endWarmChunk();
  }

  // ---- Render resolution / quality presets (persisted) ----
  public static readonly QUALITY_PRESETS: { id: string; label: string }[] = [
    { id: 'low', label: 'Low (1x, no shadows / bloom / post-processing)' },
    { id: 'performance', label: 'Performance (1x)' },
    { id: 'balanced', label: 'Balanced (1.5x)' },
    { id: 'high', label: 'High (2x)' },
    { id: 'ultra', label: 'Ultra (2.5x supersampled)' },
    { id: 'native', label: 'Native display resolution' }
  ];

  public static loadQuality(): string {
    try {
      const q = localStorage.getItem('sc2_render_quality');
      if (q && Renderer.QUALITY_PRESETS.some(p => p.id === q)) return q;
    } catch {}
    return 'balanced';
  }

  public static pixelRatioFor(quality: string): number {
    switch (quality) {
      case 'low':
      case 'performance': return 1;
      case 'high': return 2;
      case 'ultra': return 2.5;
      case 'native': return Math.max(1, window.devicePixelRatio || 1);
      default: return Math.min(window.devicePixelRatio || 1, 1.5);
    }
  }

  /**
   * Low tier: on top of 1x resolution, drop the expensive per-pixel features: dynamic shadows, the whole post-processing
   * chain (MSAA half-float target, bloom, colour grade), image-based reflections, small ground cover/doodads and most of the
   * animated grass. Gameplay visuals (units, fog, terrain) stay.
   */
  private applyLowTier(on: boolean) {
    if (on === this.lowTier) return;
    this.lowTier = on;
    // Nothing here may change a shader program's inputs (shadow-casting light count, scene.environment, shadowMap.enabled):
    // that recompiles every material and freezes the game for seconds. Hide the effects instead - shadows get zero
    // intensity and stop being rendered, reflections get zero intensity.
    const detail = () => this.sceneryRoot?.userData.detail as THREE.Object3D | undefined;
    const fx: (() => void)[] = [
      () => { this.shadowsOff = on; this.dirLight.shadow.intensity = on ? 0 : 1; },
      () => { if (this.bloomPass) this.bloomPass.enabled = !on; },
      () => { const d = detail(); if (d) d.visible = !on; },
      () => { if (this.grassMesh) this.grassMesh.count = on ? Math.floor(this.grassFullCount * 0.3) : this.grassFullCount; },
      () => { this.scene.environmentIntensity = on ? 0 : 0.3; }
    ];
    // Spread the changes over several frames (one every ~120 ms) instead of all in one frame; stepping back up undoes them in reverse.
    this.tierQueue = on ? fx : fx.reverse();
    if (this.framesRendered < 2) { this.tierQueue.forEach(f => f()); this.tierQueue = []; } // before the first frame: just apply
  }

  private tierQueue: (() => void)[] = [];
  private tierAt = 0;
  private framesRendered = 0;
  private shadowsOff = false;
  private runTierQueue(now: number) {
    this.framesRendered++;
    if (!this.tierQueue.length || now - this.tierAt < 120) return;
    this.tierAt = now;
    this.tierQueue.shift()!();
  }

  private warmGroup: THREE.Group | null = null;
  private warmFramesLeft = 0;
  private warmChunkDone: (() => void) | null = null;
  /** Model types already warmed ('u:marine', 'b:pylon'): later calls skip them. */
  private warmed = new Set<string>();
  private warmChain: Promise<void> = Promise.resolve();
  private warmGen = 0;
  /** Stops the warm-up in progress after its current chunk (and drops queued ones), so a newer, more urgent one runs next. */
  public stopWarmUp() { this.warmGen++; }
  private static readonly WARM_CHUNK = 8; // types per chunk (x2 team colours): a short hitch per frame instead of one ~3 s freeze

  private endWarmChunk() {
    if (this.warmGroup) { this.scene.remove(this.warmGroup); this.warmGroup.clear(); this.warmGroup = null; }
    this.warmFramesLeft = 0;
    const done = this.warmChunkDone; this.warmChunkDone = null; done?.();
  }

  /**
   * Shader / geometry / texture warm-up: unit and building models (both team colours) are placed, microscopic, in front of the
   * camera; their programs are compiled in parallel, then drawn for a couple of frames so buffers and textures are uploaded.
   * Runs in small chunks (the scene keeps rendering behind the menu), skips types already warmed, and queues behind any warm-up
   * in progress, so it can run while idle on the menu and again, for just the match's races, during the start countdown.
   * `races` limits it to those races' models (load their rigged models first, or the fallback models get warmed instead).
   */
  public warmUp(races?: FactionType[]): Promise<void> {
    const gen = this.warmGen;
    const run = async () => {
      if (gen !== this.warmGen) return;
      const units: UnitType[] = ['observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership', 'infestor', 'scv', 'marine', 'marauder', 'firebat', 'medic', 'siege_tank', 'siege_tank_sieged', 'medivac', 'wraith', 'banshee', 'hellion', 'thor', 'thor_ap', 'goliath', 'mule',
      'viking', 'viking_assault', 'widow_mine', 'dark_templar', 'auto_turret', 'lurker', 'drone', 'zergling', 'roach', 'hydralisk', 'mutalisk', 'queen', 'baneling', 'ravager', 'ultralisk', 'broodlord', 'viper', 'probe', 'zealot', 'stalker', 'archon', 'sentry', 'void_ray', 'cyclone', 'odin', 'overlord', 'swarm_host', 'immortal', 'colossus', 'carrier', 'tempest', 'adept'];
      const buildings: BuildingType[] = ['fusion_core', 'ghost_academy', 'sensor_tower', 'command_center', 'orbital_command', 'planetary_fortress', 'techlab', 'reactor', 'supply_depot', 'supply_depot_lowered', 'refinery', 'barracks', 'engineering_bay', 'bunker', 'missile_turret', 'factory', 'starport', 'armory',
      'hatchery', 'spawning_pool', 'roach_warren', 'hydralisk_den', 'spine_crawler', 'extractor', 'overlord_pod', 'nexus', 'pylon', 'assimilator', 'gateway', 'forge', 'photon_cannon', 'stargate', 'infestation_pit', 'hive', 'baneling_nest', 'evolution_chamber', 'lurker_den', 'spire', 'greater_spire', 'nydus_network', 'ultralisk_cavern', 'spore_crawler', 'cybernetics_core', 'twilight_council', 'robotics_facility', 'robotics_bay', 'templar_archives', 'dark_shrine', 'fleet_beacon', 'shield_battery', 'creep_tumor', 'nydus_worm'];
      const want = (race: FactionType | undefined) => !races || !race || races.includes(race);
      const todo: [string, () => THREE.Object3D, () => THREE.Object3D][] = [];
      for (const t of units) if (!this.warmed.has('u:' + t) && want(UNIT_CONFIGS[t]?.race)) todo.push(['u:' + t, () => modelFactory.createUnitModel(t, true), () => modelFactory.createUnitModel(t, false)]);
      for (const t of buildings) if (!this.warmed.has('b:' + t) && want(BUILDING_CONFIGS[t]?.race)) todo.push(['b:' + t, () => modelFactory.createBuildingModel(t, true), () => modelFactory.createBuildingModel(t, false)]);
      for (let i = 0; i < todo.length; i += Renderer.WARM_CHUNK) {
        if (gen !== this.warmGen) return; // stopped: a match start wants its own races first
        const g = new THREE.Group();
        const at = new THREE.Vector3(); this.camera.getWorldDirection(at); at.multiplyScalar(30).add(this.camera.position);
        for (const [key, ...makers] of todo.slice(i, i + Renderer.WARM_CHUNK)) {
          this.warmed.add(key);
          for (const make of makers) { try { const m = make(); m.position.copy(at); m.scale.multiplyScalar(0.0005); g.add(m); } catch { /* model not available */ } }
        }
        g.traverse(o => { o.frustumCulled = false; (o as THREE.Mesh).castShadow = false; });
        this.scene.add(g);
        try { await (this.webglRenderer as any).compileAsync(g, this.camera, this.scene); } catch { /* ignore */ }
        // drawn through the normal path for 2 frames, then removed (500 ms cap: hidden tabs do not render)
        await new Promise<void>(res => { this.warmGroup = g; this.warmFramesLeft = 2; this.warmChunkDone = res; setTimeout(() => { if (this.warmGroup === g) this.endWarmChunk(); }, 500); });
      }
    };
    this.warmChain = this.warmChain.then(run, run);
    return this.warmChain;
  }

  private ratioTarget = -1;
  private ratioStepAt = 0;
  private applyRatio(ratio: number) {
    if (Math.abs(this.webglRenderer.getPixelRatio() - ratio) < 1e-3) return;
    this.webglRenderer.setPixelRatio(ratio);
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setPixelRatio(ratio);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass?.setSize(Math.max(2, window.innerWidth >> 1), Math.max(2, window.innerHeight >> 1));
  }
  /** Move the render resolution one step (max 0.5x) towards the target; called every frame, acts at most every 200 ms. */
  private rampRatio(now: number, first = false) {
    if (this.ratioTarget < 0) return;
    const cur = this.webglRenderer.getPixelRatio();
    if (Math.abs(cur - this.ratioTarget) < 1e-3) return;
    if (!first && now - this.ratioStepAt < 150) return;
    this.ratioStepAt = now;
    const next = cur > this.ratioTarget ? Math.max(this.ratioTarget, cur - 0.5) : Math.min(this.ratioTarget, cur + 0.5);
    this.applyRatio(next);
  }

  /** Apply a quality preset live: render resolution (pixel ratio) and shadow-map detail. */
  public setQuality(quality: string, persist = true) {
    if (persist) { try { localStorage.setItem('sc2_render_quality', quality); } catch {} }
    this.applyLowTier(quality === 'low');
    const ratio = Renderer.pixelRatioFor(quality);
    // Resizing reallocates the canvas and every post-processing target: only do it when the resolution really changes, and
    // for automatic changes walk there in small steps (one every ~200 ms) so no single frame pays for a huge reallocation.
    this.ratioTarget = ratio;
    if (persist) this.applyRatio(ratio);
    else this.rampRatio(performance.now(), true);
    if (persist) {
      const wantType = ratio >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (this.webglRenderer.shadowMap.type !== wantType) {
        this.webglRenderer.shadowMap.type = wantType;
        this.scene.traverse(o => { const m = (o as THREE.Mesh).material as any; if (m) (Array.isArray(m) ? m : [m]).forEach((x: any) => { x.needsUpdate = true; }); });
      }
      const shadowRes = ratio >= 2 ? 2048 : 1024;
      if (this.dirLight.shadow.mapSize.width !== shadowRes) {
        this.dirLight.shadow.mapSize.set(shadowRes, shadowRes);
        this.dirLight.shadow.map?.dispose();
        (this.dirLight.shadow as any).map = null;
      }
    }
  }

  public getRenderInfo(): string {
    const r = this.webglRenderer.getPixelRatio();
    return `${Math.round(window.innerWidth * r)}×${Math.round(window.innerHeight * r)} px (${r}x)`;
  }

  private onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webglRenderer.setSize(width, height);
    this.composer?.setSize(width, height);
    this.bloomPass?.setSize(Math.max(2, width >> 1), Math.max(2, height >> 1));
  }
}
