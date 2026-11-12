import * as THREE from 'three';
import { BUILDING_CONFIGS } from '../config';
import { localBox, isHelperMesh } from './WarpIn';

/**
 * Zerg structure mutation, SC2 style: the drone burrows into the creep and swells into a pulsing, vein-streaked flesh cocoon;
 * the structure then grows up out of the ground inside the (translucent) membrane, which splits, collapses into the creep and
 * bursts a spray of yellow-green ichor when the mutation completes.
 *   p 0.00-0.25 : cocoon swells, structure still buried
 *   p 0.20-0.90 : structure grows (width/height from squat to full), membrane thins
 *   p 0.88-1.00 : membrane splits and slumps, ichor burst ring
 * The cocoon and the growing structure are skinned in a wet blood-web texture (on patched material clones, restored when done)
 * and pulse to a resting human heartbeat: a soft "lub" and a weaker "dub", 66 beats a minute.
 */

/** Resting human heartbeat, 66 bpm: smooth lub (1.0) then dub (0.55) 0.27 of a beat later. Returns 0..1. */
export const HEART_GLSL = /* glsl */ `
  float heartBeat(float t){
    float ph = fract(t * 1.1);
    float d1 = ph - 0.0;  d1 -= floor(d1 + 0.5);
    float d2 = ph - 0.27; d2 -= floor(d2 + 0.5);
    return exp(-d1 * d1 / 0.0072) + 0.55 * exp(-d2 * d2 / 0.0072);
  }
`;
export function heartBeat(t: number): number {
  const ph = t * 1.1 - Math.floor(t * 1.1);
  let d1 = ph; d1 -= Math.floor(d1 + 0.5);
  let d2 = ph - 0.27; d2 -= Math.floor(d2 + 0.5);
  return Math.exp(-d1 * d1 / 0.0072) + 0.55 * Math.exp(-d2 * d2 / 0.0072);
}

/** Wet blood-web texture, tiled with triplanar projection (shared by every morph). */
let bloodTex: THREE.Texture | null = null;
function getBloodTex(): THREE.Texture {
  if (bloodTex) return bloodTex;
  const base = ((import.meta as any).env?.BASE_URL as string | undefined) ?? '/';
  bloodTex = new THREE.TextureLoader().load(base + 'textures/zerg_blood_web.webp');
  bloodTex.wrapS = bloodTex.wrapT = THREE.RepeatWrapping;
  bloodTex.colorSpace = THREE.SRGBColorSpace;
  bloodTex.anisotropy = 8;
  return bloodTex;
}
const TRIPLANAR_GLSL = /* glsl */ `
  vec3 bloodTri(sampler2D tex, vec3 p, vec3 n){
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
    return texture2D(tex, p.zy).rgb * w.x + texture2D(tex, p.xz).rgb * w.y + texture2D(tex, p.xy).rgb * w.z;
  }
`;

interface MeshSwap { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; clones: THREE.Material[] }

/** Skin a structure material in blood web that pulses with the heartbeat and hardens away as the mutation finishes. */
function patchFlesh(clone: THREE.Material, orig: THREE.Material, u: MorphState['uniforms']) {
  const prev = orig.onBeforeCompile;
  const prevKey = orig.customProgramCacheKey ? orig.customProgramCacheKey() : '';
  clone.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uProg = u.uProg; shader.uniforms.uTime = u.uTime; shader.uniforms.uBloodTex = u.uBloodTex;
    shader.vertexShader = 'varying vec3 vBloodW;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vBloodW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vBloodW;\nuniform float uProg;\nuniform float uTime;\nuniform sampler2D uBloodTex;\n${HEART_GLSL}\n${TRIPLANAR_GLSL}\n`
      + shader.fragmentShader.replace('#include <tonemapping_fragment>', `
      {
        vec3 fn = normalize(cross(dFdx(vBloodW), dFdy(vBloodW)));
        vec3 web = bloodTri(uBloodTex, vBloodW * 0.42 + vec3(0.0, uTime * 0.015, 0.0), fn);
        float beat = heartBeat(uTime - vBloodW.y * 0.06);       // the beat rolls up the structure
        float cover = 1.0 - smoothstep(0.6, 0.98, uProg);       // flesh skin hardens into the finished carapace
        float lit = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));
        vec3 flesh = web * (0.35 + 1.6 * lit) * (0.85 + 0.35 * beat);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, flesh, cover * 0.82);
        gl_FragColor.rgb += web * vec3(1.0, 0.25, 0.2) * beat * cover * 0.55;   // veins flush with each beat
      }
      #include <tonemapping_fragment>`);
  };
  clone.customProgramCacheKey = () => prevKey + '|zergflesh';
}
interface MorphState {
  root: THREE.Object3D; base: THREE.Vector3; shell: THREE.Mesh; ring: THREE.Mesh;
  shellMat: THREE.ShaderMaterial; ringMat: THREE.MeshBasicMaterial;
  uniforms: { uProg: { value: number }; uTime: { value: number }; uBloodTex: { value: THREE.Texture } };
  swaps: MeshSwap[]; center: THREE.Vector3; rx: number; rh: number; t: number; burst: number; done: boolean;
}

