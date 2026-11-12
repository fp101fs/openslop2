/** Constants shared by the serverless P2P transport and the room prober. */

/** Room code <-> PeerJS id: "svg-<CODE>". */
export const PREFIX = 'svg-';

/** Fixed matchmaking slots: the fallback when the public game list service is unavailable (Quick Match + slot scan). */
export const QUICK_CODES = ['QUIK', 'QUIL', 'QUIM', 'QUIN'];

/** Free public STUN: lets two browsers find each other's public address for a direct connection. */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

/** Free public TURN relay: the last resort for strict NATs (our own TURN from /api/turn is tried before it; see iceServers.ts). */
export const PUBLIC_TURN_SERVERS: RTCIceServer[] = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

/** Built-in list (direct connection is always tried first). */
export const ICE_SERVERS: RTCIceServer[] = [...STUN_SERVERS, ...PUBLIC_TURN_SERVERS];
