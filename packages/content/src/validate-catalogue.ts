import type { Catalogue } from "@jev-game/game";

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function validateCatalogue(catalogue: Catalogue): void {
  for (const [key, hero] of Object.entries(catalogue.heroes)) {
    if (hero.id !== key) {
      throw new Error(`hero catalogue key "${key}" does not match its id "${hero.id}"`);
    }

    if (
      !isPositiveInteger(hero.maxHp) ||
      !isPositiveInteger(hero.attackDamage) ||
      !isPositiveInteger(hero.attackIntervalTicks)
    ) {
      throw new Error(`hero "${hero.id}" has a non-integer HP, damage or attack interval`);
    }

    if (
      !isPositiveFinite(hero.attackRangeUnits) ||
      !isPositiveFinite(hero.moveSpeedUnitsPerSecond)
    ) {
      throw new Error(`hero "${hero.id}" has a non-positive or non-finite numeric field`);
    }
  }

  for (const [key, arena] of Object.entries(catalogue.arenas)) {
    if (arena.id !== key) {
      throw new Error(`arena catalogue key "${key}" does not match its id "${arena.id}"`);
    }

    if (!isPositiveFinite(arena.width) || !isPositiveFinite(arena.height)) {
      throw new Error(`arena "${arena.id}" has a non-positive or non-finite dimension`);
    }
  }
}
