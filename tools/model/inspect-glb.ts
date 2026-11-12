import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const buf = await Bun.file(process.argv[2]!.replace(/^~/, process.env.HOME!)).arrayBuffer();
const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
gltf.scene.updateMatrixWorld(true);
gltf.scene.traverse((o: any) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); console.log(o.name, o.geometry.attributes.position.count, 'min', b.min.toArray().map((n: number) => +n.toFixed(2)), 'max', b.max.toArray().map((n: number) => +n.toFixed(2))); });
