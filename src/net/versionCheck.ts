import { GAME_VERSION } from '../version';

const label = (v: unknown) => typeof v === 'string' && /^[\w.\-]{1,20}$/.test(v) ? `v${v}` : 'an older version';

/**
 * Both players must run the same game version: different builds simulate differently and desync.
 * `theirs` is the other side's version (undefined from builds before this check). Returns null when it matches,
 * otherwise the message for the player on `mine`. `who` is the other side's role.
 */
export function versionMismatchError(theirs: unknown, who: 'host' | 'guest', mine: unknown = GAME_VERSION): string | null {
  if (theirs === mine) return null;
  const other = who === 'host' ? 'The host' : 'The other player';
  return `${other} is on ${label(theirs)}, you are on ${label(mine)}. Both players need the same version: refresh the page to update.`;
}
