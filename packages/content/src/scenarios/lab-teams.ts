import {
  createHeroBuild,
  ownCellCenter,
  withEquipment,
  type BoardSide,
  type EquippedGem,
  type HeroDefinitionId,
  type UnitSetup,
  type UpgradeCategory,
  type UpgradeDefinitionId,
} from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { gameCatalogue } from "../catalogue.js";
import { defaultFormation } from "../formations.js";

export interface LabHeroPicks {
  upgradeIds: readonly UpgradeDefinitionId[];
  gems: readonly EquippedGem[];
}

export type LabPicksByHero = ReadonlyMap<HeroDefinitionId, LabHeroPicks>;

function piecesOf(pieceIds: readonly UpgradeDefinitionId[], category: UpgradeCategory): UpgradeDefinitionId[] {
  return pieceIds.filter((pieceId) => gameCatalogue.upgrades[pieceId]?.category === category);
}

export function teamUnits(teamId: string, heroIds: readonly HeroDefinitionId[], side: BoardSide, picksByHero: LabPicksByHero = new Map()): UnitSetup[] {
  const formation = defaultFormation(heroIds);

  return heroIds.map((heroId, index) => {
    const unitId = `${teamId}-${index + 1}`;
    const cell = formation[index];

    if (cell === undefined) {
      throw new Error(`no formation cell for ${unitId}`);
    }

    const picks = picksByHero.get(heroId);
    const picked = picks?.upgradeIds ?? [];
    const levelled = createHeroBuild(unitId, heroId, piecesOf(picked, "level"), gameCatalogue);

    return {
      unitId,
      teamId,
      build: withEquipment(levelled, piecesOf(picked, "item"), picks?.gems ?? []),
      spawn: ownCellCenter(boardArena, side, cell),
    };
  });
}
