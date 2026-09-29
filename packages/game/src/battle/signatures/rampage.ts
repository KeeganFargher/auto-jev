import type { RampageDefinition } from "../../definitions.js";
import { directionTo, type Vector2 } from "../../math/vector.js";
import { faceTowards } from "../attacks.js";
import { RAMPAGE_FREEZE } from "../beats.js";
import { chainDamageMultiplier, recordComboLink } from "../chain.js";
import { emit, type StepContext } from "../events.js";
import { isLaunchable, launchOrCarry } from "../launch.js";
import { flightFraction } from "../motion.js";
import { hasWantedState, thickestGroup } from "../prediction.js";
import {
  GRAB_HEIGHT_UNITS,
  GRAB_RETRY_TICKS,
  GRAB_SLACK_UNITS,
  LONE_THROW_UNITS,
} from "../rules.js";
import { isFloating, isOnFloor, unitById, type RampageState, type UnitState } from "../state.js";
import {
  compareUnitIds,
  currentTarget,
  isEnemyOf,
  isInReach,
  livingAllies,
  livingEnemies,
  nearestUnit,
} from "../targeting.js";
import type { CastPlan } from "./plan.js";

type GrabAction = Extract<UnitState["action"], { kind: "grab" }>;

export function rampageOf(unit: UnitState): RampageDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "rampage") {
    throw new Error(`Unit "${unit.unitId}" has no Rampage`);
  }

  return signature;
}

function rampageStateOf(unit: UnitState): RampageState {
  const rampage = unit.rampage;

  if (rampage === null) {
    throw new Error(`Unit "${unit.unitId}" is not rampaging`);
  }

  return rampage;
}

export function planRampage(
  ctx: StepContext,
  unit: UnitState,
  definition: RampageDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  const state = ctx.state;
  const bigTick = state.tick + definition.growTicks;

  const nearby = livingEnemies(state, unit).filter((enemy) =>
    isInReach(unit, enemy, definition.triggerRangeUnits),
  );

  const wanted = nearby.some((enemy) => hasWantedState(state, enemy, definition.wants, bigTick));

  if (nearby.length === 0 || (wantedOnly && !wanted)) {
    return null;
  }

  return { targetUnitId: null, point: { ...unit.position }, wanted };
}

export function startRampage(
  ctx: StepContext,
  unit: UnitState,
  definition: RampageDefinition,
): void {
  const tick = ctx.state.tick;
  const growEndTick = tick + definition.growTicks;
  const shrinkStartTick = growEndTick + definition.bigTicks;
  unit.rampage = {
    startTick: tick,
    growEndTick,
    shrinkStartTick,
    endTick: shrinkStartTick + definition.shrinkTicks,
    nextGrabTick: growEndTick,
  };
  unit.action = { kind: "rampage-grow", startTick: tick, endTick: growEndTick };
  emit(ctx, { kind: "rampage", unitId: unit.unitId, phase: "grow", size: definition.size });
}

function rampageSize(definition: RampageDefinition, rampage: RampageState, tick: number): number {
  const extra = definition.size - 1;

  if (tick < rampage.growEndTick) {
    return 1 + extra * flightFraction(rampage.startTick, rampage.growEndTick, tick);
  }

  if (tick < rampage.shrinkStartTick) {
    return definition.size;
  }

  return definition.size - extra * flightFraction(rampage.shrinkStartTick, rampage.endTick, tick);
}

export function advanceRampages(ctx: StepContext): void {
  const tick = ctx.state.tick;

  for (const unit of ctx.state.units) {
    const rampage = unit.rampage;

    if (!unit.alive || rampage === null) {
      continue;
    }

    const definition = rampageOf(unit);

    if (tick === rampage.growEndTick) {
      emit(ctx, { kind: "rampage", unitId: unit.unitId, phase: "big", size: definition.size });
      emit(ctx, { kind: "beat", beat: RAMPAGE_FREEZE });
    }

    if (tick === rampage.shrinkStartTick) {
      emit(ctx, { kind: "rampage", unitId: unit.unitId, phase: "shrink", size: 1 });
    }

    if (tick >= rampage.endTick) {
      unit.rampage = null;
      unit.size = 1;
      unit.radius = unit.baseRadius;
      emit(ctx, { kind: "rampage", unitId: unit.unitId, phase: "end", size: 1 });

      continue;
    }

    unit.size = rampageSize(definition, rampage, tick);
    unit.radius = unit.baseRadius * unit.size;
  }
}

