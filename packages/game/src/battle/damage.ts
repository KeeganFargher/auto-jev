import type { UnitState } from "./state.js";

export function applyDamage(unit: UnitState, amount: number): number {
  const actual = Math.min(amount, unit.hp);
  unit.hp -= actual;

  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.alive = false;
  }

  return actual;
}
