import type { ChainDamageEffectDefinition } from "../definitions.js";
import type { UnitId } from "../ids.js";
import type { UnitState } from "./state.js";
import { distance } from "../math/vector.js";
import { RANGE_EPSILON } from "../constants.js";
import { applyDamage } from "./damage.js";

export interface ChainHitOutcome {
  targetUnitId: UnitId;
  hpLost: number;
  shieldAbsorbed: number;
}

function findNextChainTarget(
  source: UnitState,
  from: UnitState,
  units: readonly UnitState[],
  visited: ReadonlySet<UnitId>,
  bounceRangeUnits: number,
): UnitState | null {
  let best: UnitState | null = null;
  let bestQuantizedDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!candidate.alive || candidate.teamId === source.teamId || visited.has(candidate.unitId)) {
      continue;
    }

    const candidateDistance = distance(from.position, candidate.position);

    if (candidateDistance > bounceRangeUnits + RANGE_EPSILON) {
      continue;
    }

    const quantizedDistance = Math.round(candidateDistance / RANGE_EPSILON);

    if (
      quantizedDistance < bestQuantizedDistance ||
      (quantizedDistance === bestQuantizedDistance && best !== null && candidate.unitId < best.unitId)
    ) {
      best = candidate;
      bestQuantizedDistance = quantizedDistance;
    }
  }

  return best;
}

export function resolveChainDamage(
  effect: ChainDamageEffectDefinition,
  source: UnitState,
  primaryTarget: UnitState,
  units: readonly UnitState[],
  bonusBounces: number,
): ChainHitOutcome[] {
  const maxBounces = Math.max(0, effect.maxBounces + bonusBounces);
  const visited = new Set<UnitId>();
  const outcomes: ChainHitOutcome[] = [];

  let currentTarget = primaryTarget;

  for (let hitIndex = 0; hitIndex <= maxBounces; hitIndex += 1) {
    visited.add(currentTarget.unitId);

    const requested = Math.round(effect.amount);

    const shieldAbsorbed =
      currentTarget.shield === null ? 0 : Math.min(currentTarget.shield.amount, requested);

    if (currentTarget.shield !== null) {
      currentTarget.shield.amount -= shieldAbsorbed;

      if (currentTarget.shield.amount <= 0) {
        currentTarget.shield = null;
      }
    }

    const hpLost = applyDamage(currentTarget, requested - shieldAbsorbed);
    outcomes.push({ targetUnitId: currentTarget.unitId, hpLost, shieldAbsorbed });

    if (hitIndex === maxBounces) {
      break;
    }

    const next = findNextChainTarget(source, currentTarget, units, visited, effect.bounceRangeUnits);

    if (next === null) {
      break;
    }

    currentTarget = next;
  }

  return outcomes;
}
