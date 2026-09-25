import type { BattleSetup, HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { bulwark } from "../roster/bulwark.js";
import { duskblade } from "../roster/duskblade.js";
import { frostweaver } from "../roster/frostweaver.js";
import { pyromancer } from "../roster/pyromancer.js";
import { teamUnits, type LabPicksByHero } from "./lab-teams.js";

export const THREE_VERSUS_THREE_TEAM_A: readonly HeroDefinitionId[] = [bulwark.id, frostweaver.id, duskblade.id];

export const THREE_VERSUS_THREE_TEAM_B: readonly HeroDefinitionId[] = [bulwark.id, pyromancer.id, duskblade.id];

export function createThreeVersusThreeSetup(seed: number, teamAPicksByHero: LabPicksByHero = new Map()): BattleSetup {
  return {
    rulesetId: "three-vs-three",
    rulesetVersion: 1,
    seed,
    arenaId: boardArena.id,
    units: [
      ...teamUnits("A", THREE_VERSUS_THREE_TEAM_A, "south", teamAPicksByHero),
      ...teamUnits("B", THREE_VERSUS_THREE_TEAM_B, "north"),
    ],
  };
}
