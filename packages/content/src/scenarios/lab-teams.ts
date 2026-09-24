import {
  createHeroBuild,
  ownCellCenter,
  withEquipment,
  type BoardSide,
  type HeroDefinitionId,
  type UnitSetup,
  type UpgradeCategory,
  type UpgradeDefinitionId,
} from "@jev-game/game";
import { boardArena } from "../arenas/board-arena.js";
import { gameCatalogue } from "../catalogue.js";
import { defaultFormation } from "../formations.js";

export type UpgradeIdsByHero = ReadonlyMap<HeroDefinitionId, readonly UpgradeDefinitionId[]>;

function piecesOf(pieceIds: readonly UpgradeDefinitionId[], category: UpgradeCategory): UpgradeDefinitionId[] {
  return pieceIds.filter((pieceId) => gameCatalogue.upgrades[pieceId]?.category === category);
}

export function teamUnits(
  teamId: string,
  heroIds: readonly HeroDefinitionId[],
  side: BoardSide,
  upgradeIdsByHero: UpgradeIdsByHero = new Map(),
): UnitSetup[] {
  const formation = defaultFormation(heroIds);

  return heroIds.map((heroId, index) => {
    const unitId = `${teamId}-${index + 1}`;
    const cell = formation[index];

    if (cell === undefined) {
      throw new Error(`no formation cell for ${unitId}`);
    }

    const picked = upgradeIdsByHero.get(heroId) ?? [];
    const talents = createHeroBuild(unitId, heroId, piecesOf(picked, "talent"), gameCatalogue);

    return {
      unitId,
      teamId,
      build: withEquipment(talents, piecesOf(picked, "item"), piecesOf(picked, "rune")),
      spawn: ownCellCenter(boardArena, side, cell),
    };
  });
}
