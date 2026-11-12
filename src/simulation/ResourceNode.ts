import * as THREE from 'three';
import { ResourceType, Vector2D, Vector3D } from '../types';
import { ProceduralGrassSystem } from '../graphics/ProceduralGrass';

export class ResourceNode {
  public id: string;
  public type: ResourceType;
  public pos: Vector2D;
  public height: number = 0;
  public amount: number;
  public maxAmount: number;
  public mesh: THREE.Group | null = null;
  public reservedBy: string | null = null; // SCV currently mining
  public radius: number = 1.0;
  public isSelected: boolean = false;

  constructor(id: string, type: ResourceType, pos: Vector2D, amount: number) {
    this.id = id;
    this.type = type;
    this.pos = { x: pos.x, y: pos.y };
    this.height = ProceduralGrassSystem.getTerrainHeight(pos.x, pos.y);
    this.amount = amount;
    this.maxAmount = amount;
    this.radius = type === 'minerals' ? 0.9 : 1.5;
  }

  public getPosition3D(): Vector3D {
    return {
      x: this.pos.x,
      y: this.height,
      z: this.pos.y
    };
  }

  public harvest(quantity: number = 5): number {
    const gathered = Math.min(this.amount, quantity);
    this.amount -= gathered;
    return gathered;
  }
}
