import type { UnitState } from "./state.js";
import { findDensestEnemyCluster } from "./targeting.js";
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
  if (target === null || unit.control !== null) {
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

export const FOLLOW_UNITS = 12;

export function proposeFollow(unit: UnitState, leader: UnitState, arenaWidth: number, arenaHeight: number): MovementProposal {
  const gap = distance(unit.position, leader.position) - FOLLOW_UNITS;

  if (unit.control !== null || gap <= 0) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const slowMultiplier = unit.slow === null ? 1 : unit.slow.speedMultiplier;
  const step = Math.min(leader.moveSpeedUnitsPerSecond * slowMultiplier * TICK_SECONDS, gap);
  const direction = directionTo(unit.position, leader.position);

  return {
    unitId: unit.unitId,
    position: clampToArena({ x: unit.position.x + direction.x * step, y: unit.position.y + direction.y * step }, arenaWidth, arenaHeight),
  };
}

export const DRIFT_SPEED_FRACTION = 0.6;

const DRIFT_STOP_UNITS = 6;

const DRIFT_SEARCH_UNITS = 999;

const DRIFT_CLUSTER_UNITS = 15;

export function proposeDrift(unit: UnitState, units: readonly UnitState[], arenaWidth: number, arenaHeight: number): MovementProposal {
  const cluster = findDensestEnemyCluster(unit, units, DRIFT_SEARCH_UNITS, DRIFT_CLUSTER_UNITS);

  if (cluster === null) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const remaining = distance(unit.position, cluster.position) - DRIFT_STOP_UNITS;

  if (remaining <= 0) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const step = Math.min(unit.moveSpeedUnitsPerSecond * DRIFT_SPEED_FRACTION * TICK_SECONDS, remaining);
  const direction = directionTo(unit.position, cluster.position);

  return {
    unitId: unit.unitId,
    position: clampToArena({ x: unit.position.x + direction.x * step, y: unit.position.y + direction.y * step }, arenaWidth, arenaHeight),
  };
}
