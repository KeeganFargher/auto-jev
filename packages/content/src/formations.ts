import {
  heroDefinition,
  sideRows,
  type BoardCell,
  type HeroDefinitionId,
  type HeroRole,
} from "@jev-game/game";
import { boardArena } from "./arenas/board-arena.js";
import { gameCatalogue } from "./catalogue.js";

const MIDLINE_ROW = 1;

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

function rowOrder(role: HeroRole, rows: number): number[] {
  const frontToBack = Array.from({ length: rows }, (_, row) => row);

  switch (role) {
    case "frontline":
      return frontToBack;
    case "midline":
      return frontToBack.sort(
        (first, second) =>
          Math.abs(first - MIDLINE_ROW) - Math.abs(second - MIDLINE_ROW) || second - first,
      );
    case "backline":
      return frontToBack.reverse();
  }
}

export function heroRole(heroId: HeroDefinitionId): HeroRole {
  return heroDefinition(gameCatalogue, heroId).role;
}

export function defaultFormation(
  heroIds: readonly HeroDefinitionId[],
  columnOrder: readonly number[] = centreOutColumns(boardArena.columns),
): BoardCell[] {
  const rows = sideRows(boardArena);
  const taken = new Set<string>();

  return heroIds.map((heroId) => {
    for (const row of rowOrder(heroRole(heroId), rows)) {
      for (const column of columnOrder) {
        const key = `${column}:${row}`;

        if (!taken.has(key)) {
          taken.add(key);

          return { column, row };
        }
      }
    }

    throw new Error(`No free cell left for hero "${heroId}"`);
  });
}
