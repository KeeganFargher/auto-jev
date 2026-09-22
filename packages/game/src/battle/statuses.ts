import type { UnitState } from "./state.js";

export interface ShieldStatus {
  amount: number;
  expiresAtTick: number;
}

export interface SlowStatus {
  speedMultiplier: number;
  expiresAtTick: number;
}

export function expireShield(unit: UnitState, tick: number): boolean {
  if (unit.shield === null || unit.shield.expiresAtTick > tick) {
    return false;
  }

  unit.shield = null;

  return true;
}

export function expireSlow(unit: UnitState, tick: number): boolean {
  if (unit.slow === null || unit.slow.expiresAtTick > tick) {
    return false;
  }

  unit.slow = null;

  return true;
}
