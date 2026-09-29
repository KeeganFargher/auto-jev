import type { ShortFuseDefinition } from "../../definitions.js";
import { distance } from "../../math/vector.js";
import { faceTowards } from "../attacks.js";
import { recordComboLink } from "../chain.js";
import type { StepContext } from "../events.js";
import { primeUnit } from "../fire.js";
import { teamMembersNear } from "../prediction.js";
import { fireProjectile } from "../projectiles.js";
import { GROUP_RADIUS_UNITS } from "../rules.js";
import { unitById, type UnitState } from "../state.js";
import { isInReach, livingEnemies } from "../targeting.js";
import type { CastPlan } from "./plan.js";

type ShortFuseAction = Extract<UnitState["action"], { kind: "short-fuse" }>;

export function shortFuseOf(unit: UnitState): ShortFuseDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "short-fuse") {
    throw new Error(`Unit "${unit.unitId}" has no Short Fuse`);
  }

  return signature;
}

interface FuseTarget {
  unit: UnitState;
  groupSize: number;
  span: number;
}

function bestFuseTarget(
  ctx: StepContext,
  unit: UnitState,
  definition: ShortFuseDefinition,
): FuseTarget | null {
  const state = ctx.state;
  let best: FuseTarget | null = null;

  for (const enemy of livingEnemies(state, unit)) {
    if (enemy.primed !== null || !isInReach(unit, enemy, definition.rangeUnits)) {
      continue;
    }

    const candidate = {
      unit: enemy,
      groupSize: teamMembersNear(
        state,
        enemy.teamId,
        enemy.position,
        GROUP_RADIUS_UNITS,
        state.tick,
      ).length,
      span: distance(unit.position, enemy.position),
    };

    if (
      best === null ||
      candidate.groupSize > best.groupSize ||
      (candidate.groupSize === best.groupSize && candidate.span < best.span) ||
      (candidate.groupSize === best.groupSize &&
        candidate.span === best.span &&
        enemy.unitId < best.unit.unitId)
    ) {
      best = candidate;
    }
  }

  return best;
}

export function planShortFuse(
  ctx: StepContext,
  unit: UnitState,
  definition: ShortFuseDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  const best = bestFuseTarget(ctx, unit, definition);

  if (best === null) {
    return null;
  }

  const wanted = definition.wants.includes("grouped") && best.groupSize >= definition.groupSize;

  if (wantedOnly && !wanted) {
    return null;
  }

  return { targetUnitId: best.unit.unitId, point: { ...best.unit.position }, wanted };
}

export function startShortFuse(
  ctx: StepContext,
  unit: UnitState,
  definition: ShortFuseDefinition,
  plan: CastPlan,
): void {
  if (plan.targetUnitId === null) {
    throw new Error(`Short Fuse from "${unit.unitId}" has no target`);
  }

  const tick = ctx.state.tick;
  faceTowards(unit, unitById(ctx.state, plan.targetUnitId));
  unit.action = {
    kind: "short-fuse",
    targetUnitId: plan.targetUnitId,
    startTick: tick,
    releaseTick: tick + definition.castTicks,
  };
}

export function advanceShortFuse(ctx: StepContext, unit: UnitState, action: ShortFuseAction): void {
  if (ctx.state.tick < action.releaseTick) {
    return;
  }

  const definition = shortFuseOf(unit);
  const planned = unitById(ctx.state, action.targetUnitId);
  unit.action = { kind: "idle" };

  const target =
    planned.alive && planned.primed === null
      ? planned
      : bestFuseTarget(ctx, unit, definition)?.unit;

  if (target === undefined) {
    return;
  }

  faceTowards(unit, target);
  fireProjectile(ctx, unit, target, { kind: "fuse" }, definition.boltUnitsPerSecond);
}

export function fuseArrives(ctx: StepContext, source: UnitState, target: UnitState): void {
  const definition = shortFuseOf(source);

  if (!target.alive || target.primed !== null) {
    return;
  }

  recordComboLink(ctx, source, [target]);
  primeUnit(ctx, source, target, definition);
}
