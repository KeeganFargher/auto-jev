import { createHeroBuild, type BattleSetup, type HeroDefinitionId, type UpgradeDefinitionId } from "@jev-game/game";
import { bruiser } from "../heroes/bruiser.js";
import { flatArena } from "../arenas/flat-arena.js";
import { catalogue } from "../catalogue.js";

export function createDuelSetup(
  seed: number,
  teamAUpgradeIdsByHero: ReadonlyMap<HeroDefinitionId, readonly UpgradeDefinitionId[]> = new Map(),
): BattleSetup {
  return {
    rulesetId: "duel-prototype",
    rulesetVersion: 1,
    seed,
    arenaId: flatArena.id,
    units: [
      {
        unitId: "A-1",
        teamId: "A",
        build: createHeroBuild("A-1", bruiser.id, teamAUpgradeIdsByHero.get(bruiser.id) ?? [], catalogue),
        spawn: { x: 10, y: flatArena.height / 2 },
      },
      {
        unitId: "B-1",
        teamId: "B",
        build: createHeroBuild("B-1", bruiser.id, [], catalogue),
        spawn: { x: flatArena.width - 10, y: flatArena.height / 2 },
      },
    ],
  };
}
