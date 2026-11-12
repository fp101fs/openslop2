import * as THREE from 'three';
import { ProceduralGrassSystem } from './ProceduralGrass';
import { UNIT_CONFIGS } from '../config';

/** Weapon ranges below this are melee, which SC2 draws no range circle for (matches Unit.ts MELEE_RANGE_MAX). */
const MELEE_RANGE_MAX = 3;
const SEGMENTS = 128;
const HALF_WIDTH = 0.07;   // ribbon half width = half the triangle height
const LIFT = 0.09;
const SPACING = 3.2;       // world units between triangles (adjusted per ring so the pattern closes evenly)
const TRI_BASE = 0.2;      // triangle base length along the ring
const ALPHA = 0.5;
const MAX_RINGS = 40;      // above this many armed selections, draw nothing

interface RingSpec { x: number; y: number; r: number }

interface RingMesh {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  len: THREE.BufferAttribute;
  vis: THREE.BufferAttribute;
}

/**
 * Range outlines on the terrain for selected units / structures: small, sparse outward-pointing triangles.
 * One ring per entity (its widest weapon). With several units selected only the outer envelope of their combined
 * reach is drawn: any part of a ring that lies inside another selected unit's circle is hidden, so a group reads
 * as one clean outline instead of a pile of overlapping circles.
 * Ring vertices are re-sampled against the terrain height so they hug hills and ramps.
 */
export class RangeRings {
  private pool: RingMesh[] = [];
  private used = 0;
  private key = '';
  private group = new THREE.Group();
  private static mat: THREE.ShaderMaterial | null = null;

  constructor(private scene: THREE.Scene) {
    this.group.name = 'range-rings';
    scene.add(this.group);
  }

