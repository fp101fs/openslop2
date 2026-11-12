import * as THREE from 'three';
import type { FireSmokeFX, FlameShape } from './FireSmoke';

/**
 * Fire and smoke on damaged Terran structures.
 *
 * Each structure gets a fixed set of hot spots, found once by dropping rays onto its model from above, so the fire stays put
 * on the hull rather than hopping about. The spots are kept in the model's own space (a lifted-off Barracks carries its fires
 * with it). They catch one after another as health drops: the first starts smoking at 3/4 health, the last at about 1/5.
 * Each spot then works up from a grey smolder, through small licking flames under grey-black smoke, to a full blaze with a
 * thick black oily column and sparks. Bigger structures get more spots and bigger flames.
 */
interface Spot {
  local: THREE.Vector3;
  /** Health fraction below which this spot starts to burn. */
  ignite: number;
  /** The shape this spot burns with once it is fully ablaze. */
  big: FlameShape;
  flameT: number;
  smokeT: number;
}
interface Entry { mesh: THREE.Object3D; spots: Spot[]; base: number; }

const ray = new THREE.Raycaster();
const tmp = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class BuildingFire {
  private entries = new Map<string, Entry>();

  constructor(private fx: FireSmokeFX) {}

  forget(id: string) { this.entries.delete(id); }
  clear() { this.entries.clear(); }

  /** Called every frame for a finished, visible Terran structure; `frac` is its health fraction. */
  update(id: string, mesh: THREE.Object3D, radius: number, frac: number, dt: number) {
    let e = this.entries.get(id);
    if (!e || e.mesh !== mesh) {
      if (frac >= 0.76) return;   // healthy: don't bother finding spots yet
      e = { mesh, spots: BuildingFire.findSpots(mesh, radius), base: 0.45 + radius * 0.26 };
      this.entries.set(id, e);
    }
    if (frac >= 0.76) return;
    mesh.updateMatrixWorld();
    for (const s of e.spots) {
      if (frac >= s.ignite) continue;
      const sev = Math.min(1, (s.ignite - frac) / 0.45);
      const p = tmp.copy(s.local).applyMatrix4(mesh.matrixWorld);
      this.burn(s, p, sev, e.base, dt);
    }
  }

  private burn(s: Spot, p: THREE.Vector3, sev: number, base: number, dt: number) {
    const fx = this.fx;
    s.flameT -= dt; s.smokeT -= dt;
    const j = () => (Math.random() - 0.5) * base * 0.35;
    if (s.flameT <= 0 && sev > 0.12) {
      const size = base * (0.45 + sev * 0.85);
      if (sev < 0.45) {
        // catching: little licks and flickers
        fx.flame(Math.random() < 0.55 ? 'flicker' : 'lick', p.x + j(), p.y - size * 0.25, p.z + j(), size * 0.8);
        s.flameT = 0.22 + Math.random() * 0.12;
      } else {
        // ablaze: the spot's main flame, with licks dancing around it
        fx.flame(s.big, p.x + j() * 0.6, p.y - size * 0.3, p.z + j() * 0.6, s.big === 'sheet' ? size * 1.15 : size);
        if (Math.random() < 0.6) fx.flame(Math.random() < 0.5 ? 'lick' : 'flicker', p.x + j() * 1.6, p.y - size * 0.2, p.z + j() * 1.6, size * 0.55);
        if (sev > 0.75 && Math.random() < 0.18) fx.embers(p.x, p.y + size * 0.6, p.z, 2, 1.4);
        s.flameT = 0.15 + Math.random() * 0.1 - sev * 0.04;
      }
    }
    if (s.smokeT <= 0) {
      const top = p.y + (sev > 0.12 ? base * (0.5 + sev * 0.9) : 0.1);
      if (sev < 0.3) {
        fx.wisp(p.x + j(), top, p.z + j(), base * (1.1 + sev * 2), 2.2, 0.35 + sev * 0.6, 1.1);
        s.smokeT = 0.3 + Math.random() * 0.15;
      } else {
        fx.column(p.x + j(), top, p.z + j(), base * (0.8 + sev * 0.8), sev > 0.6, 0.4 + sev * 0.4);
        s.smokeT = 0.36 - sev * 0.12 + Math.random() * 0.1;
      }
    }
  }

  /** Drop a grid of rays onto the model and pick well-spread points on its upper surfaces. */
  static findSpots(mesh: THREE.Object3D, radius: number): Spot[] {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const solids: THREE.Object3D[] = [];
    mesh.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !o.visible) return;
      const mat = m.material as THREE.Material;
      if (Array.isArray(mat) || (mat as any).isShaderMaterial || (mat.transparent && (mat.opacity ?? 1) < 0.9) || (mat as any).depthWrite === false) return;
      solids.push(o);
    });
    const cx = mesh.position.x, cz = mesh.position.z, groundY = mesh.position.y;
    const hits: { p: THREE.Vector3; up: boolean }[] = [];
    const N = 8, ext = radius * 0.85;
    for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
      const x = cx + ((i + 0.5) / N - 0.5) * 2 * ext, z = cz + ((k + 0.5) / N - 0.5) * 2 * ext;
      ray.set(new THREE.Vector3(x, box.max.y + 1, z), DOWN);
      const h = ray.intersectObjects(solids, false)[0];
      if (!h || h.point.y < groundY + 0.35) continue;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      hits.push({ p: h.point.clone(), up: n.y > 0.85 });
    }
    const count = Math.max(2, Math.min(7, Math.round(1.5 + radius * 1.5)));
    const chosen: { p: THREE.Vector3; up: boolean }[] = [];
    if (hits.length) {
      // start somewhere high on the bulk of the structure, then keep taking the point farthest from those already taken
      const byY = [...hits].sort((a, b) => b.p.y - a.p.y);
      chosen.push(byY[Math.floor(Math.random() * Math.max(1, byY.length * 0.4))]!);
      while (chosen.length < count && chosen.length < hits.length) {
        let best = hits[0]!, bd = -1;
        for (const h of hits) {
          let md = Infinity;
          for (const c of chosen) md = Math.min(md, Math.hypot(h.p.x - c.p.x, h.p.z - c.p.z));
          const score = md + (h.p.y - groundY) * 0.15;   // a slight preference for higher spots
          if (score > bd) { bd = score; best = h; }
        }
        chosen.push(best);
      }
    } else {
      // no geometry hit (model still loading?): spread spots over a guessed roof
      for (let c = 0; c < count; c++) {
        const a = (c / count) * Math.PI * 2;
        chosen.push({ p: new THREE.Vector3(cx + Math.cos(a) * radius * 0.45, groundY + 1.5, cz + Math.sin(a) * radius * 0.45), up: true });
      }
    }
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    // the first spot catches at 3/4 health, the last at about 1/5
    return chosen.map((c, i) => ({
      local: c.p.clone().applyMatrix4(inv),
      ignite: 0.75 - (i / Math.max(1, chosen.length - 1)) * 0.55,
      big: c.up && radius >= 1.4 && Math.random() < 0.45 ? 'sheet' : (['tongue', 'tongue', 'lean', 'lick'] as FlameShape[])[Math.floor(Math.random() * 4)]!,
      flameT: Math.random() * 0.3, smokeT: Math.random() * 0.3
    }));
  }
}
