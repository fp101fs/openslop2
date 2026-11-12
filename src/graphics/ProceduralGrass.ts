import * as THREE from 'three';
import { LAYOUT } from '../maps';
import { rasterFor } from '../levels/LevelRaster';

// Fast 2D Simplex/Perlin-style gradient noise for organic macro terrain variation
class SimplexNoise {
  private p: Uint8Array = new Uint8Array(512);

  constructor(seed: number = 42) {
    const permutation = new Uint8Array(256);
    for (let i = 0; i < 256; i++) permutation[i] = i;
    // Seeded shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      const tmp = permutation[i]!;
      permutation[i] = permutation[j]!;
      permutation[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255]!;
    }
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  public noise(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1 = 0;
    let j1 = 1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.grad(this.p[ii + this.p[jj!]!]!, x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.grad(this.p[ii + i1 + this.p[jj + j1]!]!, x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.grad(this.p[ii + 1 + this.p[jj + 1]!]!, x2, y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  // Fractal Brownian Motion (layered octaves)
  public fbm(x: number, y: number, octaves = 4, persistence = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxValue;
  }
}

export class ProceduralGrassSystem {
  public static readonly noise = new SimplexNoise(1337);

  // Generate 100% mathematically seamless procedural grass texture with rich lime greens, light greens & emeralds
  public static generateSeamlessGrassTexture(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Fresh vibrant green spring turf underlayer (no dark gray/mud)
    ctx.fillStyle = '#2d681c';
    ctx.fillRect(0, 0, size, size);

    // 2. Base moss & clover soft noise underlayer with seamless toroidal sampling
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Toroidal coordinates for 100% seamless wrapping
        const nx = Math.cos((x * Math.PI * 2) / size);
        const ny = Math.sin((x * Math.PI * 2) / size);
        const nz = Math.cos((y * Math.PI * 2) / size);
        const nw = Math.sin((y * Math.PI * 2) / size);

        // Multi-frequency noise
        const n1 = this.noise.noise(nx * 1.5, ny * 1.5 + nz * 1.5) * 0.5 + 0.5;
        const n2 = this.noise.noise(nz * 3.0, nw * 3.0 + nx * 3.0) * 0.5 + 0.5;
        const blend = n1 * 0.65 + n2 * 0.35;

        const idx = (y * size + x) * 4;
        // Rich vibrant spring green base (fresh emerald to bright sunlit lawn)
        const r = Math.floor(40 + blend * 55);
        const g = Math.floor(100 + blend * 85);
        const b = Math.floor(25 + blend * 35);

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Render 42,000 randomized organic grass blades with toroidal wrapping
    // Enhanced palette: rich lime greens, vivid light greens, emeralds & sunlit highlights
    const bladeColors = [
      '#34851f', // Deep emerald anchor
      '#44a329', // Rich clover green
      '#53bf2d', // Crisp lawn green
      '#6edb3b', // Bright light green
      '#86e843', // Vibrant lime-meadow green
      '#9ef24b', // Punchy electric lime
      '#b6f859', // Sunlit lime-chartreuse tip
      '#cbfa6a', // Sunbeam yellow-lime highlight
      '#8cd934'  // Spring shoots
    ];

    const bladeCount = 42000;

    // Helper to draw a single tapered blade with toroidal wrap across edges
    const drawWrappedBlade = (
      startX: number,
      startY: number,
      length: number,
      angle: number,
      curve: number,
      width: number,
      color: string
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';

      // Draw original and periodic wraps (-size, 0, +size)
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const x0 = startX + ox;
          const y0 = startY + oy;

          // Quick bounds check
          if (x0 < -20 || x0 > size + 20 || y0 < -20 || y0 > size + 20) continue;

          const midX = x0 + Math.cos(angle) * (length * 0.5) + curve * 0.4;
          const midY = y0 + Math.sin(angle) * (length * 0.5);
          const endX = x0 + Math.cos(angle) * length + curve;
          const endY = y0 + Math.sin(angle) * length;

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(midX, midY, endX, endY);
          ctx.stroke();
        }
      }
    };

    // Layer 1: Base & mid-tone lush green blades
    for (let i = 0; i < bladeCount * 0.45; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const length = 5 + Math.random() * 8;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
      const curve = (Math.random() - 0.5) * 4;
      const width = 1.3 + Math.random() * 0.8;
      const color = bladeColors[Math.floor(Math.random() * 4)]!;
      drawWrappedBlade(x, y, length, angle, curve, width, color);
    }

    // Layer 2: Radiant lime greens and bright light green sunlit blades
    for (let i = 0; i < bladeCount * 0.55; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const length = 4 + Math.random() * 7.5;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.55;
      const curve = (Math.random() - 0.5) * 3.5;
      const width = 0.9 + Math.random() * 0.7;
      const color = bladeColors[3 + Math.floor(Math.random() * 6)]!;
      drawWrappedBlade(x, y, length, angle, curve, width, color);
    }

    // 4. Scattered wild clover florets & micro chamomile daisies (fresh cheerful meadow look)
    ctx.fillStyle = '#e2ffba';
    for (let i = 0; i < 220; i++) {
      const cx = Math.random() * size;
      const cy = Math.random() * size;
      const rad = 1.0 + Math.random() * 1.4;

      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const x = cx + ox;
          const y = cy + oy;
          if (x >= -4 && x <= size + 4 && y >= -4 && y <= size + 4) {
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Generate 100% mathematically seamless dirt/sand texture matching the attached light beige sand image
  // Rich warm sunlit golden beige sand palette (never gray)
  public static generateSeamlessSandTexture(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Harmonic diagonal wave frequencies ensure strict mathematical seamlessness at borders
    // u = 2 * PI * x / size, v = 2 * PI * y / size
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x * Math.PI * 2) / size;
        const v = (y * Math.PI * 2) / size;

        // Sand dune ripples: fine, organic wind-blown waves with seamless harmonic curves
        const distort =
          Math.sin(2 * u - 2 * v) * 0.55 +
          Math.cos(3 * u + 2 * v) * 0.35 +
          Math.sin(u + 3 * v) * 0.20;
        const wave1 = Math.sin(6 * u + 4 * v + distort);
        const wave2 = Math.sin(12 * u + 8 * v + Math.cos(2 * u - v) * 0.5) * 0.38;
        const wave3 = Math.sin(24 * u + 16 * v + distort * 0.5) * 0.15;
        const totalWave = wave1 * 0.58 + wave2 * 0.28 + wave3 * 0.14;

        // Fine quartz sand grain micro-texture
        const grain = (Math.random() - 0.5) * 0.09;
        const val = totalWave * 0.34 + grain;

        // Very Light Beige Dune Sand Palette matching uploaded reference image (warm ivory/cream beige, zero gray):
        // Highlights (sunlit ivory sand ridge): rgb(252, 246, 232) #fcf6e8
        // Midtone (very light creamy beige sand): rgb(240, 229, 207) #f0e5cf
        // Troughs / Shading (warm soft sand ripple shadow): rgb(225, 210, 182) #e1d2b6
        // Deep ripples (warm sandy crevice): rgb(214, 196, 166) #d6c4a6
        let r: number, g: number, b: number;
        if (val < -0.12) {
          const t = Math.min(1.0, Math.max(0.0, (-val - 0.12) / 0.26));
          r = Math.floor(225 * (1 - t) + 214 * t);
          g = Math.floor(210 * (1 - t) + 196 * t);
          b = Math.floor(182 * (1 - t) + 166 * t);
        } else if (val < 0.08) {
          const t = (val + 0.12) / 0.20;
          r = Math.floor(225 * (1 - t) + 240 * t);
          g = Math.floor(210 * (1 - t) + 229 * t);
          b = Math.floor(182 * (1 - t) + 207 * t);
        } else {
          const t = Math.min(1.0, Math.max(0.0, (val - 0.08) / 0.30));
          r = Math.floor(240 * (1 - t) + 252 * t);
          g = Math.floor(229 * (1 - t) + 246 * t);
          b = Math.floor(207 * (1 - t) + 232 * t);
        }

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Add scattered tiny pebbles and mineral granules (1-2px) exactly like the sand photo
    const pebbleColors = [
      '#5c4628', // Dark mineral grain
      '#7a5f36', // Golden brown pebble
      '#3d2e18', // Obsidian dark fleck
      '#9a7a4a', // Light quartz pebble
      '#c2a26c'  // Weathered granite speck
    ];

    for (let i = 0; i < 650; i++) {
      const px = Math.floor(Math.random() * size);
      const py = Math.floor(Math.random() * size);
      const col = pebbleColors[Math.floor(Math.random() * pebbleColors.length)]!;
      ctx.fillStyle = col;

      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          const x = px + ox;
          const y = py + oy;
          if (x >= 0 && x < size && y >= 0 && y < size) {
            ctx.fillRect(x, y, 1.5, 1.5);
          }
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Tangent-space normal map from grass canvas for dynamic lighting highlights
  public static generateSeamlessGrassNormalMap(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const normData = ctx.createImageData(size, size);
    const dst = normData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx0 = (x - 1 + size) % size;
        const nx1 = (x + 1) % size;
        const ny0 = (y - 1 + size) % size;
        const ny1 = (y + 1) % size;

        const v0 = this.noise.noise(nx0 * 0.08, y * 0.08);
        const v1 = this.noise.noise(nx1 * 0.08, y * 0.08);
        const v2 = this.noise.noise(x * 0.08, ny0 * 0.08);
        const v3 = this.noise.noise(x * 0.08, ny1 * 0.08);

        const dx = (v1 - v0) * 1.5;
        const dy = (v3 - v2) * 1.5;
        const dz = 1.0;

        const len = Math.hypot(dx, dy, dz);
        const r = Math.floor((-dx / len * 0.5 + 0.5) * 255);
        const g = Math.floor((-dy / len * 0.5 + 0.5) * 255);
        const b = Math.floor((dz / len * 0.5 + 0.5) * 255);

        const idx = (y * size + x) * 4;
        dst[idx] = r;
        dst[idx + 1] = g;
        dst[idx + 2] = b;
        dst[idx + 3] = 255;
      }
    }

    ctx.putImageData(normData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Tangent-space normal map from sand dune wave harmonics
  public static generateSeamlessSandNormalMap(size = 512): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const normData = ctx.createImageData(size, size);
    const dst = normData.data;

    const sampleHeight = (x: number, y: number) => {
      const u = (x * Math.PI * 2) / size;
      const v = (y * Math.PI * 2) / size;
      const distort =
        Math.sin(2 * u - 2 * v) * 0.55 +
        Math.cos(3 * u + 2 * v) * 0.35 +
        Math.sin(u + 3 * v) * 0.20;
      const wave1 = Math.sin(6 * u + 4 * v + distort);
      const wave2 = Math.sin(12 * u + 8 * v + Math.cos(2 * u - v) * 0.5) * 0.38;
      return wave1 * 0.68 + wave2 * 0.32;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx0 = (x - 1 + size) % size;
        const nx1 = (x + 1) % size;
        const ny0 = (y - 1 + size) % size;
        const ny1 = (y + 1) % size;

        const hL = sampleHeight(nx0, y);
        const hR = sampleHeight(nx1, y);
        const hD = sampleHeight(x, ny0);
        const hU = sampleHeight(x, ny1);

        const dx = (hR - hL) * 2.2;
        const dy = (hU - hD) * 2.2;
        const dz = 1.0;

        const len = Math.hypot(dx, dy, dz);
        const r = Math.floor((-dx / len * 0.5 + 0.5) * 255);
        const g = Math.floor((-dy / len * 0.5 + 0.5) * 255);
        const b = Math.floor((dz / len * 0.5 + 0.5) * 255);

        const idx = (y * size + x) * 4;
        dst[idx] = r;
        dst[idx + 1] = g;
        dst[idx + 2] = b;
        dst[idx + 3] = 255;
      }
    }

    ctx.putImageData(normData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  /** Data-driven level raster when the current map is a LevelDef (null on the procedural maps). */
  private static get R() { return LAYOUT.level ? rasterFor(LAYOUT.level) : null; }

  // Distance to the nearest natural winding sand trail (each trail connects two bases with a gentle S-curve)
  public static getTrailDistance(x: number, z: number): number {
    let best = 999.0;
    for (const tr of LAYOUT.trails) {
      const ax = tr.a[0], ay = tr.a[1];
      const vx = tr.b[0] - ax, vy = tr.b[1] - ay;
      const len = Math.hypot(vx, vy);
      const ux = vx / len, uy = vy / len;
      const proj = (x - ax) * ux + (z - ay) * uy;
      if (proj < -0.1 * len || proj > 1.1 * len) continue;
      const perp = (x - ax) * -uy + (z - ay) * ux;
      const curveOffset = Math.sin((proj * Math.PI * 2.0) / len) * 4.2 * Math.min(1.0, len / 99.0);
      best = Math.min(best, Math.abs(perp - curveOffset));
    }
    return best;
  }

  // Precomputed 241x241 (0.5-tile resolution) bilinear height cache for O(1) nanosecond terrain queries
  private static heightCache: Float32Array | null = null;
  private static readonly CACHE_RES = LAYOUT.size * 2 + 1;
  public static readonly HIGH_GROUND_HEIGHT = 2.25;
  /** Default map (space station): ramps are flat across their walkable width so the 3D metal ramp decks lie level. */
  private static readonly FLAT_RAMPS = !LAYOUT.level && LAYOUT.id === 'standard';

  /** Half-width of the carved ramp corridor; flares out at both mouths so the ramp opens naturally into the terrain. */
  private static rampHalfCore(proj: number): number {
    const top = 1.0 - this.smooth01((proj - 15.0) / 3.0);   // flare at the plateau end
    const bottom = this.smooth01((proj - 20.0) / 3.0);      // flare at the valley end
    return 2.5 + 1.6 * Math.min(1.0, top + bottom);
  }

  private static smooth01(t: number): number {
    const c = Math.max(0.0, Math.min(1.0, t));
    return c * c * (3.0 - 2.0 * c);
  }

  private static rampFromAxes(proj: number, perp: number): { onRamp: boolean; t: number; wallBlend: number } | null {
    if (proj < 13.8 || proj > 24.6) return null;
    const half = this.rampHalfCore(proj);
    const soft = 1.5 + 0.8 * (half - 2.5) / 1.6;
    if (perp > half + soft) return null;
    const t = Math.max(0.0, Math.min(1.0, (proj - 15.5) / 6.8));
    const wallBlend = perp <= half ? 0.0 : Math.min(1.0, (perp - half) / soft);
    return { onRamp: wallBlend < 0.65, t, wallBlend };
  }

  // Each plateau has one carved ramp running along its (dx, dy) direction (standard map: (36,36)<->(41,41) and (84,84)<->(79,79))
  public static getRampInfo(x: number, z: number): { onRamp: boolean; t: number; wallBlend: number } {
    const R = this.R;
    if (R) { const on = R.isRamp(x, z); return { onRamp: on, t: on ? R.rampT01(x, z) : 0, wallBlend: on ? 0 : 1 }; }
    for (const p of LAYOUT.plateaus) {
      const dx = x - p.x, dz = z - p.y;
      if (dx > 26 || dx < -26 || dz > 26 || dz < -26) continue;
      const r = this.rampFromAxes(dx * p.dx + dz * p.dy, Math.abs(dx * p.dy - dz * p.dx));
      if (r) return r;
    }
    return { onRamp: false, t: 0, wallBlend: 1.0 };
  }

  /**
   * Smooth ramp surface data for the terrain shader (replaces the old hard-edged ramp strip):
   *   road = 0..1 weight of the engineered stone surface (fades out at both mouths and along organic, noisy edges)
   *   ao   = 0..1 brightness (1 = unshaded): darkens along the ramp side walls and toward the low end to show elevation.
   */
  public static getRampSurface(x: number, z: number): { road: number; ao: number } {
    const R = this.R;
    if (R) { const road = R.roadWeight(x, z); return { road, ao: 1 - 0.22 * R.rampT01(x, z) * road }; }
    let road = 0.0;
    let ao = 1.0;
    const wob = this.noise.noise(x * 0.33, z * 0.33) * 0.45;
    const axes: [number, number][] = [];
    for (const p of LAYOUT.plateaus) {
      const dx = x - p.x, dz = z - p.y;
      if (dx > 30 || dx < -30 || dz > 30 || dz < -30) continue;
      axes.push([dx * p.dx + dz * p.dy, Math.abs(dx * p.dy - dz * p.dx)]);
    }
    for (const [proj, perp] of axes) {
      if (proj < 11.0 || proj > 27.5 || perp > 9.0) continue;
      const half = this.rampHalfCore(proj);
      const lateral = 1.0 - this.smooth01((perp + wob - (half - 0.6)) / 1.7);
      const top = this.smooth01((proj - 13.2) / 3.4);
      const bottom = 1.0 - this.smooth01((proj - 21.4) / 3.4);
      road = Math.max(road, lateral * top * bottom);

      // Side-wall shading: a dark band just outside the road edge, strongest mid-ramp where the walls are tallest
      const window = this.smooth01((proj - 14.0) / 2.5) * (1.0 - this.smooth01((proj - 22.5) / 2.5));
      const wallBand = this.smooth01((perp + wob - (half - 0.2)) / 1.4) * (1.0 - this.smooth01((perp + wob - (half + 2.4)) / 2.4));
      const along = this.smooth01((proj - 15.5) / 6.8); // 0 at the plateau lip, 1 at the valley floor
      // Gentle gradient: lip is lit, the lower end sits in the plateau's shadow
      const slopeShade = 1.0 - 0.30 * along * (0.35 + 0.65 * lateral);
      const sideShade = 1.0 - 0.45 * wallBand * window;
      ao = Math.min(ao, slopeShade * sideShade);
    }
    return { road, ao };
  }

  /** 0..1 stratified-cliff weight with the carved ramp cut out of it (smooth; encoded into the mask B channel). */
  public static getCliffWeight(wx: number, wz: number): number {
    if (this.R) return this.R.cliffWeight(wx, wz);
    const rockNoise = this.noise.noise(wx * 0.18, wz * 0.18) * 0.35;
    let w = 0.0;
    const rings = LAYOUT.plateaus.map(p => Math.hypot(wx - p.x, wz - p.y) + rockNoise);
    for (const d of rings) {
      if (d >= 17.4 && d <= 21.6) {
        const rim = 1.0 - Math.abs(d - 19.5) / 2.1;
        w = Math.max(w, this.smooth01(rim * 1.8));
      }
    }
    for (const m of LAYOUT.mesas) {
      const d = Math.hypot(wx - m.x, wz - m.y) + rockNoise;
      if (d <= 5.8) w = Math.max(w, this.smooth01((5.8 - d) / 1.2));
    }
    if (w > 0) w *= 1.0 - this.getRampSurface(wx, wz).road;
    return w;
  }

  public static isRamp(x: number, z: number): boolean {
    return this.getRampInfo(x, z).onRamp;
  }

  // Returns true if (x, z) is on an impassable steep cliff wall (base plateau rim or central choke mesas)
  public static isCliffWall(x: number, z: number): boolean {
    if (this.R) return this.R.isWall(x, z);
    const ramp = this.getRampInfo(x, z);
    if (ramp.onRamp) return false;

    const rockNoise = this.noise.noise(x * 0.18, z * 0.18) * 0.35;
    for (const p of LAYOUT.plateaus) {
      const d = Math.hypot(x - p.x, z - p.y) + rockNoise;
      if (d > 17.8 && d < 21.3) return true;
    }
    // Central tactical choke mesas
    for (const m of LAYOUT.mesas) {
      if (Math.hypot(x - m.x, z - m.y) + rockNoise < 5.6) return true;
    }

    return false;
  }

  // Material mask encoded in B channel of tBiomeMask:
  // 0.0 = standard sand/grass, 0.45 = tactical metallic/stone ramp, 0.85..1.0 = stratified basalt cliff wall
  public static getCliffAndRampMask(wx: number, wz: number): number {
    if (this.R) { if (this.R.roadWeight(wx, wz) > 0.5) return 0.45; return this.R.cliffWeight(wx, wz) > 0.5 ? 0.85 : 0.0; }
    const ramp = this.getRampInfo(wx, wz);
    const rockNoise = this.noise.noise(wx * 0.18, wz * 0.18) * 0.35;

    // Check if inside carved tactical ramp corridor
    if (ramp.wallBlend < 0.95) {
      const rampLengthFade = Math.sin(ramp.t * Math.PI);
      const roadwayWeight = (1.0 - ramp.wallBlend) * Math.min(1.0, rampLengthFade * 1.6);
      if (roadwayWeight > 0.15) {
        return 0.35 + roadwayWeight * 0.22; // 0.35..0.57 = Tactical Ramp
      }
    }

    // Check steep base plateau cliff walls
    for (const p of LAYOUT.plateaus) {
      const d = Math.hypot(wx - p.x, wz - p.y) + rockNoise;
      if (d >= 17.4 && d <= 21.6) {
        const rimFactor = 1.0 - Math.abs(d - 19.5) / 2.1;
        return 0.72 + Math.max(0.0, rimFactor) * 0.28;
      }
    }

    // Central tactical choke mesas
    for (const m of LAYOUT.mesas) {
      const d = Math.hypot(wx - m.x, wz - m.y) + rockNoise;
      if (d <= 5.8) return 0.75 + Math.min(0.25, (5.8 - d) * 0.12);
    }

    return 0.0;
  }

  // Continuous, deterministic 3D terrain elevation function (Bilinearly sampled from static 241x241 LUT)
  public static getTerrainHeight(x: number, z: number): number {
    if (this.R) return this.R.heightAt(x, z);
    if (!this.heightCache) {
      const res = this.CACHE_RES;
      const cache = new Float32Array(res * res);
      for (let gz = 0; gz < res; gz++) {
        const wz = gz * 0.5;
        const row = gz * res;
        for (let gx = 0; gx < res; gx++) {
          cache[row + gx] = this.computeRawTerrainHeight(gx * 0.5, wz);
        }
      }
      this.heightCache = cache;
    }

    if (x <= 3.5 || x >= LAYOUT.size - 3.5 || z <= 3.5 || z >= LAYOUT.size - 3.5) {
      return 0.0;
    }

    const fx = x * 2.0;
    const fz = z * 2.0;
    const ix = fx | 0;
    const iz = fz | 0;
    const tx = fx - ix;
    const tz = fz - iz;

    const res = this.CACHE_RES;
    const idx = iz * res + ix;
    const h00 = this.heightCache[idx]!;
    const h10 = this.heightCache[idx + 1]!;
    const h01 = this.heightCache[idx + res]!;
    const h11 = this.heightCache[idx + res + 1]!;

    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }

  // Raw procedural 3D terrain elevation function (evaluated once at startup to populate heightCache)
  private static computeRawTerrainHeight(x: number, z: number): number {
    const margin = 3.5;
    const mapSize = LAYOUT.size;
    if (x <= margin || x >= mapSize - margin || z <= margin || z >= mapSize - margin) {
      return 0.0;
    }
    const borderWeight = Math.min(
      1.0,
      Math.min((x - margin) / 4.0, (mapSize - margin - x) / 4.0),
      Math.min((z - margin) / 4.0, (mapSize - margin - z) / 4.0)
    );

    const rockNoise = this.noise.noise(x * 0.18, z * 0.18) * 0.35;

    // 1. High-Ground Base Plateaus & Carved Tactical Ramps
    const ramp = this.getRampInfo(x, z);
    for (const p of LAYOUT.plateaus) {
      const distRaw = Math.hypot(x - p.x, z - p.y);
      if (distRaw >= 23.5) continue;
      const dist = distRaw + rockNoise;
      const highGroundH = p.h ?? this.HIGH_GROUND_HEIGHT; // per-plateau elevation tier
      if (dist <= 18.0 && ramp.wallBlend > 0.8) {
        return highGroundH * borderWeight;
      }
      // Steep cliff drop from 18.0 to 20.8
      let cliffH = 0.0;
      if (dist <= 18.0) {
        cliffH = highGroundH;
      } else if (dist < 20.8) {
        const tc = (dist - 18.0) / 2.8;
        const sc = tc * tc * (3.0 - 2.0 * tc);
        cliffH = highGroundH * (1.0 - sc);
      }
      if (ramp.wallBlend < 1.0) {
        const sr = ramp.t * ramp.t * (3.0 - 2.0 * ramp.t);
        const rampH = highGroundH * (1.0 - sr);
        // station map: the 3D metal ramp is flat across its whole walkable width (wallBlend < 0.65), then the side drops away
        const wb = this.FLAT_RAMPS ? Math.max(0, (ramp.wallBlend - 0.65) / 0.35) : ramp.wallBlend;
        const wbE = wb * wb * (3.0 - 2.0 * wb);
        return (rampH * (1.0 - wbE) + cliffH * wbE) * borderWeight;
      }
      if (dist < 21.5) {
        return cliffH * borderWeight;
      }
    }

    // 2. Central Tactical Choke Mesas
    for (const m of LAYOUT.mesas) {
      const distMesa = Math.hypot(x - m.x, z - m.y) + rockNoise;
      if (distMesa < 5.6) {
        if (distMesa <= 3.4) return 2.85;
        const tm = (distMesa - 3.4) / 2.2;
        const sm = tm * tm * (3.0 - 2.0 * tm);
        return 2.85 * (1.0 - sm);
      }
    }

    // 3. Keep ramp aprons, natural center expansion (60, 60), and main trail flat at valley level
    const trailDist = this.getTrailDistance(x, z);

    let baseMask = 1.0;
    for (const p of LAYOUT.plateaus) {
      const d = Math.hypot(x - p.x, z - p.y);
      if (d < 25.5) baseMask = Math.min(baseMask, Math.max(0.0, (d - 21.5) / 4.0));
    }
    for (const c of LAYOUT.clearings) {
      const d = Math.hypot(x - c.x, z - c.y);
      if (d < 13.0) baseMask = Math.min(baseMask, Math.max(0.0, (d - 8.0) / 5.0));
    }
    if (trailDist < 7.5) {
      baseMask = Math.min(baseMask, Math.max(0.0, (trailDist - 3.5) / 4.0));
    }

    if (baseMask <= 0.0 || borderWeight <= 0.0) {
      return 0.0;
    }

    // Broad multi-octave curvy hill noise
    const n1 = this.noise.noise(x * 0.032, z * 0.032);
    const n2 = this.noise.noise(x * 0.068 + 15.5, z * 0.068 + 8.2) * 0.35;
    const n3 = this.noise.noise(x * 0.12 - 5.0, z * 0.12 + 12.0) * 0.12;

    const rawH = n1 * 0.72 + n2 + n3;

    // Smoothly transition from valley floor (0.0) into rolling hills up to ~2.85 units high
    if (rawH <= -0.32) {
      return 0.0;
    }

    const normalizedH = (rawH + 0.32) / 1.15;
    const hillHeight = Math.pow(Math.min(1.0, normalizedH), 1.45) * 2.85;

    return Math.max(0.0, hillHeight * baseMask * borderWeight);
  }

  // Continuous, smooth 0..1 elevation & slope light/shadow factor for rolling hills:
  // 0.0 = deep valley / shaded trough (darker lush emerald shade)
  // 1.0 = hilltop crest / sunlit slope (brightest normal grass color)
  public static getHillShadeFactor(wx: number, wz: number): number {
    const h = Math.max(0, this.getTerrainHeight(wx, wz)); // pits / liquid sit below 0

    // Sample surface slope normal via central differences for directional sun/shadow relief
    const eps = 0.6;
    const hR = this.getTerrainHeight(wx + eps, wz);
    const hL = this.getTerrainHeight(wx - eps, wz);
    const hD = this.getTerrainHeight(wx, wz + eps);
    const hU = this.getTerrainHeight(wx, wz - eps);

    const dh_dx = (hR - hL) / (2.0 * eps);
    const dh_dz = (hD - hU) / (2.0 * eps);

    // Directional sunlight comes from (+40, +70, +30), so slopes facing (+X, +Z) are sunlit (dh_dx < 0, dh_dz < 0)
    // and slopes facing away (-X, -Z) cast soft topographic self-shading
    const slopeRelief = (-dh_dx * 0.62 - dh_dz * 0.48) * 0.45;

    // Continuous underlying hill wave so even broad valley floors have smooth depth variation
    const n1 = this.noise.noise(wx * 0.032, wz * 0.032);
    const n2 = this.noise.noise(wx * 0.068 + 15.5, wz * 0.068 + 8.2) * 0.35;
    const waveNormalized = Math.max(0.0, Math.min(1.0, (n1 * 0.72 + n2 + 0.55) / 1.25));

    // Normalized physical height (0 at valley floor, 1.0 on hilltops)
    const heightNormalized = Math.min(1.0, Math.pow(h / 2.15, 0.75));

    const combined = heightNormalized * 0.68 + waveNormalized * 0.24 + slopeRelief;
    return Math.max(0.0, Math.min(1.0, combined));
  }

  // Deterministic world-space biome weight: 0.0 = pure light beige sand, 1.0 = pure lush vibrant grass
  /** Optional extra no-grass test, set by the renderer before the blades are scattered. */
  public static noGrassAt: ((x: number, z: number) => boolean) | null = null;

  public static getGrassBiomeWeight(wx: number, wz: number): number {
    if (this.R) return Math.max(0, Math.min(1, this.R.biomeWeight(wx, wz) + this.noise.fbm(wx * 0.11, wz * 0.11, 2, 0.5) * 0.12));
    // Organic shoreline noise for natural transitions between sand clearings/trails and lush grass
    const edgeNoise = this.noise.fbm(wx * 0.09, wz * 0.09, 2, 0.5) * 2.2;

    let grassWeight = 1.0;

    // 1. Base clearings (sand) on every plateau
    for (const p of LAYOUT.plateaus) {
      const d = Math.hypot(wx - p.x, wz - p.y) + edgeNoise;
      if (d < 17.0) grassWeight = Math.min(grassWeight, Math.max(0.0, (d - 10.5) / 6.5));
    }

    // 2. Expansion clearings
    for (const c of LAYOUT.clearings) {
      const d = Math.hypot(wx - c.x, wz - c.y) + edgeNoise * 0.7;
      if (d < 8.5) grassWeight = Math.min(grassWeight, Math.max(0.0, (d - 4.5) / 4.0));
    }

    // 3. Natural winding sandy trail connecting the bases
    const trailDist = this.getTrailDistance(wx, wz) + edgeNoise * 0.45;
    if (trailDist < 3.6) {
      grassWeight = Math.min(grassWeight, Math.max(0.0, (trailDist - 1.4) / 2.2));
    }

    return Math.min(1.0, Math.max(0.0, grassWeight));
  }

  // Generate world-space Biome Mask Texture (Macro terrain distribution between Grass and Sand)
  // Base clearings & trails are very light beige sand; the rest of the battlefield & 3D hills are lush vibrant grass
  public static generateBiomeMaskTexture(size = 512, mapSize = 120): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / size) * mapSize;
        const wz = (y / size) * mapSize;

        const grassWeight = this.getGrassBiomeWeight(wx, wz);
        const hillShade = this.getHillShadeFactor(wx, wz);
        const cliffRamp = this.getCliffWeight(wx, wz);

        // R: 0..255 (0 = sand, 255 = grass)
        // G: 0..255 (0 = deep valley in rolling hills, 255 = brightest hilltop)
        // B: 0..255 (0 = standard biome, 90..150 = tactical ramp roadway, 180..255 = stratified basalt cliff wall)
        const byteBiome = Math.floor(grassWeight * 255);
        const byteHillShade = Math.floor(hillShade * 255);
        const byteCliffRamp = Math.floor(cliffRamp * 255);

        const idx = (y * size + x) * 4;
        data[idx] = byteBiome;
        data[idx + 1] = byteHillShade;
        data[idx + 2] = byteCliffRamp;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  // Ramp surface texture: R = smooth stone-road weight, G = elevation shading (1 = unshaded). Alpha stays opaque.
  public static generateRampMaskTexture(size = 512, mapSize = 120): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = this.getRampSurface((x / size) * mapSize, (y / size) * mapSize);
        const i = (y * size + x) * 4;
        d[i] = Math.floor(r.road * 255);
        d[i + 1] = Math.floor(r.ao * 255);
        d[i + 2] = 0;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // Create terrain plane geometry with 3D sloping curvy soft hills
  public static createTerrainGeometry(mapSize: number, segments = 120): THREE.PlaneGeometry {
    const geo = new THREE.PlaneGeometry(mapSize, mapSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const vertexCount = posAttr.count;

    for (let i = 0; i < vertexCount; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const wx = vx + mapSize / 2;
      const wz = vz + mapSize / 2;

      const y = this.getTerrainHeight(wx, wz);
      posAttr.setY(i, y);
    }

    geo.computeVertexNormals();
    return geo;
  }

  // Generate 3D instanced grass tufts swaying naturally in the wind (1 single draw call)
  public static createInstancedGrass(
    mapSize: number,
    count = 2400,
    fogUniform?: { value: THREE.Texture | null },
    colors?: { low: number; high: number }
  ): { mesh: THREE.InstancedMesh; update: (dt: number) => void } {
    const tuftGeo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const bladeColors: number[] = [];

    const numBlades = 3;
    let vOffset = 0;

    for (let b = 0; b < numBlades; b++) {
      const angle = (b * Math.PI) / numBlades;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const halfW = 0.18;
      const height = 0.48;

      positions.push(
        -cosA * halfW, 0, -sinA * halfW,
        cosA * halfW, 0, sinA * halfW,
        cosA * halfW * 0.6, height, sinA * halfW * 0.6,
        -cosA * halfW * 0.6, height, -sinA * halfW * 0.6
      );

      uvs.push(
        0, 0,
        1, 0,
        1, 1,
        0, 1
      );

      // Root to tip color gradient (rich green root to luminous vibrant lime-green tip)
      const cLo = colors ? new THREE.Color(colors.low) : new THREE.Color(0.22, 0.52, 0.18);
      const cHi = colors ? new THREE.Color(colors.high) : new THREE.Color(0.72, 0.98, 0.32);
      bladeColors.push(
        cLo.r, cLo.g, cLo.b, // bottom left
        cLo.r, cLo.g, cLo.b, // bottom right
        cHi.r, cHi.g, cHi.b, // top right (tip)
        cHi.r, cHi.g, cHi.b  // top left (tip)
      );

      indices.push(
        vOffset, vOffset + 1, vOffset + 2,
        vOffset, vOffset + 2, vOffset + 3
      );

      vOffset += 4;
    }

    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(bladeColors, 3));
    tuftGeo.setIndex(indices);
    tuftGeo.computeVertexNormals();

    // Procedural blade alpha cutout
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 64;
    alphaCanvas.height = 128;
    const actx = alphaCanvas.getContext('2d')!;
    actx.fillStyle = '#000000';
    actx.fillRect(0, 0, 64, 128);

    actx.fillStyle = '#ffffff';
    actx.beginPath();
    actx.moveTo(8, 128);
    actx.lineTo(56, 128);
    actx.quadraticCurveTo(50, 40, 32, 2);
    actx.quadraticCurveTo(14, 40, 8, 128);
    actx.fill();

    const alphaTex = new THREE.CanvasTexture(alphaCanvas);

    const grassMat = new THREE.MeshStandardMaterial({
      alphaMap: alphaTex,
      transparent: false,
      alphaTest: 0.35,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.05
    });

    const windUniforms = {
      uTime: { value: 0 },
      tFogMap: fogUniform || { value: null }
    };

    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.tFogMap = windUniforms.tFogMap;
      shader.vertexShader = `
        uniform float uTime;
        uniform sampler2D tFogMap;
        varying vec3 vGrassFogTint;
        ${shader.vertexShader}
      `;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vec4 worldInstPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Cull distant sub-pixel grass tufts (> 68 units from camera) in vertex shader to eliminate horizon overdraw
        vec2 camDxDz = worldInstPos.xz - cameraPosition.xz;
        float camDistSq = dot(camDxDz, camDxDz);
        if (camDistSq > 4624.0) {
          transformed *= 0.0;
          vGrassFogTint = vec3(1.0);
        } else {
          // Sway tip in wind using UV.y anchor
          float swayIntensity = uv.y * 0.16;
          float phase = worldInstPos.x * 0.35 + worldInstPos.z * 0.45;
          float windSway = sin(uTime * 2.5 + phase) * swayIntensity + cos(uTime * 1.8 + phase * 0.7) * (swayIntensity * 0.4);
          transformed.x += windSway;
          transformed.z += windSway * 0.6;

          // Compute SC2 Fog of War tint once per vertex instead of per pixel
          vec2 grassFogUv = vec2(worldInstPos.x / ${LAYOUT.size.toFixed(1)}, 1.0 - (worldInstPos.z / ${LAYOUT.size.toFixed(1)}));
          float fogB = texture2D(tFogMap, grassFogUv).r;
          vec3 sc2Shroud = vec3(0.04, 0.06, 0.10);
          vec3 sc2Explored = vec3(0.38, 0.44, 0.56);
          vec3 sc2Visible = vec3(1.0, 1.0, 1.0);
          vGrassFogTint = fogB < 0.42
            ? mix(sc2Shroud, sc2Explored, smoothstep(0.0, 0.42, fogB))
            : mix(sc2Explored, sc2Visible, smoothstep(0.42, 1.0, fogB));
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGrassFogTint;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vGrassFogTint;
        `
      );
    };

    const instMesh = new THREE.InstancedMesh(tuftGeo, grassMat, count);
    instMesh.castShadow = false; // Grass blades receive shadows without thrashing the 2048px shadow map
    instMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const borderMargin = 4;
    const playableSize = mapSize - borderMargin * 2;
    const up = new THREE.Vector3(0, 1, 0);

    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 6;

    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const px = borderMargin + Math.random() * playableSize;
      const pz = borderMargin + Math.random() * playableSize;

      // Only spawn 3D grass blades where the biome is lush grass and not on cliff faces or tactical ramps
      const grassBiome = this.getGrassBiomeWeight(px, pz);
      if (grassBiome < 0.55 || this.getCliffAndRampMask(px, pz) > 0.15) {
        continue;
      }

      const py = this.getTerrainHeight(px, pz);
      if (py < -0.02) continue; // no grass inside liquid pits
      if (this.noGrassAt?.(px, pz)) continue; // e.g. asphalt roads and their dirt shoulders

      // Slight extra density on elevated 3D hills while keeping lush grass plains well-populated
      if (py < 0.10 && Math.random() > 0.65) {
        continue;
      }

      // Compute exact hill surface slope normal using central differences
      const eps = 0.35;
      const hR = this.getTerrainHeight(px + eps, pz);
      const hL = this.getTerrainHeight(px - eps, pz);
      const hD = this.getTerrainHeight(px, pz + eps);
      const hU = this.getTerrainHeight(px, pz - eps);

      const dh_dx = (hR - hL) / (2 * eps);
      const dh_dz = (hD - hU) / (2 * eps);

      // Exact surface normal vector perpendicular to the 3D terrain
      const surfaceNormal = new THREE.Vector3(-dh_dx, 1.0, -dh_dz).normalize();

      // Align tuft Up vector to the slope normal using quaternion (avoids Euler gimbal error)
      dummy.quaternion.setFromUnitVectors(up, surfaceNormal);

      // Random yaw spin around the slope normal
      const yawAngle = Math.random() * Math.PI * 2;
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(surfaceNormal, yawAngle);
      dummy.quaternion.premultiply(yawQuat);

      // Plant tuft root flush into the ground surface (-0.02) to guarantee zero floating blades
      dummy.position.set(px, py - 0.02, pz);

      const scale = 0.85 + Math.random() * 0.45;
      dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.3), scale);
      dummy.updateMatrix();

      instMesh.setMatrixAt(placed, dummy.matrix);

      // Tint 3D grass blades smoothly by rolling-hill elevation:
      // Valleys are noticeably darker deep-emerald green, hilltops are brightest normal grass color
      const hillShade = this.getHillShadeFactor(px, pz);
      const smoothShade = hillShade * hillShade * (3.0 - 2.0 * hillShade);
      const rShade = 0.42 + smoothShade * 0.62;
      const gShade = 0.52 + smoothShade * 0.52;
      const bShade = 0.38 + smoothShade * 0.62;
      instMesh.setColorAt(placed, new THREE.Color(rShade, gShade, bShade));

      placed++;
    }

    // In case attempts finished early, scale unused instances to zero
    if (placed < count) {
      const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
      const defaultCol = new THREE.Color(1, 1, 1);
      for (let i = placed; i < count; i++) {
        instMesh.setMatrixAt(i, zeroMat);
        instMesh.setColorAt(i, defaultCol);
      }
    }

    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) {
      instMesh.instanceColor.needsUpdate = true;
    }

    let timeAcc = 0;
    const update = (dt: number) => {
      timeAcc += dt;
      windUniforms.uTime.value = timeAcc;
    };

    return { mesh: instMesh, update };
  }
}
