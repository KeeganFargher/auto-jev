import type { BlizzardDefinition } from "../../definitions.js";
import { directionTo } from "../../math/vector.js";
import { unitsWithin } from "../areas.js";
import { COMBO_FREEZE } from "../beats.js";
import { chainDamageMultiplier, recordComboLink } from "../chain.js";
import { dealDamage } from "../damage.js";
import { emit, type StepContext } from "../events.js";
import { interruptAction } from "../launch.js";
import { isImmovable, isOnFloor, type UnitState } from "../state.js";
import { isEnemyOf } from "../targeting.js";
import { planAreaCast } from "./area-cast.js";
import type { CastPlan } from "./plan.js";

type BlizzardAction = Extract<UnitState["action"], { kind: "blizzard" }>;

export function blizzardOf(unit: UnitState): BlizzardDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "blizzard") {
    throw new Error(`Unit "${unit.unitId}" has no Blizzard`);
  }

  return signature;
}

function isFreezable(target: UnitState): boolean {
  return target.alive && isOnFloor(target) && !isImmovable(target);
}

export function planBlizzard(
  ctx: StepContext,
  unit: UnitState,
  definition: BlizzardDefinition,
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
      isEligible: isFreezable,
    },
    wantedOnly,
  );
}

export function startBlizzard(
  ctx: StepContext,
  unit: UnitState,
  definition: BlizzardDefinition,
  plan: CastPlan,
): void {
  const tick = ctx.state.tick;
  const direction = directionTo(unit.position, plan.point);

  if (direction.x !== 0 || direction.y !== 0) {
    unit.facing = direction;
  }

  unit.action = {
    kind: "blizzard",
    center: { ...plan.point },
    startTick: tick,
    releaseTick: tick + definition.castTicks,
  };
}

export function advanceBlizzard(ctx: StepContext, unit: UnitState, action: BlizzardAction): void {
  const state = ctx.state;
  const definition = blizzardOf(unit);

  if (state.tick < action.releaseTick) {
    return;
  }

  const targets = unitsWithin(state.units, action.center, definition.radiusUnits).filter(
    (target) => isEnemyOf(unit, target) && isFreezable(target),
  );

  recordComboLink(ctx, unit, targets);
  const multiplier = chainDamageMultiplier(state, unit.teamId);

  for (const target of targets) {
    const untilTick = state.tick + definition.freezeTicks;
    target.frozen = { makerUnitId: unit.unitId, untilTick };
    interruptAction(target);
    emit(ctx, { kind: "freeze", unitId: target.unitId, makerUnitId: unit.unitId, untilTick });
    dealDamage(ctx, unit, target, definition.damage * multiplier, "frost", false);
  }

  if (targets.length > 0) {
    emit(ctx, { kind: "beat", beat: COMBO_FREEZE });
  }

  unit.action = { kind: "idle" };
}