function isGrabbable(
  unit: UnitState,
  target: UnitState,
  definition: RampageDefinition,
  slackUnits: number,
): boolean {
  return (
    target.alive &&
    isEnemyOf(unit, target) &&
    (isFloating(target) || isLaunchable(target)) &&
    target.elevation <= GRAB_HEIGHT_UNITS &&
    isInReach(unit, target, definition.grabReachUnits + slackUnits)
  );
}

function chooseGrabTarget(
  ctx: StepContext,
  unit: UnitState,
  definition: RampageDefinition,
): UnitState | null {
  const state = ctx.state;
  const throwTick = state.tick + definition.grabWindupTicks;

  const grabbable = livingEnemies(state, unit)
    .filter((enemy) => isGrabbable(unit, enemy, definition, 0))
    .sort(compareUnitIds);

  const preferred = grabbable.filter((enemy) =>
    hasWantedState(state, enemy, definition.wants, throwTick),
  );

  if (preferred.length > 0) {
    return nearestUnit(unit, preferred);
  }

  const target = currentTarget(state, unit);

  if (target !== null && grabbable.includes(target)) {
    return target;
  }

  return nearestUnit(unit, grabbable);
}

export function tryGrab(ctx: StepContext, unit: UnitState): void {
  const tick = ctx.state.tick;
  const rampage = rampageStateOf(unit);
  const definition = rampageOf(unit);

  if (tick < rampage.nextGrabTick || tick >= rampage.shrinkStartTick) {
    return;
  }

  const target = chooseGrabTarget(ctx, unit, definition);

  if (target === null) {
    rampage.nextGrabTick = tick + GRAB_RETRY_TICKS;

    return;
  }

  const throwTick = tick + definition.grabWindupTicks;
  unit.action = { kind: "grab", targetUnitId: target.unitId, startTick: tick, throwTick };
  faceTowards(unit, target);
  emit(ctx, { kind: "grab", unitId: unit.unitId, targetUnitId: target.unitId, throwTick });
}

function throwDestination(
  ctx: StepContext,
  unit: UnitState,
  target: UnitState,
  definition: RampageDefinition,
): Vector2 {
  const state = ctx.state;

  const friends = livingAllies(state, target).filter(
    (friend) => isOnFloor(friend) && isInReach(unit, friend, definition.throwSearchUnits),
  );

  const group = thickestGroup(state, friends, target.teamId, unit.position, target.unitId);

  if (group !== null) {
    return { ...group.unit.position };
  }

  const direction = directionTo(unit.position, target.position);
  const away = direction.x === 0 && direction.y === 0 ? unit.facing : direction;

  return {
    x: target.position.x + away.x * LONE_THROW_UNITS,
    y: target.position.y + away.y * LONE_THROW_UNITS,
  };
}

export function advanceGrab(ctx: StepContext, unit: UnitState, action: GrabAction): void {
  const state = ctx.state;
  const tick = state.tick;

  if (tick < action.throwTick) {
    return;
  }

  const definition = rampageOf(unit);
  const rampage = rampageStateOf(unit);
  const target = unitById(state, action.targetUnitId);
  unit.action = { kind: "idle" };

  if (!isGrabbable(unit, target, definition, GRAB_SLACK_UNITS)) {
    rampage.nextGrabTick = tick + GRAB_RETRY_TICKS;

    return;
  }

  recordComboLink(ctx, unit, [target]);
  const multiplier = chainDamageMultiplier(state, unit.teamId);
  const destination = throwDestination(ctx, unit, target, definition);
  emit(ctx, {
    kind: "throw",
    unitId: unit.unitId,
    targetUnitId: target.unitId,
    destination,
  });
  launchOrCarry(ctx, target, {
    cause: "throw",
    launcher: unit,
    destination,
    riseUnits: definition.throwRiseUnits,
    hard: true,
    bowlingHop: 0,
    bowlingDamage: definition.bowlingDamage * multiplier,
    landingDamage: definition.thrownDamage * multiplier,
    stunTicks: 0,
  });
  rampage.nextGrabTick = tick + definition.throwIntervalTicks - definition.grabWindupTicks;
}
