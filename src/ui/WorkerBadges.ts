import * as THREE from 'three';
import type { GameWorld } from '../simulation/GameWorld';
import { Building } from '../simulation/Building';
import { Unit } from '../simulation/Unit';
import { TOWN_HALL_TYPES } from '../config';

const MINERAL_RADIUS = 13; // patches within this distance of a town hall belong to its mineral line
const GAS_CAPACITY = 3;
const MINERALS_PER_PATCH = 2;
const GAS_ICON = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.2 13 5.2v5.6L8 14.8 3 10.8V5.2z" fill="#58e06b" stroke="#c8ffd0" stroke-width=".8"/></svg>';
const MINERAL_ICON = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 .8 12.2 5 11 14.6 6 15.2 3.4 8z" fill="#4fb6ff" stroke="#d6f0ff" stroke-width=".8"/><path d="M8 .8 6.4 6.6 3.4 8M6.4 6.6 6 15.2" fill="none" stroke="#e8f7ff" stroke-width=".6" opacity=".8"/></svg>';

/**
 * SC2-style "Workers: 6/16" capacity badge floated above each selected town hall (mineral line, 2 per patch)
 * and each selected gas structure (3 per geyser). The text turns red once the base is over-saturated.
 */
export class WorkerBadges {
  private root: HTMLElement;
  private pool: HTMLElement[] = [];
  private vec = new THREE.Vector3();

  constructor(container: HTMLElement, private world: GameWorld) {
    this.root = document.createElement('div');
    this.root.className = 'worker-badge-layer';
    container.appendChild(this.root);
  }

  private badge(i: number): HTMLElement {
    let el = this.pool[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'worker-badge';
      el.innerHTML = '<span class="wb-icon"></span><span class="wb-text"></span>';
      this.root.appendChild(el);
      this.pool[i] = el;
    }
    return el;
  }

  public update(camera: THREE.Camera) {
    const w = this.world;
    let used = 0;
    const gatherers = w.selectedEntities.some(e => e instanceof Building)
      ? w.units.filter((u: Unit) => !u.isDead && u.isGathering && u.playerId === 'player')
      : [];
    for (const e of w.selectedEntities) {
      if (!(e instanceof Building) || e.isDead || !e.isConstructed || e.playerId !== 'player') continue;
      let count = 0, cap = 0, gas = false;
      if (TOWN_HALL_TYPES.includes(e.type) || e.type === 'orbital_command' || e.type === 'planetary_fortress') {
        const ids = new Set<string>();
        for (const r of w.resourceNodes) {
          if (r.type === 'minerals' && r.amount > 0 && Math.hypot(r.pos.x - e.pos.x, r.pos.y - e.pos.y) <= MINERAL_RADIUS) ids.add(r.id);
        }
        cap = ids.size * MINERALS_PER_PATCH;
        for (const u of gatherers) if (u.targetNodeId && ids.has(u.targetNodeId)) count++;
      } else if (e.type === 'refinery' || e.type === 'extractor' || e.type === 'assimilator') {
        const geyser = w.resourceNodes.find(r => r.type === 'vespene' && Math.hypot(r.pos.x - e.pos.x, r.pos.y - e.pos.y) < 1.5);
        if (!geyser) continue;
        gas = true;
        cap = GAS_CAPACITY;
        for (const u of gatherers) if (u.targetNodeId === geyser.id) count++;
      } else continue;

      this.vec.set(e.pos.x, (e as any).getPosition3D().y + 2.6, e.pos.y).project(camera);
      if (this.vec.z > 1 || this.vec.z < -1) continue;
      const el = this.badge(used++);
      el.style.display = 'flex';
      el.style.left = `${(this.vec.x * 0.5 + 0.5) * window.innerWidth}px`;
      el.style.top = `${(-this.vec.y * 0.5 + 0.5) * window.innerHeight}px`;
      const text = `Workers: ${count}/${cap}`;
      const over = count > cap;
      const key = `${gas ? 'g' : 'm'}|${text}|${over}`;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.classList.toggle('over', over);
        (el.firstChild as HTMLElement).innerHTML = gas ? GAS_ICON : MINERAL_ICON;
        (el.lastChild as HTMLElement).textContent = text;
      }
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.style.display = 'none';
  }
}
