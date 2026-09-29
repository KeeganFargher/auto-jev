import {
  ownCellCenter,
  type BoardSide,
  type HeroDefinitionId,
  type UnitSetup,
} from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { defaultFormation } from "../formations.js";

export function teamUnits(
  teamId: string,
  heroIds: readonly HeroDefinitionId[],
  side: BoardSide,
): UnitSetup[] {
  const formation = defaultFormation(heroIds);

  return heroIds.map((heroId, index) => {
    const unitId = `${teamId}-${index + 1}`;
    const cell = formation[index];

    if (cell === undefined) {
      throw new Error(`No formation cell for ${unitId}`);
    }

    return { unitId, teamId, heroId, spawn: ownCellCenter(boardArena, side, cell) };
  });
}
