import {
  isValidFormation,
  ownCellCenter,
  type BattleSetup,
  type BoardCell,
  type BoardSide,
  type HeroBuild,
  type UnitSetup,
} from "@jev-game/game";
import { boardArena, defaultFormation } from "@jev-game/content";
import type { PlayerId } from "./ids.js";

export interface TeamPlacement {
  playerId: PlayerId;
  heroBuilds: readonly HeroBuild[];
  formation: readonly BoardCell[];
}

function teamUnits(team: TeamPlacement, side: BoardSide): UnitSetup[] {
  const formation = isValidFormation(boardArena, team.formation, team.heroBuilds.length)
    ? team.formation
    : defaultFormation(team.heroBuilds.map((build) => build.heroId));

  return team.heroBuilds.map((build, index) => ({
    unitId: `${team.playerId}-${index}`,
    teamId: team.playerId,
    build,
    spawn: ownCellCenter(boardArena, side, formation[index]!),
  }));
}

export function createMatchBattleSetup(seed: number, teamA: TeamPlacement, teamB: TeamPlacement): BattleSetup {
  return {
    rulesetId: "run-match",
    rulesetVersion: 2,
    seed,
    arenaId: boardArena.id,
    units: [...teamUnits(teamA, "south"), ...teamUnits(teamB, "north")],
  };
}
