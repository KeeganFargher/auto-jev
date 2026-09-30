import type { SetupWant } from "../../definitions.js";
import { distance, isWithinRange, type Vector2 } from "../../math/vector.js";
import { hasWantedState, predictedPosition } from "../prediction.js";
import type { UnitState } from "../state.js";
import { compareUnitIds, livingEnemies } from "../targeting.js";
import type { StepContext } from "../events.js";
import type { CastPlan } from "./plan.js";

export interface AreaCast {
  rangeUnits: number;
  radiusUnits: number;
  releaseTick: number;
  wants: readonly SetupWant[];
  groupSize: number;
  isEligible: (target: UnitState) => boolean;
}

interface AreaScore {
  center: Vector2;
  hits: number;
  wanted: boolean;
}

function scoreCenter(
  ctx: StepContext,
  cast: AreaCast,
  center: Vector2,
  enemies: readonly UnitState[],
): AreaScore {
  let hits = 0;
  let wantedHits = 0;

  for (const enemy of enemies) {
    const at = predictedPosition(ctx.state, enemy, cast.releaseTick);

    if (!isWithinRange(distance(center, at), cast.radiusUnits + enemy.radius)) {
      continue;
    }

    hits += 1;
    wantedHits += hasWantedState(ctx.state, enemy, cast.wants, cast.releaseTick) ? 1 : 0;
  }

  const grouped = cast.wants.includes("grouped") && hits >= cast.groupSize;

  return { center, hits, wanted: wantedHits > 0 || grouped };
}

export function planAreaCast(
  ctx: StepContext,
  unit: UnitState,
  cast: AreaCast,
  wantedOnly: boolean,
): CastPlan | null {
  const enemies = livingEnemies(ctx.state, unit)
    .filter(cast.isEligible)
    .sort(compareUnitIds);
  let best: AreaScore | null = null;

  for (const enemy of enemies) {
    const center = predictedPosition(ctx.state, enemy, cast.releaseTick);

    if (!isWithinRange(distance(unit.position, center) - unit.radius, cast.rangeUnits + enemy.radius)) {
      continue;
    }

    const score = scoreCenter(ctx, cast, center, enemies);

    if ((wantedOnly && !score.wanted) || score.hits === 0) {
      continue;
    }

    if (best === null || score.hits > best.hits) {
      best = score;
    }
  }

  if (best === null) {
    return null;
  }

  return { targetUnitId: null, point: { ...best.center }, wanted: best.wanted };
}
