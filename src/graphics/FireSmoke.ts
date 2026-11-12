import * as THREE from 'three';

/**
 * GPU fire and smoke. Each system is one instanced quad mesh with a fixed ring buffer of particles. The CPU only writes a
 * particle's starting values once (origin, velocity, start time, life, sizes); the vertex shader works out its position,
 * growth and age from a time uniform, and the fragment shader shapes it from one shared tileable noise texture.
 * No per-particle work happens on the CPU after spawning, and the whole thing is two draw calls.
 *
 * Fire kinds:  0 flame tongue, 1 fireball (cools into soot), 2 ember, 3 flash,
 *              4 lick (thin tall licking flame), 5 sheet (wide low wall of flame with several peaks),
 *              6 flicker (small candle-like flame), 7 jet (flamethrower plume, stretched along its motion),
 *              8 lean (a tongue bent over sideways as if by a draught).
 * Smoke kinds: 0 black oily smoke, 1 grey smoke, 2 light wisp, 3 white steam, 4 explosion billow (lit warm from inside at first).
 */
export type FireKind = 'tongue' | 'fireball' | 'ember' | 'flash' | 'lick' | 'sheet' | 'flicker' | 'jet' | 'lean';
/** Standing flame shapes (all stand on their origin and lick upward). */
export type FlameShape = 'tongue' | 'lick' | 'sheet' | 'flicker' | 'lean';
export type SmokeKind = 'black' | 'dust' | 'wisp' | 'steam' | 'billow';
const FIRE_K: Record<FireKind, number> = { tongue: 0, fireball: 1, ember: 2, flash: 3, lick: 4, sheet: 5, flicker: 6, jet: 7, lean: 8 };
const SMOKE_K: Record<SmokeKind, number> = { black: 0, dust: 1, wisp: 2, steam: 3, billow: 4 };

export interface Emit {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  /** Size at birth and at death (world units, quad half-width x2). */
  s0: number; s1: number;
  /** Constant vertical acceleration (buoyancy > 0, gravity < 0). */
  rise?: number;
  /** Velocity damping per second (air drag); 0 = none. */
  drag?: number;
  /** Fire: brightness multiplier. Smoke: opacity. */
  i?: number;
  /** Noise rotation speed (rad/s). */
  spin?: number;
}

