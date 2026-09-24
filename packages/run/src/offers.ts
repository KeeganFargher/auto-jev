import { createRng, nextInt, type Catalogue } from "@jev-game/game";
import type { PlayerId } from "./ids.js";
import type { HeroOffer } from "./types.js";
import { deriveOfferSeed } from "./seed.js";

export function playableHeroIds(catalogue: Catalogue): string[] {
  const heroIds: string[] = [];

  for (const hero of Object.values(catalogue.heroes)) {
    if (hero.summon !== true) {
      heroIds.push(hero.id);
    }
  }

  return heroIds.sort();
}

export function generateHeroOffers(
  catalogue: Catalogue,
  runSeed: number,
  round: number,
  playerId: PlayerId,
  count: number,
): HeroOffer[] {
  const pool = playableHeroIds(catalogue);
  const rng = createRng(deriveOfferSeed(runSeed, round, playerId, "hero-draft"));
  const offers: HeroOffer[] = [];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const [heroId] = pool.splice(nextInt(rng, pool.length), 1);

    if (heroId !== undefined) {
      offers.push({ offerId: `${playerId}-hero-${index}`, heroId });
    }
  }

  return offers;
}
