import type { TeamId, UnitId } from "../ids.js";
import { canStartAttack, resolveAttackHit, startAttack } from "./attacks.js";
import { advanceBubbleMotion, checkSafetyBubbles, resolveBubbles } from "./bubbles.js";
import { expireChains } from "./chain.js";
import { emit, type BattleEvent, type StepContext } from "./events.js";
import { advanceBurning, advanceFuses, discardSpentFuses, spreadFire } from "./fire.js";
import { resolveLandings } from "./landing.js";
import { advanceUnitMotion } from "./motion.js";
import { moveUnits } from "./movement.js";
import { resolveProjectiles } from "./projectiles.js";
import type { BattleResult } from "./result.js";
import { advanceSignatureAction, trySignature } from "./signatures/index.js";
import { advanceRampages, tryGrab } from "./signatures/rampage.js";
import { canAct, unitById, type BattleState, type UnitState } from "./state.js";
import { currentTarget } from "./targeting.js";

export interface BattleStep {
  tick: number;
  events: BattleEvent[];
  result: BattleResult | null;
}

function tryAttack(ctx: StepContext, unit: UnitState): void {
  const target = currentTarget(ctx.state, unit);

  if (target !== null && canStartAttack(ctx, unit, target)) {
    startAttack(ctx, unit, target);
  }
}

function resolveActions(ctx: StepContext): void {
  const state = ctx.state;

  for (const unitId of state.resolutionOrder) {
    const unit = unitById(state, unitId);
    const action = unit.action;

    if (!unit.alive) {
      continue;
    }

    if (action.kind === "attack") {
      if (state.tick >= action.hitTick) {
        resolveAttackHit(ctx, unit, action.targetUnitId);
      }

      continue;
    }

    if (action.kind !== "idle") {
      advanceSignatureAction(ctx, unit);

      continue;
    }

    if (!canAct(unit, state.tick) || unit.primed !== null) {
      continue;
    }

    if (unit.rampage !== null) {
      tryGrab(ctx, unit);

      continue;
    }

    if (!trySignature(ctx, unit)) {
      tryAttack(ctx, unit);
    }
  }
}

function assertFiniteUnits(state: BattleState): void {
  for (const unit of state.units) {
    if (
      !Number.isFinite(unit.hp) ||
      !Number.isFinite(unit.position.x) ||
      !Number.isFinite(unit.position.y) ||
      !Number.isFinite(unit.elevation)
    ) {
      throw new Error(`Unit "${unit.unitId}" has non-finite state at tick ${state.tick}`);
    }
  }
}

function damageDealtByUnit(state: BattleState): Record<UnitId, number> {
  const damageDealt: Record<UnitId, number> = {};

  for (const unit of state.units) {
    damageDealt[unit.unitId] = unit.damageDealt;
  }

  return damageDealt;
}

function evaluateResult(state: BattleState): BattleResult | null {
  const livingTeamIds = new Set<TeamId>();
  let survivor: TeamId | null = null;

  for (const unit of state.units) {
    if (unit.alive) {
      livingTeamIds.add(unit.teamId);
      survivor = unit.teamId;
    }
  }

  const endedAtTick = state.tick;

  if (survivor === null) {
    return {
      kind: "draw",
      reason: "mutual-elimination",
      endedAtTick,
      damageDealt: damageDealtByUnit(state),
    };
  }

  if (livingTeamIds.size === 1) {
    return {
      kind: "win",
      winningTeamId: survivor,
      endedAtTick,
      damageDealt: damageDealtByUnit(state),
    };
  }

  if (state.tick >= state.tickLimit) {
    return { kind: "draw", reason: "timeout", endedAtTick, damageDealt: damageDealtByUnit(state) };
  }

  return null;
}

export function stepBattle(state: BattleState): BattleStep {
  if (state.result !== null) {
    throw new Error(`Battle already ended at tick ${state.result.endedAtTick}`);
  }

  state.tick += 1;
  const ctx: StepContext = { state, events: [] };
  expireChains(state);
  advanceRampages(ctx);
  advanceBurning(ctx);
  advanceUnitMotion(ctx);
  advanceBubbleMotion(ctx);
  resolveLandings(ctx);
  resolveBubbles(ctx);
  advanceFuses(ctx);
  moveUnits(ctx);
  spreadFire(ctx);
  resolveProjectiles(ctx);
  resolveActions(ctx);
  checkSafetyBubbles(ctx);
  discardSpentFuses(ctx);
  assertFiniteUnits(state);
  const result = evaluateResult(state);

  if (result !== null) {
    state.result = result;
    emit(ctx, { kind: "battle-ended", result });
  }

  return { tick: state.tick, events: ctx.events, result };
}
