import * as THREE from 'three';
import { setTeamMaskMap } from './TeamColor';

/**
 * Repaints a hand-painted green Zerg texture (models/hydralisk.glb) into the dark purple / maroon hide used by the Zerg here,
 * keeps bone (fangs, scythes, spines) ivory, and builds a carapace mask (the bright armour plates) that TeamColor paints in the
 * owner's colour. Done once per texture on a canvas at load time; the GLB is untouched.
 */
const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

const col = new THREE.Color();
/** sRGB 0..1 from hsl */
const fromHsl = (h: number, s: number, l: number) => { col.setHSL(h, s, l, THREE.NoColorSpace); return col; };


/** Per-texel repaint: source sRGB 0..1 (+ the geometry pass's up / bone weights, if the profile has one) -> new sRGB colour + team mask weight. */
type Paint = (r: number, g: number, b: number, up: number, bone: number) => [number, number, number, number];
/** Geometry pass for textures that carry no shell / flesh split of their own: per bind-pose triangle (centroid, face normal) -> [up, bone], 0..1. */
type GeoPass = (c: THREE.Vector3, n: THREE.Vector3) => [number, number];
const out: [number, number, number, number] = [0, 0, 0, 0];
const blend = (layers: [number, number, number, number][]) => { // [h, s, l, weight]
  out[0] = out[1] = out[2] = 0;
  for (const [h, s, l, w] of layers) { if (w <= 0) continue; const c = fromHsl(h, s, l); out[0] += c.r * w; out[1] += c.g * w; out[2] += c.b * w; }
};

export type ZergSkinProfile = 'hydralisk' | 'roach' | 'larva' | 'egg';

const PROFILES: Record<ZergSkinProfile, Paint> = {
  /** models/hydralisk.glb: green painted hide, grey-green hood plates, yellowish bone. Plates -> team mask. */
  hydralisk: (r, g, b) => {
    const [hh, ss, ll] = hsl(r, g, b);
    // pale, greyish texels are either bone (fangs, scythes, spines: yellowish or very bright) or the grey-green hood / back plates
    const pale = sstep(0.27, 0.42, ll) * (1 - sstep(0.2, 0.36, ss));
    const boneish = Math.max(1 - sstep(0.175, 0.2, hh), sstep(0.46, 0.56, ll));
    const bone = pale * boneish;
    // carapace: the saturated green armour plates, plus the pale grey-green hood plates
    const green = sstep(0.17, 0.22, hh) * (1 - sstep(0.44, 0.5, hh));
    const plate = pale * (1 - boneish) * green * sstep(0.12, 0.17, ss);
    const shell = Math.max(green * sstep(0.24, 0.38, ss) * sstep(0.1, 0.2, ll), plate) * (1 - bone);
    const flesh = Math.max(0, 1 - bone - shell);
    blend([
      // hide: deep maroon in the creases rising to dark purple on the lit folds
      [0.93 - 0.13 * sstep(0.08, 0.35, ll), 0.36, Math.min(0.36, ll * 0.7), flesh],
      // carapace base (what menus show; TeamColor repaints it in the owner's colour by luminance)
      [0.78, 0.45, Math.min(0.62, ll * 1.25), shell],
      // bone: warm ivory, a touch darker than the source
      [0.09, 0.2 + 0.1 * (1 - ll), Math.min(0.85, ll * 1.2), bone]
    ]);
    return [out[0], out[1], out[2], Math.min(1, shell * 1.7)];
  },
  /** models/roach.glb: olive-brown shell, purple flesh and side blades, pale grey spines / fans / teeth (and a grey unused background).
   *  Shell -> bronze-tan bone, flesh -> team mask (dark maroon where the mask is cut off by height), spines -> ivory. */
  roach: (r, g, b) => {
    const [hh, ss, ll] = hsl(r, g, b);
    const purple = sstep(0.62, 0.7, hh) * (1 - sstep(0.97, 0.995, hh)) * sstep(0.06, 0.14, ss);
    const pale = (1 - sstep(0.1, 0.2, ss)) * sstep(0.38, 0.5, ll) * (1 - purple);
    const shell = Math.max(0, 1 - purple - pale);
    blend([
      // flesh: maroon-purple hide (TeamColor paints the masked part)
      [0.9 - 0.08 * sstep(0.15, 0.5, ll), 0.42, Math.min(0.34, ll * 0.62), purple],
      // shell: bronze / tan bone, lighter than the olive source
      [0.08 + 0.015 * ll, 0.4, Math.min(0.58, 0.03 + Math.pow(ll, 1.15) * 1.1), shell],
      // spines, fans, teeth: ivory
      [0.1, 0.22, Math.min(0.86, ll * 1.15), pale]
    ]);
    return [out[0], out[1], out[2], Math.min(0.85, purple * 1.2)];
  },
  /** models/larva.glb: one pale, veined grub texture (no shell / flesh split), so the geometry pass decides: upward-facing back ->
   *  bronze-tan shell with the team mask along the spine, flanks and belly -> maroon-purple flesh, tusks -> ivory, eye stays dark. */
  larva: (r, g, b, up, bone) => {
    const [, , ll] = hsl(r, g, b);
    const f = ll / 0.8; // texture is ~0.8 light; the veins (~0.45) become the creases
    const eye = 1 - sstep(0.12, 0.3, ll);
    const shell = sstep(0.34, 0.54, up) * (1 - bone) * (1 - eye);
    const flesh = Math.max(0, 1 - shell - bone) * (1 - eye);
    blend([
      [0.9 - 0.04 * f, 0.42, Math.min(0.36, 0.27 * Math.pow(f, 1.6)), flesh],
      [0.075, 0.42, Math.min(0.56, 0.44 * Math.pow(f, 1.8)), shell],
      [0.1, 0.22, Math.min(0.86, 0.78 * f), bone * (1 - eye)],
      [0.0, 0.5, ll * 0.6, eye]
    ]);
    return [out[0], out[1], out[2], Math.min(1, sstep(0.8, 0.93, up) * shell * 1.3)];
  },
  /** models/egg.glb: green glowing sacs in a brown shell / spike cage, purple root membrane. Sacs -> team mask, brown -> bronze-tan,
   *  purple -> maroon hide. */
  egg: (r, g, b) => {
    const [hh, ss, ll] = hsl(r, g, b);
    const sac = sstep(0.13, 0.16, hh) * (1 - sstep(0.4, 0.5, hh)) * sstep(0.45, 0.6, ss) * sstep(0.08, 0.17, ll);
    const purple = sstep(0.6, 0.7, hh) * (1 - sac);
    const shell = Math.max(0, 1 - sac - purple);
    blend([
      [0.9, 0.4, Math.min(0.32, ll * 2.4), purple],
      [0.075 + 0.02 * ll, 0.42, Math.min(0.62, 0.04 + ll * 1.25), shell],
      [0.78, 0.5, Math.min(0.66, ll * 1.9), sac]
    ]);
    return [out[0], out[1], out[2], Math.min(1, sac * 1.3)];
  }
};

