import {
  gemFitsSkill,
  gemSocketsFor,
  sideRows,
  withEquipment,
  type BoardCell,
  type Catalogue,
  type EquippedGem,
  type HeroBuild,
  type SkillSlot,
} from "@jev-game/game";
import { boardArena, centreOutColumns, isFrontlineHero } from "@jev-game/content";
import type { OwnedGem, OwnedPiece, PlayerSeat } from "./types.js";
import type { RunRules } from "./rules.js";

export interface Loadout {
  heroBuilds: readonly HeroBuild[];
  items: readonly OwnedPiece[];
  gems: readonly OwnedGem[];
}

export function piecesOnHero<T extends OwnedPiece>(pieces: readonly T[], heroSlot: number): T[] {
  return pieces.filter((piece) => piece.heroSlot === heroSlot);
}

export function stashedPieces<T extends OwnedPiece>(pieces: readonly T[]): T[] {
  return pieces.filter((piece) => piece.heroSlot === null);
}

export function gemsInSkill(gems: readonly OwnedGem[], heroSlot: number, skill: SkillSlot): OwnedGem[] {
  return gems.filter((gem) => gem.heroSlot === heroSlot && gem.skill === skill);
}

export function equippedGems(gems: readonly OwnedGem[], heroSlot: number): EquippedGem[] {
  const equipped: EquippedGem[] = [];

  for (const gem of piecesOnHero(gems, heroSlot)) {
    if (gem.skill !== null) {
      equipped.push({ gemId: gem.pieceId, slot: gem.skill });
    }
  }

  return equipped;
}

export function loadoutBuild(loadout: Loadout, heroSlot: number): HeroBuild | null {
  const build = loadout.heroBuilds[heroSlot];

  if (build === undefined) {
    return null;
  }

  return withEquipment(
    build,
    piecesOnHero(loadout.items, heroSlot).map((piece) => piece.pieceId),
    equippedGems(loadout.gems, heroSlot),
  );
}

export function equippedBuild(seat: PlayerSeat, heroSlot: number): HeroBuild | null {
  return loadoutBuild(seat, heroSlot);
}

export function loadoutBuilds(loadout: Loadout): HeroBuild[] {
  const builds: HeroBuild[] = [];

  for (let slot = 0; slot < loadout.heroBuilds.length; slot += 1) {
    const build = loadoutBuild(loadout, slot);

    if (build !== null) {
      builds.push(build);
    }
  }

  return builds;
}

export function equippedBuilds(seat: PlayerSeat): HeroBuild[] {
  return loadoutBuilds(seat);
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

export function gemSockets(seat: Loadout, heroSlot: number, skill: SkillSlot, catalogue: Catalogue): number {
  const build = loadoutBuild(seat, heroSlot);
  const hero = build === null ? undefined : catalogue.heroes[build.heroId];

  return build === null || hero === undefined ? 0 : gemSocketsFor(hero, build, catalogue)[skill];
}

export function stashOverflowGems(seat: Loadout, catalogue: Catalogue): OwnedGem[] {
  const socketed = new Map<string, number>();

  return seat.gems.map((gem) => {
    if (gem.heroSlot === null || gem.skill === null) {
      return gem;
    }

    const key = `${gem.heroSlot}:${gem.skill}`;
    const used = socketed.get(key) ?? 0;

    if (used < gemSockets(seat, gem.heroSlot, gem.skill, catalogue)) {
      socketed.set(key, used + 1);

      return gem;
    }

    return { ...gem, heroSlot: null, skill: null };
  });
}

export function freeGemSockets(seat: Loadout, heroSlot: number, skill: SkillSlot, catalogue: Catalogue, ignoringInstanceId: string | null): number {
  const used = gemsInSkill(seat.gems, heroSlot, skill).filter((gem) => gem.instanceId !== ignoringInstanceId).length;

  return Math.max(0, gemSockets(seat, heroSlot, skill, catalogue) - used);
}

export function gemCanGoOn(
  seat: Loadout,
  gemId: string,
  heroSlot: number,
  skill: SkillSlot,
  catalogue: Catalogue,
  ignoringInstanceId: string | null,
): boolean {
  const build = seat.heroBuilds[heroSlot];
  const gem = catalogue.upgrades[gemId];

  if (build === undefined || gem === undefined || !gemFitsSkill(gem, build.heroId, skill, catalogue)) {
    return false;
  }

  const duplicate = gemsInSkill(seat.gems, heroSlot, skill).some((owned) => owned.pieceId === gemId && owned.instanceId !== ignoringInstanceId);

  return !duplicate && freeGemSockets(seat, heroSlot, skill, catalogue, ignoringInstanceId) > 0;
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
