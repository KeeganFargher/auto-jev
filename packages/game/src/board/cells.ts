import type { Vector2 } from "../math/vector.js";

export interface BoardGrid {
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export interface BoardCell {
  column: number;
  row: number;
}

export type BoardSide = "south" | "north";

export function cellSize(grid: BoardGrid): number {
  return grid.width / grid.columns;
}

export function sideRows(grid: BoardGrid): number {
  return grid.rows / 2;
}

export function isOwnCell(grid: BoardGrid, cell: BoardCell): boolean {
  return (
    Number.isInteger(cell.column) &&
    Number.isInteger(cell.row) &&
    cell.column >= 0 &&
    cell.column < grid.columns &&
    cell.row >= 0 &&
    cell.row < sideRows(grid)
  );
}

export function ownCellToBoardCell(grid: BoardGrid, side: BoardSide, cell: BoardCell): BoardCell {
  const frontRow = sideRows(grid);

  if (side === "south") {
    return { column: cell.column, row: frontRow + cell.row };
  }

  return { column: grid.columns - 1 - cell.column, row: frontRow - 1 - cell.row };
}

export function boardCellCenter(grid: BoardGrid, cell: BoardCell): Vector2 {
  const size = cellSize(grid);

  return { x: (cell.column + 0.5) * size, y: (cell.row + 0.5) * size };
}

export function ownCellCenter(grid: BoardGrid, side: BoardSide, cell: BoardCell): Vector2 {
  return boardCellCenter(grid, ownCellToBoardCell(grid, side, cell));
}

export function ownCellAt(grid: BoardGrid, side: BoardSide, point: Vector2): BoardCell | null {
  const size = cellSize(grid);
  const boardColumn = Math.floor(point.x / size);
  const boardRow = Math.floor(point.y / size);
  const frontRow = sideRows(grid);

  const cell =
    side === "south"
      ? { column: boardColumn, row: boardRow - frontRow }
      : { column: grid.columns - 1 - boardColumn, row: frontRow - 1 - boardRow };

  return isOwnCell(grid, cell) ? cell : null;
}

export function isValidFormation(grid: BoardGrid, formation: readonly BoardCell[], heroCount: number): boolean {
  if (formation.length !== heroCount) {
    return false;
  }

  const occupied = new Set<string>();

  for (const cell of formation) {
    if (!isOwnCell(grid, cell)) {
      return false;
    }

    const key = `${cell.column}:${cell.row}`;

    if (occupied.has(key)) {
      return false;
    }

    occupied.add(key);
  }

  return true;
}

export function sameFormation(first: readonly BoardCell[], second: readonly BoardCell[]): boolean {
  return (
    first.length === second.length &&
    first.every((cell, index) => cell.column === second[index]?.column && cell.row === second[index]?.row)
  );
}
