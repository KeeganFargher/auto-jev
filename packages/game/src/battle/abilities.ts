import type { AbilityDefinitionId, UnitId } from "../ids.js";
import type { Catalogue } from "../definitions.js";
import type { UnitState } from "./state.js";
import { distance, isWithinRange } from "../math/vector.js";
import { resolveAbilityTarget } from "./targeting.js";

export interface ActionProposal {
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  targetUnitId: UnitId;
  isBasicAttack: boolean;
}

export function getEngageRange(unit: UnitState, catalogue: Catalogue): number {
  const hero = catalogue.heroes[unit.heroId];

  if (hero === undefined) {
    return 0;
  }

  const basicAttack = catalogue.abilities[hero.basicAttackId];

  return basicAttack === undefined ? 0 : basicAttack.range;
}

export function proposeAction(
  unit: UnitState,
  units: readonly UnitState[],
  tick: number,
  catalogue: Catalogue,
): ActionProposal | null {
  const hero = catalogue.heroes[unit.heroId];

  if (hero === undefined) {
    return null;
  }

  const candidateIds = [...hero.abilityIds, hero.basicAttackId];

  for (const abilityId of candidateIds) {
    const ability = catalogue.abilities[abilityId];

    if (ability === undefined) {
      continue;
    }

    const readyTick = unit.abilityCooldowns[abilityId] ?? 0;

    if (tick < readyTick) {
      continue;
    }

    const target = resolveAbilityTarget(ability.targetPolicy, unit, units);

    if (target === null || !isWithinRange(distance(unit.position, target.position), ability.range)) {
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
