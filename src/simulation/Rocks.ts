import * as THREE from 'three';
import { Entity } from './Entity';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Destructible rock formation (SC2 style): blocks a path until enough units destroy it.
 * Not a unit or a building - it is only ever attacked on explicit order (right-click it).
 */
export class DestructibleRock extends Entity {
  public readonly size: number;
  constructor(id: string, x: number, y: number, size: number = 3) {
    super(id, 'rocks', 'enemy', { x, y }, 1500, 1, 0);
    this.size = size;
    this.radius = size * 0.6;
    this.height = ProceduralGrassSystem.getTerrainHeight(x, y);
    this.components = []; // no component damage model for rocks
  }

  public update(): void { /* inert */ }

  private static grainTex: THREE.CanvasTexture | null = null;

  /** Seamless grain + crack texture used as both colour modulation and bump map. */
  private static getGrainTex(): THREE.CanvasTexture {
    if (this.grainTex) return this.grainTex;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!, img = g.createImageData(N, N);
    const hash = (x: number, y: number, p: number) => { const v = Math.sin(((x % p) + p) % p * 127.1 + ((y % p) + p) % p * 311.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x: number, y: number, p: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      return (hash(xi, yi, p) * (1 - u) + hash(xi + 1, yi, p) * u) * (1 - w) + (hash(xi, yi + 1, p) * (1 - u) + hash(xi + 1, yi + 1, p) * u) * w;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let n = 0, amp = 0.5, f = 4, tot = 0;
      for (let o = 0; o < 5; o++) { n += vn(x / N * f, y / N * f, f) * amp; tot += amp; amp *= 0.5; f *= 2; }
      n /= tot;
      const ridge = 1 - Math.abs(vn(x / N * 6, y / N * 6, 6) * 2 - 1);           // crack network
      const crack = Math.pow(ridge, 6) * 0.45;
      const v = Math.max(0, Math.min(1, 0.35 + n * 0.75 - crack));
      const b = Math.round(v * 255), i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
    return (this.grainTex = t);
  }

  public buildMesh(): THREE.Group {
    const g = new THREE.Group();
    let seed = Math.round(this.pos.x * 31 + this.pos.y * 17);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const off = rnd() * 100;
    const h3 = (x: number, y: number, z: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
    const n3 = (x: number, y: number, z: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
               l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
    };
    const fbm = (x: number, y: number, z: number) => n3(x, y, z) * 0.55 + n3(x * 2.1, y * 2.1, z * 2.1) * 0.28 + n3(x * 4.3, y * 4.3, z * 4.3) * 0.17;

    const chunks: THREE.BufferGeometry[] = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rnd() * 0.5;
      const dist = (i === 0 ? 0 : 0.5 + rnd() * 0.6) * this.size * 0.5;
      const r = (i === 0 ? 1.0 : 0.42 + rnd() * 0.42) * this.size * 0.42;
      let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
      geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
      geo = mergeVertices(geo, 1e-4);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      const sy = 0.7 + rnd() * 0.5, ox = off + i * 17.3;
      const rot = new THREE.Euler(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5);
      const mtx = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(ang) * dist, r * 0.38, Math.sin(ang) * dist),
        new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(r, r * sy, r));
      const uv = new Float32Array(pos.count * 2);
      const p = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        p.fromBufferAttribute(pos, k);
        const dir = p.clone();
        const big = fbm(dir.x * 1.3 + ox, dir.y * 1.3 + ox, dir.z * 1.3 + ox);
        const ridged = 1 - Math.abs(n3(dir.x * 3 + ox, dir.y * 3, dir.z * 3 + ox) * 2 - 1);
        let d = 0.7 + big * 0.7 + ridged * ridged * 0.22;
        // chiselled faces: quantise the radius slightly along a few random plane normals -> angular, broken-stone look
        d -= Math.max(0, dir.dot(new THREE.Vector3(0.6, 0.5, 0.2).normalize()) - 0.55) * 0.5;
        p.multiplyScalar(d);
        if (p.y < -0.45) p.y = -0.45 + (p.y + 0.45) * 0.1; // flatten the underside into the ground
        pos.setXYZ(k, p.x, p.y, p.z);
        // colour: sandstone strata bands + dark crevices + moss on upward faces (finalised after normals)
        const band = Math.sin((p.y * 7 + big * 5) ) * 0.5 + 0.5;
        const tone = 0.075 + big * 0.1 + band * 0.04 + (ridged > 0.8 ? -0.03 : 0);
        col[k * 3] = tone * 1.04; col[k * 3 + 1] = tone * 0.97; col[k * 3 + 2] = tone * 0.84;
        uv[k * 2] = p.x * 0.9 + p.z * 0.55; uv[k * 2 + 1] = p.y * 0.9 + p.z * 0.35;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      // faceted (chiselled) look: un-index so every triangle gets its own flat normal
      geo = geo.toNonIndexed();
      geo.computeVertexNormals();
      // moss / lichen on upward-facing surfaces, darker soil stain near the base
      const pos2 = geo.getAttribute('position') as THREE.BufferAttribute;
      const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
      const col2 = (geo.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
      for (let k = 0; k < pos2.count; k++) {
        const up = Math.max(0, nrm.getY(k));
        const m = Math.max(0, up - 0.6) * 1.2 * (0.4 + n3(pos2.getX(k) * 5 + ox, pos2.getY(k) * 5, pos2.getZ(k) * 5) * 0.8);
        const base = Math.max(0, -pos2.getY(k) * 0.9);
        col2[k * 3] = col2[k * 3] * (1 - m * 0.35) * (1 - base * 0.4);
        col2[k * 3 + 1] = col2[k * 3 + 1] * (1 + m * 0.18) * (1 - base * 0.4);
        col2[k * 3 + 2] = col2[k * 3 + 2] * (1 - m * 0.45) * (1 - base * 0.4);
      }
      geo.applyMatrix4(mtx);
      chunks.push(geo);
    }
    const merged = mergeGeometries(chunks)!;
    const tex = DestructibleRock.getGrainTex();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, bumpMap: tex, bumpScale: 1.2, roughness: 0.95, metalness: 0.02 });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    this.mesh = g;
    g.position.set(this.pos.x, this.height, this.pos.y);
    return g;
  }
}
