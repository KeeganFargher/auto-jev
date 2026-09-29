import type { RadialLaunch } from "../definitions.js";
import { directionTo, distance, type Vector2 } from "../math/vector.js";
import { unitsWithin } from "./areas.js";
import { launchBubble, popBubble } from "./bubbles.js";
import { chainDamageMultiplier, recordComboLink } from "./chain.js";
import { dealDamage } from "./damage.js";
import { emit, type DamageCause, type StepContext } from "./events.js";
import { flightTicks, launchPeak, planFlightPath } from "./motion.js";
import {
  JUGGLE_DAMAGE_MULTIPLIER,
  JUGGLE_DISTANCE_MULTIPLIER,
  JUGGLE_RISE_MULTIPLIER,
} from "./rules.js";
import {
  bubbleById,
  isFloating,
  isImmovable,
  isLaunched,
  type FlightMotion,
  type LandingEffect,
  type LaunchCause,
  type UnitState,
} from "./state.js";
import { compareUnitIds, isEnemyOf } from "./targeting.js";

export interface LaunchPlan {
  cause: LaunchCause;
  launcher: UnitState;
  destination: Vector2;
  riseUnits: number;
  hard: boolean;
  bowlingHop: number;
  bowlingDamage: number;
  landingDamage: number;
  stunTicks: number;
}

export interface RadialStrike {
  cause: LaunchCause;
  damageCause: DamageCause;
  source: UnitState;
  center: Vector2;
  radiusUnits: number;
  damage: number;
  launch: RadialLaunch;
}

export function isJuggled(unit: UnitState): boolean {
  return isLaunched(unit) || isFloating(unit);
}

export function isLaunchable(unit: UnitState): boolean {
  return unit.alive && !isImmovable(unit);
}

export function interruptAction(unit: UnitState): void {
  unit.action = { kind: "idle" };
}

export function outwardDirection(center: Vector2, unit: UnitState, launcher: UnitState): Vector2 {
  const away = directionTo(center, unit.position);

  if (away.x !== 0 || away.y !== 0) {
    return away;
  }

  const fromLauncher = directionTo(launcher.position, unit.position);

  if (fromLauncher.x !== 0 || fromLauncher.y !== 0) {
    return fromLauncher;
  }

  return launcher.facing;
}

export function landingEffect(plan: LaunchPlan, juggle: boolean): LandingEffect {
  return {
    hard: plan.hard,
    cause: plan.cause,
    launcherUnitId: plan.launcher.unitId,
    launcherTeamId: plan.launcher.teamId,
    bowlingHop: plan.bowlingHop,
    bowlingDamage: plan.bowlingDamage,
    landingDamage: juggle ? plan.landingDamage * JUGGLE_DAMAGE_MULTIPLIER : plan.landingDamage,
    stunTicks: plan.stunTicks,
  };
}

export function juggledRise(riseUnits: number, juggle: boolean): number {
  return juggle ? riseUnits * JUGGLE_RISE_MULTIPLIER : riseUnits;
}

function beginFlight(
  ctx: StepContext,
  unit: UnitState,
  destination: Vector2,
  riseUnits: number,
  landing: LandingEffect,
  juggle: boolean,
): FlightMotion {
  const state = ctx.state;
  const peak = launchPeak(unit.elevation, riseUnits);

  const motion: FlightMotion = {
    kind: "flight",
    path: planFlightPath(unit.position, destination, state.arenaWidth, state.arenaHeight),
    startTick: state.tick,
    endTick: state.tick + flightTicks(peak),
    startHeight: unit.elevation,
    peak,
    landing,
  };

  unit.motion = motion;
  interruptAction(unit);
  emit(ctx, { kind: "launch", unitId: unit.unitId, motion, juggle });

  return motion;
}

function flingUnit(
  ctx: StepContext,
  unit: UnitState,
  plan: LaunchPlan,
  juggle: boolean,
): FlightMotion {
  if (!isLaunchable(unit)) {
    throw new Error(`Unit "${unit.unitId}" cannot be launched`);
  }

  if (isFloating(unit)) {
    throw new Error(`Unit "${unit.unitId}" is floating; launch its bubble instead`);
  }

  return beginFlight(
    ctx,
    unit,
    plan.destination,
    juggledRise(plan.riseUnits, juggle),
    landingEffect(plan, juggle),
    juggle,
  );
}

export function launchUnit(ctx: StepContext, unit: UnitState, plan: LaunchPlan): FlightMotion {
  return flingUnit(ctx, unit, plan, isLaunched(unit));
}

