import type { ActiveZone, BattleState, PendingImpact, UnitState } from "./state.js";
import type { BattleResult } from "./result.js";
import { cloneRng, type RngState } from "../random/rng.js";

export interface BattleSnapshot {
  tick: number;
  tickLimit: number;
  arenaWidth: number;
  arenaHeight: number;
  arenaColumns: number;
  arenaRows: number;
  units: UnitState[];
  impacts: PendingImpact[];
  zones: ActiveZone[];
  result: BattleResult | null;
  rng: RngState;
}

export function getBattleSnapshot(state: BattleState): BattleSnapshot {
  return {
    tick: state.tick,
    tickLimit: state.tickLimit,
    arenaWidth: state.arenaWidth,
    arenaHeight: state.arenaHeight,
    arenaColumns: state.arenaColumns,
    arenaRows: state.arenaRows,
    units: state.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      abilityCooldowns: { ...unit.abilityCooldowns },
      shield: unit.shield === null ? null : { ...unit.shield },
      slow: unit.slow === null ? null : { ...unit.slow },
      condition: unit.condition === null ? null : { ...unit.condition },
      control: unit.control === null ? null : { ...unit.control },
      taunt: unit.taunt === null ? null : { ...unit.taunt },
      dots: unit.dots.map((dot) => ({ ...dot })),
      link: unit.link === null ? null : { ...unit.link },
      channel: unit.channel === null ? null : { ...unit.channel },
      memory: {
        ...unit.memory,
        firedThresholds: [...unit.memory.firedThresholds],
        slowHistory: {},
        firstHitTargets: [...unit.memory.firstHitTargets],
        basicAttackCounts: { ...unit.memory.basicAttackCounts },
      },
    })),
    impacts: state.impacts.map((impact) => ({ ...impact, center: { ...impact.center } })),
    zones: state.zones.map((zone) => ({ ...zone, center: { ...zone.center } })),
    result: state.result,
    rng: cloneRng(state.rng),
  };
}
