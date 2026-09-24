import {
  compileBuild,
  runeFitsHero,
  sideRows,
  withEquipment,
  type BoardCell,
  type Catalogue,
  type HeroBuild,
} from "@jev-game/game";
import { boardArena, centreOutColumns, isFrontlineHero } from "@jev-game/content";
import type { OwnedPiece, PlayerSeat } from "./types.js";
import type { RunRules } from "./rules.js";

export interface Loadout {
  heroBuilds: readonly HeroBuild[];
  items: readonly OwnedPiece[];
  runes: readonly OwnedPiece[];
}

export function piecesOnHero(pieces: readonly OwnedPiece[], heroSlot: number): OwnedPiece[] {
  return pieces.filter((piece) => piece.heroSlot === heroSlot);
}

export function stashedPieces(pieces: readonly OwnedPiece[]): OwnedPiece[] {
  return pieces.filter((piece) => piece.heroSlot === null);
}

export function equippedBuild(seat: PlayerSeat, heroSlot: number): HeroBuild | null {
  const build = seat.heroBuilds[heroSlot];

  if (build === undefined) {
    return null;
  }

  return withEquipment(
    build,
    piecesOnHero(seat.items, heroSlot).map((piece) => piece.pieceId),
    piecesOnHero(seat.runes, heroSlot).map((piece) => piece.pieceId),
  );
}

export function equippedBuilds(seat: PlayerSeat): HeroBuild[] {
  const builds: HeroBuild[] = [];

  for (let slot = 0; slot < seat.heroBuilds.length; slot += 1) {
    const build = equippedBuild(seat, slot);

    if (build !== null) {
      builds.push(build);
    }
  }

  return builds;
}

export function hasFreeItemSlot(seat: Loadout, heroSlot: number, rules: RunRules, ignoringInstanceId: string | null): boolean {
  if (seat.heroBuilds[heroSlot] === undefined) {
    return false;
  }

  const held = piecesOnHero(seat.items, heroSlot).filter((piece) => piece.instanceId !== ignoringInstanceId);

  return held.length < rules.itemSlots;
}

export function itemCanGoOn(
  seat: Loadout,
  pieceId: string,
  heroSlot: number,
  rules: RunRules,
  catalogue: Catalogue,
  ignoringInstanceId: string | null,
): boolean {
  if (!hasFreeItemSlot(seat, heroSlot, rules, ignoringInstanceId)) {
    return false;
  }

  const limit = catalogue.upgrades[pieceId]?.maxStacks ?? 1;
  let copies = 0;

  for (const piece of piecesOnHero(seat.items, heroSlot)) {
    if (piece.pieceId === pieceId && piece.instanceId !== ignoringInstanceId) {
      copies += 1;
    }
  }

  return copies < limit;
}

export function hasStashRoom(seat: Loadout, rules: RunRules, ignoringInstanceId: string | null): boolean {
  return stashedPieces(seat.items).filter((piece) => piece.instanceId !== ignoringInstanceId).length < rules.stashCapacity;
}

export function freeRuneSockets(seat: Loadout, heroSlot: number, catalogue: Catalogue, ignoringInstanceId: string | null): number {
  const build = seat.heroBuilds[heroSlot];

  if (build === undefined) {
    return 0;
  }

  const sockets = compileBuild(build, catalogue).runeSockets;
  const used = piecesOnHero(seat.runes, heroSlot).filter((piece) => piece.instanceId !== ignoringInstanceId).length;

  return Math.max(0, sockets - used);
}

export function runeCanGoOn(seat: Loadout, runeId: string, heroSlot: number, catalogue: Catalogue, ignoringInstanceId: string | null): boolean {
  const build = seat.heroBuilds[heroSlot];
  const rune = catalogue.upgrades[runeId];

  if (build === undefined || rune === undefined || !runeFitsHero(rune, build.heroId, catalogue)) {
    return false;
  }

  const duplicate = piecesOnHero(seat.runes, heroSlot).some(
    (piece) => piece.pieceId === runeId && piece.instanceId !== ignoringInstanceId,
  );

  return !duplicate && freeRuneSockets(seat, heroSlot, catalogue, ignoringInstanceId) > 0;
}

export function nextFormationCell(formation: readonly BoardCell[], heroId: string): BoardCell | null {
  const rowsPerSide = sideRows(boardArena);
  const frontToBack = Array.from({ length: rowsPerSide }, (_, row) => row);
  const rows = isFrontlineHero(heroId) ? frontToBack : [...frontToBack].reverse();
  const taken = new Set(formation.map((cell) => `${cell.column}:${cell.row}`));

  for (const row of rows) {
    for (const column of centreOutColumns(boardArena.columns)) {
      if (!taken.has(`${column}:${row}`)) {
        return { column, row };
      }
    }
  }

  return null;
}
