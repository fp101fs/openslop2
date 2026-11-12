import * as THREE from 'three';
import { BUILDING_CONFIGS } from '../config';

/**
 * Protoss warp-in: while a structure is under construction its real model is swapped (per building) onto patched material clones that
 *   - draw drifting white "plasma" contour lines across the surface (curvy, organic, animated),
 *   - keep the hull translucent and teal-tinted, fading to solid as the lines fade out,
 * and a soft glowing energy sphere surrounds it, collapsing into a flash when the warp-in completes.
 * On completion the original (shared) materials are restored and the clones disposed, so finished buildings cost nothing extra.
 */

/** Flat helper meshes (power-field disc / ring, glow planes, decals) are not part of the hull. */
export function isHelperMesh(m: THREE.Mesh): boolean {
  const t = m.geometry?.type;
  return t === 'PlaneGeometry' || t === 'CircleGeometry' || t === 'RingGeometry';
}

/** Bounding box of the visible meshes in the root's own (unscaled, unrotated) local space. */
export function localBox(root: THREE.Object3D): THREE.Box3 {
  const p = root.position.clone(), q = root.quaternion.clone(), sc = root.scale.clone(), parent = root.parent;
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  if (parent) parent.remove(root); // detach so parent transforms do not leak in
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(); const tmp = new THREE.Box3();
  root.traverseVisible(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.warpFx || m.userData.morphFx || !m.geometry || isHelperMesh(m)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    box.union(tmp);
  });
  if (parent) parent.add(root);
  root.position.copy(p); root.quaternion.copy(q); root.scale.copy(sc); root.updateMatrixWorld(true);
  return box;
}

interface MeshSwap { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; clones: THREE.Material[] }
interface WarpState {
  root: THREE.Object3D; swaps: MeshSwap[]; fx: THREE.Mesh; fxMat: THREE.ShaderMaterial;
  uniforms: { uProg: { value: number }; uTime: { value: number } }; t: number; done: boolean; flash: number;
}

const GLSL_NOISE_LINES = /* glsl */ `
  float warpLines(vec3 p, float t) {
    float n = sin(p.x * 3.1 + sin(p.y * 2.3 + t * 0.9) * 1.6)
            + sin(p.y * 3.7 + sin(p.z * 2.9 - t * 0.7) * 1.4)
            + sin(p.z * 3.3 + sin(p.x * 2.6 + t * 0.6) * 1.8)
            + sin((p.x + p.y + p.z) * 1.9 + t * 0.5);
    float line = 1.0 - smoothstep(0.0, 0.22, abs(n));
    float n2 = sin(p.x * 6.2 - t * 0.8 + sin(p.z * 4.1 + t) * 1.2) + sin(p.y * 5.6 + sin(p.x * 3.3 - t * 0.6) * 1.3) + sin(p.z * 5.1 + t * 0.4);
    float fine = 1.0 - smoothstep(0.0, 0.16, abs(n2));
    return clamp(line + fine * 0.55, 0.0, 1.0);
  }
`;

function patchClone(clone: THREE.Material, orig: THREE.Material, u: WarpState['uniforms']) {
  const prev = orig.onBeforeCompile;
  const prevKey = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '';
  clone.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uProg = u.uProg; shader.uniforms.uTime = u.uTime;
    shader.vertexShader = 'varying vec3 vWarpPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWarpPos = transformed;');
    shader.fragmentShader = `varying vec3 vWarpPos;\nuniform float uProg;\nuniform float uTime;\n${GLSL_NOISE_LINES}\n` + shader.fragmentShader.replace('#include <dithering_fragment>', `
      {
        float lines = warpLines(vWarpPos, uTime) * (1.0 - smoothstep(0.5, 0.97, uProg));
        float solid = smoothstep(0.22, 0.95, uProg);
        vec3 teal = vec3(0.45, 0.85, 1.0);
        gl_FragColor.rgb = mix(teal * (0.35 + 0.65 * length(gl_FragColor.rgb)), gl_FragColor.rgb, solid);
        gl_FragColor.rgb += vec3(0.85, 0.97, 1.0) * lines * 1.6;
        gl_FragColor.a *= clamp(mix(0.16, 1.0, solid) + lines * 0.75, 0.0, 1.0);
      }
      #include <dithering_fragment>`);
  };
  clone.customProgramCacheKey = () => prevKey + '|warpin';
}

