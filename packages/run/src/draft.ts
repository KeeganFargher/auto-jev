import type { Catalogue, HeroDefinitionId } from "@jev-game/game";

export function draftPool(catalogue: Catalogue): HeroDefinitionId[] {
  return Object.values(catalogue.heroes).flatMap((hero) => (hero.draftable ? [hero.id] : []));
}
