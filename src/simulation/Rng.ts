/**
 * Seeded random numbers for the simulation.
 *
 * Lockstep multiplayer needs every computer to make the same "random" choices, so simulation code calls `simRandom()`
 * instead of `Math.random()`. Each GameWorld owns an `Rng`; `world.update()` makes it the active one, so several
 * worlds can run side by side (tests do). Pure visuals (particles, sounds, idle animations) keep using Math.random.
 */
export class Rng {
  /** The whole generator state: one 32-bit integer, so saves and keyframes can store it. */
  public state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  /** mulberry32: fast, small state, good enough spread for gameplay. Returns [0, 1). */
  public next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** A fresh random seed (single player: every match plays out differently). */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0 || 1;
}

let active: Rng | null = null;

/** Make `rng` the generator that `simRandom()` draws from (GameWorld does this at the start of every update). */
export function useSimRng(rng: Rng | null) {
  active = rng;
}

/** Random number in [0, 1) for simulation code. */
export function simRandom(): number {
  return active ? active.next() : Math.random();
}
