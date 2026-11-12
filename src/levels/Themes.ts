/**
 * Level themes: pure colour data, so any level can wear any theme. The terrain shader gradient-maps the shared
 * procedural ground / clearing / cliff textures through these three-stop palettes (shadow, mid, highlight).
 */
export type Tri = [number, number, number]; // hex colours: shadow, mid, highlight

export interface Theme {
  id: string;
  ground: Tri;
  clearing: Tri;       // plaza slabs and packed earth
  cliff: Tri;
  rampTint: number;    // multiplied into the ramp stone
  background: number;  // scene clear colour (also the outer meadow)
  meadow: number;      // flat ground outside the playfield
  sun: number;
  hemiSky: number; hemiGround: number; ambient: number;
  /** Grass-blade tufts on natural ground (null = none). */
  grass: { low: number; high: number; density: number } | null;
  /** [ground, plaza, cliff] minimap rgb. */
  minimap: [[number, number, number], [number, number, number], [number, number, number]];
  /** Water / lava / acid colour for liquid pits (also the glow colour of crystal props). */
  liquid: number;
  /** Liquid surface opacity (1 = lava / acid, ~0.7 = water). */
  liquidOpacity?: number;
  /** [trunk, leaf shadow, leaf light] for tree / bush props. */
  foliage: [number, number, number];
  /** Photo textures sampled from the source scenes: blended over the cliff / natural-ground gradient maps. */
  cliffTex?: string;
  groundTex?: string;
  /** 'asphalt': road ops draw as cracked asphalt with a dashed centre line and red-brown dirt shoulders (default: cobbled ramp stone). */
  roadStyle?: 'asphalt';
}

