import type { CampaignDef } from '../../types';
import { liberationDay } from './missions/liberationDay';
import { theOutlaws } from './missions/theOutlaws';
import { zeroHour } from './missions/zeroHour';
import { theEvacuation } from './missions/theEvacuation';
import { outbreak } from './missions/outbreak';
import { safeHaven } from './missions/safeHaven';
import { havensFall } from './missions/havensFall';
import { smashAndGrab } from './missions/smashAndGrab';
import { theDig } from './missions/theDig';
import { theMoebiusFactor } from './missions/theMoebiusFactor';
import { supernova } from './missions/supernova';
import { mawOfTheVoid } from './missions/mawOfTheVoid';
import { theDevilsPlayground } from './missions/theDevilsPlayground';
import { welcomeToTheJungle } from './missions/welcomeToTheJungle';
import { breakout } from './missions/breakout';
import { ghostOfAChance } from './missions/ghostOfAChance';
import { theGreatTrainRobbery } from './missions/theGreatTrainRobbery';
import { cutthroat } from './missions/cutthroat';
import { engineOfDestruction } from './missions/engineOfDestruction';
import { mediaBlitz } from './missions/mediaBlitz';
import { piercingTheShroud } from './missions/piercingTheShroud';
import { whispersOfDoom } from './missions/whispersOfDoom';
import { aSinisterTurn } from './missions/aSinisterTurn';
import { echoesOfTheFuture } from './missions/echoesOfTheFuture';
import { inUtterDarkness } from './missions/inUtterDarkness';
import { gatesOfHell } from './missions/gatesOfHell';
import { bellyOfTheBeast } from './missions/bellyOfTheBeast';
import { shatterTheSky } from './missions/shatterTheSky';
import { allIn } from './missions/allIn';

/** Wings of Liberty: 29 missions in 7 arcs. Flow/unlock rules: docs/campaign/wings-of-liberty-flow.md; specs: docs/campaign/wings-of-liberty.md. */
export const WOL: CampaignDef = {
  id: 'wol', name: 'Wings of Liberty', tagline: 'Jim Raynor\'s war against Mengsk and the Swarm', color: '#d23c3c', hero: 'marine',
  missions: [liberationDay, theOutlaws, zeroHour, theEvacuation, outbreak, safeHaven, havensFall, smashAndGrab, theDig, theMoebiusFactor, supernova, mawOfTheVoid,
    theDevilsPlayground, welcomeToTheJungle, breakout, ghostOfAChance, theGreatTrainRobbery, cutthroat, engineOfDestruction, mediaBlitz, piercingTheShroud,
    whispersOfDoom, aSinisterTurn, echoesOfTheFuture, inUtterDarkness, gatesOfHell, bellyOfTheBeast, shatterTheSky, allIn]
};
