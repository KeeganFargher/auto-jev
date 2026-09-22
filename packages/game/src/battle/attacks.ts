import type { UnitState } from "./state.js";
import { distance } from "../math/vector.js";

export interface AttackProposal {
  sourceUnitId: string;
  targetUnitId: string;
  amount: number;
}

export function proposeAttack(
  unit: UnitState,
  target: UnitState | null,
  tick: number,
): AttackProposal | null {
  if (target === null || !target.alive) {
    return null;
  }

  if (tick < unit.nextAttackTick) {
    return null;
  }

  if (distance(unit.position, target.position) > unit.attackRangeUnits) {
    return null;
  }

  return { sourceUnitId: unit.unitId, targetUnitId: target.unitId, amount: unit.attackDamage };
}
