import type { CampaignDef, MissionDef } from './types';
import { NCO } from './campaigns/nco';
import { WOL } from './campaigns/wol';

/** Add a campaign here and it appears as a pathway on the Campaign select screen. */
export const CAMPAIGNS: CampaignDef[] = [NCO, WOL];

export const campaignById = (id: string) => CAMPAIGNS.find(c => c.id === id);
export function missionOf(campaignId: string | undefined, key: string | undefined): MissionDef | undefined {
  return campaignById(campaignId ?? '')?.missions.find(m => m.key === key);
}
