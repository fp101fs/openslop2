import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ModelFactory } from '../graphics/ModelFactory';
import { loadRigged, buildRigged } from '../graphics/RiggedModels';

/** Dev-only turntable: /dev/zerg-preview.html. Zerglings, Hydralisks, Drones, Roaches, Larva and Eggs for both teams, lit like the game.
 *  ?yaw=deg&zoom=k&top=1&only=roach,drone,larva,egg&tex=hydralisk|roach|larva|egg */
const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true });
r.setPixelRatio(devicePixelRatio); r.setSize(innerWidth, innerHeight);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x45484e);
const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3;
scene.add(new THREE.AmbientLight(0xdde8d5, 0.75), new THREE.HemisphereLight(0xb4d4ff, 0x6f8a3a, 0.85));
const sun = new THREE.DirectionalLight(0xffe6bd, 2.1); sun.position.set(40, 70, 30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);
const fill = new THREE.DirectionalLight(0x7da4e8, 0.7); fill.position.set(-30, 20, -30); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x5a5d63, roughness: 0.8, metalness: 0.2 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

await loadRigged(['hydralisk', 'drone', 'roach', 'larva', 'egg']);
const mf = new ModelFactory();
const yaw = (+(q.get('yaw') ?? 30)) * Math.PI / 180;
const units: THREE.Object3D[] = [];
const only = q.get('only')?.split(',');
type Kind = 'zergling' | 'hydralisk' | 'drone' | 'roach' | 'larva' | 'egg';
const place = (type: Kind, isPlayer: boolean, x: number, z: number) => {
  if (only && !only.includes(type)) return;
  const m = mf.createUnitModel(type, isPlayer); m.position.set(x, 0, z); m.rotation.y = yaw;
  m.traverse(o => { o.castShadow = true; }); scene.add(m); units.push(m);
};
place('zergling', true, -2.4, 0.6); place('zergling', false, -0.8, 0.6);
place('hydralisk', true, 0.9, 0); place('hydralisk', false, 2.7, 0);
if (only) { // a closer pair per kind, side by side
  units.forEach(u => scene.remove(u)); units.length = 0;
  const kinds = only as Kind[], n = kinds.length * 2;
  kinds.forEach((k, i) => { place(k, true, (i * 2 - (n - 1) / 2) * 2.2, 0); place(k, false, (i * 2 + 1 - (n - 1) / 2) * 2.2, 0); });
}

const zoom = +(q.get('zoom') ?? 1);
const cam = new THREE.PerspectiveCamera(q.get('top') ? 40 : 35, innerWidth / innerHeight, 0.1, 100);
if (q.get('top')) cam.position.set(0, 9 / zoom, 6 / zoom); else cam.position.set(0, 4.2 / zoom, 7.5 / zoom);
cam.lookAt(0, 0.6, 0);
(window as any).preview = { scene, units, cam, r };
r.setAnimationLoop(() => r.render(scene, cam));
if (q.get('tex')) { // ?tex=1 (or =roach / larva / egg): show the repainted texture and its carapace mask
  const { getTeamMaskMap } = await import('../graphics/TeamColor');
  let mat: THREE.MeshStandardMaterial | undefined;
  buildRigged((['roach', 'larva', 'egg'] as const).find(k => k === q.get('tex')) ?? 'hydralisk')!.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.map) mat = m; });
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;inset:0;display:flex;gap:4px;background:#000';
  for (const c of [mat!.map!.image, getTeamMaskMap(mat!)?.image] as (HTMLCanvasElement | undefined)[]) if (c) { c.style.cssText = 'height:100vh;width:auto'; box.appendChild(c); }
  document.body.appendChild(box);
}
