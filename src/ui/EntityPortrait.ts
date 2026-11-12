import * as THREE from 'three';
import { modelFactory } from '../graphics/ModelFactory';
import { riggedModelsReady } from '../graphics/RiggedModels';
import type { UnitType, BuildingType } from '../types';

/**
 * Selection-panel portraits: a still of the unit / structure's real 3D model (3/4 view, whole model in frame, transparent
 * background), rendered once per (type, team) on one shared WebGL renderer and cached as a data URL. '' until the model is ready.
 */
const SIZE = 160;
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const cache = new Map<string, string>();

export function entityPortrait(type: string, isBuilding: boolean, isPlayer: boolean): string {
  const key = `${type}|${isPlayer ? 'p' : 'e'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (failed || !riggedModelsReady()) return '';
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.setPixelRatio(1);
      renderer.setSize(SIZE, SIZE, false);
      renderer.setClearColor(0x000000, 0);
    }
    const holder = isBuilding ? modelFactory.createBuildingModel(type as BuildingType, isPlayer) : modelFactory.createUnitModel(type as UnitType, isPlayer);
    const rig = holder.userData.rigged as { mixer?: THREE.AnimationMixer; clips?: Record<string, THREE.AnimationClip> } | undefined;
    if (rig?.mixer && rig.clips) {
      const names = Object.keys(rig.clips);
      const n = names.find(k => /stand|idle/i.test(k)) ?? names[0];
      if (n) { rig.mixer.clipAction(rig.clips[n]!).play(); rig.mixer.update(0.01); }
    }
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xbfd2ff, 0x3a3026, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0dc, 3.2); sun.position.set(-5, 8, 7); sc.add(sun);
    const rim = new THREE.DirectionalLight(0x7aa8ff, 2.2); rim.position.set(6, 4, -7); sc.add(rim);
    holder.rotation.y += -0.6;
    sc.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const r = Math.max(0.5, sz.length() * 0.5);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 500);
    const d = r / Math.sin(THREE.MathUtils.degToRad(14)) * 0.92;
    cam.position.set(c.x + d * 0.5, c.y + d * 0.38, c.z + d * 0.78);
    cam.lookAt(c);
    renderer.render(sc, cam);
    const url = renderer.domElement.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } catch {
    failed = true;
    return '';
  }
}
