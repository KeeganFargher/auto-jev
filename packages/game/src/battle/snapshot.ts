import type { ActiveEmitter, ActiveZone, BattleState, PendingImpact, UnitState } from "./state.js";
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
  emitters: ActiveEmitter[];
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
      shield: unit.shield === null ? null : { ...unit.shield, blessed: unit.shield.blessed === null ? null : { ...unit.shield.blessed } },
      slow: unit.slow === null ? null : { ...unit.slow },
      condition: unit.condition === null ? null : { ...unit.condition },
      control: unit.control === null ? null : { ...unit.control },
      taunt: unit.taunt === null ? null : { ...unit.taunt },
      dots: unit.dots.map((dot) => ({ ...dot })),
      speedBuffs: unit.speedBuffs.map((buff) => ({ ...buff })),
      marks: unit.marks.map((mark) => ({ ...mark })),
      chill: unit.chill === null ? null : { ...unit.chill },
      pandemic: unit.pandemic === null ? null : { ...unit.pandemic, spread: unit.pandemic.spread === null ? null : { ...unit.pandemic.spread } },
      link: unit.link === null ? null : { ...unit.link },
      graveMark: unit.graveMark === null ? null : { ...unit.graveMark },
      channel: unit.channel === null ? null : { ...unit.channel },
      form: unit.form === null ? null : { ...unit.form, retaliatedAt: { ...unit.form.retaliatedAt } },
      memory: {
        ...unit.memory,
        firstHitTargets: [...unit.memory.firstHitTargets],
        attackCounts: { ...unit.memory.attackCounts },
        attackCountedStrike: { ...unit.memory.attackCountedStrike },
        siphonedAt: { ...unit.memory.siphonedAt },
        ruthlessStunned: { ...unit.memory.ruthlessStunned },
        spentTriggers: [...unit.memory.spentTriggers],
        triggerReadyAt: { ...unit.memory.triggerReadyAt },
        stacks: { ...unit.memory.stacks },
        stacksGainedAt: { ...unit.memory.stacksGainedAt },
        stackProgress: { ...unit.memory.stackProgress },
        stored: { ...unit.memory.stored },
        storedIncoming: { ...unit.memory.storedIncoming },
        skillUses: { ...unit.memory.skillUses },
      },
    })),
    impacts: state.impacts.map((impact) => ({ ...impact, center: { ...impact.center } })),
    zones: state.zones.map((zone) => ({ ...zone, center: { ...zone.center } })),
    emitters: state.emitters.map((emitter) => ({ ...emitter, position: { ...emitter.position }, velocity: { ...emitter.velocity } })),
    result: state.result,
    rng: cloneRng(state.rng),
  };
}
