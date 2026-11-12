import { simRandom } from './Rng';
import * as THREE from 'three';
import { SHIELD_POINTS, SHIELD_REGEN_DELAY, SHIELD_REGEN_RATE } from '../config';
import { PlayerId, EntityType, Vector2D, Vector3D, UnitComponentState } from '../types';

export abstract class Entity {
  public id: string;
  public type: EntityType;
  public playerId: PlayerId;
  public pos: Vector2D;
  public height: number = 0;
  public rotation: number = 0;
  public pitch: number = 0;
  public roll: number = 0;
  public radius: number = 0.5;
  public health: number;
  public maxHealth: number;
  public energy: number = 0;
  public maxEnergy: number = 0;
  public armor: number = 0;
  public sightRange: number = 9;
  public isDead: boolean = false;
  public isSelected: boolean = false;
  /** Set when mission script code spawned this entity: identifies it across a save / load (see MissionRuntime). */
  public scriptTag?: string;

  // --- SC2 mechanics: shields, stealth, ability cooldowns, buffs ---
  /** SC2 attributes (light / armored / biological / mechanical / massive / structure) used by bonus damage */
  public attrs: string[] = [];
  public shield: number = 0;
  public maxShield: number = 0;
  public shieldArmor: number = 0;
  /** Seconds since last damage; shields regenerate after SHIELD_REGEN_DELAY */
  public sinceDamaged: number = 99;
  /** Where the last hostile hit came from (idle workers flee away from it). */
  public lastAttackerPos: { x: number; y: number } | null = null;
  /** Seconds a cloaked unit stays revealed after an EMP Round. */
  public revealTimer: number = 0;
  public cloaked: boolean = false;
  public burrowed: boolean = false;
  public abilityCd: Record<string, number> = {};
  /** Guardian Shield: ranged damage reduced while > 0 */
  public guardianTimer: number = 0;
  /** Seconds of remaining life (MULE). 0 = permanent */
  public lifespan: number = 0;
  public mesh: THREE.Group | null = null;

  // IL-2 Sturmovik Component-Based Damage System
  public components: UnitComponentState[] = [];
  public lastDamagedComponent: string | null = null;
  public damageSmokeTimer: number = 0;

  constructor(
    id: string,
    type: EntityType,
    playerId: PlayerId,
    pos: Vector2D,
    health: number,
    armor: number = 0,
    sightRange: number = 9
  ) {
    this.id = id;
    this.type = type;
    this.playerId = playerId;
    this.pos = { x: pos.x, y: pos.y };
    this.health = health;
    this.maxHealth = health;
    this.armor = armor;
    this.sightRange = sightRange;

    this.initComponents(type);
    const sh = SHIELD_POINTS[type as string];
    if (sh) { this.maxShield = sh; this.shield = sh; }
  }

  /** Per-tick upkeep shared by units and buildings (cooldowns, shield regen, buffs). */
  public tickStatus(dt: number) {
    for (const k in this.abilityCd) {
      const v = this.abilityCd[k]! - dt;
      if (v <= 0) delete this.abilityCd[k]; else this.abilityCd[k] = v;
    }
    if (this.guardianTimer > 0) this.guardianTimer -= dt;
    this.sinceDamaged += dt;
    if (this.revealTimer > 0) this.revealTimer -= dt;
    if (this.maxShield > 0 && this.shield < this.maxShield && this.sinceDamaged > SHIELD_REGEN_DELAY) {
      // only the part of this tick that lies past the delay regenerates, so the delay is exact
      const regenTime = Math.min(dt, this.sinceDamaged - SHIELD_REGEN_DELAY);
      this.shield = Math.min(this.maxShield, this.shield + SHIELD_REGEN_RATE * regenTime);
    }
  }

  /** SC2 has no localized component damage (that was an IL-2 style extra): damage is plain shields / hit points / armor, so no components. */
  public initComponents(_type: EntityType) {
    this.components = [];
  }

  public getComponentHp(id: string): number {
    const comp = this.components.find(c => c.id === id);
    return comp ? comp.hp : 100;
  }

  public static formatAsciiBar(hp: number): string {
    const clamped = Math.max(0, Math.min(100, hp));
    const filled = clamped < 50 ? Math.floor(clamped / 10) : Math.round(clamped / 10);
    return '='.repeat(filled) + '-'.repeat(10 - filled);
  }

  public getSpeedMultiplier(): number {
    let mult = 1.0;
    const engineHp = this.getComponentHp('engine');
    if (engineHp < 75) {
      mult *= 0.55 + 0.45 * (engineHp / 75);
    }
    const rotorHp = this.getComponentHp('rotor');
    if (rotorHp < 75) {
      mult *= 0.6 + 0.4 * (rotorHp / 75);
    }
    const tracksHp = this.getComponentHp('tracks');
    if (tracksHp < 75) {
      mult *= 0.35 + 0.65 * (tracksHp / 75);
    }
    const mobilityHp = this.getComponentHp('mobility');
    if (mobilityHp < 75) {
      mult *= 0.5 + 0.5 * (mobilityHp / 75);
    }
    return Math.max(0.25, mult);
  }

  public getTurnMultiplier(dir?: 'left' | 'right'): number {
    let mult = 1.0;
    const tailHp = this.getComponentHp('tail');
    if (tailHp < 75) {
      mult *= 0.5 + 0.5 * (tailHp / 75);
    }
    const rotorHp = this.getComponentHp('rotor');
    if (rotorHp < 75) {
      mult *= 0.55 + 0.45 * (rotorHp / 75);
    }
    const tracksHp = this.getComponentHp('tracks');
    if (tracksHp < 75) {
      mult *= 0.45 + 0.55 * (tracksHp / 75);
    }
    if (dir === 'left') {
      const lw = this.getComponentHp('left_wing');
      if (lw < 75) mult *= 0.4 + 0.6 * (lw / 75);
    } else if (dir === 'right') {
      const rw = this.getComponentHp('right_wing');
      if (rw < 75) mult *= 0.4 + 0.6 * (rw / 75);
    } else {
      const wingAvg = (this.getComponentHp('left_wing') + this.getComponentHp('right_wing')) * 0.5;
      if (wingAvg < 75) mult *= 0.55 + 0.45 * (wingAvg / 75);
    }
    return Math.max(0.3, mult);
  }