export function dropUnit(
  ctx: StepContext,
  unit: UnitState,
  launcher: UnitState,
  hard: boolean,
): FlightMotion {
  if (!unit.alive) {
    throw new Error(`Unit "${unit.unitId}" is dead and cannot drop`);
  }

  return beginFlight(
    ctx,
    unit,
    unit.position,
    0,
    {
      hard,
      cause: "drop",
      launcherUnitId: launcher.unitId,
      launcherTeamId: launcher.teamId,
      bowlingHop: 0,
      bowlingDamage: 0,
      landingDamage: 0,
      stunTicks: 0,
    },
    false,
  );
}

export function launchOrCarry(ctx: StepContext, unit: UnitState, plan: LaunchPlan): void {
  const motion = unit.motion;

  if (motion.kind === "float") {
    launchBubble(ctx, bubbleById(ctx.state, motion.bubbleId), plan);

    return;
  }

  launchUnit(ctx, unit, plan);
}

function radialFraction(strike: RadialStrike, unit: UnitState): number {
  return Math.min(1, distance(strike.center, unit.position) / strike.radiusUnits);
}

function radialRise(launch: RadialLaunch, fraction: number): number {
  return launch.centerRiseUnits + (launch.edgeRiseUnits - launch.centerRiseUnits) * fraction;
}

function radialDistance(launch: RadialLaunch, fraction: number): number {
  return (
    launch.centerDistanceUnits + (launch.edgeDistanceUnits - launch.centerDistanceUnits) * fraction
  );
}

function launchOutward(
  ctx: StepContext,
  unit: UnitState,
  strike: RadialStrike,
  juggle: boolean,
): void {
  const fraction = radialFraction(strike, unit);
  const direction = outwardDirection(strike.center, unit, strike.source);
  const reach = radialDistance(strike.launch, fraction) * (juggle ? JUGGLE_DISTANCE_MULTIPLIER : 1);
  flingUnit(
    ctx,
    unit,
    {
      cause: strike.cause,
      launcher: strike.source,
      destination: {
        x: unit.position.x + direction.x * reach,
        y: unit.position.y + direction.y * reach,
      },
      riseUnits: radialRise(strike.launch, fraction),
      hard: true,
      bowlingHop: 0,
      bowlingDamage: strike.launch.bowlingDamage,
      landingDamage: 0,
      stunTicks: 0,
    },
    juggle,
  );
}

function floatingIn(unit: UnitState, bubbleIds: ReadonlySet<number>): boolean {
  const motion = unit.motion;

  return motion.kind === "float" && bubbleIds.has(motion.bubbleId);
}

export function strikeTargets(ctx: StepContext, strike: RadialStrike): UnitState[] {
  const state = ctx.state;

  const struck = unitsWithin(state.units, strike.center, strike.radiusUnits).filter((unit) =>
    isEnemyOf(strike.source, unit),
  );

  const struckBubbleIds = new Set<number>();

  for (const unit of struck) {
    const motion = unit.motion;

    if (motion.kind === "float") {
      struckBubbleIds.add(motion.bubbleId);
    }
  }

  return state.units
    .filter(
      (unit) =>
        struck.includes(unit) ||
        (unit.alive && isEnemyOf(strike.source, unit) && floatingIn(unit, struckBubbleIds)),
    )
    .sort(compareUnitIds);
}

export function radialStrike(ctx: StepContext, strike: RadialStrike): UnitState[] {
  if (strike.radiusUnits <= 0) {
    throw new Error(`Radial strike from "${strike.source.unitId}" has no radius`);
  }

  const state = ctx.state;
  const targets = strikeTargets(ctx, strike);
  recordComboLink(ctx, strike.source, targets);
  const multiplier = chainDamageMultiplier(state, strike.source.teamId);
  const juggled = new Set<string>();

  for (const target of targets) {
    if (isJuggled(target)) {
      juggled.add(target.unitId);
    }
  }

  for (const target of targets) {
    const motion = target.motion;

    if (motion.kind === "float") {
      popBubble(ctx, bubbleById(state, motion.bubbleId));
    }
  }

  for (const target of targets) {
    const juggle = juggled.has(target.unitId);
    const bonus = juggle ? JUGGLE_DAMAGE_MULTIPLIER : 1;
    dealDamage(
      ctx,
      strike.source,
      target,
      strike.damage * multiplier * bonus,
      strike.damageCause,
      false,
    );

    if (isLaunchable(target)) {
      launchOutward(ctx, target, strike, juggle);
    }
  }

  return targets;
}
