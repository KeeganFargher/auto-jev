import type { HeroDefinitionId } from "../ids.js";
import type { Catalogue, ComboKind, ConditionKind, School, EffectDefinition } from "../definitions.js";
import type { HeroBuild } from "./state.js";
import { compileBuild, type CompiledUnitStats } from "./compile-build.js";
import { COMBO_FOR_CONDITION, CONDITION_KINDS, DETONATED_BY, SCHOOLS } from "../battle/conditions.js";

export const ATTUNEMENT_THRESHOLD = 3;

export const ATTUNEMENT_MIGHT_MAX_HP = 0.2;

export const ATTUNEMENT_ARCANA_MANA_GAIN = 0.25;

export const ATTUNEMENT_CUNNING_CRIT_CHANCE = 0.2;

export interface ComboTrait {
  condition: ConditionKind;
  combo: ComboKind;
  detonatingSchool: School;
  appliers: HeroDefinitionId[];
  detonators: HeroDefinitionId[];
  selfCombo: boolean;
  tier: number;
}

export interface AttunementTrait {
  school: School;
  heroes: HeroDefinitionId[];
  active: boolean;
}

export interface TeamTraits {
  combos: ComboTrait[];
  attunements: AttunementTrait[];
}

function collectConditions(effects: readonly EffectDefinition[], into: Set<ConditionKind>): void {
  for (const effect of effects) {
    if (effect.kind === "apply-condition") {
      into.add(effect.condition);
    }

    if (effect.kind === "dot" && effect.conditionAtStacks !== undefined) {
      into.add(effect.conditionAtStacks.condition);
    }
  }
}

export function appliedConditions(compiled: CompiledUnitStats): Set<ConditionKind> {
  const applied = new Set<ConditionKind>();

  for (const ability of Object.values(compiled.abilities)) {
    collectConditions(ability.effects, applied);
    collectConditions(ability.secondary?.effects ?? [], applied);
    collectConditions(ability.zone?.effects ?? [], applied);
  }

  for (const passive of compiled.passives) {
    if (passive.kind === "every-nth-basic-attack" || passive.kind === "first-hit-per-enemy") {
      collectConditions(passive.effects, applied);
    }
  }

  return applied;
}

export function detonatingSchools(compiled: CompiledUnitStats, catalogue: Catalogue): Set<School> {
  const schools = new Set<School>();

  if (compiled.school !== null) {
    schools.add(compiled.school);
  }

  for (const ability of Object.values(compiled.abilities)) {
    if (ability.school !== undefined) {
      schools.add(ability.school);
    }

    for (const effect of ability.effects) {
      const summoned = effect.kind === "summon" ? catalogue.heroes[effect.heroId]?.school : undefined;

      if (summoned !== undefined) {
        schools.add(summoned);
      }
    }
  }

  for (const passive of compiled.passives) {
    if (passive.kind === "extra-detonation") {
      schools.add(passive.school);
    }
  }

  return schools;
}

export function allowsSelfCombo(compiled: CompiledUnitStats): boolean {
  return compiled.passives.some((passive) => passive.kind === "extra-detonation" && passive.allowSelf);
}

export function compileTeamTraits(compiledUnits: readonly CompiledUnitStats[], catalogue: Catalogue): TeamTraits {
  const combos: ComboTrait[] = CONDITION_KINDS.map((condition) => {
    const appliers = new Set<HeroDefinitionId>();
    const detonators = new Set<HeroDefinitionId>();
    const applierUnits: number[] = [];
    const detonatorUnits: number[] = [];
    let selfCombo = false;

    compiledUnits.forEach((compiled, unitIndex) => {
      const applies = appliedConditions(compiled).has(condition);
      const detonates = detonatingSchools(compiled, catalogue).has(DETONATED_BY[condition]);

      if (applies) {
        appliers.add(compiled.heroId);
        applierUnits.push(unitIndex);
      }

      if (detonates) {
        detonators.add(compiled.heroId);
        detonatorUnits.push(unitIndex);
      }

      if (applies && detonates && allowsSelfCombo(compiled)) {
        selfCombo = true;
      }
    });

    const paired = selfCombo || applierUnits.some((applier) => detonatorUnits.some((detonator) => detonator !== applier));

    const tier = !paired ? 0 : appliers.size >= 2 && detonators.size >= 2 ? 2 : 1;

    return {
      condition,
      combo: COMBO_FOR_CONDITION[condition],
      detonatingSchool: DETONATED_BY[condition],
      appliers: [...appliers].sort(),
      detonators: [...detonators].sort(),
      selfCombo,
      tier,
    };
  });

  const attunements: AttunementTrait[] = SCHOOLS.map((school) => {
    const heroes = new Set<HeroDefinitionId>();

    for (const compiled of compiledUnits) {
      if (catalogue.heroes[compiled.heroId]?.school === school) {
        heroes.add(compiled.heroId);
      }
    }

    return { school, heroes: [...heroes].sort(), active: heroes.size >= ATTUNEMENT_THRESHOLD };
  });

  return { combos, attunements };
}

export function computeTeamTraits(builds: readonly HeroBuild[], catalogue: Catalogue): TeamTraits {
  return compileTeamTraits(
    builds.map((build) => compileBuild(build, catalogue)),
    catalogue,
  );
}
