import * as THREE from 'three';
import { modelFactory } from '../graphics/ModelFactory';
import { riggedModelsReady } from '../graphics/RiggedModels';
import type { UnitType, BuildingType } from '../types';

/**
 * SC2-style selection bar art: a static green hologram outline of the unit's real 3D model (tinted by health), and the HTML
 * for the single-unit / structure / multi-select layouts. Icons are rendered once per type on a shared WebGL renderer
 * (lit silhouette + silhouette mask), then tinted and outlined on a 2D canvas; cached as data URLs.
 */
const S = 192;
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const base = new Map<string, { shade: HTMLCanvasElement; mask: HTMLCanvasElement } | null>();
const tinted = new Map<string, string>();

export type Tint = 'green' | 'yellow' | 'red' | 'orange';
const TINT: Record<Tint, { fill: string; edge: string }> = {
  green: { fill: '#1fae2a', edge: '#7dff6a' },
  yellow: { fill: '#b3a21a', edge: '#fff04a' },
  red: { fill: '#b32a1a', edge: '#ff6a4a' },
  orange: { fill: '#b8641a', edge: '#ffae4a' },
};
export const hpTint = (frac: number): Tint => frac > 0.66 ? 'green' : frac > 0.33 ? 'yellow' : 'red';

function grab(r: THREE.WebGLRenderer): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  c.getContext('2d')!.drawImage(r.domElement, 0, 0); return c;
}

function baseFor(type: string, isBuilding: boolean) {
  const key = `${isBuilding ? 'b' : 'u'}|${type}`;
  if (base.has(key)) return base.get(key)!;
  if (failed || !riggedModelsReady()) return null;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(S, S, false); renderer.setClearColor(0x000000, 0);
    }
    const holder = isBuilding ? modelFactory.createBuildingModel(type as BuildingType, true) : modelFactory.createUnitModel(type as UnitType, true);
    const rig = holder.userData.rigged as { mixer?: THREE.AnimationMixer; clips?: Record<string, THREE.AnimationClip> } | undefined;
    if (rig?.mixer && rig.clips) {
      const names = Object.keys(rig.clips);
      const n = names.find(k => /stand|idle/i.test(k)) ?? names[0];
      if (n) { rig.mixer.clipAction(rig.clips[n]!).play(); rig.mixer.update(0.01); }
    }
    holder.rotation.y += -0.6;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(-5, 8, 7); sc.add(sun);
    sc.add(holder); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const rad = Math.max(0.5, sz.length() * 0.5);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
    const d = rad / Math.sin(THREE.MathUtils.degToRad(14)) * 0.9;
    cam.position.set(c.x + d * 0.5, c.y + d * 0.42, c.z + d * 0.76); cam.lookAt(c);
    sc.overrideMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    renderer.render(sc, cam); const shade = grab(renderer);
    sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    renderer.render(sc, cam); const mask = grab(renderer);
    const out = { shade, mask }; base.set(key, out); return out;
  } catch { failed = true; return null; }
}

/** Data URL of the outline icon ('' while the models are not ready). */
export function wireIcon(type: string, isBuilding: boolean, tint: Tint): string {
  const k = `${isBuilding ? 'b' : 'u'}|${type}|${tint}`;
  const hit = tinted.get(k); if (hit) return hit;
  const b = baseFor(type, isBuilding); if (!b) return '';
  const col = TINT[tint];
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!;
  // body: tinted shading, clipped to the silhouette
  g.fillStyle = col.fill; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply'; g.drawImage(b.shade, 0, 0);
  g.globalCompositeOperation = 'lighten'; g.globalAlpha = 0.35; g.fillStyle = col.fill; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in'; g.drawImage(b.mask, 0, 0);
  // bright outline: dilated silhouette minus silhouette
  const ring = document.createElement('canvas'); ring.width = S; ring.height = S;
  const rg = ring.getContext('2d')!;
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; rg.drawImage(b.mask, Math.cos(t) * 2.2, Math.sin(t) * 2.2); }
  rg.globalCompositeOperation = 'source-in'; rg.fillStyle = col.edge; rg.fillRect(0, 0, S, S);
  rg.globalCompositeOperation = 'destination-out'; rg.drawImage(b.mask, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.drawImage(ring, 0, 0);
  const url = cv.toDataURL('image/png'); tinted.set(k, url); return url;
}
