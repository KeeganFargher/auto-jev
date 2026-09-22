import type { TargetPolicy } from "../definitions.js";
import type { UnitState } from "./state.js";
import { distance } from "../math/vector.js";

function isLegalEnemy(unit: UnitState, candidate: UnitState): boolean {
  return candidate.alive && candidate.teamId !== unit.teamId;
}

function isLegalAlly(unit: UnitState, candidate: UnitState): boolean {
  return candidate.alive && candidate.teamId === unit.teamId;
}

export function findNearestEnemy(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  let nearest: UnitState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isLegalEnemy(unit, candidate)) {
      continue;
    }

    const candidateDistance = distance(unit.position, candidate.position);

    if (
      candidateDistance < nearestDistance ||
      (candidateDistance === nearestDistance &&
        nearest !== null &&
        candidate.unitId < nearest.unitId)
    ) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

export function findLowestHpFractionAlly(
  unit: UnitState,
  units: readonly UnitState[],
): UnitState | null {
  let lowest: UnitState | null = null;
  let lowestFraction = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isLegalAlly(unit, candidate) || candidate.hp >= candidate.maxHp) {
      continue;
    }

    const candidateFraction = candidate.hp / candidate.maxHp;

    if (
      candidateFraction < lowestFraction ||
      (candidateFraction === lowestFraction && lowest !== null && candidate.unitId < lowest.unitId)
    ) {
      lowest = candidate;
      lowestFraction = candidateFraction;
    }
  }

  return lowest;
}

export function resolveTarget(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  if (unit.targetUnitId !== null) {
    const current = units.find((candidate) => candidate.unitId === unit.targetUnitId);

    if (current !== undefined && isLegalEnemy(unit, current)) {
      return current;
    }
  }

  return findNearestEnemy(unit, units);
}

export function resolveAbilityTarget(
  targetPolicy: TargetPolicy,
  unit: UnitState,
  units: readonly UnitState[],
): UnitState | null {
  if (targetPolicy === "nearest-enemy") {
    return resolveTarget(unit, units);
  }

  return findLowestHpFractionAlly(unit, units);
}
