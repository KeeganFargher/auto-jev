import type { UnitId } from "../ids.js";
import type { UnitState } from "./state.js";
import { getEngageRange } from "./abilities.js";
import { findDensestEnemyCluster } from "./targeting.js";
import { clampToArena, directionTo, distance, isWithinRange, type Vector2 } from "../math/vector.js";
import { TICK_SECONDS } from "../constants.js";

export interface MovementProposal {
  unitId: string;
  position: Vector2;
}

export const SLOT_SPACING_UNITS = 7;

export const MIN_GAP_UNITS = 6;

const SLOT_OFFSETS = [0, -1, 1, -2, 2, -3, 3];

const SEPARATION_UNITS_PER_SECOND = 20;

const COLUMN_HALF_WIDTH_UNITS = 4;

const COLUMN_DEPTH_UNITS = 15;

const COLUMN_PENALTY = 2.5;

function slotStepRadians(range: number): number {
  return 2 * Math.asin(Math.min(1, SLOT_SPACING_UNITS / (2 * range)));
}

function isSlotTaken(slot: Vector2, unit: UnitState, target: UnitState, units: readonly UnitState[]): boolean {
  return units.some(
    (other) => other.alive && other.unitId !== unit.unitId && other.unitId !== target.unitId && distance(other.position, slot) < SLOT_SPACING_UNITS,
  );
}

function isInColumn(slot: Vector2, unit: UnitState, units: readonly UnitState[]): boolean {
  return units.some(
    (other) =>
      other.alive &&
      other.unitId !== unit.unitId &&
      Math.abs(other.position.x - slot.x) < COLUMN_HALF_WIDTH_UNITS &&
      Math.abs(other.position.y - slot.y) < COLUMN_DEPTH_UNITS,
  );
}

function engageSlot(unit: UnitState, target: UnitState, range: number, units: readonly UnitState[], arenaWidth: number, arenaHeight: number): Vector2 | null {
  const bearing = Math.atan2(unit.position.y - target.position.y, unit.position.x - target.position.x);
  const step = slotStepRadians(range);
  let best: Vector2 | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const offset of SLOT_OFFSETS) {
    const angle = bearing + offset * step;
    const around = { x: target.position.x + Math.cos(angle) * range, y: target.position.y + Math.sin(angle) * range };
    const slot = clampToArena(around, arenaWidth, arenaHeight);

    if (!isWithinRange(distance(slot, target.position), range) || isSlotTaken(slot, unit, target, units)) {
      continue;
    }

    const cost = Math.abs(offset) + (isInColumn(slot, unit, units) ? COLUMN_PENALTY : 0);

    if (cost < bestCost) {
      best = slot;
      bestCost = cost;
    }
  }

  return best;
}

export function proposeMovement(
  unit: UnitState,
  target: UnitState | null,
  engageRangeUnits: number,
  units: readonly UnitState[],
  arenaWidth: number,
  arenaHeight: number,
): MovementProposal {
  if (target === null || unit.control !== null) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const distanceToTarget = distance(unit.position, target.position);

  if (isWithinRange(distanceToTarget, engageRangeUnits)) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const slowMultiplier = unit.slow === null ? 1 : unit.slow.speedMultiplier;
  const maxStep = unit.moveSpeedUnitsPerSecond * slowMultiplier * TICK_SECONDS;
  const slot = engageRangeUnits > 0 ? engageSlot(unit, target, engageRangeUnits, units, arenaWidth, arenaHeight) : null;
  const destination = slot ?? target.position;
  const remaining = slot === null ? distanceToTarget - engageRangeUnits : distance(unit.position, slot);
  const step = Math.min(maxStep, remaining);
  const direction = directionTo(unit.position, destination);

  const proposed = {
    x: unit.position.x + direction.x * step,
    y: unit.position.y + direction.y * step,
  };

  return { unitId: unit.unitId, position: clampToArena(proposed, arenaWidth, arenaHeight) };
}

function canBePushed(unit: UnitState, busy: ReadonlySet<UnitId>): boolean {
  return unit.moveSpeedUnitsPerSecond > 0 && !busy.has(unit.unitId);
}

