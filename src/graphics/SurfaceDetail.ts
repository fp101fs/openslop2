import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Procedural panel-line / scratch / grime bump map applied to every model material for a less flat, less "toy" look. */
let tex: THREE.CanvasTexture | null = null;
function makeTex(): THREE.CanvasTexture {
  if (tex) return tex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  // mottled grime
  for (let i = 0; i < 900; i++) {
    const v = 110 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 9, 0, Math.PI * 2); g.fill();
  }
  // panel seams
  g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 2;
  for (const p of [64, 128, 192]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p + (p === 128 ? 20 : -10)); g.lineTo(S, p + (p === 128 ? 20 : -10)); g.stroke(); }
  // rivets
  g.fillStyle = 'rgba(210,210,210,0.9)';
  for (let x = 8; x < S; x += 32) for (const y of [6, 70, 134, 198]) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
  // scratches
  g.strokeStyle = 'rgba(220,220,220,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 60; i++) { const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 12); g.stroke(); }
  tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Neutral albedo "wear" map: grime, dark panel lines, lighter worn edges, stains. Multiplies the material colour. */
let colorTex: THREE.CanvasTexture | null = null;
function makeColorTex(): THREE.CanvasTexture {
  if (colorTex) return colorTex;
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 500; i++) { // grime blotches
    const v = 150 + Math.random() * 70;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.22)`;
    g.beginPath(); g.arc(8 + Math.random() * (S - 16), 8 + Math.random() * (S - 16), 3 + Math.random() * 14, 0, Math.PI * 2); g.fill();
  }
  // vertical rain streaks / stains
  for (let i = 0; i < 26; i++) {
    const x = 10 + Math.random() * (S - 20), y = 10 + Math.random() * (S - 60);
    const gr = g.createLinearGradient(0, y, 0, y + 30 + Math.random() * 50);
    gr.addColorStop(0, 'rgba(70,60,45,0.28)'); gr.addColorStop(1, 'rgba(70,60,45,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + Math.random() * 4, 80);
  }
  // dark panel lines (match the bump seams)
  g.strokeStyle = 'rgba(40,44,48,0.75)'; g.lineWidth = 1.5;
  for (const p of [64, 128, 192]) { const q = p + (p === 128 ? 20 : -10); g.beginPath(); g.moveTo(p, 6); g.lineTo(p, S - 6); g.moveTo(6, q); g.lineTo(S - 6, q); g.stroke(); }
  // inset panel rectangles
  g.strokeStyle = 'rgba(60,64,70,0.45)';
  for (let i = 0; i < 7; i++) g.strokeRect(10 + Math.random() * 150, 10 + Math.random() * 150, 30 + Math.random() * 60, 20 + Math.random() * 50);
  // worn bright edge on every face + dark corner soot
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
  // keep the very corners clean (meshes without UVs sample here)
  g.fillStyle = '#e4e4e4'; g.fillRect(0, S - 6, 6, 6);
  colorTex = new THREE.CanvasTexture(c);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.anisotropy = 8;
  return colorTex;
}

let hazardTex: THREE.CanvasTexture | null = null;
function makeHazardTex(): THREE.CanvasTexture {
  if (hazardTex) return hazardTex;
  const S = 64, c = document.createElement('canvas');
  c.width = S; c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2d30'; g.fillRect(0, 0, S, 16);
  g.fillStyle = '#e0b020';
  for (let x = -16; x < S + 16; x += 16) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 8, 16); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.anisotropy = 8;
  return hazardTex;
}

/** Yellow/black hazard-stripe trim around the base of a Terran building footprint. */
export function addHazardTrim(root: THREE.Object3D, halfW: number, halfD: number) {
  if (root.userData.hazardTrim) return;
  root.userData.hazardTrim = true;
  const t = makeHazardTex();
  const mk = (len: number) => {
    const tx = t.clone(); tx.needsUpdate = true; tx.repeat.set(Math.max(1, Math.round(len / 0.9)), 1);
    return new THREE.MeshStandardMaterial({ map: tx, roughness: 0.6, metalness: 0.3 });
  };
  const h = 0.16, th = 0.1;
  const bands: [number, number, number, number, number][] = [
    [halfW * 2, halfW * 2 + 0, 0, halfD, 0], [halfW * 2, 0, 0, -halfD, 0],
  ];
  const add = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mk(Math.max(w, d)));
    m.position.set(x, h / 2 + 0.02, z);
    m.userData.silhouette = true; m.userData.noOutline = true; m.receiveShadow = true;
    root.add(m);
  };
  void bands;
  add(halfW * 2, th, 0, halfD); add(halfW * 2, th, 0, -halfD);
  add(th, halfD * 2, halfW, 0); add(th, halfD * 2, -halfW, 0);
}

const done = new WeakSet<THREE.Material>();
const smoothed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Re-tessellate faceted round primitives (only when their baked orientation is unchanged). */
function smoothGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = smoothed.get(g);
  if (hit) return hit;
  let out = g;
  const p: any = (g as any).parameters;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const sz = bb.getSize(new THREE.Vector3());
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-3 * Math.max(1, b);
  if (g.type === 'CylinderGeometry' && p && p.radialSegments < 16 && near(sz.y, p.height)) {
    out = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 20, 1, p.openEnded, p.thetaStart, p.thetaLength);
  } else if (g.type === 'ConeGeometry' && p && p.radialSegments < 16 && near(sz.y, p.height)) {
    out = new THREE.ConeGeometry(p.radius, p.height, 20, 1, p.openEnded, p.thetaStart, p.thetaLength);
  } else if (g.type === 'SphereGeometry' && p && p.widthSegments < 16 && near(sz.y, p.radius * 2) && p.phiLength > 6.2) {
    out = new THREE.SphereGeometry(p.radius, 24, 16, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
  }
  smoothed.set(g, out);
  return out;
}
/** Replace hard-edged BoxGeometry with bevelled rounded boxes (real new meshes) with world-scale triplanar UVs,
 *  so edges catch light and panel lines/rivets keep a constant size. Cached per box dimensions. */
const boxMapped = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
const boxByDims = new Map<string, THREE.BufferGeometry>();
function worldScaleBoxUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = boxMapped.get(g);
  if (hit) return hit;
  const p: any = (g as any).parameters;
  if (g.type !== 'BoxGeometry' || !p) { boxMapped.set(g, g); return g; }
  const dimsArr = [p.width, p.height, p.depth];
  if (dimsArr.filter(v => v < 0.07).length >= 2) { // slender rod (antenna, strut): round cylinder along its long axis
    const long = dimsArr.indexOf(Math.max(...dimsArr)), rad = Math.max(0.012, Math.max(...dimsArr.filter((_, i) => i !== long)) / 2);
    const cyl = new THREE.CylinderGeometry(rad, rad, dimsArr[long], 8);
    if (long === 0) cyl.rotateZ(Math.PI / 2); else if (long === 2) cyl.rotateX(Math.PI / 2);
    boxMapped.set(g, cyl); return cyl;
  }
  if (Math.min(...dimsArr) < 0.06) { boxMapped.set(g, g); return g; }
  const key = [p.width, p.height, p.depth].map((v: number) => v.toFixed(3)).join('x');
  let out = boxByDims.get(key);
  if (!out) {
    const T = 1.6, r = Math.min(0.34, Math.min(p.width, p.height, p.depth) * 0.22);
    out = new RoundedBoxGeometry(p.width, p.height, p.depth, 2, r);
    const pos = out.getAttribute('position'), nor = out.getAttribute('normal'), uv = out.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      if (ax >= ay && ax >= az) uv.setXY(i, pos.getZ(i) / T + 0.5, pos.getY(i) / T + 0.5);
      else if (ay >= az) uv.setXY(i, pos.getX(i) / T + 0.5, pos.getZ(i) / T + 0.5);
      else uv.setXY(i, pos.getX(i) / T + 0.5, pos.getY(i) / T + 0.5);
    }
    boxByDims.set(key, out);
  }
  boxMapped.set(g, out); return out;
}
export function addSurfaceDetail(root: THREE.Object3D) {
  const t = makeTex();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o.userData.noSurfaceDetail) return;
    if (m.geometry && !o.userData.isOutlineHull) {
      if (o.userData.silhouette) { if (!o.userData.noOutline) m.geometry = worldScaleBoxUV(m.geometry); }
      else m.geometry = worldScaleBoxUV(smoothGeometry(m.geometry));
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const s = mat as THREE.MeshStandardMaterial;
      if (!s || !(s as any).isMeshStandardMaterial || done.has(s) || s.transparent || s.bumpMap) continue;
      done.add(s);
      s.bumpMap = t;
      s.bumpScale = 1.4;
      if (!s.map) s.map = makeColorTex();
      s.needsUpdate = true;
    }
  });
}

let blobTex: THREE.CanvasTexture | null = null;
let blobMat: THREE.MeshBasicMaterial | null = null;
/** Soft ambient-occlusion "contact shadow" blob on the ground under a model (never pickable, never outlined). */
export function addContactShadow(root: THREE.Object3D, sizeX: number, sizeZ = sizeX, opacity = 0.85) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
    blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), blobMat!);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.renderOrder = -2;
  m.userData.noOutline = true; m.userData.silhouette = true; m.userData.contactShadow = true;
  m.raycast = () => {};
  root.add(m);
}
