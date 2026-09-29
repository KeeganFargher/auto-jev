import { DEFAULT_TICK_LIMIT, type BattleSetup, type HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { teamUnits } from "./lab-teams.js";

export const MAX_LAB_TEAM_SIZE = 5;

export function createCustomLabSetup(
  seed: number,
  teamA: readonly HeroDefinitionId[],
  teamB: readonly HeroDefinitionId[],
): BattleSetup {
  if (
    teamA.length === 0 ||
    teamB.length === 0 ||
    teamA.length > MAX_LAB_TEAM_SIZE ||
    teamB.length > MAX_LAB_TEAM_SIZE
  ) {
    throw new Error(`A lab fight needs 1 to ${MAX_LAB_TEAM_SIZE} heroes on each side`);
  }

  return {
    rulesetId: "lab",
    rulesetVersion: 1,
    seed,
    arenaId: boardArena.id,
    tickLimit: DEFAULT_TICK_LIMIT,
    units: [...teamUnits("A", teamA, "south"), ...teamUnits("B", teamB, "north")],
  };
}
