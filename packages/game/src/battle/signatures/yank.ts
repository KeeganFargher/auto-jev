import { TICK_RATE } from "../../constants.js";
import type { YankDefinition } from "../../definitions.js";
import { directionTo, distance } from "../../math/vector.js";
import { faceTowards } from "../attacks.js";
import { YANK_FREEZE } from "../beats.js";
import { chainDamageMultiplier, recordComboLink } from "../chain.js";
import { emit, type StepContext } from "../events.js";
import { isLaunchable, launchOrCarry } from "../launch.js";
import { hasWantedState } from "../prediction.js";
import { fireProjectile } from "../projectiles.js";
import { bubbleById, isFloating, unitById, type BattleState, type UnitState } from "../state.js";
import { edgeGap, isEnemyOf, isInReach, livingEnemies } from "../targeting.js";
import type { CastPlan } from "./plan.js";

type YankAction = Extract<UnitState["action"], { kind: "yank" }>;

interface YankTarget {
  unit: UnitState;
  wanted: boolean;
  span: number;
}

export function yankOf(unit: UnitState): YankDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "yank") {
    throw new Error(`Unit "${unit.unitId}" has no Yank`);
  }

  return signature;
}

function carriesFuse(state: BattleState, target: UnitState): boolean {
  const motion = target.motion;

  if (motion.kind !== "float") {
    return target.primed !== null;
  }

  return bubbleById(state, motion.bubbleId).memberUnitIds.some(
    (memberId) => unitById(state, memberId).primed !== null,
  );
}

function isHookable(state: BattleState, unit: UnitState, target: UnitState): boolean {
  return (
    target.alive &&
    isEnemyOf(unit, target) &&
    (isFloating(target) || isLaunchable(target)) &&
    !carriesFuse(state, target)
  );
}

function isYankable(
  state: BattleState,
  unit: UnitState,
  target: UnitState,
  definition: YankDefinition,
): boolean {
  return (
    isHookable(state, unit, target) &&
    edgeGap(unit, target) >= definition.minRangeUnits &&
    isInReach(unit, target, definition.rangeUnits)
  );
}

function hookArrivalTick(
  state: BattleState,
  unit: UnitState,
  target: UnitState,
  definition: YankDefinition,
): number {
  const travelTicks = Math.max(
    1,
    Math.round(
      (distance(unit.position, target.position) / definition.hookUnitsPerSecond) * TICK_RATE,
    ),
  );

  return state.tick + definition.castTicks + travelTicks;
}

function isBetterYank(candidate: YankTarget, best: YankTarget | null): boolean {
  if (best === null) {
    return true;
  }

  if (candidate.wanted !== best.wanted) {
    return candidate.wanted;
  }

  if (candidate.span !== best.span) {
    return candidate.span > best.span;
  }

  return candidate.unit.unitId < best.unit.unitId;
}

function bestYankTarget(
  ctx: StepContext,
  unit: UnitState,
  definition: YankDefinition,
  wantedOnly: boolean,
): YankTarget | null {
  const state = ctx.state;
  let best: YankTarget | null = null;

  for (const enemy of livingEnemies(state, unit)) {
    if (!isYankable(state, unit, enemy, definition)) {
      continue;
    }

    const arrivalTick = hookArrivalTick(state, unit, enemy, definition);

    const candidate = {
      unit: enemy,
      wanted: hasWantedState(state, enemy, definition.wants, arrivalTick),
      span: distance(unit.position, enemy.position),
    };

    if ((!wantedOnly || candidate.wanted) && isBetterYank(candidate, best)) {
      best = candidate;
    }
  }

  return best;
}

export function planYank(
  ctx: StepContext,
  unit: UnitState,
  definition: YankDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  const best = bestYankTarget(ctx, unit, definition, wantedOnly);

  if (best === null) {
    return null;
  }

  return { targetUnitId: best.unit.unitId, point: { ...best.unit.position }, wanted: best.wanted };
}

export function startYank(
  ctx: StepContext,
  unit: UnitState,
  definition: YankDefinition,
  plan: CastPlan,
): void {
  if (plan.targetUnitId === null) {
    throw new Error(`Yank from "${unit.unitId}" has no target`);
  }

  const tick = ctx.state.tick;
  const throwTick = tick + definition.castTicks;
  faceTowards(unit, unitById(ctx.state, plan.targetUnitId));
  unit.action = {
    kind: "yank",
    targetUnitId: plan.targetUnitId,
    startTick: tick,
    throwTick,
    endTick: throwTick + definition.recoverTicks,
  };
}

function throwHook(ctx: StepContext, unit: UnitState, action: YankAction): boolean {
  const state = ctx.state;
  const definition = yankOf(unit);
  const planned = unitById(state, action.targetUnitId);

  const target = isYankable(state, unit, planned, definition)
    ? planned
    : bestYankTarget(ctx, unit, definition, false)?.unit;

  if (target === undefined) {
    return false;
  }

  faceTowards(unit, target);
  fireProjectile(ctx, unit, target, { kind: "hook" }, definition.hookUnitsPerSecond);

  return true;
}

export function advanceYank(ctx: StepContext, unit: UnitState, action: YankAction): void {
  const tick = ctx.state.tick;

  if (tick === action.throwTick && !throwHook(ctx, unit, action)) {
    unit.action = { kind: "idle" };

    return;
  }

  if (tick >= action.endTick) {
    unit.action = { kind: "idle" };
  }
}

export function hookArrives(ctx: StepContext, source: UnitState, target: UnitState): void {
  const state = ctx.state;
  const definition = yankOf(source);

  if (!source.alive || !isHookable(state, source, target)) {
    return;
  }

  recordComboLink(ctx, source, [target]);
  const multiplier = chainDamageMultiplier(state, source.teamId);
  const direction = directionTo(source.position, target.position);
  const toward = direction.x === 0 && direction.y === 0 ? source.facing : direction;

  const destination = {
    x: source.position.x + toward.x * definition.landingOffsetUnits,
    y: source.position.y + toward.y * definition.landingOffsetUnits,
  };

  emit(ctx, { kind: "yank", unitId: source.unitId, targetUnitId: target.unitId, destination });
  launchOrCarry(ctx, target, {
    cause: "yank",
    launcher: source,
    destination,
    riseUnits: definition.riseUnits,
    hard: true,
    bowlingHop: 0,
    bowlingDamage: definition.bowlingDamage * multiplier,
    landingDamage: definition.damage * multiplier,
    stunTicks: definition.stunTicks,
  });
  emit(ctx, { kind: "beat", beat: YANK_FREEZE });
}
