import { TICK_SECONDS } from "../constants.js";
import type { UnitId } from "../ids.js";
import {
  clampToArena,
  directionTo,
  distance,
  isWithinRange,
  length,
  lerp,
  normalize,
  perpendicular,
  rotate,
  type Vector2,
} from "../math/vector.js";
import type { StepContext } from "./events.js";
import { thickestGroup } from "./prediction.js";
import { PANIC_SWAY, PANIC_WAVE_TICKS, SEPARATION_UNITS_PER_SECOND } from "./rules.js";
import { rampageOf } from "./signatures/rampage.js";
import {
  fuseById,
  isGrounded,
  isImmovable,
  isOnFloor,
  isStunned,
  type BattleState,
  type PrimedState,
  type UnitState,
} from "./state.js";
import { currentTarget, livingAllies, unitsInIdOrder, updateTarget } from "./targeting.js";

const SLOT_OFFSETS = [0, -1, 1, -2, 2, -3, 3];

const SLOT_GAP_UNITS = 1;

function engageRange(unit: UnitState): number {
  return unit.rampage === null ? unit.attack.rangeUnits : rampageOf(unit).grabReachUnits;
}

function moveSpeed(state: BattleState, unit: UnitState): number {
  const primed = unit.primed;
  const rampage = unit.rampage === null ? 1 : rampageOf(unit).moveMultiplier;
  const panic = primed === null ? 1 : fuseById(state, primed.fuseId).panicMoveMultiplier;

  return unit.moveUnitsPerSecond * rampage * panic;
}

function canMove(state: BattleState, unit: UnitState): boolean {
  return (
    unit.alive && isGrounded(unit) && !isStunned(unit, state.tick) && unit.action.kind === "idle"
  );
}

function stepToward(state: BattleState, from: Vector2, heading: Vector2, units: number): Vector2 {
  return clampToArena(
    { x: from.x + heading.x * units, y: from.y + heading.y * units },
    state.arenaWidth,
    state.arenaHeight,
  );
}

function turn(heading: Vector2, cosine: number, sine: number, steps: number): Vector2 {
  const signedSine = steps < 0 ? -sine : sine;
  let turned = heading;

  for (let count = 0; count < Math.abs(steps); count += 1) {
    turned = rotate(turned, cosine, signedSine);
  }

  return turned;
}

function isSlotTaken(
  slot: Vector2,
  unit: UnitState,
  target: UnitState,
  units: readonly UnitState[],
): boolean {
  return units.some(
    (other) =>
      other.alive &&
      isOnFloor(other) &&
      other.unitId !== unit.unitId &&
      other.unitId !== target.unitId &&
      distance(other.position, slot) < unit.radius + other.radius,
  );
}

function engageSlot(
  state: BattleState,
  unit: UnitState,
  target: UnitState,
  reach: number,
  units: readonly UnitState[],
): Vector2 | null {
  const bearing = directionTo(target.position, unit.position);
  const spacing = Math.min(1, (2 * unit.radius + SLOT_GAP_UNITS) / (2 * reach));
  const cosine = 1 - 2 * spacing * spacing;
  const sine = 2 * spacing * Math.sqrt(1 - spacing * spacing);

  for (const offset of SLOT_OFFSETS) {
    const slot = stepToward(state, target.position, turn(bearing, cosine, sine, offset), reach);

    if (
      isWithinRange(distance(slot, target.position), reach) &&
      !isSlotTaken(slot, unit, target, units)
    ) {
      return slot;
    }
  }

  return null;
}

function steer(state: BattleState, unit: UnitState, units: readonly UnitState[]): Vector2 | null {
  const target = currentTarget(state, unit);

  if (target === null || !target.alive) {
    return null;
  }

  const reach = unit.radius + target.radius + engageRange(unit);
  const span = distance(unit.position, target.position);

  if (isWithinRange(span, reach)) {
    return null;
  }

  const slot = engageSlot(state, unit, target, reach, units);
  const destination = slot ?? target.position;
  const remaining = slot === null ? span - reach : distance(unit.position, slot);
  const travel = Math.min(moveSpeed(state, unit) * TICK_SECONDS, remaining);

  return stepToward(state, unit.position, directionTo(unit.position, destination), travel);
}

