import type { BattleSetup, HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { bulwark } from "../roster/bulwark.js";
import { duskblade } from "../roster/duskblade.js";
import { teamUnits, type UpgradeIdsByHero } from "./lab-teams.js";

export const DUEL_TEAM_A: readonly HeroDefinitionId[] = [duskblade.id];

export const DUEL_TEAM_B: readonly HeroDefinitionId[] = [bulwark.id];

export function createDuelSetup(seed: number, teamAUpgradeIdsByHero: UpgradeIdsByHero = new Map()): BattleSetup {
  return {
    rulesetId: "duel",
    rulesetVersion: 1,
    seed,
    arenaId: boardArena.id,
    units: [...teamUnits("A", DUEL_TEAM_A, "south", teamAUpgradeIdsByHero), ...teamUnits("B", DUEL_TEAM_B, "north")],
  };
}