  private static material(): THREE.ShaderMaterial {
    if (!RangeRings.mat) {
      RangeRings.mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        uniforms: { uPeriod: { value: SPACING }, uBase: { value: TRI_BASE }, uAlpha: { value: ALPHA } },
        vertexShader: /* glsl */ `
          attribute float aLen;
          attribute float aAcross;
          attribute float aVis;
          varying float vLen; varying float vAcross; varying float vVis;
          void main() {
            vLen = aLen; vAcross = aAcross; vVis = aVis;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uPeriod; uniform float uBase; uniform float uAlpha;
          varying float vLen; varying float vAcross; varying float vVis;
          void main() {
            if (vVis < 0.5) discard;
            float s = fract(vLen / uPeriod) * uPeriod;
            if (s > uBase) discard;
            float along = abs(s / uBase * 2.0 - 1.0); // 0 at triangle centre, 1 at base corners
            float t = vAcross * 0.5 + 0.5;            // 0 inner edge (base), 1 outer edge (apex)
            float edge = (1.0 - t) - along;
            float a = smoothstep(0.0, fwidth(edge) * 1.5, edge);
            if (a <= 0.0) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, uAlpha * a);
          }`,
      });
    }
    return RangeRings.mat;
  }

  private make(): RingMesh {
    const g = new THREE.BufferGeometry();
    const n = (SEGMENTS + 1) * 2;
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const len = new THREE.BufferAttribute(new Float32Array(n), 1);
    len.setUsage(THREE.DynamicDrawUsage);
    const vis = new THREE.BufferAttribute(new Float32Array(n), 1);
    vis.setUsage(THREE.DynamicDrawUsage);
    const across = new Float32Array(n);
    for (let i = 0; i < n; i++) across[i] = i % 2 === 0 ? -1 : 1;
    g.setAttribute('position', pos);
    g.setAttribute('aLen', len);
    g.setAttribute('aVis', vis);
    g.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, RangeRings.material());
    mesh.frustumCulled = false; // positions are rewritten in world space
    mesh.renderOrder = 3;
    mesh.userData.noOutline = true;
    mesh.raycast = () => {};
    this.group.add(mesh);
    return { mesh, pos, len, vis };
  }

  /** Build one ring, hiding the parts that fall inside any of the other rings. */
  private place(ring: RingMesh, s: RingSpec, all: RingSpec[]) {
    ring.mesh.visible = true;
    const arr = ring.pos.array as Float32Array;
    const lenArr = ring.len.array as Float32Array;
    const visArr = ring.vis.array as Float32Array;
    const count = Math.max(6, Math.round((Math.PI * 2 * s.r) / SPACING));
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const px = s.x + c * s.r, pz = s.y + sn * s.r;
      let visible = 1;
      for (const o of all) {
        if (o === s) continue;
        const dx = px - o.x, dz = pz - o.y;
        if (dx * dx + dz * dz < (o.r - 0.05) * (o.r - 0.05)) { visible = 0; break; }
      }
      const l = (i / SEGMENTS) * count * SPACING;
      for (let side = 0; side < 2; side++) {
        const rr = s.r + (side === 0 ? -HALF_WIDTH : HALF_WIDTH);
        const wx = s.x + c * rr, wz = s.y + sn * rr;
        const v = i * 2 + side, o = v * 3;
        arr[o] = wx;
        arr[o + 1] = Math.max(0, ProceduralGrassSystem.getTerrainHeight(wx, wz)) + LIFT;
        arr[o + 2] = wz;
        lenArr[v] = l;
        visArr[v] = visible;
      }
    }
    ring.pos.needsUpdate = true;
    ring.len.needsUpdate = true;
    ring.vis.needsUpdate = true;
  }

  /** The widest-range ring (centre + radius in world units) for one selected entity; null for melee, unarmed and garrisoned units. */
  static specFor(e: any): RingSpec | null {
    if (!e || e.isDead || e.loadedIn) return null;
    let best = 0;
    const consider = (range: number, extra = 0) => { if (range >= MELEE_RANGE_MAX) best = Math.max(best, range + extra); };
    if ('isConstructed' in e && e.type === 'bunker') {
      // Bunker: the garrison's reach (their range + bunker bonus, which already includes the half footprint)
      for (const u of e.cargo) consider(u.attackRange + u.rangeBonus);
    } else if ('isConstructed' in e) {
      if (e.damage > 0 && e.attackRange > 0 && e.isConstructed) consider(e.attackRange, e.radius);
    } else if ('canTargetGround' in e) {
      const c = UNIT_CONFIGS[e.type as keyof typeof UNIT_CONFIGS];
      if (!c) return null;
      const reach = (k: any) => (k && (k.damage > 0 || k.airWeapon?.damage > 0)) ? Math.max(k.damage > 0 ? k.attackRange : 0, k.airWeapon?.damage > 0 ? k.airWeapon.attackRange : 0) : 0;
      // The unit's own attackRange tracks its current mode and range upgrades (e.g. Seismic Spines)
      let range = reach(c) > 0 ? (e.attackRange ?? reach(c)) : 0;
      // Mid mode switch (Siege Mode, Thor / Viking modes): show the mode it is switching into
      const to = e.isTransforming ? UNIT_CONFIGS[e.transformToType as keyof typeof UNIT_CONFIGS] : null;
      if (to) range = reach(to) > 0 ? Math.max(0, range + reach(to) - reach(c)) || reach(to) : 0;
      consider(range, (e.rangeBonus ?? 0) + (e.radius ?? 0));
    }
    return best > 0 ? { x: e.pos.x, y: e.pos.y, r: best } : null;
  }

  update(selected: any[]) {
    const specs: RingSpec[] = [];
    const seen = new Set<string>();
    let key = '';
    for (const e of selected) {
      const s = RangeRings.specFor(e);
      if (!s) continue;
      const k = `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.r.toFixed(2)}`;
      if (seen.has(k)) continue; // stacked units with identical circles
      seen.add(k);
      specs.push(s);
      key += k + ';';
    }
    if (specs.length > MAX_RINGS) { specs.length = 0; key = ''; }
    if (key !== this.key) {
      this.key = key;
      for (let i = 0; i < specs.length; i++) {
        if (i === this.pool.length) this.pool.push(this.make());
        this.place(this.pool[i]!, specs[i]!, specs);
      }
    }
    for (let i = specs.length; i < this.used; i++) this.pool[i]!.mesh.visible = false;
    this.used = specs.length;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const r of this.pool) r.mesh.geometry.dispose();
    this.pool = [];
  }
}
