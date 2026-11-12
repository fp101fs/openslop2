import * as THREE from 'three';
import { Vector2D, Vector3D } from '../types';
import { ProceduralGrassSystem } from './ProceduralGrass';
import { modelFactory } from './ModelFactory';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Decals {
  private scene: THREE.Scene;
  private selectionRings: Map<string, THREE.Group> = new Map();
  private healthBars: Map<string, { bg: THREE.Mesh; bar: THREE.Mesh; sh?: THREE.Mesh }> = new Map();
  /** Segmented overhead bars (shield / health / energy), one entry per entity. */
  private segBars: Map<string, { rows: THREE.Mesh[]; top: number; topAt: number; ox: number; oz: number; measured: boolean }> = new Map();
  private static segGeo = new THREE.PlaneGeometry(1, 1);
  /** Set by the app: segmented bars billboard to this camera so they are perfectly rectangular on screen. */
  public camera: THREE.Camera | null = null;
  /** Drawing-buffer size and pixel ratio (set by the app) so bars are laid out in real rendered pixels, which keeps every border line identical. */
  /** 1 when fully zoomed in (the reference bar size), shrinking in proportion as the camera zooms out. Same for every unit, so flyers match ground units. */
  public zoomScale: (() => number) | null = null;
  public viewport: (() => { w: number; h: number; pr: number }) | null = null;
  private static _up = new THREE.Vector3();
  private static segMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uRatio: { value: 1 }, uSegs: { value: 10 }, uColor: { value: new THREE.Color(0x22dd44) }, uSize: { value: new THREE.Vector2(100, 10) }, uF: { value: new THREE.Vector2(14, 8) }, uB: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv; uniform float uRatio; uniform float uSegs; uniform vec3 uColor; uniform vec2 uSize; uniform vec2 uF; uniform float uB;
      void main(){
        // Everything is laid out in screen pixels: border B | fill F | border B | fill F | ... | border B, and B above / below,
        // so every black line (bar ends, top / bottom, and the separators between mini rectangles) is exactly the same width.
        vec2 p = vUv * uSize;
        float pitchX = uF.x + uB;
        float i = floor(p.x / pitchX);
        float lx = p.x - i * pitchX;
        bool border = lx < uB || i >= uSegs || p.y < uB || p.y > uSize.y - uB;
        if (border) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        float lo = i / uSegs, hi = (i + 1.0) / uSegs;
        if (uRatio >= hi - 1e-4) gl_FragColor = vec4(uColor, 1.0);                          // full rectangle
        else if (uRatio > lo) gl_FragColor = vec4(uColor * 0.55 + 0.1, 1.0);               // the rectangle currently draining: faded
        else gl_FragColor = vec4(0.09, 0.1, 0.12, 1.0);                                      // gone
      }`
  });
  private placementGhost: THREE.Group | null = null;
  private rallyLines: Map<string, THREE.Group & { userData: { key?: string } }> = new Map();

  // Shared 4-corner tactical HUD bracket geometry & health bar resources
  private cornerGeo: THREE.BufferGeometry;
  private ringGeo: THREE.BufferGeometry;
  private ringMat: THREE.MeshStandardMaterial;
  private hbBgGeo = new THREE.PlaneGeometry(1.26, 0.17).rotateX(-Math.PI / 4);
  private hbBarGeo = new THREE.PlaneGeometry(1.16, 0.08).rotateX(-Math.PI / 4);
  private hbBgMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  private hbPlayerMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
  private hbEnemyMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });

  private greenMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  });
  private redMat = new THREE.MeshBasicMaterial({
    color: 0xff3344,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  });
  private yellowMat = new THREE.MeshBasicMaterial({
    color: 0xffdd00,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  });
  private cyanMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    opacity: 0.95
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.cornerGeo = this.createCornerBracketGeometry();
    // Selection ring: a dashed circle of short tube segments lying on the ground (unit radius, scaled per entity)
    const dashes = 8, arc = (Math.PI * 2 / dashes) * 0.42; // 8 equal dashes with a gap between each
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < dashes; i++) {
      const g = new THREE.TorusGeometry(1, 0.05, 8, 10, arc);
      g.rotateZ(i * Math.PI * 2 / dashes + (Math.PI * 2 / dashes) * 0.29);
      g.rotateX(-Math.PI / 2);
      parts.push(g);
    }
    this.ringGeo = mergeGeometries(parts)!;
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0xd9ae18, emissive: 0xb88400, emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.85, toneMapped: true });
  }

  // Construct 4 bold, sharp tactical corner brackets framing the unit/building/resource bounding perimeter
  private createCornerBracketGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const arm = 0.48; // Arm length
    const th = 0.12;  // Arm thickness
    let vOffset = 0;

    const addQuad = (x1: number, z1: number, x2: number, z2: number) => {
      positions.push(
        x1, 0, z1,
        x2, 0, z1,
        x2, 0, z2,
        x1, 0, z2
      );
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(
        vOffset, vOffset + 1, vOffset + 2,
        vOffset, vOffset + 2, vOffset + 3
      );
      vOffset += 4;
    };

    // Top-Left corner [-1, -1]
    addQuad(-1.0, -1.0, -1.0 + arm, -1.0 + th); // Horizontal arm
    addQuad(-1.0, -1.0, -1.0 + th, -1.0 + arm); // Vertical arm

    // Top-Right corner [+1, -1]
    addQuad(1.0 - arm, -1.0, 1.0, -1.0 + th);   // Horizontal arm
    addQuad(1.0 - th, -1.0, 1.0, -1.0 + arm);   // Vertical arm

    // Bottom-Left corner [-1, +1]
    addQuad(-1.0, 1.0 - th, -1.0 + arm, 1.0);   // Horizontal arm
    addQuad(-1.0, 1.0 - arm, -1.0 + th, 1.0);   // Vertical arm

    // Bottom-Right corner [+1, +1]
    addQuad(1.0 - arm, 1.0 - th, 1.0, 1.0);     // Horizontal arm
    addQuad(1.0 - th, 1.0 - arm, 1.0, 1.0);     // Vertical arm

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Update selection indicator (4 corners) for selected entity IDs
  public updateSelectionRings(
    selectedEntities: Array<{ id: string; pos: Vector3D; radius: number; isPlayer: boolean; isNeutral?: boolean; isMineral?: boolean }>
  ) {
    const activeIds = new Set<string>();

    selectedEntities.forEach(ent => {
      activeIds.add(ent.id);
      let group = this.selectionRings.get(ent.id);

      if (!group) {
        group = new THREE.Group();

        let mat = this.redMat;
        if (ent.isMineral) {
          mat = this.cyanMat;
        } else if (ent.isNeutral) {
          mat = this.yellowMat;
        } else if (ent.isPlayer) {
          mat = this.greenMat;
        }

        // Four bright, bold tactical corner brackets [   ]
        void mat;
        const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
        ring.castShadow = false; ring.receiveShadow = false;
        ring.raycast = () => {};
        group.add(ring);

        this.scene.add(group);
        this.selectionRings.set(ent.id, group);
      }

      const groundY = ProceduralGrassSystem.getTerrainHeight(ent.pos.x, ent.pos.z);
      group.position.set(ent.pos.x, groundY + 0.06, ent.pos.z);

      // Conform selection bracket orientation to 3D hill slope
      const dh_dx = (ProceduralGrassSystem.getTerrainHeight(ent.pos.x + 0.35, ent.pos.z) - 
                     ProceduralGrassSystem.getTerrainHeight(ent.pos.x - 0.35, ent.pos.z)) / 0.7;
      const dh_dz = (ProceduralGrassSystem.getTerrainHeight(ent.pos.x, ent.pos.z + 0.35) - 
                     ProceduralGrassSystem.getTerrainHeight(ent.pos.x, ent.pos.z - 0.35)) / 0.7;
      group.rotation.x = -dh_dz;
      group.rotation.z = dh_dx;

      const scale = ent.radius * 1.35;
      group.scale.set(scale, 1, scale);
      group.renderOrder = 30;
    });

    // Remove indicators no longer selected
    this.selectionRings.forEach((group, id) => {
      if (!activeIds.has(id)) {
        this.scene.remove(group);
        this.selectionRings.delete(id);
      }
    });
  }

  // Update Health Bar overhead
  public updateHealthBar(id: string, pos: Vector3D, hpRatio: number, isPlayer: boolean, height: number = 1.6, width: number = 1, shieldRatio: number = -1) {
    let hb = this.healthBars.get(id);

    if (!hb) {
      // Backing plate is tinted by team (blue = mine, red = enemy); the fill colour tracks health
      const bg = new THREE.Mesh(this.hbBgGeo, new THREE.MeshBasicMaterial({ color: isPlayer ? 0x1c5cff : 0xd01818 }));
      const bar = new THREE.Mesh(this.hbBarGeo, new THREE.MeshBasicMaterial({ color: 0x00ff66 }));

      this.scene.add(bg);
      this.scene.add(bar);
      hb = { bg, bar };
      this.healthBars.set(id, hb);
    }

    const r = Math.max(0, Math.min(1, hpRatio));
    hb.bg.position.set(pos.x, pos.y + height, pos.z);
    hb.bg.scale.set(width, 1.15, 1);
    hb.bar.position.set(pos.x - (1 - r) * 0.58 * width, pos.y + height + 0.01, pos.z);
    hb.bar.scale.set(Math.max(0.001, r) * width, 1.15, 1);
    (hb.bar.material as THREE.MeshBasicMaterial).color.setHSL(r * 0.33, 1.0, 0.5);

    // Protoss shield strip above the health bar
    if (shieldRatio >= 0) {
      if (!hb.sh) {
        hb.sh = new THREE.Mesh(this.hbBarGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        this.scene.add(hb.sh);
      }
      const sr = Math.max(0.001, Math.min(1, shieldRatio));
      hb.sh.visible = shieldRatio > 0;
      hb.sh.position.set(pos.x - (1 - sr) * 0.58 * width, pos.y + height + 0.17, pos.z);
      hb.sh.scale.set(sr * width, 0.9, 1);
    }
  }

  /**
   * Segmented overhead bars: shields (blue), health (green), energy (purple), only the ones the entity has. Square-ended rectangles
   * split into small rectangles that vanish as the value drops (the draining one turns a faded tint). The stack floats just above the
   * topmost point of the rendered model (measured from its mesh, refreshed every couple of seconds).
   */
  public updateBars(e: { id: string; health: number; maxHealth: number; shield: number; maxShield: number; energy: number; maxEnergy: number; mesh: THREE.Object3D | null; height: number; pos: { x: number; y: number } }, structure = false) {
    let sb = this.segBars.get(e.id);
    const now = performance.now();
    if (!sb) { sb = { rows: [], top: 1.2, topAt: 0, ox: 0, oz: 0, measured: false }; this.segBars.set(e.id, sb); }
    if (e.mesh && !structure && !sb.measured) {
      // Units: measure the real animated silhouette once (precise, skinned vertices; shadows / rings / hulls excluded) to get the visual
      // centre relative to the pivot (in the model's own frame) and the topmost point, so bars sit exactly centred over the model.
      sb.measured = true;
      e.mesh.updateMatrixWorld(true);
      const box = Decals._box.makeEmpty();
      e.mesh.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || o.userData.teamMarker || o.userData.isOutlineHull || o.userData.contactShadow || o.userData.silhouette) return;
        const sm = m as THREE.SkinnedMesh; if (sm.isSkinnedMesh) sm.skeleton.update();
        box.expandByObject(m, true);
        if (sm.isSkinnedMesh) (sm as any).boundingBox = null;
      });
      if (isFinite(box.max.y)) {
        sb.top = Math.max(0.6, box.max.y - e.height);
        const dx = (box.min.x + box.max.x) / 2 - e.pos.x, dz = (box.min.z + box.max.z) / 2 - e.pos.y, r = -e.mesh.rotation.y;
        sb.ox = dx * Math.cos(r) + dz * Math.sin(r); sb.oz = -dx * Math.sin(r) + dz * Math.cos(r);
      }
    } else if (e.mesh && structure && now - sb.topAt > 2000) {
      sb.topAt = now + Math.random() * 400;
      const box = Decals._box.setFromObject(e.mesh);
      e.mesh.traverse(o => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh) (sm as any).boundingBox = null; }); // setFromObject caches a (possibly stale) box that would make raycasts miss
      if (isFinite(box.max.y)) sb.top = Math.max(0.6, box.max.y - e.height);
    }
    const rows: { v: number; m: number; color: number }[] = [];
    if (e.maxShield > 0) rows.push({ v: e.shield, m: e.maxShield, color: 0x3aa0ff });
    rows.push({ v: e.health, m: e.maxHealth, color: 0x22dd44 });
    if (e.maxEnergy > 0) rows.push({ v: e.energy, m: e.maxEnergy, color: 0xb050ff });
    while (sb.rows.length < rows.length) {
      const mat = Decals.segMat.clone();
      mat.uniforms = { uRatio: { value: 1 }, uSegs: { value: 10 }, uColor: { value: new THREE.Color() }, uSize: { value: new THREE.Vector2(100, 10) }, uF: { value: new THREE.Vector2(Decals.FILL_W, Decals.FILL_H) }, uB: { value: Decals.BORDER } };
      const m = new THREE.Mesh(Decals.segGeo, mat); m.renderOrder = 50; m.frustumCulled = false;
      this.scene.add(m); sb.rows.push(m);
    }
    // Constant on-screen size: scale the billboards by their distance so a mini rectangle is the same number of pixels for a
    // flyer (close to the camera) as for a ground unit, and for every unit type.
    const cam = this.camera as THREE.PerspectiveCamera | null;
    let wpp = 0.01;
    const vp = this.viewport ? this.viewport() : { w: window.innerWidth, h: window.innerHeight, pr: 1 };
    const rot = e.mesh ? e.mesh.rotation.y : 0;
    const centre = Decals._c.set(e.pos.x + sb.ox * Math.cos(rot) + sb.oz * Math.sin(rot), e.height + sb.top, e.pos.y - sb.ox * Math.sin(rot) + sb.oz * Math.cos(rot));
    if (cam) {
      Decals._fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const d = Math.max(0.5, Decals._d.subVectors(centre, cam.position).dot(Decals._fwd));
      wpp = (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(200, vp.h);
    }
    // whole rendered pixels: fill 14 x 8 and 2 px borders in CSS px, scaled by the render resolution and rounded, so the grid is exact
    const zs = Math.max(0.15, Math.min(1, this.zoomScale ? this.zoomScale() : 1)) * vp.pr;
    const F_W = Math.max(2, Math.round(Decals.FILL_W * zs)), F_H = Math.max(1, Math.round(Decals.FILL_H * zs)), B = Math.max(1, Math.round(Decals.BORDER * zs));
    const rowPx = F_H + 2 * B;                  // one row's height in px (borders included)
    const stepPx = rowPx - B;                   // rows overlap by one border so the line between rows has the same width too
    const vw = vp.w, vh = vp.h;
    for (let i = 0; i < sb.rows.length; i++) {
      const m = sb.rows[i]!;
      const r = rows[i];
      if (!r) { m.visible = false; continue; }
      m.visible = true;
      const segs = Decals.segCount(r.m, structure);
      const wPx = segs * (F_W + B) + B;
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uRatio!.value = Math.max(0, Math.min(1, r.v / r.m)); u.uSegs!.value = segs; (u.uColor!.value as THREE.Color).setHex(r.color);
      (u.uSize!.value as THREE.Vector2).set(wPx, rowPx); (u.uF!.value as THREE.Vector2).set(F_W, F_H); u.uB!.value = B;
      m.scale.set(wPx * wpp, rowPx * wpp, 1);
      // rows stack upward (energy at the bottom, health, shields on top); centred exactly over the unit, facing the camera
      const upPx = 8 * zs + rowPx / 2 + (rows.length - 1 - i) * stepPx;
      m.position.copy(centre);
      if (cam) {
        m.quaternion.copy(cam.quaternion);
        Decals._up.set(0, 1, 0).applyQuaternion(cam.quaternion);
        Decals._right.set(1, 0, 0).applyQuaternion(cam.quaternion);
        m.position.addScaledVector(Decals._up, upPx * wpp);
        // snap the quad's top-left corner to the pixel grid so all border lines render crisp and identical
        Decals._p.copy(m.position).project(cam);
        const sx = (Decals._p.x + 1) / 2 * vw, sy = (1 - Decals._p.y) / 2 * vh;
        const left = sx - wPx / 2, top = sy - rowPx / 2;
        const dx = Math.round(left) - left, dy = Math.round(top) - top;
        m.position.addScaledVector(Decals._right, dx * wpp);
        m.position.addScaledVector(Decals._up, -dy * wpp);
      } else m.position.y += upPx * wpp;
    }
  }
  private static _box = new THREE.Box3();
  /** Every mini rectangle is the same size in screen pixels (see updateBars). */
  private static readonly FILL_W = 14;   // one mini rectangle's fill, px (14 x 8 = 7:4, the closest whole-pixel size to 16:9 at this scale)
  private static readonly FILL_H = 8;
  private static readonly BORDER = 2;    // every black line, CSS px (scaled by the render resolution)
  private static _right = new THREE.Vector3(); private static _p = new THREE.Vector3(); private static _c = new THREE.Vector3(); private static _fwd = new THREE.Vector3(); private static _d = new THREE.Vector3();
  /** Number of mini rectangles for a bar of `max` points: log-scaled so a Probe (20) = 4, Hydralisk (90) = 5, Overlord / 200-HP unit = 6; structures start at 8 (Pylon, Photon Cannon). */
  private static segCount(max: number, structure: boolean): number {
    const n = structure ? 8 + 0.87 * Math.log(Math.max(1, max) / 175) : 4 + 0.87 * Math.log(Math.max(1, max) / 20);
    return Math.max(3, Math.min(structure ? 14 : 12, Math.round(n)));
  }

  public removeSegBars(id: string) {
    const sb = this.segBars.get(id); if (!sb) return;
    sb.rows.forEach(m => { this.scene.remove(m); (m.material as THREE.Material).dispose(); });
    this.segBars.delete(id);
  }

  public removeHealthBar(id: string) {
    this.removeSegBars(id);
    const hb = this.healthBars.get(id);
    if (hb) {
      this.scene.remove(hb.bg);
      this.scene.remove(hb.bar);
      if (hb.sh) { this.scene.remove(hb.sh); (hb.sh.material as THREE.Material).dispose(); }
      (hb.bg.material as THREE.Material).dispose();
      (hb.bar.material as THREE.Material).dispose();
      this.healthBars.delete(id);
    }
  }

  // Holographic Building Placement Grid (Green = Valid, Red = Invalid)
  // `yaw` turns the volume exactly like the finished model; the thin cell grid shows the true (axis-aligned) footprint cells.
  public setPlacementGhost(
    pos: Vector2D,
    width: number,
    height: number,
    isValid: boolean,
    yaw = 0,
    type?: string
  ) {
    if (!this.placementGhost) {
      this.placementGhost = new THREE.Group();
      this.scene.add(this.placementGhost);
    }

    // Clear old children
    while (this.placementGhost.children.length > 0) {
      const child = this.placementGhost.children[0]!;
      this.placementGhost.remove(child);
    }

    const color = isValid ? 0x00ff88 : 0xff2222;
    const groundY = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.y);

    // Semi-transparent tinted copy of the actual structure model (falls back to a box if there is no model)
    const model = type ? this.getGhostModel(type, isValid, color) : null;
    if (model) {
      model.position.set(pos.x, groundY, pos.y);
      this.placementGhost.add(model);
    } else {
      const vol = new THREE.Group();
      vol.position.set(pos.x, groundY, pos.y);
      vol.rotation.y = yaw;
      const box = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, height), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
      box.position.y = 0.6;
      const wire = new THREE.Mesh(new THREE.BoxGeometry(width, 1.22, height), new THREE.MeshBasicMaterial({ color, wireframe: true }));
      wire.position.y = 0.6;
      vol.add(box, wire);
      this.placementGhost.add(vol);
    }

    // True footprint: one outlined square per grid cell the structure will occupy (axis-aligned, snapped to the grid)
    const pts: number[] = [];
    const x0 = pos.x - width / 2, z0 = pos.y - height / 2;
    for (let i = 0; i <= width; i++) pts.push(x0 + i, 0, z0, x0 + i, 0, z0 + height);
    for (let j = 0; j <= height; j++) pts.push(x0, 0, z0 + j, x0 + width, 0, z0 + j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
    grid.position.y = groundY + 0.08;
    grid.renderOrder = 31;
    this.placementGhost.add(grid);

    // A new Pylon previews the power field it will project
    if (type === 'pylon') {
      const ring = new THREE.LineLoop(Decals.pylonRingGeo, Decals.pylonRingMat);
      ring.position.set(pos.x, groundY + 0.1, pos.y);
      ring.renderOrder = 31;
      this.placementGhost.add(ring);
    }
  }
  private static pylonRingGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => { const a = i / 96 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5); }));
  private static pylonRingMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, depthTest: false });

  private ghostModels = new Map<string, THREE.Group | null>();
  private static ghostMats = new Map<number, { fill: THREE.Material; wire: THREE.Material }>();

  /** Cached holographic copy of a building model: every mesh is re-skinned with a translucent tint plus a wireframe overlay. */
  private getGhostModel(type: string, valid: boolean, color: number): THREE.Group | null {
    const key = `${type}:${valid}`;
    if (this.ghostModels.has(key)) return this.ghostModels.get(key)!;
    let result: THREE.Group | null = null;
    try {
      let mats = Decals.ghostMats.get(color);
      if (!mats) {
        mats = {
          fill: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
          wire: new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.5, depthWrite: false })
        };
        Decals.ghostMats.set(color, mats);
      }
      const model = modelFactory.createBuildingModel(type as any, true);
      const meshes: THREE.Mesh[] = [];
      const drop: THREE.Object3D[] = [];
      model.traverse(o => {
        if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
        else if ((o as any).isLight || (o as any).isSprite || (o as any).isPoints || (o as any).isLine) drop.push(o);
      });
      for (const o of drop) o.parent?.remove(o);
      for (const m of meshes) {
        m.material = mats.fill;
        m.castShadow = false; m.receiveShadow = false;
        m.renderOrder = 30;
        if (!(m as any).isSkinnedMesh && !(m as any).isInstancedMesh) {
          const w = new THREE.Mesh(m.geometry, mats.wire);
          w.renderOrder = 30;
          m.add(w);
        }
      }
      if (meshes.length) result = model;
    } catch { result = null; }
    this.ghostModels.set(key, result);
    return result;
  }

  public clearPlacementGhost() {
    if (this.placementGhost) {
      this.scene.remove(this.placementGhost);
      this.placementGhost = null;
    }
  }

  // Rally point Line from building to target position
  public updateRallyLine(buildingId: string, fromPos: Vector3D, toPos: Vector2D | null) {
    let line = this.rallyLines.get(buildingId);
    if (!toPos) {
      if (line) {
        this.scene.remove(line);
        this.rallyLines.delete(buildingId);
      }
      return;
    }

    const key = `${fromPos.x.toFixed(2)},${fromPos.z.toFixed(2)}>${toPos.x.toFixed(2)},${toPos.y.toFixed(2)}`;
    if (line && line.userData.key === key) return; // unchanged: keep the existing ribbon
    if (line) { this.scene.remove(line); line.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }

    // Bold dashed ribbon draped over the terrain: bright dashes on a dark under-stroke so it reads on grass, sand and rock
    const dx = toPos.x - fromPos.x, dz = toPos.y - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const dash = 0.8, gap = 0.5, step = dash + gap;
    const mk = (halfW: number, lift: number, pad = 0) => {
      const pos: number[] = [], idx: number[] = [];
      let v = 0;
      for (let d = 0; d < len; d += step) {
        const d1 = Math.min(len, d + dash) + pad, d0 = d - pad; // pad extends the dark outline past both ends of the dash
        const a0 = [fromPos.x + ux * d0, fromPos.z + uz * d0], a1 = [fromPos.x + ux * d1, fromPos.z + uz * d1];
        const ya = ProceduralGrassSystem.getTerrainHeight(a0[0]!, a0[1]!) + lift;
        const yb = ProceduralGrassSystem.getTerrainHeight(a1[0]!, a1[1]!) + lift;
        pos.push(a0[0]! + nx * halfW, ya, a0[1]! + nz * halfW, a0[0]! - nx * halfW, ya, a0[1]! - nz * halfW,
                 a1[0]! - nx * halfW, yb, a1[1]! - nz * halfW, a1[0]! + nx * halfW, yb, a1[1]! + nz * halfW);
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    };
    const dark = new THREE.Mesh(mk(0.105, 0.1, 0.018), new THREE.MeshBasicMaterial({ color: 0x0c0800, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const bright = new THREE.Mesh(mk(0.088, 0.12), new THREE.MeshBasicMaterial({ color: 0xffc21a, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    dark.renderOrder = 4; bright.renderOrder = 5;
    dark.raycast = () => {}; bright.raycast = () => {};
    const grp = new THREE.Group() as THREE.Group & { userData: { key?: string } };
    grp.add(dark, bright);
    grp.userData.key = key;
    this.scene.add(grp);
    this.rallyLines.set(buildingId, grp);
  }

  public removeRallyLine(buildingId: string) {
    const line = this.rallyLines.get(buildingId);
    if (line) {
      this.scene.remove(line);
      this.rallyLines.delete(buildingId);
    }
  }

  public clearAll() {
    this.selectionRings.forEach(r => this.scene.remove(r));
    this.selectionRings.clear();
    this.healthBars.forEach(hb => {
      this.scene.remove(hb.bg);
      this.scene.remove(hb.bar);
      (hb.bg.material as THREE.Material).dispose();
      (hb.bar.material as THREE.Material).dispose();
    });
    this.healthBars.clear();
    this.segBars.forEach((_, id) => this.removeSegBars(id));
    this.rallyLines.forEach(l => this.scene.remove(l));
    this.rallyLines.clear();
    this.clearPlacementGhost();
  }
}
