import type { BattleState, UnitState } from "./state.js";
import type { BattleResult } from "./result.js";
import { cloneRng, type RngState } from "../random/rng.js";

export interface BattleSnapshot {
  tick: number;
  tickLimit: number;
  arenaWidth: number;
  arenaHeight: number;
  units: UnitState[];
  result: BattleResult | null;
  rng: RngState;
}

export function getBattleSnapshot(state: BattleState): BattleSnapshot {
  return {
    tick: state.tick,
    tickLimit: state.tickLimit,
    arenaWidth: state.arenaWidth,
    arenaHeight: state.arenaHeight,
    units: state.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      abilityCooldowns: { ...unit.abilityCooldowns },
      shield: unit.shield === null ? null : { ...unit.shield },
    })),
    result: state.result,
    rng: cloneRng(state.rng),
  };
}
