import {
  DEFAULT_TICK_LIMIT,
  isValidFormation,
  ownCellCenter,
  type BattleSetup,
  type BoardCell,
  type BoardSide,
  type HeroDefinitionId,
  type UnitSetup,
} from "@jev-game/game";
import { boardArena } from "@jev-game/content";
import type { PlayerId } from "./ids.js";

export const MATCH_RULESET_ID = "run-match";

export const MATCH_RULESET_VERSION = 3;

export interface TeamPlacement {
  playerId: PlayerId;
  heroIds: readonly HeroDefinitionId[];
  formation: readonly BoardCell[];
}

function teamUnits(team: TeamPlacement, side: BoardSide): UnitSetup[] {
  if (team.heroIds.length === 0) {
    throw new Error(`Player "${team.playerId}" goes to battle with no heroes`);
  }

  if (!isValidFormation(boardArena, team.formation, team.heroIds.length)) {
    throw new Error(`Player "${team.playerId}" goes to battle with an invalid formation`);
  }

  return team.heroIds.map((heroId, index) => {
    const unitId = `${team.playerId}-${index + 1}`;
    const cell = team.formation[index];

    if (cell === undefined) {
      throw new Error(`No formation cell for ${unitId}`);
    }

    return { unitId, teamId: team.playerId, heroId, spawn: ownCellCenter(boardArena, side, cell) };
  });
}

export function createMatchBattleSetup(
  seed: number,
  teamA: TeamPlacement,
  teamB: TeamPlacement,
): BattleSetup {
  return {
    rulesetId: MATCH_RULESET_ID,
    rulesetVersion: MATCH_RULESET_VERSION,
    seed,
    arenaId: boardArena.id,
    tickLimit: DEFAULT_TICK_LIMIT,
    units: [...teamUnits(teamA, "south"), ...teamUnits(teamB, "north")],
  };
}
