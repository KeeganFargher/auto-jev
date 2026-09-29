import { TICK_RATE } from "../constants.js";
import { clampToArena, length, scale, type Vector2 } from "../math/vector.js";
import { healUnit } from "./damage.js";
import { emit, type StepContext } from "./events.js";
import { landBodies } from "./landing.js";
import {
  dropUnit,
  interruptAction,
  juggledRise,
  landingEffect,
  type LaunchPlan,
} from "./launch.js";
import {
  arcHeight,
  flightFraction,
  flightTicks,
  launchPeak,
  pathEndDirection,
  pathPoint,
  planFlightPath,
} from "./motion.js";
import { HEAL_PULSE_TICKS } from "./rules.js";
import {
  isFloating,
  nextEntityId,
  unitById,
  type BubbleKind,
  type BubbleState,
  type UnitState,
} from "./state.js";
import { compareUnitIds, livingAllies } from "./targeting.js";

export interface BubbleSpec {
  kind: BubbleKind;
  owner: UnitState;
  center: Vector2;
  radiusUnits: number;
  members: UnitState[];
  floatHeightUnits: number;
  riseTicks: number;
  durationTicks: number;
  healPerPulse: number;
}

function memberOffset(center: Vector2, member: UnitState, radiusUnits: number): Vector2 {
  const offset = { x: member.position.x - center.x, y: member.position.y - center.y };
  const span = length(offset);
  const limit = Math.max(0, radiusUnits - member.radius);

  if (span <= limit) {
    return offset;
  }

  return scale(offset, limit / span);
}

export function bubbleMembers(ctx: StepContext, bubble: BubbleState): UnitState[] {
  return bubble.memberUnitIds.map((unitId) => unitById(ctx.state, unitId));
}

export function createBubble(ctx: StepContext, spec: BubbleSpec): BubbleState {
  if (spec.members.length === 0) {
    throw new Error(`Bubble from "${spec.owner.unitId}" has no members`);
  }

  for (const member of spec.members) {
    if (!member.alive || isFloating(member)) {
      throw new Error(`Unit "${member.unitId}" cannot join a bubble`);
    }
  }

  const state = ctx.state;
  const members = [...spec.members].sort(compareUnitIds);
  let totalElevation = 0;

  for (const member of members) {
    totalElevation += member.elevation;
  }

  const startElevation = totalElevation / members.length;

  const bubble: BubbleState = {
    bubbleId: nextEntityId(state),
    kind: spec.kind,
    ownerUnitId: spec.owner.unitId,
    ownerTeamId: spec.owner.teamId,
    center: { ...spec.center },
    elevation: startElevation,
    startElevation,
    floatHeight: spec.floatHeightUnits,
    radius: spec.radiusUnits,
    memberUnitIds: members.map((member) => member.unitId),
    startTick: state.tick,
    riseEndTick: state.tick + spec.riseTicks,
    endTick: state.tick + spec.durationTicks,
    healPerPulse: spec.healPerPulse,
    nextPulseTick: state.tick + HEAL_PULSE_TICKS,
    flight: null,
  };

  for (const member of members) {
    interruptAction(member);
    member.motion = {
      kind: "float",
      bubbleId: bubble.bubbleId,
      offset: memberOffset(bubble.center, member, bubble.radius),
    };
    member.elevation = startElevation;
  }

  state.bubbles = [...state.bubbles, bubble];
  emit(ctx, {
    kind: "bubble",
    bubbleId: bubble.bubbleId,
    bubbleKind: bubble.kind,
    ownerUnitId: bubble.ownerUnitId,
    memberUnitIds: [...bubble.memberUnitIds],
    center: { ...bubble.center },
    radius: bubble.radius,
    floatHeight: bubble.floatHeight,
    endTick: bubble.endTick,
  });

  return bubble;
}

function removeBubble(ctx: StepContext, bubble: BubbleState): void {
  const state = ctx.state;
  state.bubbles = state.bubbles.filter((candidate) => candidate.bubbleId !== bubble.bubbleId);
  emit(ctx, {
    kind: "pop",
    bubbleId: bubble.bubbleId,
    center: { ...bubble.center },
    elevation: bubble.elevation,
    memberUnitIds: [...bubble.memberUnitIds],
  });
}

export function popBubble(ctx: StepContext, bubble: BubbleState): void {
  const owner = unitById(ctx.state, bubble.ownerUnitId);
  const members = bubbleMembers(ctx, bubble);
  removeBubble(ctx, bubble);

  for (const member of members) {
    dropUnit(ctx, member, owner, bubble.kind === "big");
  }
}

export function leaveBubble(ctx: StepContext, bubble: BubbleState, unit: UnitState): void {
  if (!bubble.memberUnitIds.includes(unit.unitId)) {
    throw new Error(`Unit "${unit.unitId}" is not in bubble ${bubble.bubbleId}`);
  }

  bubble.memberUnitIds = bubble.memberUnitIds.filter((unitId) => unitId !== unit.unitId);

  if (bubble.memberUnitIds.length === 0) {
    removeBubble(ctx, bubble);
  }
}

