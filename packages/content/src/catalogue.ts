import type { Catalogue, HeroDefinition, HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "./arenas/board-arena.js";
import { berserker } from "./heroes/berserker.js";
import { bubbleCleric } from "./heroes/bubble-cleric.js";
import { firebrand } from "./heroes/firebrand.js";
import { burr } from "./heroes/burr.js";
import { harpooner } from "./heroes/harpooner.js";
import { mags } from "./heroes/mags.js";
import { paladin } from "./heroes/paladin.js";
import { trainingDummy } from "./heroes/training-dummy.js";

const heroes: HeroDefinition[] = [
  paladin,
  berserker,
  firebrand,
  bubbleCleric,
  harpooner,
  mags,
  burr,
  trainingDummy,
];

export const gameCatalogue: Catalogue = {
  heroes: Object.fromEntries(heroes.map((hero) => [hero.id, hero])),
  arenas: { [boardArena.id]: boardArena },
};

export const DRAFTABLE_HERO_IDS: readonly HeroDefinitionId[] = heroes.flatMap((hero) =>
  hero.draftable ? [hero.id] : [],
);
