import Peer from 'peerjs';
import { SignalPeer } from './SignalPeer';
import { signalApi } from './signalApi';

/**
 * One place that makes WebRTC peers. With Upstash configured, the deployment runs its own handshake broker (api/signal.ts)
 * and peers are SignalPeers; otherwise (or after that broker fails) they are PeerJS peers on the free public broker.
 * Both sides of a match load the same deployment, so they always agree on which broker to meet at.
 */

/** The data-connection surface the game uses (PeerJS DataConnection and SignalConnection both fit). */
export interface ConnLike {
  open: boolean;
  peer: string;
  on(event: string, fn: (...a: any[]) => void): unknown;
  send(d: unknown): void;
  close(): void;
}

/** The peer surface the game uses (PeerJS Peer and SignalPeer both fit). */
export interface PeerLike {
  on(event: string, fn: (...a: any[]) => void): unknown;
  connect(id: string, opts?: unknown): ConnLike;
  destroy(): void;
  reconnect(): void;
}

/** Decide the broker for this page (one quick request, cached). Await before createPeer(). */
export function preparePeers(): Promise<void> {
  return signalApi.available().then(() => undefined);
}

export function createPeer(id: string | undefined, iceServers: RTCIceServer[]): PeerLike {
  if (signalApi.usable()) return new SignalPeer(id, { config: { iceServers } });
  return new Peer(id as any, { debug: 0, config: { iceServers } }) as unknown as PeerLike;
}

/** Which broker new peers use (for the lobby / debugging). */
export const peerBroker = (): 'own' | 'peerjs' => (signalApi.usable() ? 'own' : 'peerjs');
