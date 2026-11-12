import type { LevelDef } from './LevelTypes';
import { mkBase, scaleLevel } from './LevelHelpers';
import { alienPlanet } from './defs/alienPlanet';
import { sandstoneGulch } from './defs/sandstoneGulch';
import { craterCity } from './defs/craterCity';
import { oliveMeadows } from './defs/oliveMeadows';
import { glacialRift } from './defs/glacialRift';
import { mossRuins } from './defs/mossRuins';
import { mireRiver } from './defs/mireRiver';
import { CAMPAIGN_LEVELS } from '../campaign/maps';
import { sunkenCityLevel } from './SlopmapLoader';

/**
 * All data-driven levels, keyed by their MapId. Each def is authored at a compact size and blown up here
 * (`scaleLevel`) so the playfields are big; extra expansions use the new room.
 */
export const LEVELS: Record<string, LevelDef> = {
  sandstone_gulch: scaleLevel(sandstoneGulch, 1.7, {
    name: 'Sandstone Gulch (2P Small)', description: sandstoneGulch.description.replace('Small 96x96', 'Small 163x163')
  }, [mkBase([138, 30], 3.927, 'third')]),
  alien_planet: scaleLevel(alienPlanet, 1.5, {
    name: 'Alien Planet (2P Medium)', description: alienPlanet.description.replace('Medium 128x128', 'Medium 192x192')
  }, [mkBase([162, 16], 4.32, 'third')]),
  crater_city: scaleLevel(craterCity, 1.4545, {
    name: 'Crater City (2P Large)', description: craterCity.description.replace('Large 176x176', 'Large 256x256')
  }, [mkBase([21, 75], 5.498, 'third'), mkBase([141, 51], 2.749, 'third')]),
  olive_meadows: scaleLevel(oliveMeadows, 1.4, {
    name: 'Olive Meadows (2P Large)', description: oliveMeadows.description
  }, [mkBase([117, 42], 0.785, 'third'), mkBase([138, 99], 2.356, 'third')]),
  glacial_rift: scaleLevel(glacialRift, 1.5, { name: 'Glacial Rift (2P Large)', description: glacialRift.description }, [mkBase([132, 78], 4.32, 'third')]),
  moss_ruins: scaleLevel(mossRuins, 1.8, { name: 'Moss Ruins (2P XL)', description: mossRuins.description }, [mkBase([117, 81], 4.712, 'third')]),
  mire_river: scaleLevel(mireRiver, 2, { name: 'Mire River (2P XL)', description: mireRiver.description }, [mkBase([105, 87], 0.785, 'third')]),
  sunken_city: sunkenCityLevel,
  ...CAMPAIGN_LEVELS
};
