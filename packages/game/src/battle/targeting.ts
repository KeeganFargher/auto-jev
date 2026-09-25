import type { AbilityDefinition, TargetPolicy } from "../definitions.js";
import type { UnitState } from "./state.js";
import { distance, isWithinRange } from "../math/vector.js";

export function isLegalEnemy(unit: UnitState, candidate: UnitState): boolean {
  return candidate.alive && candidate.teamId !== unit.teamId && candidate.untargetableUntilTick === 0;
}

export function isCorpse(unit: UnitState): boolean {
  return !unit.alive && unit.memory.fellAtTick >= 0 && !unit.memory.corpseSpent;
}

export function isRevivable(caster: UnitState, candidate: UnitState): boolean {
  return isCorpse(candidate) && candidate.teamId === caster.teamId && candidate.summonerUnitId === null && !candidate.memory.resurrected;
}

export function isExplodable(unit: UnitState, candidate: UnitState, summonId: string | undefined): boolean {
  return isCorpse(candidate) || (candidate.alive && candidate.summonerUnitId === unit.unitId && candidate.heroId === summonId);
}

export function isCastTarget(ability: AbilityDefinition, source: UnitState, target: UnitState): boolean {
  return ability.targetPolicy === "busiest-corpse" ? isExplodable(source, target, ability.consumes?.summonId) : target.alive;
}

function isLegalAlly(unit: UnitState, candidate: UnitState): boolean {
  return candidate.alive && candidate.teamId === unit.teamId;
}

export function findNearestEnemy(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  let nearest: UnitState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isLegalEnemy(unit, candidate)) {
      continue;
    }

    const candidateDistance = distance(unit.position, candidate.position);

    if (
      candidateDistance < nearestDistance ||
      (candidateDistance === nearestDistance &&
        nearest !== null &&
        candidate.unitId < nearest.unitId)
    ) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

export function findLowestHpFractionAlly(
  unit: UnitState,
  units: readonly UnitState[],
): UnitState | null {
  let lowest: UnitState | null = null;
  let lowestFraction = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isLegalAlly(unit, candidate) || candidate.hp >= candidate.maxHp) {
      continue;
    }

    const candidateFraction = candidate.hp / candidate.maxHp;

    if (
      candidateFraction < lowestFraction ||
      (candidateFraction === lowestFraction && lowest !== null && candidate.unitId < lowest.unitId)
    ) {
      lowest = candidate;
      lowestFraction = candidateFraction;
    }
  }

  return lowest;
}

function inReach(unit: UnitState, candidate: UnitState, rangeUnits: number): boolean {
  return isWithinRange(distance(unit.position, candidate.position), rangeUnits);
}

export function findLowestHpEnemy(unit: UnitState, units: readonly UnitState[], rangeUnits: number): UnitState | null {
  let lowest: UnitState | null = null;

  for (const candidate of units) {
    if (!isLegalEnemy(unit, candidate) || !inReach(unit, candidate, rangeUnits)) {
      continue;
    }

    const candidateIsHero = candidate.summonerUnitId === null;
    const lowestIsHero = lowest !== null && lowest.summonerUnitId === null;

    if (
      lowest === null ||
      (candidateIsHero && !lowestIsHero) ||
      (candidateIsHero === lowestIsHero && (candidate.hp < lowest.hp || (candidate.hp === lowest.hp && candidate.unitId < lowest.unitId)))
    ) {
      lowest = candidate;
    }
  }

  return lowest;
}

function findHighestManaEnemy(unit: UnitState, units: readonly UnitState[], rangeUnits: number): UnitState | null {
  let best: UnitState | null = null;

  for (const candidate of units) {
    if (!isLegalEnemy(unit, candidate) || candidate.maxMana <= 0 || !inReach(unit, candidate, rangeUnits)) {
      continue;
    }

    if (best === null || candidate.mana > best.mana || (candidate.mana === best.mana && candidate.unitId < best.unitId)) {
      best = candidate;
    }
  }

  return best;
}

function findBusiestCorpse(unit: UnitState, units: readonly UnitState[], ability: AbilityDefinition, radiusUnits: number): UnitState | null {
  let best: UnitState | null = null;
  let bestCount = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isExplodable(unit, candidate, ability.consumes?.summonId)) {
      continue;
    }

    const candidateDistance = distance(unit.position, candidate.position);

    if (!isWithinRange(candidateDistance, ability.range)) {
      continue;
    }

    const count = countEnemiesWithin(unit, units, candidate.position, radiusUnits);

    if (
      count > bestCount ||
      (count === bestCount && candidateDistance < bestDistance) ||
      (count === bestCount && candidateDistance === bestDistance && best !== null && candidate.unitId < best.unitId)
    ) {
      best = candidate;
      bestCount = count;
      bestDistance = candidateDistance;
    }
  }

  return bestCount > 0 ? best : null;
}