export function launchBubble(ctx: StepContext, bubble: BubbleState, plan: LaunchPlan): void {
  const state = ctx.state;
  const peak = launchPeak(bubble.elevation, juggledRise(plan.riseUnits, true));
  bubble.flight = {
    path: planFlightPath(bubble.center, plan.destination, state.arenaWidth, state.arenaHeight),
    startTick: state.tick,
    endTick: state.tick + flightTicks(peak),
    startHeight: bubble.elevation,
    peak,
    landing: landingEffect(plan, true),
  };
  emit(ctx, { kind: "bubble-launch", bubbleId: bubble.bubbleId, flight: bubble.flight });
}

function riseElevation(bubble: BubbleState, tick: number): number {
  const fraction = flightFraction(bubble.startTick, bubble.riseEndTick, tick);
  const eased = 1 - (1 - fraction) * (1 - fraction);

  return bubble.startElevation + (bubble.floatHeight - bubble.startElevation) * eased;
}

function carryMembers(ctx: StepContext, bubble: BubbleState): void {
  const state = ctx.state;

  for (const member of bubbleMembers(ctx, bubble)) {
    const motion = member.motion;

    if (motion.kind !== "float" || motion.bubbleId !== bubble.bubbleId) {
      throw new Error(
        `Unit "${member.unitId}" is listed in bubble ${bubble.bubbleId} but not riding it`,
      );
    }

    member.position = clampToArena(
      { x: bubble.center.x + motion.offset.x, y: bubble.center.y + motion.offset.y },
      state.arenaWidth,
      state.arenaHeight,
    );
    member.elevation = bubble.elevation;
  }
}

function pulseHeal(ctx: StepContext, bubble: BubbleState): void {
  const state = ctx.state;

  if (bubble.healPerPulse <= 0 || state.tick < bubble.nextPulseTick) {
    return;
  }

  bubble.nextPulseTick += HEAL_PULSE_TICKS;
  const owner = unitById(state, bubble.ownerUnitId);

  for (const member of bubbleMembers(ctx, bubble)) {
    healUnit(ctx, owner, member, bubble.healPerPulse, "safety-bubble");
  }
}

function landBubble(ctx: StepContext, bubble: BubbleState): void {
  const flight = bubble.flight;

  if (flight === null) {
    throw new Error(`Bubble ${bubble.bubbleId} is not flying`);
  }

  const seconds = (flight.endTick - flight.startTick) / TICK_RATE;
  const members = bubbleMembers(ctx, bubble);
  bubble.center = { ...flight.path.to };
  bubble.elevation = 0;
  carryMembers(ctx, bubble);
  removeBubble(ctx, bubble);
  landBodies(
    ctx,
    members,
    bubble.center,
    flight.landing,
    pathEndDirection(flight.path),
    flight.path.length / seconds,
  );
}

export function advanceBubbleMotion(ctx: StepContext): void {
  const tick = ctx.state.tick;

  for (const bubble of ctx.state.bubbles) {
    const flight = bubble.flight;

    if (flight === null) {
      bubble.elevation = riseElevation(bubble, tick);
    } else {
      const fraction = flightFraction(flight.startTick, flight.endTick, tick);
      bubble.center = pathPoint(flight.path, fraction);
      bubble.elevation = arcHeight(flight.startHeight, flight.peak, fraction);
    }

    carryMembers(ctx, bubble);
  }
}

export function resolveBubbles(ctx: StepContext): void {
  const state = ctx.state;
  const tick = state.tick;
  const pending = state.bubbles;

  for (const bubble of pending) {
    if (!state.bubbles.includes(bubble)) {
      continue;
    }

    const flight = bubble.flight;

    if (flight !== null) {
      if (tick >= flight.endTick) {
        landBubble(ctx, bubble);
      }

      continue;
    }

    pulseHeal(ctx, bubble);

    if (tick >= bubble.endTick) {
      popBubble(ctx, bubble);
    }
  }
}

export function checkSafetyBubbles(ctx: StepContext): void {
  const state = ctx.state;

  for (const cleric of state.units) {
    const passive = cleric.passive;

    if (!cleric.alive || passive === null) {
      continue;
    }

    for (const ally of livingAllies(state, cleric)) {
      if (
        ally.safetyBubbled ||
        isFloating(ally) ||
        ally.hp >= ally.maxHp * passive.thresholdFraction
      ) {
        continue;
      }

      ally.safetyBubbled = true;
      createBubble(ctx, {
        kind: "safety",
        owner: cleric,
        center: ally.position,
        radiusUnits: passive.radiusUnits,
        members: [ally],
        floatHeightUnits: passive.floatHeightUnits,
        riseTicks: passive.riseTicks,
        durationTicks: passive.durationTicks,
        healPerPulse:
          (ally.maxHp * passive.healFraction * HEAL_PULSE_TICKS) / passive.durationTicks,
      });
    }
  }
}
