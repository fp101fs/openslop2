import type { GameWorld } from '../simulation/GameWorld';
import type { PlayerId } from '../types';

/**
 * A 32-bit fingerprint of the simulation state. Lockstep players swap these every turn: equal numbers mean both computers
 * still run the same game, a mismatch means they drifted apart (a desync) and the host sends a full keyframe.
 *
 * `side` maps this computer's labels to the host's, so a PvP guest (who sees itself as 'player') hashes the same as the host.
 * Values are rounded so the hash compares game state, not the last bits of floating-point noise.
 */
export function stateHash(w: GameWorld, side: (pid: PlayerId) => number): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
  };
  const str = (s: string) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0); };
  const q = (n: number) => mix(Math.round(n * 64));

  mix(w.entityIdCounter);
  mix(w.rngState);
  for (const u of w.units) {
    if (u.isDead) continue;
    str(u.id); str(u.type); mix(side(u.playerId));
    q(u.pos.x); q(u.pos.y); q(u.health); q(u.shield ?? 0); q(u.energy ?? 0);
  }
  for (const b of w.buildings) {
    if (b.isDead) continue;
    str(b.id); str(b.type); mix(side(b.playerId));
    q(b.health); q(b.buildProgress); mix(b.queue.length);
  }
  for (const n of w.resourceNodes) q(n.amount);
  // host slot order, so both computers feed the two players in the same order
  for (const pid of (['player', 'enemy'] as PlayerId[]).sort((a, b) => side(a) - side(b))) {
    const r = w.resources[pid];
    q(r.minerals); q(r.gas); mix(r.supply); mix(r.maxSupply);
  }
  return h >>> 0;
}