function panicHeading(state: BattleState, unit: UnitState, primed: PrimedState): Vector2 {
  const friends = livingAllies(state, unit).filter(isOnFloor);
  const group = thickestGroup(state, friends, unit.teamId, unit.position, unit.unitId);
  const toward = group === null ? unit.facing : directionTo(unit.position, group.unit.position);
  const base = toward.x === 0 && toward.y === 0 ? unit.facing : toward;
  const phase = ((primed.explodeTick - state.tick) % PANIC_WAVE_TICKS) / PANIC_WAVE_TICKS;
  const sway = (1 - 4 * Math.abs(phase - 0.5)) * PANIC_SWAY;
  const side = perpendicular(base);

  return normalize({ x: base.x + side.x * sway, y: base.y + side.y * sway });
}

function panicStep(state: BattleState, unit: UnitState, primed: PrimedState): Vector2 {
  const heading = panicHeading(state, unit, primed);

  return stepToward(state, unit.position, heading, moveSpeed(state, unit) * TICK_SECONDS);
}

function isPushable(unit: UnitState): boolean {
  return !isImmovable(unit) && unit.motion.kind !== "skid";
}

function addPush(
  pushes: Map<UnitId, Vector2>,
  unitId: UnitId,
  direction: Vector2,
  amount: number,
): void {
  const push = pushes.get(unitId) ?? { x: 0, y: 0 };
  pushes.set(unitId, { x: push.x + direction.x * amount, y: push.y + direction.y * amount });
}

function keepInRange(state: BattleState, unit: UnitState, pushed: Vector2): Vector2 {
  const target = currentTarget(state, unit);

  if (target === null || !target.alive) {
    return pushed;
  }

  const reach = unit.radius + target.radius + engageRange(unit);

  if (!isWithinRange(distance(unit.position, target.position), reach)) {
    return pushed;
  }

  const span = distance(pushed, target.position);

  if (span <= reach) {
    return pushed;
  }

  return lerp(target.position, pushed, reach / span);
}

function separateUnits(state: BattleState, units: readonly UnitState[]): void {
  const floor = units.filter((unit) => unit.alive && isOnFloor(unit));
  const pushes = new Map<UnitId, Vector2>();

  for (const [index, first] of floor.entries()) {
    for (const second of floor.slice(index + 1)) {
      const minimum = first.radius + second.radius;
      const gap = distance(first.position, second.position);
      const firstMoves = isPushable(first);
      const secondMoves = isPushable(second);

      if (gap >= minimum || (!firstMoves && !secondMoves)) {
        continue;
      }

      const away = gap > 0 ? directionTo(second.position, first.position) : { x: -1, y: 0 };
      const share = (minimum - gap) * (firstMoves && secondMoves ? 0.5 : 1);

      if (firstMoves) {
        addPush(pushes, first.unitId, away, share);
      }

      if (secondMoves) {
        addPush(pushes, second.unitId, away, -share);
      }
    }
  }

  const limit = SEPARATION_UNITS_PER_SECOND * TICK_SECONDS;
  const settled = new Map<UnitId, Vector2>();

  for (const unit of floor) {
    const push = pushes.get(unit.unitId);

    if (push === undefined) {
      continue;
    }

    const span = length(push);
    const factor = span > limit ? limit / span : 1;
    const pushed = stepToward(state, unit.position, push, factor);
    settled.set(unit.unitId, keepInRange(state, unit, pushed));
  }

  for (const unit of floor) {
    unit.position = settled.get(unit.unitId) ?? unit.position;
  }
}

export function moveUnits(ctx: StepContext): void {
  const state = ctx.state;
  const units = unitsInIdOrder(state);

  for (const unit of units) {
    if (unit.alive && isGrounded(unit) && !isStunned(unit, state.tick) && unit.primed === null) {
      updateTarget(state, unit);
    }
  }

  const steps = new Map<UnitId, Vector2>();

  for (const unit of units) {
    if (!canMove(state, unit)) {
      continue;
    }

    const primed = unit.primed;
    const next = primed === null ? steer(state, unit, units) : panicStep(state, unit, primed);

    if (next !== null) {
      steps.set(unit.unitId, next);
    }
  }

  for (const unit of units) {
    const next = steps.get(unit.unitId);

    if (next === undefined) {
      continue;
    }

    const heading = directionTo(unit.position, next);

    if (heading.x !== 0 || heading.y !== 0) {
      unit.facing = heading;
    }

    unit.position = next;
  }

  separateUnits(state, units);
}
