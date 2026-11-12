import type { CampaignDef } from '../../types';
import { theEscape } from './missions/theEscape';
import { suddenStrike } from './missions/suddenStrike';
import { enemyIntelligence } from './missions/enemyIntelligence';
import { troubleInParadise } from './missions/troubleInParadise';
import { nightTerrors } from './missions/nightTerrors';
import { flashpoint } from './missions/flashpoint';
import { inTheEnemysShadow } from './missions/inTheEnemysShadow';
import { darkSkies } from './missions/darkSkies';
import { endGame } from './missions/endGame';

/** Nova Covert Ops: 9 linear missions in 3 packs. Spec: docs/campaign/nova-covert-ops.md. One file per mission in ./missions. */
export const NCO: CampaignDef = {
  id: 'nco', name: 'Nova Covert Ops', tagline: 'Agent Nova Terra uncovers the Defenders of Man', color: '#c9a227', hero: 'nova',
  missions: [theEscape, suddenStrike, enemyIntelligence, troubleInParadise, nightTerrors, flashpoint, inTheEnemysShadow, darkSkies, endGame]
};