export const THEMES: Record<string, Theme> = {
  alien: {
    id: 'alien',
    ground: [0x030820, 0x0c1f58, 0x2450a0],
    clearing: [0x040924, 0x0e2460, 0x2660a8],
    cliff: [0x03061a, 0x102462, 0x3678ff],
    rampTint: 0x6aa0ff,
    background: 0x050a1e,
    meadow: 0x07123a,
    sun: 0xbfd8ff,
    hemiSky: 0x7aa0ff, hemiGround: 0x1a2a78, ambient: 0x8ea8ff,
    grass: { low: 0x0a3a78, high: 0x34f0c8, density: 0.5 },
    minimap: [[22, 52, 128], [60, 120, 200], [8, 14, 46]],
    liquid: 0x16ffa0, liquidOpacity: 0.85,
    foliage: [0x1a2a60, 0x0f7a8c, 0x3ff0c8]
  },
  // palettes below are sampled from the source scene textures (shadow / mid / highlight of the albedo)
  sandstone: {
    id: 'sandstone',
    ground: [0x6a4a30, 0xa07c52, 0xd8b88a],
    clearing: [0x7a5a40, 0xb89468, 0xe8d0a4],
    cliff: [0x3a2218, 0x8a5a3a, 0xd0966a],
    rampTint: 0xd0b088,
    background: 0x2a1e18, meadow: 0x4a3626, sun: 0xffe2b8,
    hemiSky: 0xffd8b0, hemiGround: 0x6a4a30, ambient: 0xe8c8a0,
    grass: { low: 0x6a5a30, high: 0xc8b070, density: 0.25 },
    minimap: [[150, 116, 80], [210, 184, 140], [74, 46, 32]],
    liquid: 0xc86a2a, liquidOpacity: 0.9,
    foliage: [0x5a3a22, 0x7a6a30, 0xa89850],
    cliffTex: 'textures/levels/sandstone_cliff.jpg'
  },
  // Mar Sara (Liberation Day): sandstone ground with a deep blue-violet chasm / water instead of lava
  marsara: {
    id: 'marsara',
    ground: [0x6a4a30, 0xa07c52, 0xd8b88a],
    clearing: [0x7a5a40, 0xb89468, 0xe8d0a4],
    cliff: [0x3a2218, 0x8a5a3a, 0xd0966a],
    rampTint: 0xd0b088,
    background: 0x1e1a24, meadow: 0x4a3626, sun: 0xffe2b8,
    hemiSky: 0xffd8b0, hemiGround: 0x6a4a30, ambient: 0xe8c8a0,
    grass: { low: 0x6a5a30, high: 0xc8b070, density: 0.25 },
    minimap: [[150, 116, 80], [210, 184, 140], [74, 46, 32]],
    liquid: 0x3a3f7a, liquidOpacity: 0.82,
    foliage: [0x5a3a22, 0x7a6a30, 0xa89850],
    cliffTex: 'textures/levels/sandstone_cliff.jpg',
    roadStyle: 'asphalt'
  },
  canyon: {
    id: 'canyon',
    ground: [0x5a2e22, 0x93603f, 0xd0a07a],
    clearing: [0x6a4030, 0xa87858, 0xe6c8a2],
    cliff: [0x3c1a14, 0x8a4630, 0xd88a5a],
    rampTint: 0xd8a880,
    background: 0x2e1a14, meadow: 0x5a3426, sun: 0xffd0a0,
    hemiSky: 0xffc8a0, hemiGround: 0x703a28, ambient: 0xe8b890,
    grass: { low: 0x70402a, high: 0xd09a62, density: 0.2 },
    minimap: [[158, 100, 72], [222, 188, 150], [70, 34, 24]],
    liquid: 0xff6a20, liquidOpacity: 0.92,
    foliage: [0x5a2e1c, 0x8a5a2a, 0xc89a50],
    cliffTex: 'textures/levels/canyon_cliff.jpg'
  },
  meadow: {
    id: 'meadow',
    ground: [0x2a3014, 0x555a28, 0x8a8c4a],
    clearing: [0x6a6c58, 0xa8a898, 0xdcdccc],
    cliff: [0x2c3024, 0x5a5e48, 0x9a9c86],
    rampTint: 0xc8c8b0,
    background: 0x6a8098, meadow: 0x3e4420, sun: 0xfff0d0,
    hemiSky: 0xb4d0f0, hemiGround: 0x586030, ambient: 0xd8e0c8,
    grass: { low: 0x3a5a1a, high: 0xa8c850, density: 1 },
    minimap: [[78, 84, 40], [180, 180, 164], [60, 64, 50]],
    liquid: 0x2a6a8a, liquidOpacity: 0.72,
    foliage: [0x4a3620, 0x2c5a1a, 0x6aa030],
    groundTex: 'textures/levels/meadow_ground.jpg'
  },
  frost: {
    id: 'frost',
    ground: [0x3a4a60, 0x7a90ac, 0xdce8f4],
    clearing: [0x586a82, 0xa4b8cc, 0xf0f6fc],
    cliff: [0x1c2638, 0x5a6c88, 0xb4c8e0],
    rampTint: 0xc8dcf0,
    background: 0x1a2438, meadow: 0x4a5c74, sun: 0xe0efff,
    hemiSky: 0xcfe2ff, hemiGround: 0x5a6e8a, ambient: 0xc8d8f0,
    grass: { low: 0x7a9ab0, high: 0xe8f4ff, density: 0.35 },
    minimap: [[120, 142, 172], [214, 228, 242], [34, 46, 70]],
    liquid: 0x7ad0ff, liquidOpacity: 0.7,
    foliage: [0x4a3e34, 0x3a6a5a, 0xe8f4ff]
  },
  moss: {
    id: 'moss',
    ground: [0x1c2418, 0x3a4a2a, 0x7a9a50],
    clearing: [0x34322e, 0x6a665e, 0xa8a49a],
    cliff: [0x24221e, 0x4e4b45, 0x9a958c],
    rampTint: 0xb4b0a4,
    background: 0x1a2018, meadow: 0x232c1c, sun: 0xf0f0d8,
    hemiSky: 0xb8c8b0, hemiGround: 0x2c3a20, ambient: 0xc0ccb0,
    grass: { low: 0x2a4a1a, high: 0x7ab048, density: 0.7 },
    minimap: [[52, 70, 38], [126, 122, 112], [40, 38, 34]],
    liquid: 0x2e5a4a, liquidOpacity: 0.75,
    foliage: [0x3a2c20, 0x23401a, 0x5e8c34],
    cliffTex: 'textures/levels/moss_cliff.jpg'
  },
  swamp: {
    id: 'swamp',
    ground: [0x14180e, 0x303a1c, 0x6c7a30],
    clearing: [0x2a2c20, 0x585a3c, 0x9a9a62],
    cliff: [0x0c1010, 0x2a3224, 0x5a6a48],
    rampTint: 0x9a9a6a,
    background: 0x10160e, meadow: 0x1c2412, sun: 0xe0e8c0,
    hemiSky: 0xa8bc98, hemiGround: 0x283418, ambient: 0xa8b890,
    grass: { low: 0x243a14, high: 0x8aa040, density: 0.8 },
    minimap: [[46, 56, 28], [120, 120, 82], [20, 26, 22]],
    liquid: 0x3a5a3a, liquidOpacity: 0.8,
    foliage: [0x2c2418, 0x1c3c18, 0x5a7a2a],
    groundTex: 'textures/levels/swamp_ground.jpg'
  },
  sunken_ruins: {
    id: 'sunken_ruins',
    ground: [0x1c2818, 0x425632, 0x869e5c],
    clearing: [0x2c3630, 0x5c6e62, 0x9eb2a4],
    cliff: [0x18221c, 0x3c5246, 0x7a9686],
    rampTint: 0x98b09c,
    background: 0x0e1814, meadow: 0x18261c, sun: 0xfff2d6,
    hemiSky: 0xa6d2c8, hemiGround: 0x263828, ambient: 0xb8d4c2,
    grass: { low: 0x24461e, high: 0x76b84c, density: 0.65 },
    minimap: [[58, 82, 46], [116, 138, 124], [28, 42, 34]],
    liquid: 0x1c788c, liquidOpacity: 0.76,
    foliage: [0x3c2c1e, 0x1e4c24, 0x5ca238],
    groundTex: 'textures/levels/swamp_ground.jpg',
    cliffTex: 'textures/levels/moss_cliff.jpg'
  }
};

export const themeOf = (id: string): Theme => THEMES[id] ?? THEMES.alien!;
