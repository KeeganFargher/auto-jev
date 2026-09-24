import type { AbilityDefinitionId, UnitId } from "../ids.js";
import type { AbilityDefinition, Catalogue } from "../definitions.js";
import type { UnitState } from "./state.js";
import { distance, isWithinRange } from "../math/vector.js";
import { resolveCastTarget } from "./targeting.js";
import { unitsInArea } from "./areas.js";
import { findBloodContract } from "../builds/compile-build.js";

export interface ActionProposal {
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  targetUnitId: UnitId;
  isBasicAttack: boolean;
}

function abilityFor(unit: UnitState, abilityId: AbilityDefinitionId, catalogue: Catalogue): AbilityDefinition | undefined {
  return unit.abilities[abilityId] ?? catalogue.abilities[abilityId];
}

export function getEngageRange(unit: UnitState, catalogue: Catalogue): number {
  const hero = catalogue.heroes[unit.heroId];

  if (hero === undefined) {
    return 0;
  }

  return abilityFor(unit, hero.basicAttackId, catalogue)?.range ?? 0;
}

function canPaySignature(unit: UnitState, manaCost: number): boolean {
  const contract = findBloodContract(unit.passives);

  return contract === null ? unit.mana >= manaCost : unit.hp > unit.maxHp * contract.minHpFraction;
}

function hasEnoughTargets(ability: AbilityDefinition, unit: UnitState, target: UnitState, units: readonly UnitState[]): boolean {
  if (ability.minTargets === undefined || ability.area === undefined) {
    return true;
  }

  const side = ability.targetPolicy === "lowest-hp-fraction-ally" ? "allies" : "enemies";

  return unitsInArea(units, unit, ability.area, target.position, side).length >= ability.minTargets;
}

export function proposeAction(
  unit: UnitState,
  units: readonly UnitState[],
  tick: number,
  catalogue: Catalogue,
): ActionProposal | null {
  const hero = catalogue.heroes[unit.heroId];

  if (hero === undefined || unit.control !== null) {
    return null;
  }

  const candidateIds = [...hero.abilityIds, hero.basicAttackId];

  for (const abilityId of candidateIds) {
    const ability = abilityFor(unit, abilityId, catalogue);

    if (ability === undefined) {
      continue;
    }

    if (ability.manaCost !== undefined && !canPaySignature(unit, ability.manaCost)) {
      continue;
    }

    if (abilityId === hero.basicAttackId && unit.channel !== null) {
      continue;
    }

    const readyTick = unit.abilityCooldowns[abilityId] ?? 0;

    if (tick < readyTick) {
      continue;
    }

    const target = resolveCastTarget(ability, unit, units);

    if (target === null) {
      continue;
    }

    if (ability.targetPolicy !== "self" && !isWithinRange(distance(unit.position, target.position), ability.range)) {
      continue;
    }

    if (!hasEnoughTargets(ability, unit, target, units)) {
      continue;
    }

    return {
      sourceUnitId: unit.unitId,
      abilityId,
      targetUnitId: target.unitId,
      isBasicAttack: abilityId === hero.basicAttackId,
    };
  }

  return null;
}
