import type { UnitState } from "./state.js";

export interface ShieldStatus {
  amount: number;
  expiresAtTick: number;
}

export function expireShield(unit: UnitState, tick: number): boolean {
  if (unit.shield === null || unit.shield.expiresAtTick > tick) {
    return false;
  }

  unit.shield = null;

  return true;
}
