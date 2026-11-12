import type { MissionDef } from '../../types';
import { doneSet } from '../../progress';

/** Shared defaults for Wings of Liberty missions (script-driven enemy, custom win). */
export function mission(m: Omit<MissionDef, 'spec' | 'playerFaction' | 'difficulty' | 'startingMinerals' | 'startingGas'> & Partial<MissionDef>): MissionDef {
  return {
    playerFaction: 'terran', difficulty: 'normal', startingMinerals: 400, startingGas: 0, noEnemyBase: true, aiOff: true, customWin: true,
    spec: 'docs/campaign/wings-of-liberty.md', ...m
  } as MissionDef;
}

/** Number of missions completed after `key` in completion order (Liquipedia: "and any 2 missions after it"). */
export function after(done: Set<string>, key: string): number {
  const list = [...done]; const i = list.indexOf(key); return i < 0 ? 0 : list.length - i - 1;
}
export const total = (done: Set<string>) => done.size;
/** Secret-mission flag set by Media Blitz when the Science Facility is destroyed. */
export const SECRET_KEY = 'sc2_wol_secret_piercing';
export const hasSecret = () => { try { return localStorage.getItem(SECRET_KEY) === '1'; } catch { return false; } };
export const setSecret = () => { try { localStorage.setItem(SECRET_KEY, '1'); } catch { /* storage blocked */ } };
/** Which Final-2 mission was played decides the All-In variant. */
export const tookAir = () => doneSet('wol').has('belly_of_the_beast');
