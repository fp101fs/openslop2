import * as THREE from 'three';

/**
 * Procedural PBR detail set for hard-surface Terran buildings: panel seams, rivets, brushed grain, scratches and grime.
 * One tileable 512px set (albedo variation, normal, roughness, metalness) generated once on a canvas, shared by every
 * model that opts in (`detail: true` in RiggedModels.DEFS). Needs UVs; the model build tools box-project them from world position.
 */
let set: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture; metalnessMap: THREE.Texture } | null = null;

function rng(seed: number) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5 >>> 0) / 4294967296); }

export function getDetailTextures() {
  if (set) return set;
  const N = 512, r = rng(1337);
  const H = new Float32Array(N * N), A = new Float32Array(N * N), R = new Float32Array(N * N), M = new Float32Array(N * N);
  const at = (x: number, y: number) => ((y + N) % N) * N + ((x + N) % N);
  // brushed grain: horizontal streaks (wraps)
  for (let y = 0; y < N; y++) { const row = r() * 0.5; for (let x = 0; x < N; x++) { const i = at(x, y); const g = row + r() * 0.5; H[i] = 0.5 + (g - 0.5) * 0.05; A[i] = 0.86 + (g - 0.5) * 0.14; R[i] = 0.55 + g * 0.2; M[i] = 0.75 + g * 0.2; } }
  // panel seams every 256 px (major) and 128 px (minor), 3 px grooves with a lit lip
  const groove = (i: number, d: number, w: number, depth: number) => { const t = Math.max(0, 1 - Math.abs(d) / w); H[i] -= depth * t; A[i] *= 1 - 0.35 * t; R[i] = Math.min(1, R[i] + 0.25 * t); M[i] *= 1 - 0.3 * t; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = at(x, y);
    groove(i, ((x + 2) % 256) - 2, 2.2, 0.55); groove(i, ((y + 2) % 256) - 2, 2.2, 0.55);
    groove(i, ((x + 66) % 128) - 66 + 64, 1.4, 0.22); groove(i, ((y + 66) % 128) - 66 + 64, 1.4, 0.22);
  }
  // rivets: 4 per panel corner area, domed bumps
  const bump = (cx: number, cy: number, rad: number, hgt: number) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d = Math.hypot(dx, dy); if (d > rad) continue; const i = at(cx + dx, cy + dy); const t = Math.sqrt(1 - (d / rad) ** 2); H[i] += hgt * t; R[i] = Math.max(0.25, R[i] - 0.2 * t); A[i] *= 1 + 0.12 * t; } };
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) for (const [ox, oy] of [[14, 14], [114, 14], [14, 114], [114, 114]]) bump(px * 256 + 6 + ox, py * 256 + 6 + oy, 3, 0.35);
  // scratches
  for (let k = 0; k < 90; k++) {
    let x = r() * N, y = r() * N; const a = r() * Math.PI, len = 20 + r() * 90, dx = Math.cos(a), dy = Math.sin(a);
    for (let s = 0; s < len; s++) { const i = at(Math.floor(x), Math.floor(y)); H[i] -= 0.1; R[i] = Math.max(0.2, R[i] - 0.3); M[i] = Math.min(1, M[i] + 0.2); A[i] = Math.min(1.1, A[i] * 1.12); x += dx; y += dy; }
  }
  // grime blotches: soft darker, rougher patches
  for (let k = 0; k < 40; k++) { const cx = r() * N, cy = r() * N, rad = 18 + r() * 40, a = 0.1 + r() * 0.18; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d = Math.hypot(dx, dy) / rad; if (d > 1) continue; const t = (1 - d) ** 2 * a, i = at(Math.floor(cx + dx), Math.floor(cy + dy)); A[i] *= 1 - t * 1.4; R[i] = Math.min(1, R[i] + t * 1.3); M[i] *= 1 - t; } }

  const mk = (fn: (i: number) => [number, number, number], srgb: boolean) => {
    const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d')!, img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const [rr, gg, bb] = fn(i); img.data[i * 4] = rr; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = bb; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  };
  const g = (v: number): [number, number, number] => { const b = Math.max(0, Math.min(255, v * 255)); return [b, b, b]; };
  set = {
    map: mk(i => g(Math.min(1, A[i]!)), true),
    roughnessMap: mk(i => g(R[i]!), false),
    metalnessMap: mk(i => g(M[i]!), false),
    normalMap: mk(i => {
      const x = i % N, y = (i / N) | 0, s = 3.2;
      const dx = (H[at(x + 1, y)]! - H[at(x - 1, y)]!) * s, dy = (H[at(x, y + 1)]! - H[at(x, y - 1)]!) * s;
      const l = Math.hypot(dx, dy, 1);
      return [(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
    }, false)
  };
  return set;
}

/** Apply the detail set to a vertex-coloured material (keeps its colours, adds panel relief and PBR variation). */
export function applyDetail(mat: THREE.MeshStandardMaterial, metal = 0.22, rough = 0.95, tint = 1.55) {
  const t = getDetailTextures();
  mat.map = t.map; mat.normalMap = t.normalMap; mat.roughnessMap = t.roughnessMap; mat.metalnessMap = t.metalnessMap;
  mat.normalScale.set(1.1, 1.1); mat.metalness = metal; mat.roughness = rough; mat.vertexColors = true; mat.color.setScalar(tint); mat.needsUpdate = true;
}
