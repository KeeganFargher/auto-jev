import type { UnitId } from "../ids.js";
import type { Vector2 } from "../math/vector.js";
import { unitsWithin } from "./areas.js";
import { dealDamage } from "./damage.js";
import { emit, type DamageCause, type StepContext } from "./events.js";
import { cometIgnite, detonateFuse } from "./fire.js";
import { interruptAction, isLaunchable, launchUnit, outwardDirection } from "./launch.js";
import {
  DOWNED_TICKS,
  SKID_TICKS,
  flightHorizontalSpeed,
  pathEndDirection,
  skidTarget,
  skidTravel,
} from "./motion.js";
import {
  BOWLING_DECAY,
  BOWLING_MAX_HOPS,
  BOWLING_RADIUS_UNITS,
  BOWLING_SHOVE_RISE_UNITS,
  BOWLING_SHOVE_UNITS,
} from "./rules.js";
import {
  fuseById,
  isImmovable,
  isOnFloor,
  unitById,
  type LandingEffect,
  type LaunchCause,
  type UnitState,
} from "./state.js";
import { unitsInIdOrder } from "./targeting.js";

function landingDamageCause(cause: LaunchCause): DamageCause {
  if (cause === "throw") {
    return "throw";
  }

  if (cause === "yank") {
    return "yank";
  }

  throw new Error(`Launch cause "${cause}" does not deal landing damage`);
}

function stunUnit(ctx: StepContext, unit: UnitState, ticks: number): void {
  const untilTick = Math.max(unit.stunnedUntilTick, ctx.state.tick + ticks);
  unit.stunnedUntilTick = untilTick;
  interruptAction(unit);
  emit(ctx, { kind: "stun", unitId: unit.unitId, untilTick });
}

function knockDown(
  ctx: StepContext,
  unit: UnitState,
  makerUnitId: UnitId,
  direction: Vector2,
  horizontalSpeed: number,
): void {
  const state = ctx.state;
  const travel = skidTravel(horizontalSpeed);
  const moving = travel > 0 && (direction.x !== 0 || direction.y !== 0);
  const untilTick = state.tick + (moving ? SKID_TICKS : 0) + DOWNED_TICKS;

  if (moving) {
    unit.motion = {
      kind: "skid",
      from: { ...unit.position },
      to: skidTarget(state, unit.position, direction, travel),
      startTick: state.tick,
      endTick: state.tick + SKID_TICKS,
      downedTicks: DOWNED_TICKS,
      makerUnitId,
    };
  } else {
    unit.motion = { kind: "downed", startTick: state.tick, endTick: untilTick, makerUnitId };
  }

  interruptAction(unit);
  emit(ctx, { kind: "downed", unitId: unit.unitId, untilTick });
}

function bowl(
  ctx: StepContext,
  point: Vector2,
  landing: LandingEffect,
  launcher: UnitState,
  excluded: ReadonlySet<UnitId>,
): void {
  const pins = unitsWithin(ctx.state.units, point, BOWLING_RADIUS_UNITS).filter(
    (unit) =>
      unit.teamId !== landing.launcherTeamId && isOnFloor(unit) && !excluded.has(unit.unitId),
  );

  for (const pin of pins) {
    dealDamage(ctx, launcher, pin, landing.bowlingDamage, "bowling", false);

    if (!isLaunchable(pin)) {
      continue;
    }

    const direction = outwardDirection(point, pin, launcher);
    launchUnit(ctx, pin, {
      cause: "bowling",
      launcher,
      destination: {
        x: pin.position.x + direction.x * BOWLING_SHOVE_UNITS,
        y: pin.position.y + direction.y * BOWLING_SHOVE_UNITS,
      },
      riseUnits: BOWLING_SHOVE_RISE_UNITS,
      hard: true,
      bowlingHop: landing.bowlingHop + 1,
      bowlingDamage: landing.bowlingDamage * BOWLING_DECAY,
      landingDamage: 0,
      stunTicks: 0,
    });
  }
}

export function landBodies(
  ctx: StepContext,
  bodies: readonly UnitState[],
  point: Vector2,
  landing: LandingEffect,
  direction: Vector2,
  horizontalSpeed: number,
): void {
  const state = ctx.state;
  const launcher = unitById(state, landing.launcherUnitId);
  const flew = landing.cause !== "drop";

  for (const body of bodies) {
    body.motion = { kind: "ground" };
    body.elevation = 0;
    emit(ctx, {
      kind: "land",
      unitId: body.unitId,
      position: { ...body.position },
      hard: landing.hard,
      cause: landing.cause,
    });
  }

  for (const body of bodies) {
    if (flew) {
      cometIgnite(ctx, body);
    }

    if (landing.landingDamage > 0) {
      dealDamage(
        ctx,
        launcher,
        body,
        landing.landingDamage,
        landingDamageCause(landing.cause),
        false,
      );
    }
  }

  if (landing.hard && landing.bowlingDamage > 0 && landing.bowlingHop < BOWLING_MAX_HOPS) {
    bowl(ctx, point, landing, launcher, new Set(bodies.map((body) => body.unitId)));
  }

  for (const body of bodies) {
    const primed = body.primed;

    if (flew && body.alive && primed !== null) {
      const fuse = fuseById(state, primed.fuseId);
      detonateFuse(ctx, fuse, body, fuse.hotPotatoScale);
    }
  }

  for (const body of bodies) {
    if (!body.alive || body.motion.kind !== "ground" || isImmovable(body)) {
      continue;
    }

    if (landing.stunTicks > 0) {
      stunUnit(ctx, body, landing.stunTicks);
    }

    if (landing.hard) {
      knockDown(ctx, body, landing.launcherUnitId, direction, horizontalSpeed);
    }
  }
}

export function resolveLandings(ctx: StepContext): void {
  const tick = ctx.state.tick;

  for (const unit of unitsInIdOrder(ctx.state)) {
    const motion = unit.motion;

    if (!unit.alive || motion.kind !== "flight" || tick < motion.endTick) {
      continue;
    }

    unit.position = { ...motion.path.to };
    landBodies(
      ctx,
      [unit],
      unit.position,
      motion.landing,
      pathEndDirection(motion.path),
      flightHorizontalSpeed(motion),
    );
  }
}
