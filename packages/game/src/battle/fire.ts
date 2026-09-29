import { TICK_RATE } from "../constants.js";
import type { ShortFuseDefinition } from "../definitions.js";
import { distance } from "../math/vector.js";
import { unitsWithin } from "./areas.js";
import { EXPLOSION_FREEZE } from "./beats.js";
import { bubbleMembers } from "./bubbles.js";
import { dealDamage } from "./damage.js";
import { emit, type IgniteCause, type StepContext } from "./events.js";
import { interruptAction, radialStrike } from "./launch.js";
import { BURN_PULSE_TICKS, COMET_RADIUS_UNITS, TOUCH_SLACK_UNITS } from "./rules.js";
import {
  fuseById,
  isOnFloor,
  nextEntityId,
  unitById,
  type FuseState,
  type UnitState,
} from "./state.js";
import { unitsInIdOrder } from "./targeting.js";

export function igniteUnit(
  ctx: StepContext,
  fuse: FuseState,
  unit: UnitState,
  source: UnitState,
  hop: number,
  cause: IgniteCause,
): boolean {
  if (!unit.alive) {
    throw new Error(`Cannot ignite dead unit "${unit.unitId}"`);
  }

  if (fuse.ignitedUnitIds.includes(unit.unitId)) {
    return false;
  }

  const tick = ctx.state.tick;
  fuse.ignitedUnitIds = [...fuse.ignitedUnitIds, unit.unitId];
  unit.burning = {
    fuseId: fuse.fuseId,
    makerUnitId: fuse.makerUnitId,
    hop,
    untilTick: tick + fuse.burnTicks,
    nextPulseTick: tick + BURN_PULSE_TICKS,
  };
  emit(ctx, {
    kind: "ignite",
    unitId: unit.unitId,
    sourceUnitId: source.unitId,
    fuseId: fuse.fuseId,
    hop,
    cause,
  });

  return true;
}

export function primeUnit(
  ctx: StepContext,
  maker: UnitState,
  target: UnitState,
  definition: ShortFuseDefinition,
): FuseState {
  if (!target.alive || target.primed !== null) {
    throw new Error(`Unit "${target.unitId}" cannot be primed`);
  }

  const state = ctx.state;

  const fuse: FuseState = {
    fuseId: nextEntityId(state),
    makerUnitId: maker.unitId,
    makerTeamId: maker.teamId,
    carrierUnitId: target.unitId,
    ignitedUnitIds: [],
    detonated: false,
    burnDamagePerPulse: (definition.burnDamagePerSecond * BURN_PULSE_TICKS) / TICK_RATE,
    burnTicks: definition.burnTicks,
    maxTouchHops: definition.maxTouchHops,
    panicMoveMultiplier: definition.panicMoveMultiplier,
    blastRadiusUnits: definition.blastRadiusUnits,
    blastDamage: definition.blastDamage,
    blastLaunch: definition.blastLaunch,
    hotPotatoScale: definition.hotPotatoScale,
  };

  state.fuses = [...state.fuses, fuse];
  target.primed = {
    fuseId: fuse.fuseId,
    makerUnitId: maker.unitId,
    explodeTick: state.tick + definition.fuseTicks,
  };
  interruptAction(target);
  emit(ctx, {
    kind: "prime",
    unitId: target.unitId,
    makerUnitId: maker.unitId,
    fuseId: fuse.fuseId,
    explodeTick: target.primed.explodeTick,
  });
  igniteUnit(ctx, fuse, target, maker, 0, "fuse");

  return fuse;
}

export function detonateFuse(
  ctx: StepContext,
  fuse: FuseState,
  carrier: UnitState,
  blastScale: number,
): void {
  if (fuse.detonated) {
    throw new Error(`Fuse ${fuse.fuseId} already detonated`);
  }

  const state = ctx.state;
  fuse.detonated = true;
  carrier.primed = null;
  const maker = unitById(state, fuse.makerUnitId);
  const center = { ...carrier.position };
  const radiusUnits = fuse.blastRadiusUnits * blastScale;
  emit(ctx, {
    kind: "explode",
    unitId: carrier.unitId,
    makerUnitId: maker.unitId,
    center,
    elevation: carrier.elevation,
    radius: radiusUnits,
    hotPotato: blastScale > 1,
  });
  emit(ctx, { kind: "beat", beat: EXPLOSION_FREEZE });
  radialStrike(ctx, {
    cause: "blast",
    damageCause: "blast",
    source: maker,
    center,
    radiusUnits,
    damage: fuse.blastDamage * blastScale,
    launch: fuse.blastLaunch,
  });
}

