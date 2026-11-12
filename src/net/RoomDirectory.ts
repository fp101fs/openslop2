import { lobbyApi, RoomFields, RoomStatus } from './lobbyApi';

const HEARTBEAT_MS = 10_000;

/**
 * Host-side membership of the public game list: registers the room, keeps it alive with a heartbeat, pushes status changes
 * (open -> full -> live) immediately, and removes it on stop. Failures never affect the game: the heartbeat just retries,
 * and `onHealth` lets the UI say "not visible in Open Games" until it recovers.
 */
export class RoomDirectory {
  private room: RoomFields | null = null;
  private token = '';
  private timer: number | null = null;
  private healthy: boolean | null = null;
  private seq = 0;

  constructor(private onHealth?: (ok: boolean) => void) {}

  public start(room: RoomFields) {
    this.stop();
    this.room = { ...room, status: room.status ?? 'open' };
    this.token = '';
    void this.beat();
    this.timer = window.setInterval(() => void this.beat(), HEARTBEAT_MS);
  }

  public update(patch: Partial<RoomFields> & { status?: RoomStatus }) {
    if (!this.room) return;
    this.room = { ...this.room, ...patch };
    void this.beat(); // push right away so the list never shows a stale state
  }

  public stop() {
    this.seq++;
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.room && this.token) lobbyApi.remove(this.room.code, this.token);
    this.room = null;
    this.token = '';
    this.healthy = null;
  }

  private setHealth(ok: boolean) {
    if (this.healthy === ok) return;
    this.healthy = ok;
    this.onHealth?.(ok);
  }

  private async beat() {
    const room = this.room;
    if (!room) return;
    const seq = this.seq;
    try {
      const token = await lobbyApi.put(room, this.token || undefined);
      if (seq !== this.seq) { if (token) lobbyApi.remove(room.code, token); return; } // stopped while the request was in flight
      this.token = token;
      this.setHealth(true);
    } catch {
      if (seq === this.seq) this.setHealth(false);
    }
  }
}
