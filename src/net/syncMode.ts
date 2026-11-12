/**
 * How online matches stay in sync (see NetSync.ts). The host decides and sends it to the guest in the match config.
 * Lockstep is the default; `?sync=snapshot` in the host's URL forces the original host-runs-everything mode.
 */
export type SyncMode = 'lockstep' | 'snapshot';

export function preferredSyncMode(): SyncMode {
  try {
    return new URLSearchParams(location.search).get('sync') === 'snapshot' ? 'snapshot' : 'lockstep';
  } catch {
    return 'lockstep';
  }
}