/** Tileable value-noise fbm, 4 channels at different scales / styles (r: fine fbm, g: finer fbm, b: billowy, a: coarse). */
function makeNoiseTexture(N = 128): THREE.DataTexture {
  const rand = (() => { let s = 1337; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const lattice = (P: number) => { const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = rand(); return g; };
  const sample = (g: Float32Array, P: number, x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
    const a = g[y0 * P + x0]!, b = g[y0 * P + x1]!, c = g[y1 * P + x0]!, d = g[y1 * P + x1]!;
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (base: number, oct: number, billow: boolean) => {
    const layers = Array.from({ length: oct }, (_, o) => ({ P: base << o, g: lattice(base << o) }));
    return (u: number, v: number) => {
      let sum = 0, amp = 0.5, norm = 0;
      for (const { P, g } of layers) {
        let n = sample(g, P, u * P, v * P);
        if (billow) n = 1 - Math.abs(n * 2 - 1);
        sum += n * amp; norm += amp; amp *= 0.5;
      }
      return sum / norm;
    };
  };
  const ch = [fbm(4, 4, false), fbm(8, 3, false), fbm(4, 4, true), fbm(2, 4, false)];
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, o = (y * N + x) * 4;
    for (let c = 0; c < 4; c++) {
      // stretch contrast a little: fbm sits mostly around 0.5
      const n = (ch[c]!(u, v) - 0.5) * 1.7 + 0.5;
      data[o + c] = Math.max(0, Math.min(255, Math.round(n * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
precision highp float;
attribute vec3 aOrigin;
attribute vec3 aVel;
attribute vec4 aTime;   // start, life, seed, kind
attribute vec4 aShape;  // size0, size1, rise, drag
attribute vec2 aParam;  // intensity, spin
uniform float uTime;
uniform vec3 uWind;
varying vec2 vUv;       // screen-aligned 0..1 (shape / lighting)
varying vec2 vNUv;      // rotated per particle (noise lookups)
varying float vT, vSeed, vKind, vI;
void main() {
  float age = uTime - aTime.x;
  float t = age / aTime.y;
  if (t < 0.0 || t >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float drag = aShape.w;
  float k = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aOrigin + aVel * k + uWind * age;
  p.y += 0.5 * aShape.z * age * age;
  float g = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(aShape.x, aShape.y, g);
  vec2 c = position.xy;
  vUv = c + 0.5;
  float ang = aTime.z * 6.2831 + aParam.y * age;
  float cs = cos(ang), sn = sin(ang);
  vNUv = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
  vec2 q = c;
#ifdef FIRE
  float kd = aTime.w;
  if (kd < 0.5 || (kd > 3.5 && kd < 6.5) || kd > 7.5) {
    // standing flames sit on their origin, noise stays upright so it streams upward. Each shape has its own width x height.
    vec2 asp = kd < 0.5 ? vec2(1.0, 1.8) : kd < 4.5 ? vec2(0.55, 2.1) : kd < 5.5 ? vec2(1.8, 1.1) : kd < 6.5 ? vec2(0.6, 1.0) : vec2(0.95, 1.7);
    q = vec2(c.x * asp.x, (c.y + 0.5) * asp.y); vNUv = vUv;
    // lean: shear the top sideways (direction from the seed), swaying a little
    if (kd > 7.5) q.x += (c.y + 0.5) * (aTime.z < 0.5 ? -1.0 : 1.0) * (0.55 + 0.15 * sin(uTime * 3.0 + aTime.z * 40.0));
  } else if (kd > 6.5 && kd < 7.5) {
    // jet: a quad stretched along the particle's on-screen direction of travel
    float dk = drag > 0.001 ? exp(-drag * age) : 1.0;
    vec3 vel = aVel * dk + uWind + vec3(0.0, aShape.z * age, 0.0);
    vec2 sv = (modelViewMatrix * vec4(vel, 0.0)).xy;
    float sl = length(sv);
    vec2 dir = sl > 1e-4 ? sv / sl : vec2(0.0, 1.0);
    float stretch = 1.0 + min(0.8, sl * 0.08);
    q = dir * c.y * stretch + vec2(dir.y, -dir.x) * c.x;   // (dir.y, -dir.x) keeps the quad front-facing
    vNUv = vUv;
  }
#endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  vT = t; vSeed = aTime.z; vKind = aTime.w; vI = aParam.x;
}`;

const FIRE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv, vNUv;
varying float vT, vSeed, vKind, vI;
// blackbody-ish ramp: deep red -> orange -> yellow -> white-hot (values > 1 feed the bloom)
vec3 ramp(float h) {
  vec3 c = mix(vec3(0.28, 0.02, 0.0), vec3(0.95, 0.22, 0.015), smoothstep(0.0, 0.4, h));
  c = mix(c, vec3(1.15, 0.55, 0.1), smoothstep(0.4, 0.75, h));
  return mix(c, vec3(1.45, 1.15, 0.7), smoothstep(0.8, 1.15, h));
}
void main() {
  float s = vSeed * 17.3;
  vec3 emit = vec3(0.0); vec3 soot = vec3(0.0); float alpha = 0.0;
  if (vKind < 0.5) {
    // flame tongue: teardrop pushed through scrolling noise, then a hard threshold (the CSS blur+contrast trick)
    float n1 = texture2D(uNoise, vec2(vUv.x * 0.7 + s, vUv.y * 0.5 - uTime * 1.1)).r;
    float n2 = texture2D(uNoise, vec2(vUv.x * 1.5 - s, vUv.y * 1.0 - uTime * 2.4)).g;
    float n = n1 * 0.65 + n2 * 0.35;
    float y = vUv.y;
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.1 * y;
    float w = (1.0 - y) * (0.45 + 0.55 * (1.0 - y));
    float body = (1.0 - smoothstep(w * 0.25, w + 0.02, abs(x))) * smoothstep(0.0, 0.2, y);
    float heat = body * (1.05 - y * 0.85) * (0.45 + 0.85 * n);
    heat *= smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.5, 1.0, vT));
    float a = smoothstep(0.16, 0.4, heat);
    emit = ramp(heat * 1.05) * a * vI;
    alpha = a * 0.3;
  } else if (vKind > 3.5 && vKind < 4.5) {
    // lick: a thin flame whose tip whips about and tears off into separate wisps
    float n1 = texture2D(uNoise, vec2(vUv.x * 0.5 + s, vUv.y * 0.45 - uTime * 1.6)).r;
    float n2 = texture2D(uNoise, vec2(vUv.x * 1.2 - s, vUv.y * 1.1 - uTime * 3.2)).g;
    float n = n1 * 0.55 + n2 * 0.45;
    float y = vUv.y;
    float sway = sin(uTime * 4.5 + vSeed * 30.0 + y * 3.0) * 0.25 * y * y;
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.5 * y + sway;
    float w = pow(1.0 - y, 1.4) * 0.9;
    float body = (1.0 - smoothstep(w * 0.2, w + 0.03, abs(x))) * smoothstep(0.0, 0.12, y);
    float heat = body * (1.1 - y * 0.9) * (0.35 + 1.0 * n);
    heat *= smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.45, 1.0, vT));
    float a = smoothstep(0.2, 0.42, heat);
    emit = ramp(heat * 1.1) * a * vI;
    alpha = a * 0.25;
  } else if (vKind > 4.5 && vKind < 5.5) {
    // sheet: a low wall of fire, several peaks rising and falling along it
    float y = vUv.y;
    float pk = texture2D(uNoise, vec2(vUv.x * 0.9 + s, uTime * 0.35 + s)).a;
    float pk2 = texture2D(uNoise, vec2(vUv.x * 2.3 - s, uTime * 0.8)).g;
    float h = 0.3 + 0.75 * pk * (0.6 + 0.6 * pk2);
    float n = texture2D(uNoise, vec2(vUv.x * 1.4 + s, y * 0.8 - uTime * 1.5)).r;
    float yy = y + (n - 0.5) * 0.35 * y;
    float body = (1.0 - smoothstep(h * 0.55, h, yy)) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.1, y);
    float heat = body * (1.1 - yy / max(h, 0.1) * 0.8) * (0.45 + 0.8 * n);
    heat *= smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.5, 1.0, vT));
    float a = smoothstep(0.16, 0.4, heat);
    emit = ramp(heat) * a * vI;
    alpha = a * 0.3;
  } else if (vKind > 5.5 && vKind < 6.5) {
    // flicker: small rounded flame that pulses quickly, like a burning scrap
    float y = vUv.y;
    float puls = 0.78 + 0.22 * sin(uTime * 19.0 + vSeed * 50.0) * sin(uTime * 7.3 + vSeed * 13.0);
    float n = texture2D(uNoise, vec2(vUv.x * 0.8 + s, y * 0.7 - uTime * 2.0)).r;
    float yy = y / puls;
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * yy;
    float w = sqrt(max(0.0, 1.0 - yy)) * (0.75 - yy * 0.35);
    float body = (1.0 - smoothstep(w * 0.35, w + 0.03, abs(x))) * smoothstep(0.0, 0.18, y);
    float heat = body * (1.15 - yy * 0.8) * (0.55 + 0.7 * n);
    heat *= smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
    float a = smoothstep(0.18, 0.42, heat);
    emit = ramp(heat * 1.05) * a * vI;
    alpha = a * 0.25;
  } else if (vKind > 6.5 && vKind < 7.5) {
    // jet: flamethrower plume. White-yellow fuel core at birth, billowing orange, then cooling into soot
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float n = texture2D(uNoise, vec2(vUv.x * 0.9 + s, vUv.y * 0.6 - uTime * 3.0)).b;
    float n2 = texture2D(uNoise, vec2(vUv.x * 1.7 - s * 0.3, vUv.y * 1.3 - uTime * 1.6)).g;
    float nn = n * 0.6 + n2 * 0.4;
    float shape = 1.0 - smoothstep(0.45, 1.0, r + (nn - 0.5) * 0.9);
    float heat = shape * (1.25 - r * 0.6) * (0.55 + 0.8 * nn) * (1.3 - vT * 1.1) - vT * 0.45;
    float a = smoothstep(0.05, 0.3, heat);
    emit = ramp(heat * 1.1) * a * vI;
    float dens = shape * smoothstep(0.25, 0.6, nn + 0.2);
    float sa = dens * smoothstep(0.35, 0.8, vT) * (1.0 - a) * (1.0 - vT) * 0.8;
    soot = vec3(0.025, 0.02, 0.018) * sa;
    alpha = a * 0.35 + sa;
  } else if (vKind > 7.5) {
    // lean: a tongue bent over by a draught (the vertex shader shears it), streaming faster
    float n1 = texture2D(uNoise, vec2(vUv.x * 0.7 + s, vUv.y * 0.5 - uTime * 1.4)).r;
    float n2 = texture2D(uNoise, vec2(vUv.x * 1.5 - s, vUv.y * 1.0 - uTime * 2.8)).g;
    float n = n1 * 0.6 + n2 * 0.4;
    float y = vUv.y;
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.2 * y;
    float w = (1.0 - y) * (0.4 + 0.5 * (1.0 - y));
    float body = (1.0 - smoothstep(w * 0.25, w + 0.02, abs(x))) * smoothstep(0.0, 0.18, y);
    float heat = body * (1.05 - y * 0.85) * (0.45 + 0.85 * n);
    heat *= smoothstep(0.0, 0.15, vT) * (1.0 - smoothstep(0.5, 1.0, vT));
    float a = smoothstep(0.16, 0.4, heat);
    emit = ramp(heat * 1.05) * a * vI;
    alpha = a * 0.3;
  } else if (vKind < 1.5) {
    // fireball: billowing ball whose temperature drops with age, the cool parts turning to soot
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float n = texture2D(uNoise, vNUv * 0.8 + vec2(s, s * 0.7) - vec2(0.0, uTime * 0.35)).b;
    float n2 = texture2D(uNoise, vNUv * 1.7 - vec2(s * 0.3, uTime * 0.6)).g;
    float nn = n * 0.6 + n2 * 0.4;
    float shape = 1.0 - smoothstep(0.5, 1.0, r + (nn - 0.5) * 0.8);
    float heat = shape * (1.15 - r * 0.7) * (0.5 + 0.85 * nn) - vT * 1.25;
    float a = smoothstep(0.04, 0.32, heat);
    emit = ramp(heat) * a * vI;
    float dens = shape * smoothstep(0.25, 0.6, nn + 0.2);
    float sa = dens * smoothstep(0.15, 0.7, vT) * (1.0 - a) * (1.0 - vT) * 0.9;
    soot = vec3(0.02, 0.018, 0.016) * sa;
    alpha = a * 0.35 + sa;
  } else if (vKind < 2.5) {
    // ember: tiny hot dot that flickers and dims
    float r = length(vUv - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.15, 1.0, r);
    float fl = 0.65 + 0.35 * sin(uTime * 28.0 + vSeed * 60.0);
    emit = vec3(2.0, 0.9, 0.25) * a * a * fl * (1.0 - vT) * vI;
    alpha = 0.0;
  } else {
    // flash: soft white-yellow burst, gone in a blink
    float r = length(vUv - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - r), 2.2);
    emit = vec3(1.5, 1.2, 0.8) * a * pow(1.0 - vT, 2.0) * vI;
    alpha = 0.0;
  }
  if (alpha + emit.r < 0.003) discard;
  gl_FragColor = vec4(emit + soot, alpha);   // premultiplied: emit adds light, alpha occludes
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SMOKE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv, vNUv;
varying float vT, vSeed, vKind, vI;
void main() {
  float s = vSeed * 23.1;
  vec2 p = vUv - 0.5; float r = length(p) * 2.0;
  float n1 = texture2D(uNoise, vNUv * 0.9 + vec2(s, s * 1.3) - vec2(0.0, uTime * 0.08)).b;
  float n2 = texture2D(uNoise, vNUv * 1.9 + vec2(-s * 0.7, s) + vec2(uTime * 0.05, -uTime * 0.13)).r;
  float n = n1 * 0.6 + n2 * 0.4;
  // edges soften as the puff ages (the CSS "blur grows over life" trick)
  float soft = mix(0.3, 0.8, vT);
  float edge = r + (n - 0.5) * (0.85 + vT * 0.4);
  float mask = 1.0 - smoothstep(1.0 - soft, 1.0, edge);
  float dens = mask * (0.45 + 1.35 * n);
  if (vKind > 1.5 && vKind < 3.5) dens *= smoothstep(0.3, 0.75, n + (1.0 - r) * 0.35); // wisps / steam break up into strands
  float fade = smoothstep(0.0, 0.1, vT) * pow(1.0 - vT, 1.3);
  float a = clamp(dens, 0.0, 1.0) * fade * vI;
  if (a < 0.004) discard;
  // fake volume: lit from above, self-shadowed underneath, noise adds lumps
  float light = clamp(0.5 + (vUv.y - 0.5) * 0.9 + (n2 - 0.5) * 0.9, 0.0, 1.0);
  vec3 dark, lit;
  if (vKind < 0.5)      { dark = vec3(0.003, 0.003, 0.003); lit = vec3(0.045, 0.042, 0.04); }
  else if (vKind < 1.5) { dark = vec3(0.07, 0.065, 0.06);  lit = vec3(0.3, 0.29, 0.27); }
  else if (vKind > 3.5) { dark = vec3(0.025, 0.021, 0.018); lit = vec3(0.17, 0.15, 0.13); }
  else if (vKind < 2.5) { dark = vec3(0.2, 0.2, 0.2);       lit = vec3(0.5, 0.5, 0.5); }
  else                  { dark = vec3(0.45, 0.47, 0.5);     lit = vec3(0.85, 0.87, 0.9); }
  vec3 col = mix(dark, lit, light);
  // dust billows start lit by the fire inside them
  if (vKind > 3.5) col += vec3(1.2, 0.42, 0.1) * (1.0 - vUv.y) * max(0.0, 1.0 - vT * 3.5) * 0.9;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class GpuParticles {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private head = 0;
  private dirtyMin = Infinity; private dirtyMax = -1;
  private readonly aOrigin: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly aTime: THREE.InstancedBufferAttribute;
  private readonly aShape: THREE.InstancedBufferAttribute;
  private readonly aParam: THREE.InstancedBufferAttribute;
  readonly uniforms: { uTime: { value: number }; uWind: { value: THREE.Vector3 }; uNoise: { value: THREE.Texture } };

  constructor(max: number, frag: string, noise: THREE.Texture, wind: THREE.Vector3, fire: boolean) {
    this.max = max;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position'));
    const attr = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aOrigin = attr(3); this.aVel = attr(3); this.aTime = attr(4); this.aShape = attr(4); this.aParam = attr(2);
    for (let i = 0; i < max; i++) { this.aTime.array[i * 4] = -1e6; this.aTime.array[i * 4 + 1] = 1; }
    geo.setAttribute('aOrigin', this.aOrigin); geo.setAttribute('aVel', this.aVel); geo.setAttribute('aTime', this.aTime);
    geo.setAttribute('aShape', this.aShape); geo.setAttribute('aParam', this.aParam);
    geo.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: wind }, uNoise: { value: noise } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms: this.uniforms, defines: fire ? { FIRE: 1 } : {},
      transparent: true, depthWrite: false, depthTest: true,
      // premultiplied alpha: rgb is added light, alpha is how much of what's behind gets covered
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = fire ? 9 : 8;
  }

  emit(kind: number, e: Emit) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    const o = this.aOrigin.array as Float32Array, v = this.aVel.array as Float32Array, t = this.aTime.array as Float32Array;
    const sh = this.aShape.array as Float32Array, pa = this.aParam.array as Float32Array;
    o[i * 3] = e.x; o[i * 3 + 1] = e.y; o[i * 3 + 2] = e.z;
    v[i * 3] = e.vx ?? 0; v[i * 3 + 1] = e.vy ?? 0; v[i * 3 + 2] = e.vz ?? 0;
    t[i * 4] = this.uniforms.uTime.value; t[i * 4 + 1] = Math.max(0.01, e.life); t[i * 4 + 2] = Math.random(); t[i * 4 + 3] = kind;
    sh[i * 4] = e.s0; sh[i * 4 + 1] = e.s1; sh[i * 4 + 2] = e.rise ?? 0; sh[i * 4 + 3] = e.drag ?? 0;
    pa[i * 2] = e.i ?? 1; pa[i * 2 + 1] = e.spin ?? (Math.random() - 0.5) * 0.6;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
  }

  /** Upload only the slots written this frame. */
  flush() {
    if (this.dirtyMax < 0) return;
    const lo = this.dirtyMin, n = this.dirtyMax - lo + 1;
    for (const a of [this.aOrigin, this.aVel, this.aTime, this.aShape, this.aParam]) {
      a.clearUpdateRanges(); a.addUpdateRange(lo * a.itemSize, n * a.itemSize); a.needsUpdate = true;
    }
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }

  clear() {
    const t = this.aTime.array as Float32Array;
    for (let i = 0; i < this.max; i++) t[i * 4] = -1e6;
    this.dirtyMin = 0; this.dirtyMax = this.max - 1;
  }
}

const R = () => Math.random() - 0.5;

/** A flamethrower (or cook-off) stream: emits jet particles from `o` along `d` for `dur` seconds. */
interface Stream {
  o: THREE.Vector3; d: THREE.Vector3; len: number; t: number; dur: number; acc: number; scale: number;
  /** Where the fuel lands (flames lick up there for a moment); null for streams into the air. */
  hit: THREE.Vector3 | null;
}

export class FireSmokeFX {
  private readonly fire: GpuParticles;
  private readonly smokeSys: GpuParticles;
  private readonly wind = new THREE.Vector3(0.25, 0, 0.12);
  private time = 0;
  private streams: Stream[] = [];

  constructor(scene: THREE.Scene) {
    const noise = makeNoiseTexture();
    this.fire = new GpuParticles(2048, FIRE_FRAG, noise, this.wind, true);
    this.smokeSys = new GpuParticles(3072, SMOKE_FRAG, noise, this.wind, false);
    scene.add(this.smokeSys.mesh, this.fire.mesh);
  }

  update(dt: number) {
    this.time += dt;
    // slowly shifting breeze shared by every particle
    this.wind.set(0.45 + Math.sin(this.time * 0.07) * 0.15, 0, 0.2 + Math.cos(this.time * 0.05) * 0.12);
    this.fire.uniforms.uTime.value = this.smokeSys.uniforms.uTime.value = this.time;
    for (let i = this.streams.length - 1; i >= 0; i--) if (!this.stepStream(this.streams[i]!, dt)) this.streams.splice(i, 1);
    this.fire.flush(); this.smokeSys.flush();
  }

  clear() { this.fire.clear(); this.smokeSys.clear(); this.streams = []; }

  // ---------------------------------------------------------------- primitives

  flameAt(kind: FireKind, e: Emit) { this.fire.emit(FIRE_K[kind], e); }
  smokeAt(kind: SmokeKind, e: Emit) { this.smokeSys.emit(SMOKE_K[kind], e); }

  flash(x: number, y: number, z: number, size: number, i = 1) {
    this.fire.emit(3, { x, y, z, life: 0.16 + size * 0.02, s0: size * 0.6, s1: size * 1.3, i });
  }

  /** One rolling fireball thrown out at `speed`. */
  fireball(x: number, y: number, z: number, size: number, speed: number) {
    const a = Math.random() * Math.PI * 2, h = speed * (0.3 + Math.random() * 0.6);
    this.fire.emit(1, {
      x: x + R() * size * 0.3, y: y + Math.random() * size * 0.2, z: z + R() * size * 0.3,
      vx: Math.cos(a) * h, vy: speed * (0.4 + Math.random() * 0.8), vz: Math.sin(a) * h,
      life: 0.55 + Math.random() * 0.35 + size * 0.08, s0: size * 0.55, s1: size * (1.3 + Math.random() * 0.6), rise: 0.8, drag: 3.2,
      i: 0.9 + Math.random() * 0.3, spin: R() * 1.5
    });
  }

  embers(x: number, y: number, z: number, n: number, power: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, h = power * (0.4 + Math.random());
      this.fire.emit(2, {
        x, y, z, vx: Math.cos(a) * h, vy: power * (0.6 + Math.random() * 1.2), vz: Math.sin(a) * h,
        life: 0.5 + Math.random() * 0.9, s0: 0.07 + Math.random() * 0.06, s1: 0.03, rise: -5, drag: 1.2, i: 0.8 + Math.random() * 0.4
      });
    }
  }

  /** One flickering tongue of flame standing on (x, y, z). */
  tongue(x: number, y: number, z: number, size: number, life = 0.7 + Math.random() * 0.5) {
    this.fire.emit(0, { x, y, z, vy: 0.25 + Math.random() * 0.3, life, s0: size * 0.75, s1: size * (0.9 + Math.random() * 0.3), rise: 0.4, i: 0.85 + Math.random() * 0.3 });
  }

  /** A standing flame of the given shape (tongue / lick / sheet / flicker / lean) on (x, y, z). */
  flame(shape: FlameShape, x: number, y: number, z: number, size: number, life = 0.6 + Math.random() * 0.5, i = 0.85 + Math.random() * 0.3) {
    this.fire.emit(FIRE_K[shape], { x, y, z, vy: 0.2 + Math.random() * 0.25, life, s0: size * 0.75, s1: size * (0.9 + Math.random() * 0.3), rise: 0.35, i });
  }

  // ---------------------------------------------------------------- flamethrowers

  /**
   * Flamethrower burst from `from` toward `to` (Firebat, Hellbat, Hellion). Burning fuel streams out as a narrow, white-hot
   * jet that billows out into rolling orange flame and dark soot as it slows; where it lands, flames lick up off the ground.
   * `reach` stretches the stream past the target (the Hellion's line of fire).
   */
  flamethrower(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, scale = 1, dur = 0.38, reach = 1.1) {
    const d = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const len = Math.max(0.6, d.length() * reach);
    d.normalize();
    const hit = new THREE.Vector3(from.x, from.y, from.z).addScaledVector(d, len);
    hit.y = Math.min(hit.y, to.y);
    this.streams.push({ o: new THREE.Vector3(from.x, from.y, from.z), d, len, t: 0, dur, acc: 0, scale, hit });
    this.flash(from.x, from.y, from.z, 0.45 * scale, 0.8);
  }

  /** A column of fire roaring straight up out of a hatch for `dur` seconds (ammunition cooking off in a wrecked vehicle). */
  fireColumn(x: number, y: number, z: number, height: number, scale = 1, dur = 0.7) {
    this.streams.push({ o: new THREE.Vector3(x, y, z), d: new THREE.Vector3(R() * 0.15, 1, R() * 0.15).normalize(), len: height, t: 0, dur, acc: 0, scale, hit: null });
  }

  private stepStream(st: Stream, dt: number): boolean {
    st.t += dt; st.acc += dt;
    const rate = 1 / 75;      // jet particles per second of stream
    // a particle launched at speed v with drag k travels v (1 - e^-kL) / k in its life L: pick v so the stream reaches `len`
    const life = 0.36 + st.len * 0.025, drag = 2.4, reachK = (1 - Math.exp(-drag * life)) / drag;
    const v = st.len / reachK;
    const side = new THREE.Vector3(-st.d.z, 0, st.d.x);
    while (st.acc >= rate) {
      st.acc -= rate;
      const j = 0.06 * v;
      this.fire.emit(7, {
        x: st.o.x + R() * 0.05, y: st.o.y + R() * 0.05, z: st.o.z + R() * 0.05,
        vx: st.d.x * v + R() * j, vy: st.d.y * v + R() * j * 0.6, vz: st.d.z * v + R() * j,
        life: life * (0.85 + Math.random() * 0.3), s0: 0.15 * st.scale, s1: (1.25 + Math.random() * 0.55) * st.scale * (0.8 + st.len * 0.07),
        rise: 1.8, drag, i: 0.6 + Math.random() * 0.25, spin: R() * 2
      });
    }
    // fuel splashing down around the target: rolling fireballs, flames licking up off the ground, soot
    if (st.hit && st.t > 0.12 && Math.random() < dt * 22) {
      const h = st.hit, s = st.scale;
      const ox = R() * 0.7 * s + side.x * R() * 0.6 * s, oz = R() * 0.7 * s + side.z * R() * 0.6 * s;
      if (Math.random() < 0.55) this.flame(Math.random() < 0.5 ? 'lick' : Math.random() < 0.5 ? 'tongue' : 'flicker', h.x + ox, h.y - 0.4, h.z + oz, (0.7 + Math.random() * 0.45) * s, 0.5 + Math.random() * 0.35);
      else this.fireball(h.x + ox, h.y - 0.1, h.z + oz, 0.6 * s, 0.9);
      if (Math.random() < 0.35) this.smokeSys.emit(0, { x: h.x + ox, y: h.y + 0.3, z: h.z + oz, vx: R() * 0.3, vy: 1.0 + Math.random() * 0.6, vz: R() * 0.3, life: 1.3 + Math.random() * 0.7, s0: 0.35 * s, s1: 1.3 * s, rise: 0.2, drag: 0.8, i: 0.45 });
    }
    if (!st.hit && Math.random() < dt * 10) this.embers(st.o.x, st.o.y + st.len * 0.5, st.o.z, 1, 2.5);
    return st.t < st.dur;
  }

  // ---------------------------------------------------------------- guns

  /**
   * Cannon muzzle blast (Siege Tank, Thor's Hammer, Planetary Fortress): a white flash, a tight ball of fire punched out along
   * the barrel, two side jets from the muzzle brake, a few sparks and a lingering grey smoke ring. `dir` is the firing direction.
   * With `ground` set, the blast also kicks a ring of dust off the ground under the barrel.
   */
  muzzleBlast(x: number, y: number, z: number, dir: { x: number; y: number; z: number }, scale = 1, ground?: number) {
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    this.flash(x + d.x * 0.25 * scale, y + d.y * 0.25 * scale, z + d.z * 0.25 * scale, 1.3 * scale, 1.5);
    // forward fireball: fast, but air drag stops it within a barrel length or two
    for (let k = 0; k < 5; k++) {
      const v = (7 + Math.random() * 5) * scale;
      this.fire.emit(1, {
        x, y, z, vx: d.x * v + R() * 1.4 * scale, vy: d.y * v + R() * 1.0 * scale, vz: d.z * v + R() * 1.4 * scale,
        life: 0.22 + Math.random() * 0.14, s0: 0.22 * scale, s1: (0.55 + Math.random() * 0.25) * scale, rise: 0.5, drag: 10, i: 1.2, spin: R() * 3
      });
    }
    // muzzle-brake side jets
    for (const sg of [-1, 1]) for (let k = 0; k < 2; k++) {
      const v = (4.5 + Math.random() * 2) * scale;
      this.fire.emit(1, {
        x: x - d.x * 0.08, y, z: z - d.z * 0.08, vx: side.x * sg * v + d.x * 1.5, vy: R() * 0.8, vz: side.z * sg * v + d.z * 1.5,
        life: 0.16 + Math.random() * 0.08, s0: 0.12 * scale, s1: 0.32 * scale, rise: 0.3, drag: 12, i: 1.1
      });
    }
    this.embers(x + d.x * 0.3, y, z + d.z * 0.3, 3, 2.2 * scale);
    // smoke: a ring pushed forward that hangs in the air and drifts
    for (let k = 0; k < 5; k++) {
      const v = (1.6 + Math.random() * 2.2) * scale;
      this.smokeSys.emit(1, {
        x: x + d.x * 0.3 * scale, y, z: z + d.z * 0.3 * scale, vx: d.x * v + R() * 0.8, vy: d.y * v + 0.25 + Math.random() * 0.3, vz: d.z * v + R() * 0.8,
        life: 1.4 + Math.random() * 1.0, s0: 0.3 * scale, s1: (1.2 + Math.random() * 0.6) * scale, rise: 0.15, drag: 2.2, i: 0.42
      });
    }
    if (ground !== undefined && y - ground < 2.5) this.dustRing(x + d.x * 0.8 * scale, ground + 0.15, z + d.z * 0.8 * scale, 0.9 * scale, 6);
  }

  /** Small launch puff (rocket backblast, grenade launcher). */
  launchPuff(x: number, y: number, z: number, dir: { x: number; y: number; z: number }, scale = 1) {
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    this.flash(x, y, z, 0.6 * scale, 0.9);
    for (let k = 0; k < 3; k++) {
      const v = 1 + Math.random() * 1.5;
      this.smokeSys.emit(1, { x, y, z, vx: -d.x * v + R() * 0.6, vy: 0.3 + Math.random() * 0.4, vz: -d.z * v + R() * 0.6, life: 0.9 + Math.random() * 0.6, s0: 0.2 * scale, s1: 0.9 * scale, rise: 0.1, drag: 2.5, i: 0.38 });
    }
  }

  /** Dust thrown outward along the ground (shell impacts, muzzle blast overpressure, collapsing structures). */
  dustRing(x: number, y: number, z: number, scale: number, n = 8) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6, v = (2.2 + Math.random() * 1.6) * scale;
      this.smokeSys.emit(1, {
        x: x + Math.cos(a) * 0.3 * scale, y, z: z + Math.sin(a) * 0.3 * scale, vx: Math.cos(a) * v, vy: 0.2 + Math.random() * 0.4, vz: Math.sin(a) * v,
        life: 1.5 + Math.random() * 1.0, s0: 0.4 * scale, s1: (1.4 + Math.random() * 0.6) * scale, rise: 0.12, drag: 2.0, i: 0.5
      });
    }
  }

  /**
   * Shell / grenade hitting the ground: the explosion, a ring of dust thrown out along the ground and dirt-dark smoke.
   * `groundY` is the terrain under the hit; the blast centres on it so the fire rises up off the ground.
   */
  groundBlast(x: number, groundY: number, z: number, scale: number) {
    this.explosion(x, groundY + 0.15 * scale, z, scale);
    this.dustRing(x, groundY + 0.1, z, scale * 0.8, Math.min(10, Math.round(5 + 2 * scale)));
    // fire jets thrown up and out of the crater
    for (let k = 0; k < Math.min(5, Math.round(1 + scale * 1.5)); k++) {
      const a = Math.random() * Math.PI * 2, h = (1 + Math.random() * 1.5) * scale;
      this.fire.emit(1, {
        x, y: groundY + 0.1, z, vx: Math.cos(a) * h, vy: (3.5 + Math.random() * 2.5) * scale, vz: Math.sin(a) * h,
        life: 0.35 + Math.random() * 0.2, s0: 0.2 * scale, s1: 0.55 * scale, rise: -2, drag: 4, i: 1.1, spin: R() * 2
      });
    }
  }

  // ---------------------------------------------------------------- presets

  /** Explosion: flash, rolling fireballs, embers, a dust billow that starts fire-lit, and black smoke for big blasts. */
  explosion(x: number, y: number, z: number, scale: number) {
    this.flash(x, y + 0.2, z, 1.8 * scale);
    const nf = Math.min(10, Math.round(3 + 2.5 * scale));
    for (let k = 0; k < nf; k++) this.fireball(x, y, z, scale * (0.6 + Math.random() * 0.5), 1.6 + 1.6 * scale);
    this.embers(x, y + 0.2, z, Math.min(14, Math.round(4 + 4 * scale)), 2.5 + 2 * scale);
    const ns = Math.min(6, Math.round(1 + 2 * scale));
    for (let k = 0; k < ns; k++) {
      this.smokeSys.emit(4, {
        x: x + R() * scale * 0.6, y: y + 0.2 + Math.random() * 0.3 * scale, z: z + R() * scale * 0.6,
        vx: R() * 1.2 * scale, vy: 0.6 + Math.random() * 0.8 * scale, vz: R() * 1.2 * scale,
        life: 2.0 + Math.random() * 1.2 + scale * 0.3, s0: 0.8 * scale, s1: (2.3 + Math.random() * 0.9) * scale, rise: 0.25, drag: 1.4, i: 0.95
      });
    }
    if (scale >= 1.4) for (let k = 0; k < 2; k++) {
      this.smokeSys.emit(0, {
        x: x + R() * scale * 0.4, y: y + 0.6 * scale, z: z + R() * scale * 0.4, vx: R() * 0.4, vy: 1.0 + Math.random() * 0.6, vz: R() * 0.4,
        life: 2.6 + Math.random(), s0: 0.6 * scale, s1: 2.2 * scale, rise: 0.15, drag: 0.6, i: 0.7
      });
    }
  }

  /** Thick smoke column puff (burning building / wreck). `black` for oily fires, otherwise grey. */
  column(x: number, y: number, z: number, size: number, black: boolean, opacity = 0.7) {
    this.smokeSys.emit(black ? 0 : 1, {
      x: x + R() * 0.3, y, z: z + R() * 0.3, vx: R() * 0.3, vy: 1.6 + Math.random() * 0.6, vz: R() * 0.3,
      life: 3.6 + Math.random() * 1.6, s0: size * 0.5, s1: size * (2.0 + Math.random() * 0.6), rise: 0.25, drag: 0.25, i: Math.min(1, opacity * 1.2)
    });
  }

  /** Thin smoke: vents, chimneys, light damage, rocket trails. */
  wisp(x: number, y: number, z: number, size: number, life = 1.4, opacity = 0.55, vy = 0.9) {
    this.smokeSys.emit(2, {
      x, y, z, vx: R() * 0.25, vy: vy * (0.8 + Math.random() * 0.4), vz: R() * 0.25,
      life: life * (0.8 + Math.random() * 0.4), s0: size * 0.35, s1: size, rise: 0.1, drag: 0.8, i: opacity
    });
  }

  steam(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number) {
    this.smokeSys.emit(3, { x, y, z, vx, vy, vz, life, s0: size * 0.25, s1: size, rise: 0.2, drag: 1.0, i: 0.6 });
  }
}
