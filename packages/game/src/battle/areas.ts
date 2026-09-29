import { distance, isWithinRange, type Vector2 } from "../math/vector.js";
import type { UnitState } from "./state.js";
import { compareUnitIds } from "./targeting.js";

export function unitsWithin(
  units: readonly UnitState[],
  center: Vector2,
  radiusUnits: number,
): UnitState[] {
  return units
    .filter(
      (unit) =>
        unit.alive && isWithinRange(distance(center, unit.position), radiusUnits + unit.radius),
    )
    .sort(compareUnitIds);
}

export function countWithin(
  units: readonly UnitState[],
  center: Vector2,
  radiusUnits: number,
): number {
  return unitsWithin(units, center, radiusUnits).length;
}
