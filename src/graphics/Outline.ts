import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Thin (1 px) white silhouette outline for selected units / buildings.
 * Inverted-hull technique: every mesh of the selected model gets a back-faced twin whose
 * vertices are pushed outward by a constant number of *screen pixels* in clip space.
 */
export class Outline {
  private static invRes = { value: new THREE.Vector2(1 / 1280, 1 / 720) };
  private static widthPx = { value: 1.0 };
  private static smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

  private static mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: true,
    uniforms: { uInvRes: Outline.invRes, uWidth: Outline.widthPx, uColor: { value: new THREE.Color(0.92, 0.92, 0.92) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform vec2 uInvRes;
      uniform float uWidth;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
        float l = length(dir);
        dir = l > 1e-5 ? dir / l : vec2(0.0);
        clip.xy += dir * uWidth * 2.0 * uInvRes * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `
  });

  private static hoverMats: Record<string, THREE.ShaderMaterial> = {};
  private static hoverMat(kind: string): THREE.ShaderMaterial {
    let m = Outline.hoverMats[kind];
    if (!m) {
      const col = kind === 'enemy' ? [0.95, 0.25, 0.2] : kind === 'resource' ? [0.25, 0.85, 1.0] : [0.3, 0.95, 0.4];
      m = Outline.mat.clone();
      m.uniforms = { uInvRes: Outline.invRes, uWidth: Outline.widthPx, uColor: { value: new THREE.Color(col[0], col[1], col[2]) } };
      m.depthWrite = false; // hull never occludes anything; the model, drawn after it, covers the hull's interior
      Outline.hoverMats[kind] = m;
    }
    return m;
  }

  private static meshesOf(root: THREE.Object3D): THREE.Mesh[] {
    const hulls: THREE.Mesh[] = [];
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.isOutlineHull) return;
      if (!m.geometry || !m.geometry.getAttribute('position')) return;
      if (m.userData.noOutline || ((m.material as any)?.transparent && (m.material as any).opacity < 0.5)) return;
      hulls.push(m);
    });
    return hulls;
  }

  /** Hover highlight (different colour from the white selection outline). kind: 'ally' | 'enemy' | 'resource' | null. */
  public static setHover(root: THREE.Object3D | null, kind: string | null) {
    if (!root) return;
    const prev = root.userData.hoverKind as string | null | undefined;
    if ((prev ?? null) === kind) return;
    root.userData.hoverKind = kind;
    Outline.applyHover(root);
  }

  private static applyHover(root: THREE.Object3D) {
    const kind = root.userData.hoverKind as string | null | undefined;
    const show = !!kind; // selection no longer draws an outline (it gets a ground ring instead), so hover always shows
    if (show && !root.userData.hoverHulls) {
      const made: THREE.Mesh[] = [];
      for (const m of Outline.meshesOf(root)) {
        // skinned models: the hull shares the skeleton so the silhouette follows the animated pose, not the bind pose
        const sk = m as THREE.SkinnedMesh;
        let hull: THREE.Mesh;
        if (sk.isSkinnedMesh) { const h = new THREE.SkinnedMesh(Outline.smoothGeo(m.geometry), Outline.mat); h.bindMode = sk.bindMode; h.bind(sk.skeleton, sk.bindMatrix); h.frustumCulled = false; hull = h; }
        else hull = new THREE.Mesh(Outline.smoothGeo(m.geometry), Outline.mat);
        hull.userData.isOutlineHull = true;
        hull.castShadow = false; hull.receiveShadow = false; hull.renderOrder = -1;
        hull.raycast = () => {};
        m.add(hull);
        made.push(hull);
      }
      root.userData.hoverHulls = made;
    }
    const hulls = root.userData.hoverHulls as THREE.Mesh[] | undefined;
    if (!hulls) return;
    // Outer 2D silhouette only: hulls draw first (renderOrder 1, depth-tested against the scene but writing no depth) and the model
    // itself draws after them (renderOrder 2), so every hull pixel that lies behind / inside the model's own silhouette is overpainted.
    // Only the thin band outside the combined silhouette survives; internal overlaps (arm over body) show no line.
    const setOrder = (h: THREE.Mesh, on: boolean) => {
      const src = h.parent as THREE.Mesh | null; if (!src) return;
      if (on) { if (src.userData._ro === undefined) src.userData._ro = src.renderOrder; src.renderOrder = 2; }
      else if (src.userData._ro !== undefined) { src.renderOrder = src.userData._ro; src.userData._ro = undefined; }
    };
    if (show) { const mat = Outline.hoverMat(kind!); for (const h of hulls) { h.material = mat; h.visible = true; h.renderOrder = 1; setOrder(h, true); } }
    else for (const h of hulls) { h.visible = false; setOrder(h, false); }
  }

  /** Call once per frame with the drawing-buffer size. */
  public static setResolution(w: number, h: number, pixelRatio = 1) {
    Outline.widthPx.value = 1.6 * pixelRatio; // ~1.6 CSS px: a touch thicker is far more stable (less edge crawl)
    Outline.invRes.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  }

  /** Smooth-normal copy of a geometry so hard-edged boxes don't tear at corners. */
  private static smoothGeo(src: THREE.BufferGeometry): THREE.BufferGeometry {
    let g = Outline.smoothCache.get(src);
    if (g) return g;
    const clone = src.clone();
    clone.deleteAttribute('normal');
    clone.deleteAttribute('uv');
    clone.deleteAttribute('uv1');
    clone.deleteAttribute('color');
    let merged: THREE.BufferGeometry;
    try {
      merged = mergeVertices(clone, 1e-3);
    } catch {
      merged = clone;
    }
    merged.computeVertexNormals();
    Outline.smoothCache.set(src, merged);
    return merged;
  }

  /** Show / hide the outline on a model group (idempotent, cheap when unchanged). */
  public static set(_root: THREE.Object3D | null, _on: boolean) {
    // selection outline removed: selected units show a yellow dashed ground ring (Decals) instead; the hover outline is kept
  }

  /** The old white selection silhouette (unused; kept in case it is wanted again). */
  public static setSelectionOutline(root: THREE.Object3D | null, on: boolean) {
    if (!root) return;
    if (!!root.userData.outlined === on) return;
    root.userData.outlined = on;
    if (root.userData.hoverHulls || root.userData.hoverKind) Outline.applyHover(root);
    if (on) {
      if (!root.userData.outlineHulls) {
        const hulls: THREE.Mesh[] = [];
        root.traverse(o => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || o.userData.isOutlineHull) return;
          if (!m.geometry || !m.geometry.getAttribute('position')) return;
          if (m.userData.noOutline || ((m.material as any)?.transparent && (m.material as any).opacity < 0.5)) return;
          hulls.push(m);
        });
        const made: THREE.Mesh[] = [];
        for (const m of hulls) {
          const hull = new THREE.Mesh(Outline.smoothGeo(m.geometry), Outline.mat);
          hull.userData.isOutlineHull = true;
          hull.castShadow = false;
          hull.receiveShadow = false;
          hull.renderOrder = -1;
          hull.raycast = () => {}; // never pickable
          m.add(hull);
          made.push(hull);
        }
        root.userData.outlineHulls = made;
      }
      for (const h of root.userData.outlineHulls as THREE.Mesh[]) h.visible = true;
    } else if (root.userData.outlineHulls) {
      for (const h of root.userData.outlineHulls as THREE.Mesh[]) h.visible = false;
    }
  }
}
