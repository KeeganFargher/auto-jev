import type { BattleSetup, HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { teamUnits, type UpgradeIdsByHero } from "./lab-teams.js";

export const MAX_LAB_TEAM_SIZE = 5;

export function createCustomLabSetup(
  seed: number,
  teamA: readonly HeroDefinitionId[],
  teamB: readonly HeroDefinitionId[],
  teamAUpgradeIdsByHero: UpgradeIdsByHero = new Map(),
): BattleSetup {
  if (teamA.length === 0 || teamB.length === 0 || teamA.length > MAX_LAB_TEAM_SIZE || teamB.length > MAX_LAB_TEAM_SIZE) {
    throw new Error(`a custom lab fight needs 1 to ${MAX_LAB_TEAM_SIZE} heroes on each side`);
  }

  return {
    rulesetId: "lab-custom",
    rulesetVersion: 1,
    seed,
    arenaId: boardArena.id,
    units: [...teamUnits("A", teamA, "south", teamAUpgradeIdsByHero), ...teamUnits("B", teamB, "north")],
  };
}