const NOISE = /* glsl */ `
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
`;

export class ZergMorph {
  private static geo: THREE.IcosahedronGeometry | null = null;
  private static ringGeo: THREE.RingGeometry | null = null;
  private static states = new WeakMap<object, MorphState>();
  private static readonly SKIP = new Set(['creep_tumor', 'nydus_worm']);

  public static applies(type: string): boolean {
    return BUILDING_CONFIGS[type as keyof typeof BUILDING_CONFIGS]?.race === 'zerg' && !ZergMorph.SKIP.has(type);
  }

  private static begin(root: THREE.Object3D): MorphState {
    const base = root.scale.clone();
    // measure the finished model (scale is 1 here: the caller has not scaled it yet)
    const box = localBox(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const rx = Math.max(1.0, Math.max(size.x, size.z) * 0.58);
    const rh = Math.max(0.9, size.y * 0.55);
    if (!ZergMorph.geo) ZergMorph.geo = new THREE.IcosahedronGeometry(1, 5);
    const uniforms = { uProg: { value: 0 }, uTime: { value: Math.random() * 20 }, uBloodTex: { value: getBloodTex() } };
    // skin the structure itself (patched clones; the shared originals come back when the mutation completes)
    const swaps: MeshSwap[] = [];
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material || m.userData.morphFx || isHelperMesh(m)) return;
      const orig = m.material;
      const list = Array.isArray(orig) ? orig : [orig];
      const clones = list.map(mat => { const c = mat.clone(); patchFlesh(c, mat, uniforms); c.needsUpdate = true; return c; });
      m.material = Array.isArray(orig) ? clones : clones[0]!;
      swaps.push({ mesh: m, orig, clones });
    });
    const shellMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms,
      vertexShader: `${NOISE}
        ${HEART_GLSL}
        uniform float uProg; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD; varying vec3 vON;
        void main(){
          vec3 p = position; vON = normal;
          float lump = vn(p * 2.4 + uTime * 0.2) * 0.34 + vn(p * 7.0 - uTime * 0.35) * 0.10 + vn(p * 15.0) * 0.03;
          float beat = heartBeat(uTime - position.y * 0.08) * 0.045;   // slow resting heartbeat swell
          float slump = smoothstep(0.88, 1.0, uProg);
          p *= 1.0 + lump + beat;
          p.y *= 1.0 - slump * 0.85;               // membrane slumps into the creep at the end
          vD = lump; vP = position;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `${NOISE}
        ${HEART_GLSL}
        ${TRIPLANAR_GLSL}
        uniform float uProg; uniform float uTime; uniform sampler2D uBloodTex; varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD; varying vec3 vON;
        void main(){
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          // veins: thin dark-red ridges of a warped noise field
          float vein = 1.0 - smoothstep(0.0, 0.11, abs(vn(vP * 3.0 + vn(vP * 5.5) * 1.6) - 0.5));
          float vein2 = 1.0 - smoothstep(0.0, 0.06, abs(vn(vP * 7.5 + 4.0) - 0.5));
          float beat = heartBeat(uTime - vP.y * 0.08);
          float pulse = 0.5 + 0.5 * beat;
          vec3 web = bloodTri(uBloodTex, vP * 1.3 + vec3(0.0, uTime * 0.02, 0.0), vON);
          vec3 flesh = web * mix(0.55, 1.0, clamp(vD * 1.8, 0.0, 1.0)) * (0.8 + 0.45 * beat);
          flesh = mix(flesh, vec3(0.62, 0.05, 0.08), vein * pulse * 0.85);
          flesh = mix(flesh, vec3(0.05, 0.01, 0.03), vein2 * 0.45);
          flesh += vec3(0.42, 0.5, 0.06) * fres * 0.4;               // wet yellow-green mucus sheen
          float spec = pow(max(0.0, dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.5)))), 24.0) * 0.35;
          flesh += spec;
          float thin = smoothstep(0.22, 0.88, uProg);                   // membrane turns translucent as the structure grows
          float split = smoothstep(0.9, 1.0, uProg);
          float a = mix(0.97, 0.36 + fres * 0.3 + vein * 0.25, thin) * (1.0 - split);
          gl_FragColor = vec4(flesh, a);
        }`
    });
    const shell = new THREE.Mesh(ZergMorph.geo, shellMat);
    shell.userData.morphFx = true; shell.frustumCulled = false; shell.renderOrder = 4; shell.raycast = () => {};
    shell.position.set(center.x, 0, center.z);
    root.add(shell);

    if (!ZergMorph.ringGeo) ZergMorph.ringGeo = new THREE.RingGeometry(0.6, 1, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8e04a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ZergMorph.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(center.x, 0.08, center.z); ring.visible = false; ring.raycast = () => {};
    ring.userData.morphFx = true;
    root.add(ring);
    return { root, base, shell, ring, shellMat, ringMat, uniforms, swaps, center, rx, rh, t: 0, burst: 0, done: false };
  }

  public static update(b: { mesh?: any; type: string; isConstructed: boolean; buildProgress: number }, dt: number) {
    const root = b.mesh as THREE.Object3D | undefined;
    if (!root || !ZergMorph.applies(b.type)) return;
    let s = ZergMorph.states.get(root);
    if (!s) {
      if (b.isConstructed) return;
      s = ZergMorph.begin(root);
      ZergMorph.states.set(root, s);
    }
    if (s.done) return;
    s.t += dt;
    s.uniforms.uTime.value += dt;
    const p = b.isConstructed ? 1 : Math.min(1, b.buildProgress);
    s.uniforms.uProg.value = p;
    const sm = (a: number, c: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (c - a))); return t * t * (3 - 2 * t); };

    // cocoon size: swells from a drone-sized lump, then settles at the footprint
    const swell = 0.28 + 0.72 * sm(0, 0.25, p);
    const slump = sm(0.88, 1, p);
    s.shell.scale.set(s.rx * swell * (1 + slump * 0.25), s.rh * swell, s.rx * swell * (1 + slump * 0.25));
    s.shell.position.y = s.rh * swell * 0.55 * (1 - slump);
    s.shell.visible = p < 0.995;

    // the structure grows out of the ground: squat and narrow at first, full height at the end, with a slow wet wobble
    const g = sm(0.2, 0.92, p);
    const beat = heartBeat(s.uniforms.uTime.value);
    const wob = 1 + beat * 0.022;
    const yy = p < 0.2 ? 0.001 : 0.04 + 0.96 * g;
    const xz = 0.55 + 0.45 * g;
    root.scale.set(s.base.x * xz * wob, s.base.y * yy * (1 + beat * 0.012), s.base.z * xz * wob);

    if (p >= 1) {
      root.scale.copy(s.base);
      if (s.swaps.length) { for (const sw of s.swaps) { sw.mesh.material = sw.orig as any; for (const c of sw.clones) c.dispose(); } s.swaps.length = 0; }
      s.burst += dt;
      const t = s.burst / 0.9;
      s.ring.visible = t < 1;
      s.ring.scale.setScalar(s.rx * (0.8 + t * 2.4));
      s.ringMat.opacity = Math.max(0, 0.75 * (1 - t));
      if (t >= 1) { root.remove(s.shell, s.ring); s.shellMat.dispose(); s.ringMat.dispose(); s.done = true; }
    }
  }
}
