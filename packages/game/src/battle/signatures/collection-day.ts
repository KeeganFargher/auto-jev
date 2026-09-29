import type { CollectionDayDefinition } from "../../definitions.js";
import { directionTo, distance, type Vector2 } from "../../math/vector.js";
import { unitsWithin } from "../areas.js";
import { COMBO_FREEZE } from "../beats.js";
import { chainDamageMultiplier, recordComboLink } from "../chain.js";
import { dealDamage } from "../damage.js";
import { emit, type StepContext } from "../events.js";
import { interruptAction, isLaunchable } from "../launch.js";
import { isOnFloor, type UnitState } from "../state.js";
import { isEnemyOf } from "../targeting.js";
import { planAreaCast } from "./area-cast.js";
import type { CastPlan } from "./plan.js";

type CollectionDayAction = Extract<UnitState["action"], { kind: "collection-day" }>;

export function collectionDayOf(unit: UnitState): CollectionDayDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "collection-day") {
    throw new Error(`Unit "${unit.unitId}" has no Collection Day`);
  }

  return signature;
}

function isPullable(target: UnitState): boolean {
  return target.alive && isOnFloor(target) && isLaunchable(target);
}

export function planCollectionDay(
  ctx: StepContext,
  unit: UnitState,
  definition: CollectionDayDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  return planAreaCast(
    ctx,
    unit,
    {
      rangeUnits: definition.rangeUnits,
      radiusUnits: definition.radiusUnits,
      releaseTick: ctx.state.tick + definition.castTicks,
      wants: definition.wants,
      groupSize: definition.groupSize,
      isEligible: isPullable,
    },
    wantedOnly,
  );
}

export function startCollectionDay(
  ctx: StepContext,
  unit: UnitState,
  definition: CollectionDayDefinition,
  plan: CastPlan,
): void {
  const tick = ctx.state.tick;
  const direction = directionTo(unit.position, plan.point);

  if (direction.x !== 0 || direction.y !== 0) {
    unit.facing = direction;
  }

  unit.action = {
    kind: "collection-day",
    center: { ...plan.point },
    startTick: tick,
    releaseTick: tick + definition.castTicks,
  };
}

function pileSpot(center: Vector2, target: UnitState, pileRadiusUnits: number): Vector2 {
  const away = directionTo(center, target.position);
  const gap = Math.min(distance(center, target.position), pileRadiusUnits);

  return { x: center.x + away.x * gap, y: center.y + away.y * gap };
}

export function advanceCollectionDay(
  ctx: StepContext,
  unit: UnitState,
  action: CollectionDayAction,
): void {
  const state = ctx.state;
  const definition = collectionDayOf(unit);

  if (state.tick < action.releaseTick) {
    return;
  }

  const targets = unitsWithin(state.units, action.center, definition.radiusUnits).filter(
    (target) => isEnemyOf(unit, target) && isPullable(target),
  );

  recordComboLink(ctx, unit, targets);
  const multiplier = chainDamageMultiplier(state, unit.teamId);

  for (const target of targets) {
    const to = pileSpot(action.center, target, definition.pileRadiusUnits);
    const endTick = state.tick + definition.pullTicks;
    emit(ctx, {
      kind: "pull",
      unitId: target.unitId,
      makerUnitId: unit.unitId,
      from: { ...target.position },
      to,
      endTick,
    });
    target.motion = {
      kind: "skid",
      from: { ...target.position },
      to,
      startTick: state.tick,
      endTick,
      makerUnitId: unit.unitId,
    };
    interruptAction(target);
    dealDamage(ctx, unit, target, definition.damage * multiplier, "pull", false);
  }

  if (targets.length > 0) {
    emit(ctx, { kind: "beat", beat: COMBO_FREEZE });
  }

  unit.action = { kind: "idle" };
}
