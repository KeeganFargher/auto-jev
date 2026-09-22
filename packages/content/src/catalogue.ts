import type { Catalogue } from "@jev-game/game";
import { bruiser } from "./heroes/bruiser.js";
import { ranger } from "./heroes/ranger.js";
import { support } from "./heroes/support.js";
import { strike } from "./abilities/strike.js";
import { bolt } from "./abilities/bolt.js";
import { mend } from "./abilities/mend.js";
import { flatArena } from "./arenas/flat-arena.js";
import { mendShield } from "./reactions/mend-shield.js";
import { moreMaxHp } from "./upgrades/more-max-hp.js";
import { fasterAttacks } from "./upgrades/faster-attacks.js";
import { extraLightningBounce } from "./upgrades/extra-lightning-bounce.js";
import { healingThatAlsoShields } from "./upgrades/healing-that-also-shields.js";
import { strongerShield } from "./upgrades/stronger-shield.js";
import { bonusDamageVsSlowed } from "./upgrades/bonus-damage-vs-slowed.js";

export const catalogue: Catalogue = {
  heroes: { [bruiser.id]: bruiser, [ranger.id]: ranger, [support.id]: support },
  abilities: { [strike.id]: strike, [bolt.id]: bolt, [mend.id]: mend },
  arenas: { [flatArena.id]: flatArena },
  upgrades: {
    [moreMaxHp.id]: moreMaxHp,
    [fasterAttacks.id]: fasterAttacks,
    [extraLightningBounce.id]: extraLightningBounce,
    [healingThatAlsoShields.id]: healingThatAlsoShields,
    [strongerShield.id]: strongerShield,
    [bonusDamageVsSlowed.id]: bonusDamageVsSlowed,
  },
  reactions: { [mendShield.id]: mendShield },
};