function addPush(pushes: Map<UnitId, Vector2>, unitId: UnitId, direction: Vector2, amount: number): void {
  const push = pushes.get(unitId) ?? { x: 0, y: 0 };
  pushes.set(unitId, { x: push.x + direction.x * amount, y: push.y + direction.y * amount });
}

function keepInRange(unit: UnitState, from: Vector2, to: Vector2, units: readonly UnitState[]): Vector2 {
  const target = unit.targetUnitId === null ? undefined : units.find((candidate) => candidate.unitId === unit.targetUnitId);
  const range = getEngageRange(unit);

  if (target === undefined || range <= 0 || !isWithinRange(distance(from, target.position), range)) {
    return to;
  }

  const reach = distance(to, target.position);

  if (reach <= range || reach === 0) {
    return to;
  }

  return {
    x: target.position.x + ((to.x - target.position.x) * range) / reach,
    y: target.position.y + ((to.y - target.position.y) * range) / reach,
  };
}

export function separateUnits(units: readonly UnitState[], busy: ReadonlySet<UnitId>, arenaWidth: number, arenaHeight: number): void {
  const alive = units.filter((unit) => unit.alive);
  const pushes = new Map<UnitId, Vector2>();

  for (const [index, first] of alive.entries()) {
    for (const second of alive.slice(index + 1)) {
      const gap = distance(first.position, second.position);
      const firstMoves = canBePushed(first, busy);
      const secondMoves = canBePushed(second, busy);

      if (gap >= MIN_GAP_UNITS || (!firstMoves && !secondMoves)) {
        continue;
      }

      const away = gap > 0 ? directionTo(second.position, first.position) : { x: first.unitId < second.unitId ? -1 : 1, y: 0 };
      const share = (MIN_GAP_UNITS - gap) * (firstMoves && secondMoves ? 0.5 : 1);

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

  for (const unit of alive) {
    const push = pushes.get(unit.unitId);

    if (push === undefined) {
      continue;
    }

    const length = Math.hypot(push.x, push.y);
    const scale = length > limit ? limit / length : 1;
    const pushed = clampToArena({ x: unit.position.x + push.x * scale, y: unit.position.y + push.y * scale }, arenaWidth, arenaHeight);
    settled.set(unit.unitId, keepInRange(unit, unit.position, pushed, units));
  }

  for (const unit of alive) {
    unit.position = settled.get(unit.unitId) ?? unit.position;
  }
}

export const FOLLOW_UNITS = 12;

export function proposeFollow(unit: UnitState, leader: UnitState, arenaWidth: number, arenaHeight: number): MovementProposal {
  const gap = distance(unit.position, leader.position) - FOLLOW_UNITS;

  if (unit.control !== null || gap <= 0) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const slowMultiplier = unit.slow === null ? 1 : unit.slow.speedMultiplier;
  const step = Math.min(leader.moveSpeedUnitsPerSecond * slowMultiplier * TICK_SECONDS, gap);
  const direction = directionTo(unit.position, leader.position);

  return {
    unitId: unit.unitId,
    position: clampToArena({ x: unit.position.x + direction.x * step, y: unit.position.y + direction.y * step }, arenaWidth, arenaHeight),
  };
}

export const DRIFT_SPEED_FRACTION = 0.6;

const DRIFT_STOP_UNITS = 6;

const DRIFT_SEARCH_UNITS = 999;

const DRIFT_CLUSTER_UNITS = 15;

export function proposeDrift(unit: UnitState, units: readonly UnitState[], arenaWidth: number, arenaHeight: number): MovementProposal {
  const cluster = findDensestEnemyCluster(unit, units, DRIFT_SEARCH_UNITS, DRIFT_CLUSTER_UNITS);

  if (cluster === null) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const remaining = distance(unit.position, cluster.position) - DRIFT_STOP_UNITS;

  if (remaining <= 0) {
    return { unitId: unit.unitId, position: unit.position };
  }

  const step = Math.min(unit.moveSpeedUnitsPerSecond * DRIFT_SPEED_FRACTION * TICK_SECONDS, remaining);
  const direction = directionTo(unit.position, cluster.position);

  return {
    unitId: unit.unitId,
    position: clampToArena({ x: unit.position.x + direction.x * step, y: unit.position.y + direction.y * step }, arenaWidth, arenaHeight),
  };
}
