import type { UnitState } from "./state.js";
import { clampToArena, directionTo, distance, type Vector2 } from "../math/vector.js";
import { TICK_SECONDS } from "../constants.js";

export interface MovementProposal {
  unitId: string;
  position: Vector2;
}

export function proposeMovement(
  unit: UnitState,
  target: UnitState | null,
  arenaWidth: number,
  arenaHeight: number,
): MovementProposal {
  if (target === null) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const distanceToTarget = distance(unit.position, target.position);

  if (distanceToTarget <= unit.attackRangeUnits) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const maxStep = unit.moveSpeedUnitsPerSecond * TICK_SECONDS;
  const remaining = distanceToTarget - unit.attackRangeUnits;
  const step = Math.min(maxStep, remaining);
  const direction = directionTo(unit.position, target.position);

  const proposed = {
    x: unit.position.x + direction.x * step,
    y: unit.position.y + direction.y * step,
  };

  return { unitId: unit.unitId, position: clampToArena(proposed, arenaWidth, arenaHeight) };
}