export function countEnemiesWithin(unit: UnitState, units: readonly UnitState[], center: { x: number; y: number }, radiusUnits: number): number {
  let count = 0;

  for (const candidate of units) {
    if (isLegalEnemy(unit, candidate) && isWithinRange(distance(center, candidate.position), radiusUnits)) {
      count += 1;
    }
  }

  return count;
}

export function findDensestEnemyCluster(
  unit: UnitState,
  units: readonly UnitState[],
  rangeUnits: number,
  radiusUnits: number,
): UnitState | null {
  let best: UnitState | null = null;
  let bestCount = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!isLegalEnemy(unit, candidate)) {
      continue;
    }

    const candidateDistance = distance(unit.position, candidate.position);

    if (!isWithinRange(candidateDistance, rangeUnits)) {
      continue;
    }

    const count = countEnemiesWithin(unit, units, candidate.position, radiusUnits);

    if (
      count > bestCount ||
      (count === bestCount && candidateDistance < bestDistance) ||
      (count === bestCount && candidateDistance === bestDistance && best !== null && candidate.unitId < best.unitId)
    ) {
      best = candidate;
      bestCount = count;
      bestDistance = candidateDistance;
    }
  }

  return best;
}

function tauntingEnemy(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  if (unit.taunt === null) {
    return null;
  }

  const byUnitId = unit.taunt.byUnitId;
  const taunter = units.find((candidate) => candidate.unitId === byUnitId);

  return taunter !== undefined && isLegalEnemy(unit, taunter) ? taunter : null;
}

export function puppetPartner(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  const link = unit.link;

  if (link === null || link.puppetUntilTick === 0) {
    return null;
  }

  let nearest: UnitState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of units) {
    if (!candidate.alive || candidate.unitId === unit.unitId || candidate.link?.linkId !== link.linkId || candidate.untargetableUntilTick !== 0) {
      continue;
    }

    const candidateDistance = distance(unit.position, candidate.position);

    if (candidateDistance < nearestDistance || (candidateDistance === nearestDistance && nearest !== null && candidate.unitId < nearest.unitId)) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

export function resolveTarget(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  return puppetPartner(unit, units) ?? resolveEnemyTarget(unit, units);
}

function commandedTarget(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  const commander = unit.summonerUnitId === null ? undefined : units.find((candidate) => candidate.unitId === unit.summonerUnitId);

  if (commander === undefined || !commander.alive || commander.form?.definition.commandsSummons !== true || commander.targetUnitId === null) {
    return null;
  }

  const target = units.find((candidate) => candidate.unitId === commander.targetUnitId);
  const reach = unit.abilities[unit.basicAttackId]?.range ?? 0;

  return target !== undefined && isLegalEnemy(unit, target) && isWithinRange(distance(unit.position, target.position), reach) ? target : null;
}

function resolveEnemyTarget(unit: UnitState, units: readonly UnitState[]): UnitState | null {
  const forced = tauntingEnemy(unit, units) ?? commandedTarget(unit, units);

  if (forced !== null) {
    return forced;
  }

  if (unit.targetUnitId !== null) {
    const current = units.find((candidate) => candidate.unitId === unit.targetUnitId);

    if (current !== undefined && isLegalEnemy(unit, current)) {
      return current;
    }
  }

  return findNearestEnemy(unit, units);
}

function resolvePolicyTarget(
  targetPolicy: Exclude<TargetPolicy, "busiest-corpse">,
  unit: UnitState,
  units: readonly UnitState[],
): UnitState | null {
  switch (targetPolicy) {
    case "nearest-enemy":
      return resolveEnemyTarget(unit, units);

    case "lowest-hp-fraction-ally":
      return findLowestHpFractionAlly(unit, units);

    case "lowest-hp-enemy":
      return tauntingEnemy(unit, units) ?? findLowestHpEnemy(unit, units, Number.POSITIVE_INFINITY);

    case "highest-mana-enemy":
      return findHighestManaEnemy(unit, units, Number.POSITIVE_INFINITY) ?? resolveEnemyTarget(unit, units);

    case "self":
      return unit.alive ? unit : null;

    case "densest-enemy-cluster":
      return resolveEnemyTarget(unit, units);

    default: {
      const exhaustive: never = targetPolicy;

      return exhaustive;
    }
  }
}

export function resolveCastTarget(
  ability: AbilityDefinition,
  unit: UnitState,
  units: readonly UnitState[],
): UnitState | null {
  const radius = ability.area?.kind === "circle" ? ability.area.radiusUnits : 0;

  switch (ability.targetPolicy) {
    case "densest-enemy-cluster":
      return findDensestEnemyCluster(unit, units, ability.range, radius);

    case "lowest-hp-enemy":
      return tauntingEnemy(unit, units) ?? findLowestHpEnemy(unit, units, ability.range);

    case "highest-mana-enemy":
      return findHighestManaEnemy(unit, units, ability.range) ?? resolveEnemyTarget(unit, units);

    case "busiest-corpse":
      return findBusiestCorpse(unit, units, ability, radius);

    default:
      return resolvePolicyTarget(ability.targetPolicy, unit, units);
  }
}
