import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const buf = await Bun.file(process.argv[2]!.replace(/^~/, process.env.HOME!)).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
gltf.scene.updateMatrixWorld(true);
const bins = 16, z0 = -448, z1 = 751; const H = new Array(bins).fill(0), W = new Array(bins).fill(0), N = new Array(bins).fill(0);
const v = new THREE.Vector3();
gltf.scene.traverse((o: any) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); const b = Math.min(bins - 1, Math.max(0, Math.floor((v.z - z0) / (z1 - z0) * bins))); H[b] = Math.max(H[b], v.y); W[b] = Math.max(W[b], Math.abs(v.x)); N[b]++; } });
for (let b = 0; b < bins; b++) console.log('z', Math.round(z0 + (b + 0.5) * (z1 - z0) / bins), 'maxY', Math.round(H[b]), 'halfW', Math.round(W[b]), 'verts', N[b]);