  public getFireRateMultiplier(): number {
    let mult = 1.0;
    const weapHp = Math.min(this.getComponentHp('weapons'), this.getComponentHp('weapon'));
    if (weapHp < 75) {
      mult *= 0.55 + 0.45 * (weapHp / 75);
    }
    const turretHp = this.getComponentHp('turret');
    if (turretHp < 75) {
      mult *= 0.6 + 0.4 * (turretHp / 75);
    }
    return Math.max(0.4, mult);
  }

  public getDamageOutputMultiplier(): number {
    const ammoHp = this.getComponentHp('ammo');
    if (ammoHp < 70) {
      return 0.65 + 0.35 * (ammoHp / 70);
    }
    return 1.0;
  }

  public getWingRollBias(): number {
    const lw = this.getComponentHp('left_wing');
    const rw = this.getComponentHp('right_wing');
    // Damaged left wing drops left wing (positive roll); damaged right wing drops right wing
    return ((rw - lw) / 100) * 0.42;
  }

  public hasSmokeDamage(): boolean {
    return this.components.some(c => c.hp < 55);
  }

  public hasCriticalDamage(): boolean {
    return this.components.some(c => c.hp < 35);
  }

  public getPosition3D(): Vector3D {
    return {
      x: this.pos.x,
      y: this.height,
      z: this.pos.y
    };
  }

  /** Kills credited to this entity (shown on the unit panel). */
  public kills = 0;
  /** Type of whatever dealt the killing blow (null if unknown); picks how gory the death is. */
  public killedBy: EntityType | null = null;
  /** Entity currently dealing damage; set by `Entity.withSource` around a hit so deaths can be credited. */
  private static damageSource: Entity | null = null;
  /** Run `fn` with `src` credited for any kill its damage causes. */
  public static withSource<T>(src: Entity | null | undefined, fn: () => T): T {
    const prev = Entity.damageSource;
    Entity.damageSource = src ?? null;
    try { return fn(); } finally { Entity.damageSource = prev; }
  }

  public takeDamage(
    amount: number,
    targetComponentId?: string,
    isPrecisionShot: boolean = false,
    ignoreArmor: boolean = false
  ): number {
    if (this.isDead) return 0;

    const effectiveArmor = ignoreArmor ? 0 : this.armor;

    const precisionMult = 1.0; // SC2 has no precision/headshot multiplier
    let incoming = amount * precisionMult;
    if (this.guardianTimer > 0) incoming = Math.max(0.5, incoming - 2); // Guardian Shield
    this.sinceDamaged = 0;
    { const s = Entity.damageSource; this.lastAttackerPos = s && s !== this && s.playerId !== this.playerId && s.pos ? { x: s.pos.x, y: s.pos.y } : null; }
    // SC2 damage order: shields absorb first (reduced by shield armor), the remainder hits hit points (reduced by armor)
    let toHealth = incoming;
    if (this.shield > 0) {
      const onShield = Math.max(ignoreArmor ? 0 : 0.5, incoming - (ignoreArmor ? 0 : this.shieldArmor));
      if (onShield <= this.shield) {
        this.shield -= onShield;
        toHealth = 0;
      } else {
        toHealth = onShield - this.shield;
        this.shield = 0;
      }
    }
    const actualDamage = toHealth > 0 ? (ignoreArmor ? toHealth : Math.max(0.5, toHealth - effectiveArmor)) : 0;
    this.health -= actualDamage;

    // Apply IL-2 localized component damage
    if (this.components.length > 0) {
      let comp: UnitComponentState | undefined;
      if (targetComponentId) {
        comp = this.components.find(c => c.id === targetComponentId);
      }
      if (!comp) {
        // Pick a component with remaining HP (or weighted random)
        const intact = this.components.filter(c => c.hp > 0);
        const pool = intact.length > 0 ? intact : this.components;
        comp = pool[Math.floor(simRandom() * pool.length)];
      }
      if (comp && actualDamage > 0) {
        const compDmgPct = (actualDamage / Math.max(1, this.maxHealth)) * 100 * (isPrecisionShot ? 2.8 : 2.1);
        comp.hp = Math.max(0, Math.round(comp.hp - compDmgPct));
        this.lastDamagedComponent = comp.name;
      }
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      const src = Entity.damageSource;
      if (src && src !== this && src.playerId !== this.playerId) src.kills++;
      this.killedBy = src && src !== this ? src.type : null;
    }
    return actualDamage;
  }

  public heal(amount: number): number {
    if (this.isDead) return 0;
    const healed = Math.min(amount, this.maxHealth - this.health);
    this.health += healed;

    // Repairing / healing also restores damaged components
    if (this.components.length > 0 && amount > 0) {
      const repairPct = (amount / Math.max(1, this.maxHealth)) * 140;
      this.components.forEach(c => {
        c.hp = Math.min(c.maxHp, Math.round(c.hp + repairPct));
      });
    }
    return healed;
  }

  public updateMeshTransform() {
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.height, this.pos.y);
      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.y = this.rotation;
      this.mesh.rotation.x = this.pitch;
      this.mesh.rotation.z = this.roll + this.getWingRollBias();
    }
  }

  public abstract update(dt: number, world: any): void;
}
