import { test, expect } from 'bun:test';
import { GAME_VERSION, TOOL_VERSIONS, FORMAT_VERSIONS } from './version';
import { SAVE_VERSION } from './save/SaveState';
import { SLOPMAP_VERSION } from '../tools/level/slopmap';
import pkg from '../package.json';
import studioPkg from '../tools/voice-studio/package.json';
import fixture from './campaign/data/fixtures/fixture.openslop2mission' with { type: 'json' };

const SEMVER = /^\d+\.\d+\.\d+$/;

test('package.json files match src/version.ts', () => {
  expect(pkg.version).toBe(GAME_VERSION);
  expect(studioPkg.version).toBe(TOOL_VERSIONS.voiceStudio);
});

test('Voice Studio header shows its version (static HTML, kept by hand)', async () => {
  const html = await Bun.file(new URL('../tools/voice-studio/index.html', import.meta.url)).text();
  expect(html).toContain(`v${TOOL_VERSIONS.voiceStudio}<`);
});

test('all app versions are semver', () => {
  for (const v of [GAME_VERSION, ...Object.values(TOOL_VERSIONS)]) expect(v).toMatch(SEMVER);
});

test('format versions match the readers', () => {
  expect(FORMAT_VERSIONS.save).toBe(SAVE_VERSION);
  expect(FORMAT_VERSIONS.map).toBe(SLOPMAP_VERSION);
  expect((fixture as { version: number }).version).toBe(FORMAT_VERSIONS.mission);
});