export class WarpIn {
  private static sphereGeo: THREE.SphereGeometry | null = null;
  private static states = new WeakMap<object, WarpState>();

  public static isProtoss(type: string): boolean { return BUILDING_CONFIGS[type as keyof typeof BUILDING_CONFIGS]?.race === 'protoss'; }

  private static begin(root: THREE.Object3D): WarpState {
    const uniforms = { uProg: { value: 0 }, uTime: { value: 0 } };
    const swaps: MeshSwap[] = [];
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material || m.userData.warpFx || isHelperMesh(m)) return;
      const orig = m.material;
      const list = Array.isArray(orig) ? orig : [orig];
      const clones = list.map(mat => {
        const c = mat.clone();
        patchClone(c, mat, uniforms);
        c.transparent = true; c.depthWrite = false; c.needsUpdate = true;
        return c;
      });
      m.material = Array.isArray(orig) ? clones : clones[0]!;
      swaps.push({ mesh: m, orig, clones });
    });
    const box = localBox(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y * 0.8) * 0.62 + 0.3;
    if (!WarpIn.sphereGeo) WarpIn.sphereGeo = new THREE.SphereGeometry(1, 28, 20);
    const fxMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uProg: uniforms.uProg, uTime: uniforms.uTime, uFlash: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uProg; uniform float uTime; uniform float uFlash;
        ${GLSL_NOISE_LINES}
        void main(){
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
          float body = (1.0 - smoothstep(0.55, 1.0, uProg));
          float swirl = warpLines(vP * 1.8, uTime * 1.3) * 0.35;
          float a = (fres * 0.85 + 0.10 + swirl) * body + uFlash;
          vec3 col = mix(vec3(0.25, 0.7, 1.0), vec3(0.9, 0.98, 1.0), fres * 0.7 + uFlash);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`
    });
    const fx = new THREE.Mesh(WarpIn.sphereGeo, fxMat);
    fx.userData.warpFx = true; fx.renderOrder = 5; fx.frustumCulled = false;
    fx.position.copy(center);
    fx.scale.setScalar(radius);
    fx.raycast = () => {};
    root.add(fx);
    return { root, swaps, fx, fxMat, uniforms, t: Math.random() * 10, done: false, flash: 0 };
  }

  private static finish(s: WarpState) {
    for (const sw of s.swaps) {
      sw.mesh.material = sw.orig as any;
      for (const c of sw.clones) c.dispose();
    }
    s.swaps.length = 0;
  }

  /** Drive the effect from the building's construction progress. Call every frame (cheap once finished). */
  public static update(b: { mesh?: any; type: string; isConstructed: boolean; buildProgress: number }, dt: number) {
    const root = b.mesh as THREE.Object3D | undefined;
    if (!root || !WarpIn.isProtoss(b.type)) return;
    let s = WarpIn.states.get(root);
    if (!s) {
      if (b.isConstructed) return; // placed finished (start of map / campaign): nothing to play
      s = WarpIn.begin(root);
      WarpIn.states.set(root, s);
    }
    if (s.done) return;
    s.t += dt;
    s.uniforms.uTime.value = s.t;
    const p = b.isConstructed ? 1 : Math.min(1, b.buildProgress);
    s.uniforms.uProg.value = p;
    if (p >= 1) {
      // completion: restore materials, bright flash that collapses and fades
      if (s.swaps.length) { WarpIn.finish(s); s.flash = 1; }
      s.flash = Math.max(0, s.flash - dt * 2.2);
      (s.fxMat.uniforms.uFlash as { value: number }).value = s.flash * 0.8;
      s.fx.scale.multiplyScalar(1 - Math.min(0.5, dt * 1.5));
      if (s.flash <= 0) { root.remove(s.fx); s.fxMat.dispose(); s.done = true; }
    }
  }
}
