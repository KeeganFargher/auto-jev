import type { BattleState, UnitState } from "./state.js";
import type { BattleResult } from "./result.js";

export interface BattleSnapshot {
  tick: number;
  tickLimit: number;
  arenaWidth: number;
  arenaHeight: number;
  units: UnitState[];
  result: BattleResult | null;
}

export function getBattleSnapshot(state: BattleState): BattleSnapshot {
  return {
    tick: state.tick,
    tickLimit: state.tickLimit,
    arenaWidth: state.arenaWidth,
    arenaHeight: state.arenaHeight,
    units: state.units.map((unit) => ({ ...unit, position: { ...unit.position } })),
    result: state.result,
  };
}
