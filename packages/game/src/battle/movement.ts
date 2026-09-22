import type { UnitState } from "./state.js";
import { clampToArena, directionTo, distance, isWithinRange, type Vector2 } from "../math/vector.js";
import { TICK_SECONDS } from "../constants.js";

export interface MovementProposal {
  unitId: string;
  position: Vector2;
}

export function proposeMovement(
  unit: UnitState,
  target: UnitState | null,
  engageRangeUnits: number,
  arenaWidth: number,
  arenaHeight: number,
): MovementProposal {
  if (target === null) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const distanceToTarget = distance(unit.position, target.position);

  if (isWithinRange(distanceToTarget, engageRangeUnits)) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const slowMultiplier = unit.slow === null ? 1 : unit.slow.speedMultiplier;
  const maxStep = unit.moveSpeedUnitsPerSecond * slowMultiplier * TICK_SECONDS;
  const remaining = distanceToTarget - engageRangeUnits;
  const step = Math.min(maxStep, remaining);
  const direction = directionTo(unit.position, target.position);

  const proposed = {
    x: unit.position.x + direction.x * step,
    y: unit.position.y + direction.y * step,
  };

  return { unitId: unit.unitId, position: clampToArena(proposed, arenaWidth, arenaHeight) };
}
