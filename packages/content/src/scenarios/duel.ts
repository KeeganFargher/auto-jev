import type { BattleSetup } from "@jev-game/game";
import { bruiser } from "../heroes/bruiser.js";
import { flatArena } from "../arenas/flat-arena.js";

export function createDuelSetup(seed: number): BattleSetup {
  return {
    rulesetId: "duel-prototype",
    rulesetVersion: 1,
    seed,
    arenaId: flatArena.id,
    units: [
      {
        unitId: "A-1",
        teamId: "A",
        heroId: bruiser.id,
        spawn: { x: 10, y: flatArena.height / 2 },
      },
      {
        unitId: "B-1",
        teamId: "B",
        heroId: bruiser.id,
        spawn: { x: flatArena.width - 10, y: flatArena.height / 2 },
      },
    ],
  };
}
