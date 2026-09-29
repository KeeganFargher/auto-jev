import type { TeamId, UnitId } from "../ids.js";
import type { SetupWant } from "../definitions.js";
import { distance, isWithinRange, type Vector2 } from "../math/vector.js";
import { DOWNED_TICKS, flightFraction, flightPosition, pathPoint } from "./motion.js";
import { GROUP_RADIUS_UNITS } from "./rules.js";
import { bubbleById, isLaunched, type BattleState, type UnitState } from "./state.js";

export function bubbleCenterAt(state: BattleState, bubbleId: number, tick: number): Vector2 {
  const bubble = bubbleById(state, bubbleId);
  const flight = bubble.flight;

  if (flight === null) {
    return bubble.center;
  }

  return pathPoint(flight.path, flightFraction(flight.startTick, flight.endTick, tick));
}

export function predictedPosition(state: BattleState, unit: UnitState, tick: number): Vector2 {
  const motion = unit.motion;

  if (motion.kind === "flight") {
    return flightPosition(motion, tick);
  }

  if (motion.kind === "float") {
    const center = bubbleCenterAt(state, motion.bubbleId, tick);

    return { x: center.x + motion.offset.x, y: center.y + motion.offset.y };
  }

  if (motion.kind === "skid") {
    return motion.to;
  }

  return unit.position;
}

export function lastsUntil(
  state: BattleState,
  unit: UnitState,
  want: SetupWant,
  tick: number,
): boolean {
  const motion = unit.motion;

  if (want === "airborne") {
    return motion.kind === "flight" && isLaunched(unit) && motion.endTick > tick;
  }

  if (want === "floating") {
    return motion.kind === "float" && bubbleById(state, motion.bubbleId).endTick > tick;
  }

  if (want === "frozen") {
    return unit.frozen !== null && unit.frozen.untilTick > tick;
  }

  if (want === "downed") {
    return (
      (motion.kind === "downed" && motion.endTick > tick) ||
      (motion.kind === "skid" && motion.endTick + DOWNED_TICKS > tick)
    );
  }

  if (want === "burning") {
    return unit.burning !== null && unit.burning.untilTick > tick;
  }

  return false;
}

export function hasWantedState(
  state: BattleState,
  unit: UnitState,
  wants: readonly SetupWant[],
  tick: number,
): boolean {
  return wants.some((want) => lastsUntil(state, unit, want, tick));
}

export function isSetUpAt(state: BattleState, unit: UnitState, tick: number): boolean {
  const motion = unit.motion;
  const primed = unit.primed;

  return (
    hasWantedState(state, unit, ["airborne", "floating", "burning", "frozen"], tick) ||
    (primed !== null && primed.explodeTick > tick) ||
    (motion.kind === "skid" && motion.endTick + DOWNED_TICKS > tick) ||
    (motion.kind === "downed" && motion.endTick > tick)
  );
}

export function isCasting(unit: UnitState): boolean {
  return unit.action.kind !== "idle" && unit.action.kind !== "attack";
}

export function teamMembersNear(
  state: BattleState,
  teamId: TeamId,
  center: Vector2,
  radiusUnits: number,
  tick: number,
): UnitState[] {
  return state.units.filter(
    (unit) =>
      unit.alive &&
      unit.teamId === teamId &&
      isWithinRange(
        distance(center, predictedPosition(state, unit, tick)),
        radiusUnits + unit.radius,
      ),
  );
}

export interface GroupCandidate {
  unit: UnitState;
  size: number;
}

export function thickestGroup(
  state: BattleState,
  candidates: readonly UnitState[],
  teamId: TeamId,
  origin: Vector2,
  excluded: UnitId | null,
): GroupCandidate | null {
  let best: GroupCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.unitId === excluded) {
      continue;
    }

    const size = teamMembersNear(
      state,
      teamId,
      candidate.position,
      GROUP_RADIUS_UNITS,
      state.tick,
    ).filter((member) => member.unitId !== excluded).length;

    const span = distance(origin, candidate.position);

    if (
      best === null ||
      size > best.size ||
      (size === best.size && span < bestDistance) ||
      (size === best.size && span === bestDistance && candidate.unitId < best.unit.unitId)
    ) {
      best = { unit: candidate, size };
      bestDistance = span;
    }
  }

  return best;
}
