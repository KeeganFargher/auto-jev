import { TICK_RATE } from "../constants.js";
import { directionTo, distance, lerp, type Vector2 } from "../math/vector.js";
import { emit, type StepContext } from "./events.js";
import type { BattleState, FlightMotion, FlightPath } from "./state.js";
import { unitsInIdOrder } from "./targeting.js";

export const GRAVITY_UNITS_PER_SECOND_SQUARED = 120;

export const DOWNED_TICKS = 15;

export const SKID_SPEED_FRACTION = 0.3;

export const SKID_MAX_UNITS = 6;

export const SKID_TICKS = 8;

export function flightTicks(peak: number): number {
  const seconds = Math.sqrt((8 * peak) / GRAVITY_UNITS_PER_SECOND_SQUARED);

  return Math.max(2, Math.round(seconds * TICK_RATE));
}

export function launchPeak(startHeight: number, riseUnits: number): number {
  const root = (Math.sqrt(riseUnits) + Math.sqrt(riseUnits + startHeight)) / 2;

  return root * root;
}

function crossingFraction(start: number, end: number, limit: number): number {
  return (limit - start) / (end - start);
}

function firstWallCrossing(from: Vector2, to: Vector2, width: number, height: number): number {
  let fraction = 1;

  if (to.x < 0) {
    fraction = Math.min(fraction, crossingFraction(from.x, to.x, 0));
  }

  if (to.x > width) {
    fraction = Math.min(fraction, crossingFraction(from.x, to.x, width));
  }

  if (to.y < 0) {
    fraction = Math.min(fraction, crossingFraction(from.y, to.y, 0));
  }

  if (to.y > height) {
    fraction = Math.min(fraction, crossingFraction(from.y, to.y, height));
  }

  return fraction;
}

function reflectInto(value: number, limit: number): number {
  if (value < 0) {
    return Math.min(-value, limit);
  }

  if (value > limit) {
    return Math.max(2 * limit - value, 0);
  }

  return value;
}

export function planFlightPath(
  from: Vector2,
  intended: Vector2,
  width: number,
  height: number,
): FlightPath {
  const total = distance(from, intended);
  const fraction = firstWallCrossing(from, intended, width, height);

  if (fraction >= 1) {
    return { from: { ...from }, bounce: null, to: { ...intended }, length: total };
  }

  const bounce = lerp(from, intended, Math.max(0, fraction));
  const to = { x: reflectInto(intended.x, width), y: reflectInto(intended.y, height) };

  return {
    from: { ...from },
    bounce,
    to,
    length: distance(from, bounce) + distance(bounce, to),
  };
}

export function pathPoint(path: FlightPath, fraction: number): Vector2 {
  if (path.bounce === null || path.length === 0) {
    return lerp(path.from, path.to, fraction);
  }

  const firstLength = distance(path.from, path.bounce);
  const travelled = path.length * fraction;

  if (travelled <= firstLength) {
    return firstLength === 0
      ? { ...path.from }
      : lerp(path.from, path.bounce, travelled / firstLength);
  }

  const secondLength = path.length - firstLength;

  return secondLength === 0
    ? { ...path.to }
    : lerp(path.bounce, path.to, (travelled - firstLength) / secondLength);
}

export function pathEndDirection(path: FlightPath): Vector2 {
  return directionTo(path.bounce ?? path.from, path.to);
}

export function arcHeight(startHeight: number, peak: number, fraction: number): number {
  return startHeight * (1 - fraction) + 4 * peak * fraction * (1 - fraction);
}

export function flightFraction(startTick: number, endTick: number, tick: number): number {
  return Math.min(1, Math.max(0, (tick - startTick) / (endTick - startTick)));
}

export function flightPosition(motion: FlightMotion, tick: number): Vector2 {
  return pathPoint(motion.path, flightFraction(motion.startTick, motion.endTick, tick));
}

export function flightElevation(motion: FlightMotion, tick: number): number {
  return arcHeight(
    motion.startHeight,
    motion.peak,
    flightFraction(motion.startTick, motion.endTick, tick),
  );
}

export function flightHorizontalSpeed(motion: FlightMotion): number {
  const seconds = (motion.endTick - motion.startTick) / TICK_RATE;

  return seconds === 0 ? 0 : motion.path.length / seconds;
}

export function skidPosition(from: Vector2, to: Vector2, fraction: number): Vector2 {
  const eased = 1 - (1 - fraction) * (1 - fraction);

  return lerp(from, to, eased);
}

export function skidTravel(horizontalSpeed: number): number {
  return Math.min(SKID_MAX_UNITS, horizontalSpeed * SKID_SPEED_FRACTION);
}

export function skidTarget(
  state: BattleState,
  from: Vector2,
  direction: Vector2,
  travel: number,
): Vector2 {
  const intended = { x: from.x + direction.x * travel, y: from.y + direction.y * travel };
  const fraction = firstWallCrossing(from, intended, state.arenaWidth, state.arenaHeight);

  return lerp(from, intended, Math.max(0, Math.min(1, fraction)));
}

export function advanceUnitMotion(ctx: StepContext): void {
  const tick = ctx.state.tick;

  for (const unit of unitsInIdOrder(ctx.state)) {
    const motion = unit.motion;

    if (!unit.alive) {
      continue;
    }

    if (motion.kind === "flight") {
      unit.position = flightPosition(motion, tick);
      unit.elevation = flightElevation(motion, tick);

      continue;
    }

    if (motion.kind === "skid") {
      unit.position = skidPosition(
        motion.from,
        motion.to,
        flightFraction(motion.startTick, motion.endTick, tick),
      );

      if (tick >= motion.endTick) {
        unit.motion = {
          kind: "downed",
          startTick: motion.endTick,
          endTick: motion.endTick + DOWNED_TICKS,
          makerUnitId: motion.makerUnitId,
        };
      }

      continue;
    }

    if (motion.kind === "downed" && tick >= motion.endTick) {
      unit.motion = { kind: "ground" };
      emit(ctx, { kind: "get-up", unitId: unit.unitId });
    }
  }
}
