import { cellSize, sideRows, type BoardCell, type HeroDefinitionId } from "@jev-game/game";
import { boardArena } from "./arenas/board-arena.js";
import { gameCatalogue } from "./catalogue.js";

const FRONTLINE_MAX_RANGE_CELLS = 1.5;

export function centreOutColumns(columns: number): number[] {
  const order: number[] = [];
  const left = Math.floor((columns - 1) / 2);

  for (let offset = 0; order.length < columns; offset += 1) {
    const leftColumn = left - offset;
    const rightColumn = left + 1 + offset;

    if (leftColumn >= 0) {
      order.push(leftColumn);
    }

    if (rightColumn < columns) {
      order.push(rightColumn);
    }
  }

  return order;
}

export function isFrontlineHero(heroId: HeroDefinitionId): boolean {
  const hero = gameCatalogue.heroes[heroId];

  if (hero === undefined) {
    return true;
  }

  const basicAttackRange = gameCatalogue.abilities[hero.basicAttackId]?.range ?? 0;

  return basicAttackRange <= cellSize(boardArena) * FRONTLINE_MAX_RANGE_CELLS;
}

export function defaultFormation(
  heroIds: readonly HeroDefinitionId[],
  columnOrder: readonly number[] = centreOutColumns(boardArena.columns),
): BoardCell[] {
  const rowsPerSide = sideRows(boardArena);
  const frontToBack = Array.from({ length: rowsPerSide }, (_, row) => row);
  const backToFront = [...frontToBack].reverse();
  const taken = new Set<string>();

  return heroIds.map((heroId) => {
    const rowOrder = isFrontlineHero(heroId) ? frontToBack : backToFront;

    for (const row of rowOrder) {
      for (const column of columnOrder) {
        const key = `${column}:${row}`;

        if (!taken.has(key)) {
          taken.add(key);

          return { column, row };
        }
      }
    }

    throw new Error(`no free cell left for hero "${heroId}"`);
  });
}
