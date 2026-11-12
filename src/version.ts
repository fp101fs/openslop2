/**
 * Versions for everything OpenSlop II ships. See "Versioning" in the README.
 *
 * Apps use semver and stay below 1.0 until their features and file formats are stable:
 * minor = new features or breaking changes, patch = fixes.
 * File formats use a plain integer that goes up only when old files can no longer load as-is.
 * src/version.test.ts keeps these in sync with package.json and the format readers.
 */

/** OpenSlop II Web: the game (also package.json "version"). */
export const GAME_VERSION = '0.6.0';

/** Tools and servers, versioned on their own. */
export const TOOL_VERSIONS = {
  missionBuilder: '0.1.0', // tools/mission-builder
  server: '0.1.0',         // OpenSlop II Server: server/relay.ts + api/
  voiceStudio: '0.1.0',    // tools/voice-studio (TTS); also its package.json "version"
} as const;

/** Data file formats. */
export const FORMAT_VERSIONS = {
  mission: 1, // .openslop2mission (MissionData.version)
  save: 1,    // save games (SAVE_VERSION)
  map: 1,     // .slopmap (SLOPMAP_VERSION)
} as const;
