import { test, expect } from 'bun:test';
import { versionMismatchError } from './versionCheck';
import { GAME_VERSION } from '../version';

test('same version passes', () => {
  expect(versionMismatchError(GAME_VERSION, 'host')).toBeNull();
});

test('different or missing version is refused with both versions named', () => {
  expect(versionMismatchError('0.0.1', 'host', '0.6.0')).toBe('The host is on v0.0.1, you are on v0.6.0. Both players need the same version: refresh the page to update.');
  expect(versionMismatchError(undefined, 'guest', '0.6.0')).toContain('The other player is on an older version');
  expect(versionMismatchError('<script>', 'host', '0.6.0')).toContain('an older version'); // never echoes junk
});
