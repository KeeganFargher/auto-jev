import type { HammerfallDefinition } from "../../definitions.js";
import { directionTo, distance, isWithinRange, type Vector2 } from "../../math/vector.js";
import { HAMMER_FREEZE, HAMMER_SLOW, HAMMER_SLOW_LEAD_TICKS } from "../beats.js";
import { emit, type StepContext } from "../events.js";
import { radialStrike, strikeTargets, type RadialStrike } from "../launch.js";
import { hasWantedState, isSetUpAt, predictedPosition } from "../prediction.js";
import type { UnitState } from "../state.js";
import { livingEnemies } from "../targeting.js";
import type { CastPlan } from "./plan.js";

type HammerfallAction = Extract<UnitState["action"], { kind: "hammerfall" }>;

export function hammerfallOf(unit: UnitState): HammerfallDefinition {
  const signature = unit.signature;

  if (signature === null || signature.kind !== "hammerfall") {
    throw new Error(`Unit "${unit.unitId}" has no Hammerfall`);
  }

  return signature;
}

interface AimScore {
  center: Vector2;
  score: number;
  wanted: boolean;
}

function aimCandidates(
  ctx: StepContext,
  unit: UnitState,
  enemies: readonly UnitState[],
  impactTick: number,
): Vector2[] {
  const reach = hammerfallOf(unit).reachUnits;

  return enemies.map((enemy) => {
    const toward = directionTo(unit.position, predictedPosition(ctx.state, enemy, impactTick));
    const heading = toward.x === 0 && toward.y === 0 ? unit.facing : toward;

    return { x: unit.position.x + heading.x * reach, y: unit.position.y + heading.y * reach };
  });
}

function scoreAim(
  ctx: StepContext,
  definition: HammerfallDefinition,
  center: Vector2,
  enemies: readonly UnitState[],
  impactTick: number,
): AimScore {
  const state = ctx.state;
  let score = 0;
  let hits = 0;
  let wantedHits = 0;

  for (const enemy of enemies) {
    const at = predictedPosition(state, enemy, impactTick);

    if (!isWithinRange(distance(center, at), definition.radiusUnits + enemy.radius)) {
      continue;
    }

    hits += 1;
    wantedHits += hasWantedState(state, enemy, definition.wants, impactTick) ? 1 : 0;
    score += isSetUpAt(state, enemy, impactTick) ? 2 : 1;
  }

  const grouped = definition.wants.includes("grouped") && hits >= definition.groupSize;

  return { center, score, wanted: wantedHits > 0 || grouped };
}

export function planHammerfall(
  ctx: StepContext,
  unit: UnitState,
  definition: HammerfallDefinition,
  wantedOnly: boolean,
): CastPlan | null {
  const impactTick = ctx.state.tick + definition.impactTick;
  const enemies = livingEnemies(ctx.state, unit);
  let best: AimScore | null = null;

  for (const center of aimCandidates(ctx, unit, enemies, impactTick)) {
    const aim = scoreAim(ctx, definition, center, enemies, impactTick);

    if (aim.score === 0 || (wantedOnly && !aim.wanted)) {
      continue;
    }

    if (best === null || aim.score > best.score) {
      best = aim;
    }
  }

  if (best === null) {
    return null;
  }

  return { targetUnitId: null, point: best.center, wanted: best.wanted };
}

export function startHammerfall(
  ctx: StepContext,
  unit: UnitState,
  definition: HammerfallDefinition,
  plan: CastPlan,
): void {
  const tick = ctx.state.tick;
  const direction = directionTo(unit.position, plan.point);

  if (direction.x !== 0 || direction.y !== 0) {
    unit.facing = direction;
  }

  unit.action = {
    kind: "hammerfall",
    startTick: tick,
    impactTick: tick + definition.impactTick,
    endTick: tick + definition.durationTicks,
    center: { ...plan.point },
  };
}

export function advanceHammerfall(
  ctx: StepContext,
  unit: UnitState,
  action: HammerfallAction,
): void {
  const definition = hammerfallOf(unit);
  const tick = ctx.state.tick;

  if (tick === action.impactTick - HAMMER_SLOW_LEAD_TICKS) {
    emit(ctx, { kind: "beat", beat: HAMMER_SLOW });
  }

  if (tick === action.impactTick) {
    const strike: RadialStrike = {
      cause: "hammer",
      damageCause: "hammer",
      source: unit,
      center: action.center,
      radiusUnits: definition.radiusUnits,
      damage: definition.damage,
      launch: definition.launch,
    };

    emit(ctx, {
      kind: "hammer-impact",
      unitId: unit.unitId,
      center: { ...action.center },
      radius: definition.radiusUnits,
      hitUnitIds: strikeTargets(ctx, strike).map((target) => target.unitId),
    });
    emit(ctx, { kind: "beat", beat: HAMMER_FREEZE });
    radialStrike(ctx, strike);
  }

  if (tick >= action.endTick) {
    unit.action = { kind: "idle" };
  }
}
