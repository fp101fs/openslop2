import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Colonel Smith's head: only the head of `models/cinematic/smith_src.glb` (a Mixamo-rigged character), baked out of its skeleton
 * into plain static meshes so it can be parented to the Marine's head bone. Everything below the jaw (torso, arms, legs, boots,
 * tattoo) is dropped; the Body mesh is cut at the neck.
 *
 * Returned group: Smith's world space, y up, facing +z, chin at y = 1.51 (SMITH_CHIN_Y) and the head centred on x = z = 0.
 */
export const SMITH_CHIN_Y = 1.51;
const NECK_CUT_Y = 1.505; // just under the chin (1.51): almost none of the source neck is kept
/** Mesh names in the source file that are part of the head: face, lips, ears, eye parts, mouth, teeth, glasses, lashes ... */
const HEAD_MESHES = ['Object_6', 'Object_7', 'Object_9', 'Object_11', 'Object_12', 'Object_15', 'Object_16', 'Object_17', 'Object_21', 'Object_22', 'Object_23', 'Object_24', 'Object_25', 'Object_26', 'Object_27'];
const BODY_MESH = 'Object_8'; // torso + neck + scalp: keep only the part above the neck cut

export async function loadSmithHead(url = 'models/cinematic/smith_src.glb'): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const out = new THREE.Group();
  out.name = 'smith_head';
  const v = new THREE.Vector3(), p2 = new THREE.Vector3();
  gltf.scene.traverse(o => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh) return;
    const isBody = sm.name === BODY_MESH;
    if (!isBody && !HEAD_MESHES.includes(sm.name)) return;
    const src = sm.geometry, pos = src.attributes.position as THREE.BufferAttribute, nrm = src.attributes.normal as THREE.BufferAttribute | undefined;
    const n = pos.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    const orig = pos.array.slice(0) as Float32Array;
    // skinned (rest pose) world position of each vertex; the normal is obtained by skinning a point nudged along it
    for (let i = 0; i < n; i++) {
      sm.getVertexPosition(i, v).applyMatrix4(sm.matrixWorld);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    }
    if (nrm) {
      const eps = 0.004;
      for (let i = 0; i < n; i++) pos.setXYZ(i, orig[i * 3]! + nrm.getX(i) * eps, orig[i * 3 + 1]! + nrm.getY(i) * eps, orig[i * 3 + 2]! + nrm.getZ(i) * eps);
      pos.needsUpdate = true;
      for (let i = 0; i < n; i++) {
        sm.getVertexPosition(i, p2).applyMatrix4(sm.matrixWorld);
        v.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!);
        p2.sub(v).normalize();
        N[i * 3] = p2.x; N[i * 3 + 1] = p2.y; N[i * 3 + 2] = p2.z;
      }
      (pos.array as Float32Array).set(orig); pos.needsUpdate = true;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (nrm) g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
    let index: number[] = [];
    const sIdx = src.index;
    const tri = (a: number, b: number, c: number) => {
      if (isBody && (P[a * 3 + 1]! + P[b * 3 + 1]! + P[c * 3 + 1]!) / 3 < NECK_CUT_Y) return;
      index.push(a, b, c);
    };
    if (sIdx) for (let i = 0; i < sIdx.count; i += 3) tri(sIdx.getX(i), sIdx.getX(i + 1), sIdx.getX(i + 2));
    else for (let i = 0; i < n; i += 3) tri(i, i + 1, i + 2);
    if (!index.length) return;
    g.setIndex(index);
    if (!nrm) g.computeVertexNormals();
    const mat = (Array.isArray(sm.material) ? sm.material[0]! : sm.material).clone() as THREE.MeshStandardMaterial;
    if ((mat as any).metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.1);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = sm.name;
    mesh.castShadow = true;
    out.add(mesh);
  });
  // centre horizontally on the head (skull centre, ignoring the ears' asymmetry is unnecessary) and report chin at SMITH_CHIN_Y
  const box = new THREE.Box3().setFromObject(out);
  out.children.forEach(c => { c.position.x -= (box.min.x + box.max.x) / 2; c.position.z -= (box.min.z + box.max.z) / 2; });
  gltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  return out;
}
