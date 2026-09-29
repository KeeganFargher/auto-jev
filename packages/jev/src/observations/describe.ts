import {
  CHAIN_DAMAGE_BONUS_PER_LINK,
  CHAIN_WINDOW_TICKS,
  READY_WAIT_TICKS,
  TICK_RATE,
  heroDefinition,
  type HeroDefinitionId,
  type SetupWant,
  type SignatureDefinition,
} from "@jev-game/game";
import { gameCatalogue } from "@jev-game/content";

export const SETUP_RULES = [
  "Heroes fight on their own. Attacking and taking hits fills a hero's mana, and a hero with full mana is ready to cast its signature.",
  `A ready hero holds its signature until an enemy is in a state the signature wants, then casts. If none turns up within ${READY_WAIT_TICKS / TICK_RATE} seconds, it casts anyway.`,
  "Airborne: launched, thrown or yanked into the air. A unit that lands is downed for a moment.",
  "Floating: held helpless inside a bubble.",
  "Burning: on fire. Fire spreads to the unit's friends when they touch.",
  "Primed: carrying a lit fuse that explodes.",
  "Grouped: several enemies bunched close together.",
  `When a signature hits an enemy whose state a different ally made, that team's chain gains a link. Each link makes the team's area strikes ${Math.round(CHAIN_DAMAGE_BONUS_PER_LINK * 100)}% stronger, until ${CHAIN_WINDOW_TICKS / TICK_RATE} seconds pass without a new link.`,
];

export function heroName(heroId: HeroDefinitionId): string {
  return heroDefinition(gameCatalogue, heroId).name;
}

function wantText(signature: SignatureDefinition, want: SetupWant): string {
  return want === "grouped" ? `grouped (${signature.groupSize} or more close together)` : want;
}

function wantsText(signature: SignatureDefinition): string {
  const wants = signature.wants.map((want) => wantText(signature, want));
  const last = wants.pop();

  if (last === undefined) {
    throw new Error(`${signature.name} wants no setups`);
  }

  return wants.length === 0 ? last : `${wants.join(", ")} or ${last}`;
}

export function heroSummary(heroId: HeroDefinitionId): string {
  const hero = heroDefinition(gameCatalogue, heroId);
  const signature = hero.signature;

  if (signature === null) {
    throw new Error(`${hero.name} has no signature to describe`);
  }

  const parts = [
    `${hero.name}, "${hero.title}", ${hero.role}. ${hero.description}`,
    `Signature, ${signature.name}: ${signature.description} It wants enemies that are ${wantsText(signature)}.`,
  ];

  if (hero.passive !== null) {
    parts.push(`Passive, ${hero.passive.name}: ${hero.passive.description}`);
  }

  return parts.join(" ");
}
