import { gameCatalogue } from "@jev-game/content";
import { heroDefinition as catalogueHero, type HeroDefinition } from "@jev-game/game";

export { gameCatalogue };

export function heroDefinition(heroId: string): HeroDefinition {
  return catalogueHero(gameCatalogue, heroId);
}

export function heroName(heroId: string): string {
  return heroDefinition(heroId).name;
}
