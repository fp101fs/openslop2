import type { CampaignDef, MissionDef } from './types';

/** Per-campaign completion, stored in localStorage as a list of mission keys. */
const key = (campaignId: string) => `sc2_campaign_done_${campaignId}`;

export function doneSet(campaignId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key(campaignId)) ?? '[]')); } catch { return new Set(); }
}
export function markDone(campaignId: string, missionKey: string) {
  const s = doneSet(campaignId); s.add(missionKey);
  try { localStorage.setItem(key(campaignId), JSON.stringify([...s])); } catch { /* storage blocked */ }
}
/** Default rule: linear (previous mission done). Missions may override with `unlock`. */
export function isUnlocked(c: CampaignDef, m: MissionDef, done: Set<string> = doneSet(c.id)): boolean {
  if (done.has(m.key)) return true;
  if (m.unlock) return m.unlock(done);
  const prev = c.missions.find(x => x.order === m.order - 1);
  return !prev || done.has(prev.key);
}
/** First unlocked, not-yet-done mission after `m` (story order), or undefined. */
export function nextMission(c: CampaignDef, m: MissionDef): MissionDef | undefined {
  const done = doneSet(c.id); done.add(m.key);
  return c.missions.filter(x => x.order > m.order).find(x => !done.has(x.key) && isUnlocked(c, x, done));
}