export function advanceFuses(ctx: StepContext): void {
  const state = ctx.state;

  for (const fuse of state.fuses) {
    if (fuse.detonated) {
      continue;
    }

    const carrier = unitById(state, fuse.carrierUnitId);
    const primed = carrier.primed;

    if (primed === null || primed.fuseId !== fuse.fuseId) {
      throw new Error(`Fuse ${fuse.fuseId} lost its carrier "${carrier.unitId}"`);
    }

    if (state.tick >= primed.explodeTick) {
      detonateFuse(ctx, fuse, carrier, 1);
    }
  }
}

export function advanceBurning(ctx: StepContext): void {
  const state = ctx.state;

  for (const unit of unitsInIdOrder(state)) {
    const burning = unit.burning;

    if (!unit.alive || burning === null) {
      continue;
    }

    if (state.tick >= burning.nextPulseTick) {
      burning.nextPulseTick += BURN_PULSE_TICKS;
      const fuse = fuseById(state, burning.fuseId);
      dealDamage(
        ctx,
        unitById(state, fuse.makerUnitId),
        unit,
        fuse.burnDamagePerPulse,
        "burn",
        false,
      );
    }

    if (unit.alive && state.tick >= burning.untilTick) {
      unit.burning = null;
      emit(ctx, { kind: "burn-end", unitId: unit.unitId });
    }
  }
}

export function advanceFreezes(ctx: StepContext): void {
  const state = ctx.state;

  for (const unit of unitsInIdOrder(state)) {
    const frozen = unit.frozen;

    if (unit.alive && frozen !== null && state.tick >= frozen.untilTick) {
      unit.frozen = null;
      emit(ctx, { kind: "thaw", unitId: unit.unitId });
    }
  }
}

export function discardSpentFuses(ctx: StepContext): void {
  const state = ctx.state;
  const burningFuseIds = new Set<number>();

  for (const unit of state.units) {
    if (unit.burning !== null) {
      burningFuseIds.add(unit.burning.fuseId);
    }
  }

  state.fuses = state.fuses.filter((fuse) => !fuse.detonated || burningFuseIds.has(fuse.fuseId));
}

export function cometIgnite(ctx: StepContext, body: UnitState): void {
  const burning = body.burning;

  if (!body.alive || burning === null) {
    return;
  }

  const fuse = fuseById(ctx.state, burning.fuseId);

  for (const other of unitsWithin(ctx.state.units, body.position, COMET_RADIUS_UNITS)) {
    if (other.unitId !== body.unitId && other.teamId === body.teamId && isOnFloor(other)) {
      igniteUnit(ctx, fuse, other, body, fuse.maxTouchHops, "comet");
    }
  }
}

function spreadInsideBubbles(ctx: StepContext): void {
  const state = ctx.state;

  for (const bubble of state.bubbles) {
    const members = bubbleMembers(ctx, bubble);
    const source = members.find((member) => member.burning !== null);
    const burning = source?.burning;

    if (source === undefined || burning === undefined || burning === null) {
      continue;
    }

    const fuse = fuseById(state, burning.fuseId);

    for (const member of members) {
      if (member.unitId !== source.unitId) {
        igniteUnit(ctx, fuse, member, source, fuse.maxTouchHops, "bubble");
      }
    }
  }
}

function isTouching(first: UnitState, second: UnitState): boolean {
  return (
    distance(first.position, second.position) <= first.radius + second.radius + TOUCH_SLACK_UNITS
  );
}

export function spreadFire(ctx: StepContext): void {
  const state = ctx.state;
  spreadInsideBubbles(ctx);
  const units = unitsInIdOrder(state);
  const spreaders = units.filter((unit) => unit.alive && unit.burning !== null && isOnFloor(unit));

  for (const spreader of spreaders) {
    const burning = spreader.burning;

    if (burning === null) {
      continue;
    }

    const fuse = fuseById(state, burning.fuseId);

    if (burning.hop >= fuse.maxTouchHops) {
      continue;
    }

    for (const other of units) {
      if (
        other.unitId !== spreader.unitId &&
        other.alive &&
        other.teamId === spreader.teamId &&
        isOnFloor(other) &&
        isTouching(spreader, other)
      ) {
        igniteUnit(ctx, fuse, other, spreader, burning.hop + 1, "touch");
      }
    }
  }
}
