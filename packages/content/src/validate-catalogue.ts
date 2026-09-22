import type { Catalogue } from "@jev-game/game";

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateAbilities(catalogue: Catalogue): void {
  for (const [key, ability] of Object.entries(catalogue.abilities)) {
    if (ability.id !== key) {
      throw new Error(`ability catalogue key "${key}" does not match its id "${ability.id}"`);
    }

    if (!isPositiveInteger(ability.cooldownTicks)) {
      throw new Error(`ability "${ability.id}" has a non-integer cooldown`);
    }

    if (!isPositiveFinite(ability.range)) {
      throw new Error(`ability "${ability.id}" has a non-positive or non-finite range`);
    }

    if (ability.effects.length === 0) {
      throw new Error(`ability "${ability.id}" has no effects`);
    }

    for (const effect of ability.effects) {
      if (effect.kind === "damage") {
        if (!isPositiveInteger(effect.amount)) {
          throw new Error(`ability "${ability.id}" has a non-integer damage amount`);
        }

        if (ability.targetPolicy !== "nearest-enemy") {
          throw new Error(
            `ability "${ability.id}" has a damage effect but its target policy "${ability.targetPolicy}" does not target an enemy`,
          );
        }
      }

      if (effect.kind === "heal") {
        if (!isPositiveInteger(effect.amount)) {
          throw new Error(`ability "${ability.id}" has a non-integer heal amount`);
        }

        if (ability.targetPolicy !== "lowest-hp-fraction-ally") {
          throw new Error(
            `ability "${ability.id}" has a heal effect but its target policy "${ability.targetPolicy}" does not target an ally`,
          );
        }
      }

      if (effect.kind === "shield") {
        if (!isPositiveInteger(effect.amount) || !isPositiveInteger(effect.durationTicks)) {
          throw new Error(`ability "${ability.id}" has a non-integer shield amount or duration`);
        }

        if (ability.targetPolicy !== "lowest-hp-fraction-ally") {
          throw new Error(
            `ability "${ability.id}" has a shield effect but its target policy "${ability.targetPolicy}" does not target an ally`,
          );
        }
      }
    }
  }
}

function validateHeroes(catalogue: Catalogue): void {
  for (const [key, hero] of Object.entries(catalogue.heroes)) {
    if (hero.id !== key) {
      throw new Error(`hero catalogue key "${key}" does not match its id "${hero.id}"`);
    }

    if (!isPositiveInteger(hero.maxHp)) {
      throw new Error(`hero "${hero.id}" has a non-integer max HP`);
    }

    if (!isPositiveFinite(hero.moveSpeedUnitsPerSecond)) {
      throw new Error(`hero "${hero.id}" has a non-positive or non-finite move speed`);
    }

    if (catalogue.abilities[hero.basicAttackId] === undefined) {
      throw new Error(`hero "${hero.id}" references unknown basic attack "${hero.basicAttackId}"`);
    }

    for (const abilityId of hero.abilityIds) {
      if (catalogue.abilities[abilityId] === undefined) {
        throw new Error(`hero "${hero.id}" references unknown ability "${abilityId}"`);
      }
    }
  }
}

function validateArenas(catalogue: Catalogue): void {
  for (const [key, arena] of Object.entries(catalogue.arenas)) {
    if (arena.id !== key) {
      throw new Error(`arena catalogue key "${key}" does not match its id "${arena.id}"`);
    }

    if (!isPositiveFinite(arena.width) || !isPositiveFinite(arena.height)) {
      throw new Error(`arena "${arena.id}" has a non-positive or non-finite dimension`);
    }
  }
}

export function validateCatalogue(catalogue: Catalogue): void {
  validateAbilities(catalogue);
  validateHeroes(catalogue);
  validateArenas(catalogue);
}
