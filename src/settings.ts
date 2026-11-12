/**
 * Player settings saved in localStorage: game speed and brightness.
 *
 * Game speed: unit and building stats in config.ts are SC2 "Faster" values (Liquipedia numbers), so a
 * simulation multiplier of 1.0 is exact SC2 ladder pace. The other speeds use SC2's ratios
 * (Slower 0.6, Slow 0.8, Normal 1.0, Fast 1.2, Faster 1.4); the Options slider sets any value in between.
 */

export type GameSpeedId = 'slower' | 'slow' | 'normal' | 'fast' | 'faster' | 'turbo';

/** Presets on SC2's scale (Normal = 1.0x, Faster = 1.4x). Turbo is the old pace (1.4 x Faster). */
export const GAME_SPEEDS: { id: GameSpeedId; label: string; ratio: number }[] = [
  { id: 'slower', label: 'Slower', ratio: 0.6 },
  { id: 'slow', label: 'Slow', ratio: 0.8 },
  { id: 'normal', label: 'Normal', ratio: 1.0 },
  { id: 'fast', label: 'Fast', ratio: 1.2 },
  { id: 'faster', label: 'Faster (SC2 ladder)', ratio: 1.4 },
  { id: 'turbo', label: 'Turbo', ratio: 1.96 },
];

/** Slider range, on the same SC2 scale. */
export const SPEED_MIN = 0.5, SPEED_MAX = 2.0, SPEED_STEP = 0.01;
export const DEFAULT_SPEED_RATIO = 1.4;
const SPEED_KEY = 'sc2_game_speed_ratio';
const BRIGHT_KEY = 'sc2_brightness';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode: setting lasts for this session only */ }
}

const clampRatio = (r: number) => Math.round(Math.max(SPEED_MIN, Math.min(SPEED_MAX, r)) * 100) / 100;
let speedRatio = (() => { const n = Number(read(SPEED_KEY)); return n > 0 ? clampRatio(n) : DEFAULT_SPEED_RATIO; })();

/** Current game speed on SC2's scale (1.4 = Faster). */
export function getSpeedRatio(): number { return speedRatio; }
export function setSpeedRatio(r: number) {
  if (!(r > 0)) return;
  speedRatio = clampRatio(r);
  write(SPEED_KEY, String(speedRatio));
}
/** The preset matching a ratio, or null for a custom slider value. */
export function speedPresetFor(r: number): GameSpeedId | null {
  return GAME_SPEEDS.find(g => Math.abs(g.ratio - r) < 0.001)?.id ?? null;
}
/** Simulation multiplier (1.0 = SC2 Faster, since unit stats are Faster values). */
export function gameSpeedMult(r: number = speedRatio): number { return r / 1.4; }

/** Brightness as a percentage (50..150, 100 = default look). */
export const DEFAULT_BRIGHTNESS = 100;
let brightness = (() => { const n = Number(read(BRIGHT_KEY)); return n >= 50 && n <= 150 ? n : DEFAULT_BRIGHTNESS; })();
export function getBrightness(): number { return brightness; }
export function setBrightness(pct: number) {
  brightness = Math.max(50, Math.min(150, Math.round(pct)));
  write(BRIGHT_KEY, String(brightness));
}
