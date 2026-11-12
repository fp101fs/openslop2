import data from './liberation_day.opensc2mission';
import { dataMission } from '../../../data/compile';

/** 1. Liberation Day - "Destroy the Dominion Outpost". Everything (map, units, triggers, dialogue) is in liberation_day.opensc2mission;
 *  edit it in the Mission Builder (bun run mission-builder). Research: docs/campaign/wol/01-liberation-day/README.md. */
export const liberationDay = dataMission(data);
