import type { BigBubbleDefinition } from "../../definitions.js";
import { distance, isWithinRange, type Vector2 } from "../../math/vector.js";
import { createBubble } from "../bubbles.js";
import { recordComboLink } from "../chain.js";
import type { StepContext } from "../events.js";
import { hasWantedState, lastsUntil, predictedPosition } from "../prediction.js";
import { isFloating, type UnitState } from "../state.js";
import { compareUnitIds, livingEnemies } from "../targeting.js";
import type { CastPlan } from "./plan.js";

type BigBubbleAction = Extract<UnitState["action"], { kind: "big-bubble" }>;

interface BubbleAim {
  center: Vector2;
  span: number;
  score: number;
  wanted: boolean;
}

interface CaughtEnemy {
  enemy: UnitState;
  span: number;
}

export function bigBubbleOf(unit: UnitState): BigBubbleDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "big-bubble") {
    throw new Error(`Unit "${unit.unitId}" has no Big Bubble`);
  }

  return signature;
}

function scoreBubbleAim(
  ctx: StepContext,
  definition: BigBubbleDefinition,
  center: Vector2,
  span: number,
  candidates: readonly UnitState[],
  releaseTick: number,
): BubbleAim {
  const state = ctx.state;
  let count = 0;
  let setups = 0;
  let airborne = false;

  for (const enemy of candidates) {
    const at = predictedPosition(state, enemy, releaseTick);

    if (!isWithinRange(distance(center, at), definition.radiusUnits + enemy.radius)) {
      continue;
    }

    count += 1;
    setups += hasWantedState(state, enemy, definition.wants, releaseTick) ? 1 : 0;
    airborne = airborne || lastsUntil(state, enemy, "airborne", releaseTick);
  }

  const grouped = definition.wants.includes("grouped") && count >= definition.groupSize;
  const caughtFlying = definition.wants.includes("airborne") && airborne;

  return {
    center: { ...center },
    span,
    score: Math.min(count, definition.maxMembers) + setups,
    wanted: grouped || caughtFlying,
  };
}

export function planBigBubble(
  ctx: StepContext,
  unit: UnitState,
  definition: BigBubbleDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  const state = ctx.state;
  const releaseTick = state.tick + definition.castTicks;
  const candidates = livingEnemies(state, unit).filter((enemy) => !isFloating(enemy));
  let best: BubbleAim | null = null;

  for (const enemy of candidates) {
    const center = predictedPosition(state, enemy, releaseTick);
    const span = distance(unit.position, center);

    if (!isWithinRange(span, definition.rangeUnits + unit.radius + enemy.radius)) {
      continue;
    }

    const aim = scoreBubbleAim(ctx, definition, center, span, candidates, releaseTick);

    if (wantedOnly && !aim.wanted) {
      continue;
    }

    if (
      best === null ||
      aim.score > best.score ||
      (aim.score === best.score && aim.span < best.span)
    ) {
      best = aim;
    }
  }

  if (best === null) {
    return null;
  }

  return { targetUnitId: null, point: best.center, wanted: best.wanted };
}

export function startBigBubble(
  ctx: StepContext,
  unit: UnitState,
  definition: BigBubbleDefinition,
  plan: CastPlan,
): void {
  const tick = ctx.state.tick;
  unit.action = {
    kind: "big-bubble",
    center: { ...plan.point },
    startTick: tick,
    releaseTick: tick + definition.castTicks,
  };
}

function compareCaught(first: CaughtEnemy, second: CaughtEnemy): number {
  return first.span - second.span || compareUnitIds(first.enemy, second.enemy);
}

function bubbleCatch(
  ctx: StepContext,
  unit: UnitState,
  definition: BigBubbleDefinition,
  center: Vector2,
): UnitState[] {
  const caught: CaughtEnemy[] = [];

  for (const enemy of livingEnemies(ctx.state, unit)) {
    const span = distance(center, enemy.position);

    if (!isFloating(enemy) && isWithinRange(span, definition.radiusUnits + enemy.radius)) {
      caught.push({ enemy, span });
    }
  }

  return caught
    .sort(compareCaught)
    .slice(0, definition.maxMembers)
    .map((entry) => entry.enemy);
}

export function advanceBigBubble(ctx: StepContext, unit: UnitState, action: BigBubbleAction): void {
  if (ctx.state.tick < action.releaseTick) {
    return;
  }

  const definition = bigBubbleOf(unit);
  unit.action = { kind: "idle" };
  const members = bubbleCatch(ctx, unit, definition, action.center);

  if (members.length === 0) {
    return;
  }

  recordComboLink(ctx, unit, members);
  createBubble(ctx, {
    kind: "big",
    owner: unit,
    center: action.center,
    radiusUnits: definition.radiusUnits,
    members,
    floatHeightUnits: definition.floatHeightUnits,
    riseTicks: definition.riseTicks,
    durationTicks: definition.durationTicks,
    healPerPulse: 0,
  });
}