/** Profiles whose split comes from the mesh rather than the texture. */
const GEO: Partial<Record<ZergSkinProfile, GeoPass>> = {
  // bind pose: local +y is up, the head (with the two downward tusks) at +x
  larva: (c, n) => [n.y * 0.5 + 0.5, c.x > 15.2 && c.y < -1.9 ? 1 : 0]
};

export interface ZergSkinResult { map: THREE.Texture; mask: THREE.Texture; mapCanvas: HTMLCanvasElement; maskCanvas: HTMLCanvasElement }

const cache = new Map<string, ZergSkinResult>();

/** The mesh wearing the texture (bind pose), for the geometry pass and the optional height limit on the carapace mask:
 *  with `y`, triangles fade from no team colour at y0 to full at y1. */
export interface TeamHeight { geo: THREE.BufferGeometry; y?: [number, number] }

/** Rasterise every triangle's UV footprint with fill(centroid, normal) -> [r, g] (0..255 each), then blur a little. */
function geoCanvas(geo: THREE.BufferGeometry, w: number, h: number, pass: GeoPass): Uint8ClampedArray | null {
  const pos = geo.attributes.position!, uv = geo.attributes.uv, idx = geo.index;
  if (!uv) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'rgb(128,0,0)'; ctx.fillRect(0, 0, w, h); ctx.lineWidth = 2; ctx.lineJoin = 'round';
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ctr = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  const tris: [number, number, number, number, number][] = [];
  const cnt = idx ? idx.count : pos.count;
  for (let t = 0; t < cnt; t += 3) {
    const i = idx ? idx.getX(t) : t, j = idx ? idx.getX(t + 1) : t + 1, k = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j); c.fromBufferAttribute(pos, k);
    n.subVectors(c, b).cross(e.subVectors(a, b)).normalize();
    ctr.copy(a).add(b).add(c).divideScalar(3);
    const [p, q] = pass(ctr, n);
    tris.push([i, j, k, Math.round(p * 255), Math.round(q * 255)]);
  }
  tris.sort((x, y) => x[4] - y[4]); // flagged (bone) triangles last, so they win shared texels
  for (const [i, j, k, p, q] of tris) {
    ctx.fillStyle = ctx.strokeStyle = `rgb(${p},${q},0)`;
    ctx.beginPath();
    ctx.moveTo(uv.getX(i) * w, uv.getY(i) * h); ctx.lineTo(uv.getX(j) * w, uv.getY(j) * h); ctx.lineTo(uv.getX(k) * w, uv.getY(k) * h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
  const sctx = soft.getContext('2d', { willReadFrequently: true })!; sctx.filter = `blur(${Math.max(1, Math.round(w / 200))}px)`; sctx.drawImage(cv, 0, 0);
  return sctx.getImageData(0, 0, w, h).data;
}

export function zergSkin(tex: THREE.Texture, limit?: TeamHeight, profile: ZergSkinProfile = 'hydralisk'): ZergSkinResult | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width) return null;
  const hit = cache.get(tex.uuid);
  if (hit) return hit;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h), px = data.data;
  const mcv = document.createElement('canvas'); mcv.width = w; mcv.height = h;
  const mctx = mcv.getContext('2d', { willReadFrequently: true })!;
  const mdata = mctx.createImageData(w, h), mp = mdata.data;

  const paint = PROFILES[profile], gp = GEO[profile];
  const region = gp && limit ? geoCanvas(limit.geo, w, h, gp) : null;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, m] = paint(px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255, region ? region[i]! / 255 : 0.5, region ? region[i + 1]! / 255 : 0);
    px[i] = Math.round(r * 255); px[i + 1] = Math.round(g * 255); px[i + 2] = Math.round(b * 255);
    const mm = Math.round(m * 255);
    mp[i] = mm; mp[i + 1] = mm; mp[i + 2] = mm; mp[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  mctx.putImageData(mdata, 0, 0);
  if (limit?.y) {
    // keep the colour on the upper body: darken each triangle's UV footprint by its rest-pose height (works however the mesh is
    // later posed, re-centred or cut up)
    const pos = limit.geo.attributes.position!, uv = limit.geo.attributes.uv, idx = limit.geo.index;
    if (uv) {
      mctx.globalCompositeOperation = 'multiply'; mctx.lineWidth = 2; mctx.lineJoin = 'round';
      const n = idx ? idx.count : pos.count, [y0, y1] = limit.y;
      for (let t = 0; t < n; t += 3) {
        const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
        const k = Math.round(sstep(y0, y1, (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3) * 255);
        if (k === 255) continue;
        mctx.fillStyle = mctx.strokeStyle = `rgb(${k},${k},${k})`;
        mctx.beginPath();
        mctx.moveTo(uv.getX(a) * w, uv.getY(a) * h); mctx.lineTo(uv.getX(b) * w, uv.getY(b) * h); mctx.lineTo(uv.getX(c) * w, uv.getY(c) * h);
        mctx.closePath(); mctx.fill(); mctx.stroke();
      }
      mctx.globalCompositeOperation = 'source-over';
    }
  }
  // soften the mask so plate edges blend instead of speckling
  const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
  const sctx = soft.getContext('2d')!; sctx.filter = `blur(${Math.max(1, Math.round(w / 300))}px)`; sctx.drawImage(mcv, 0, 0);

  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel;
    t.colorSpace = srgb ? tex.colorSpace : THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  const res = { map: mk(cv, true), mask: mk(soft, false), mapCanvas: cv, maskCanvas: soft };
  cache.set(tex.uuid, res);
  return res;
}

/** Swap an (often unlit) textured material for a lit one wearing the repainted skin, with its carapace mask registered for TeamColor. */
/** Team-coloured glow on the masked area (TeamColor), for the egg's sacs. */
const GLOW: Partial<Record<ZergSkinProfile, number>> = { egg: 0.35 };

export function zergSkinMaterial(src: THREE.Material, limit?: TeamHeight, profile: ZergSkinProfile = 'hydralisk'): THREE.MeshStandardMaterial | null {
  const map = (src as THREE.MeshBasicMaterial).map;
  if (!map) return null;
  const skin = zergSkin(map, limit, profile);
  if (!skin) return null;
  const m = new THREE.MeshStandardMaterial({ map: skin.map, roughness: 0.58, metalness: 0.08, side: src.side, name: src.name + '_zerg' });
  const nm = (src as THREE.MeshStandardMaterial).normalMap;
  if (nm) { m.normalMap = nm; m.normalScale.copy((src as THREE.MeshStandardMaterial).normalScale); }
  m.userData.rigTuned = true;
  if (GLOW[profile]) m.userData.teamGlow = GLOW[profile];
  setTeamMaskMap(m, skin.mask);
  return m;
}
