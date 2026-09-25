import type { AbilityDefinitionId, UnitId } from "../ids.js";
import type { AbilityDefinition } from "../definitions.js";
import type { UnitState } from "./state.js";
import { distance, isWithinRange } from "../math/vector.js";
import { isCorpse, isRevivable, puppetPartner, resolveCastTarget, resolveTarget } from "./targeting.js";
import { unitsInArea } from "./areas.js";
import { findBloodPact } from "../builds/compile-build.js";

export interface ActionProposal {
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  targetUnitId: UnitId;
  isBasicAttack: boolean;
}

export function activeBasicAttackId(unit: UnitState): AbilityDefinitionId {
  const swapped = unit.form?.definition.basicAttackId;

  return swapped !== undefined && unit.abilities[swapped] !== undefined ? swapped : unit.basicAttackId;
}

export function getEngageRange(unit: UnitState): number {
  return unit.abilities[activeBasicAttackId(unit)]?.range ?? 0;
}

function canPaySkill(unit: UnitState, abilityId: AbilityDefinitionId, manaCost: number | undefined): boolean {
  const pact = findBloodPact(unit.passives);
  const skill = abilityId === unit.abilityId || abilityId === unit.ultimateId;

  if (pact !== null && skill) {
    return unit.hp > unit.maxHp * pact.minHpFraction;
  }

  return manaCost === undefined || unit.mana >= manaCost;
}

function hasEnoughTargets(ability: AbilityDefinition, unit: UnitState, target: UnitState, units: readonly UnitState[]): boolean {
  if (ability.minTargets === undefined || ability.area === undefined) {
    return true;
  }

  const side = ability.targetPolicy === "lowest-hp-fraction-ally" ? "allies" : "enemies";

  return unitsInArea(units, unit, ability.area, target.position, side).length >= ability.minTargets;
}

function hasEnoughPoisoned(ability: AbilityDefinition, unit: UnitState, target: UnitState, units: readonly UnitState[]): boolean {
  const gate = ability.requiresPoisoned;

  if (gate === undefined) {
    return true;
  }

  const pool = ability.area === undefined ? units.filter((candidate) => candidate.alive && candidate.teamId !== unit.teamId) : unitsInArea(units, unit, ability.area, target.position, "enemies");
  const poisoned = pool.filter((candidate) => candidate.dots.some((dot) => dot.dot === "poison" && dot.sourceUnitId === unit.unitId && dot.stacks >= gate.stacks));

  return poisoned.length >= gate.targets;
}

function worthResurrecting(ability: AbilityDefinition, unit: UnitState, units: readonly UnitState[]): boolean {
  for (const effect of ability.effects) {
    if (effect.kind === "resurrect") {
      return unit.hp < unit.maxHp * effect.dangerHpFraction || units.some((other) => isRevivable(unit, other));
    }
  }

  return true;
}

function worthRaising(ability: AbilityDefinition, units: readonly UnitState[]): boolean {
  return !ability.effects.some((effect) => effect.kind === "raise-army") || units.some((other) => isCorpse(other) && other.summonerUnitId === null);
}

function candidateIds(unit: UnitState, units: readonly UnitState[]): AbilityDefinitionId[] {
  if (puppetPartner(unit, units) !== null) {
    return [activeBasicAttackId(unit)];
  }

  const ids: AbilityDefinitionId[] = [];

  if (unit.ultimateId !== null) {
    ids.push(unit.ultimateId);
  }

  if (unit.abilityId !== null) {
    ids.push(unit.abilityId);
  }

  ids.push(activeBasicAttackId(unit));

  return ids;
}

export function proposeAction(unit: UnitState, units: readonly UnitState[], tick: number): ActionProposal | null {
  if (unit.control !== null) {
    return null;
  }

  for (const abilityId of candidateIds(unit, units)) {
    const ability = unit.abilities[abilityId];

    if (ability === undefined) {
      continue;
    }

    if (!canPaySkill(unit, abilityId, ability.manaCost)) {
      continue;
    }

    const basic = activeBasicAttackId(unit);

    if (abilityId === basic && unit.channel !== null) {
      continue;
    }

    const readyTick = unit.abilityCooldowns[abilityId] ?? 0;

    if (tick < readyTick) {
      continue;
    }

    const target = abilityId === basic ? resolveTarget(unit, units) : resolveCastTarget(ability, unit, units);

    if (target === null) {
      continue;
    }

    if (ability.targetPolicy !== "self" && !isWithinRange(distance(unit.position, target.position), ability.range)) {
      continue;
    }

    if (!hasEnoughTargets(ability, unit, target, units) || !hasEnoughPoisoned(ability, unit, target, units) || !worthResurrecting(ability, unit, units) || !worthRaising(ability, units)) {
      continue;
    }

    return {
      sourceUnitId: unit.unitId,
      abilityId,
      targetUnitId: target.unitId,
      isBasicAttack: abilityId === basic,
    };
  }

  return null;
}
