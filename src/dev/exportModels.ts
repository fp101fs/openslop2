import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { modelFactory } from '../graphics/ModelFactory';
import { buildReactorModel, buildTechLabModel } from '../graphics/AddonModels';

/**
 * Dev tool: bakes the code-built (procedural) models to standalone GLBs. Run in the dev page:
 *   const m = await import('/src/dev/exportModels.ts'); await m.exportAll('http://localhost:5300')
 * `sink` is a tiny local server that writes POST /save?name=<file> into public/models (tools/model/save-server.ts).
 */
const BUILDERS: Record<string, () => THREE.Object3D> = {
  mineral_patch: () => modelFactory.createMineralPatch(),
  vespene_geyser: () => modelFactory.createVespeneGeyser(),
  refinery: () => (modelFactory as any).buildRefineryProcedural(true), // the live build, not the GLB it is exported to
  techlab: () => buildTechLabModel(true, 'factory'),
  techlab_barracks: () => buildTechLabModel(true, 'barracks'),
  techlab_starport: () => buildTechLabModel(true, 'starport'),
  reactor: () => buildReactorModel(true),
  mule: () => modelFactory.createUnitModel('mule' as any, true)
};

export async function exportModel(name: string, sink: string): Promise<string> {
  const obj = BUILDERS[name]!();
  obj.updateMatrixWorld(true);
  const glb: ArrayBuffer = await new Promise((res, rej) => new GLTFExporter().parse(obj, r => res(r as ArrayBuffer), rej, { binary: true, onlyVisible: true, maxTextureSize: 1024 }));
  const r = await fetch(`${sink}/save?name=${name}.glb`, { method: 'POST', body: glb });
  return `${name}: ${(glb.byteLength / 1024).toFixed(0)} KB -> ${await r.text()}`;
}
export async function exportAll(sink: string) { const out: string[] = []; for (const n of Object.keys(BUILDERS)) { try { out.push(await exportModel(n, sink)); } catch (e) { out.push(`${n}: FAILED ${e}`); } } return out.join('\n'); }
