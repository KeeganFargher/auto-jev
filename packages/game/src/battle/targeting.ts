import { distance, isWithinRange } from "../math/vector.js";
import { TARGET_SWITCH_MARGIN_UNITS } from "./rules.js";
import { isAirborne, isFloating, unitById, type BattleState, type UnitState } from "./state.js";

export function compareUnitIds(first: UnitState, second: UnitState): number {
  if (first.unitId < second.unitId) {
    return -1;
  }

  return first.unitId > second.unitId ? 1 : 0;
}

export function unitsInIdOrder(state: BattleState): UnitState[] {
  return [...state.units].sort(compareUnitIds);
}

export function isEnemyOf(unit: UnitState, other: UnitState): boolean {
  return other.teamId !== unit.teamId;
}

export function livingEnemies(state: BattleState, unit: UnitState): UnitState[] {
  return state.units.filter((candidate) => candidate.alive && isEnemyOf(unit, candidate));
}

export function livingAllies(state: BattleState, unit: UnitState): UnitState[] {
  return state.units.filter(
    (candidate) =>
      candidate.alive && candidate.teamId === unit.teamId && candidate.unitId !== unit.unitId,
  );
}

export function edgeGap(first: UnitState, second: UnitState): number {
  return distance(first.position, second.position) - first.radius - second.radius;
}

export function isInReach(unit: UnitState, target: UnitState, rangeUnits: number): boolean {
  return isWithinRange(edgeGap(unit, target), rangeUnits);
}

export function canAttack(unit: UnitState, target: UnitState): boolean {
  if (!target.alive || !isEnemyOf(unit, target) || isFloating(target)) {
    return false;
  }

  return unit.attack.kind === "projectile" || !isAirborne(target);
}

export function nearestUnit(unit: UnitState, candidates: readonly UnitState[]): UnitState | null {
  let best: UnitState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateDistance = distance(unit.position, candidate.position);

    if (
      candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && best !== null && candidate.unitId < best.unitId)
    ) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }

  return best;
}

export function currentTarget(state: BattleState, unit: UnitState): UnitState | null {
  return unit.targetUnitId === null ? null : unitById(state, unit.targetUnitId);
}

export function updateTarget(state: BattleState, unit: UnitState): void {
  const closest = nearestUnit(
    unit,
    state.units.filter((candidate) => canAttack(unit, candidate)),
  );

  if (closest === null) {
    const approach = nearestUnit(unit, livingEnemies(state, unit));
    unit.targetUnitId = approach === null ? null : approach.unitId;

    return;
  }

  const current = currentTarget(state, unit);

  if (
    current !== null &&
    canAttack(unit, current) &&
    distance(unit.position, current.position) <=
      distance(unit.position, closest.position) + TARGET_SWITCH_MARGIN_UNITS
  ) {
    return;
  }

  unit.targetUnitId = closest.unitId;
}
