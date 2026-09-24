import type { AreaDefinition } from "../definitions.js";
import type { UnitState } from "./state.js";
import { directionTo, distance, isWithinRange, type Vector2 } from "../math/vector.js";

export type AreaSide = "enemies" | "allies";

function isOnSide(source: UnitState, candidate: UnitState, side: AreaSide): boolean {
  if (!candidate.alive) {
    return false;
  }

  return side === "enemies" ? candidate.teamId !== source.teamId : candidate.teamId === source.teamId;
}

function sortByDistance(units: UnitState[], from: Vector2): UnitState[] {
  return units.sort((a, b) => {
    const difference = distance(from, a.position) - distance(from, b.position);

    if (difference !== 0) {
      return difference;
    }

    return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
  });
}

export function unitsInCircle(
  units: readonly UnitState[],
  source: UnitState,
  center: Vector2,
  radiusUnits: number,
  side: AreaSide,
): UnitState[] {
  const inside: UnitState[] = [];

  for (const candidate of units) {
    if (isOnSide(source, candidate, side) && isWithinRange(distance(center, candidate.position), radiusUnits)) {
      inside.push(candidate);
    }
  }

  return sortByDistance(inside, center);
}

export function unitsInRay(
  units: readonly UnitState[],
  source: UnitState,
  origin: Vector2,
  toward: Vector2,
  lengthUnits: number,
  widthUnits: number,
  side: AreaSide,
): UnitState[] {
  const direction = directionTo(origin, toward);
  const inside: UnitState[] = [];

  for (const candidate of units) {
    if (!isOnSide(source, candidate, side)) {
      continue;
    }

    const offsetX = candidate.position.x - origin.x;
    const offsetY = candidate.position.y - origin.y;
    const along = offsetX * direction.x + offsetY * direction.y;
    const across = Math.abs(offsetX * direction.y - offsetY * direction.x);

    if (along >= 0 && isWithinRange(along, lengthUnits) && isWithinRange(across, widthUnits / 2)) {
      inside.push(candidate);
    }
  }

  return sortByDistance(inside, origin);
}

export function unitsInLine(
  units: readonly UnitState[],
  source: UnitState,
  toward: Vector2,
  lengthUnits: number,
  widthUnits: number,
  side: AreaSide,
): UnitState[] {
  return unitsInRay(units, source, source.position, toward, lengthUnits, widthUnits, side);
}

export function areaCenter(area: AreaDefinition, source: UnitState, anchor: Vector2): Vector2 {
  if (area.kind === "circle" && area.center === "self") {
    return { x: source.position.x, y: source.position.y };
  }

  return { x: anchor.x, y: anchor.y };
}

export function unitsInArea(
  units: readonly UnitState[],
  source: UnitState,
  area: AreaDefinition,
  anchor: Vector2,
  side: AreaSide,
): UnitState[] {
  if (area.kind === "circle") {
    return unitsInCircle(units, source, areaCenter(area, source, anchor), area.radiusUnits, side);
  }

  return unitsInLine(units, source, anchor, area.lengthUnits, area.widthUnits, side);
}
