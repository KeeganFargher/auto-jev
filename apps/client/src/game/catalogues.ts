import { gameCatalogue } from "@jev-game/content";
import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export { gameCatalogue };

export function heroDefinition(heroId: string): HeroDefinition | undefined {
  return gameCatalogue.heroes[heroId];
}

export function abilityDefinition(abilityId: string): AbilityDefinition | undefined {
  return gameCatalogue.abilities[abilityId];
}

export function upgradeDefinition(upgradeId: string): UpgradeDefinition | undefined {
  return gameCatalogue.upgrades[upgradeId];
}

export function heroName(heroId: string): string {
  return heroDefinition(heroId)?.name ?? heroId;
}
