import {
  applyUpgrade,
  createHeroBuild,
  createRng,
  eligibleTalents,
  findSignatureAbilityId,
  nextFloat,
  nextInt,
  runeFitsHero,
  type Catalogue,
  type HeroBuild,
  type Rarity,
  type RngState,
  type UpgradeDefinition,
} from "@jev-game/game";
import type { PlayerId } from "./ids.js";
import type { OwnedPiece, PendingDecision, PlayerSeat, RewardOffer } from "./types.js";
import {
  itemRarityForRound,
  milestoneAfterRound,
  rarityAbove,
  talentTierAfterRound,
  type RunRules,
} from "./rules.js";
import { deriveOfferSeed } from "./seed.js";
import { playableHeroIds } from "./offers.js";
import { hasStashRoom, itemCanGoOn, nextFormationCell, runeCanGoOn } from "./inventory.js";

export type RewardRejection = "unknown-offer" | "ineligible-upgrade" | "team-full";

function sample<T>(pool: readonly T[], count: number, rng: RngState): T[] {
  const remaining = [...pool];
  const chosen: T[] = [];

  while (chosen.length < count && remaining.length > 0) {
    const index = nextInt(rng, remaining.length);
    chosen.push(remaining[index]!);
    remaining.splice(index, 1);
  }

  return chosen;
}

function upgradesOf(catalogue: Catalogue, predicate: (upgrade: UpgradeDefinition) => boolean): UpgradeDefinition[] {
  return Object.values(catalogue.upgrades)
    .filter(predicate)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function offerId(decisionId: string, index: number): string {
  return `${decisionId}-${index}`;
}

function itemDecision(
  catalogue: Catalogue,
  rules: RunRules,
  round: number,
  playerId: PlayerId,
  runSeed: number,
  isLoser: boolean,
): PendingDecision | null {
  const rng = createRng(deriveOfferSeed(runSeed, round, playerId, "item"));
  const count = rules.itemOfferCount + (isLoser ? rules.loserBonusOffers : 0);
  const band = itemRarityForRound(rules, round);
  const decisionId = `${playerId}-r${round}-item`;
  const offers: RewardOffer[] = [];
  const taken = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const surprise = round >= rules.surpriseFromRound && band !== "legendary" && nextFloat(rng) < rules.surpriseChance;
    const rarity: Rarity = surprise ? rarityAbove(band) : band;
    let pool = upgradesOf(catalogue, (upgrade) => upgrade.category === "item" && upgrade.rarity === rarity && !taken.has(upgrade.id));

    if (pool.length === 0) {
      pool = upgradesOf(catalogue, (upgrade) => upgrade.category === "item" && !taken.has(upgrade.id));
    }

    const [item] = sample(pool, 1, rng);

    if (item === undefined) {
      break;
    }

    taken.add(item.id);
    offers.push({ offerId: offerId(decisionId, index), kind: "item", pieceId: item.id, heroId: null, heroSlot: null, rarity: item.rarity ?? rarity });
  }

  return offers.length === 0 ? null : { decisionId, kind: "item", heroSlot: null, tier: null, offers };
}

function runeDecision(catalogue: Catalogue, rules: RunRules, round: number, seat: PlayerSeat, runSeed: number): PendingDecision | null {
  const rng = createRng(deriveOfferSeed(runSeed, round, seat.playerId, "rune"));

  const pool = upgradesOf(
    catalogue,
    (upgrade) => upgrade.category === "rune" && seat.heroBuilds.some((build) => runeFitsHero(upgrade, build.heroId, catalogue)),
  );

  const decisionId = `${seat.playerId}-r${round}-rune`;

  const offers = sample(pool, rules.runeOfferCount, rng).map((rune, index): RewardOffer => ({
    offerId: offerId(decisionId, index),
    kind: "rune",
    pieceId: rune.id,
    heroId: null,
    heroSlot: null,
    rarity: null,
  }));

  return offers.length === 0 ? null : { decisionId, kind: "rune", heroSlot: null, tier: null, offers };
}

function talentTier(upgrade: UpgradeDefinition): number {
  return upgrade.tier ?? 0;
}

export function nextTalentDecision(
  catalogue: Catalogue,
  seat: PlayerSeat,
  heroSlot: number,
  maxTier: number,
  round: number,
): PendingDecision | null {
  const build = seat.heroBuilds[heroSlot];

  if (build === undefined) {
    return null;
  }

  const ownedTiers = new Set<number>();

  for (const selection of build.upgrades) {
    const upgrade = catalogue.upgrades[selection.upgradeId];

    if (upgrade?.category === "talent") {
      ownedTiers.add(talentTier(upgrade));
    }
  }

  for (let tier = 1; tier <= maxTier; tier += 1) {
    if (ownedTiers.has(tier)) {
      continue;
    }

    const eligible = eligibleTalents(build, catalogue, tier).sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.id.localeCompare(b.id));

    if (eligible.length === 0) {
      return null;
    }

    const decisionId = `${seat.playerId}-r${round}-talent-${heroSlot}-t${tier}`;

    return {
      decisionId,
      kind: "talent",
      heroSlot,
      tier,
      offers: eligible.map((talent, index) => ({
        offerId: offerId(decisionId, index),
        kind: "talent",
        pieceId: talent.id,
        heroId: build.heroId,
        heroSlot,
        rarity: null,
      })),
    };
  }

  return null;
}

function recruitDecision(catalogue: Catalogue, rules: RunRules, round: number, seat: PlayerSeat, runSeed: number): PendingDecision | null {
  const rng = createRng(deriveOfferSeed(runSeed, round, seat.playerId, "recruit"));
  const decisionId = `${seat.playerId}-r${round}-recruit`;
  const offers: RewardOffer[] = [];

  if (seat.heroBuilds.length < rules.maxTeamSize) {
    const owned = new Set(seat.heroBuilds.map((build) => build.heroId));
    const heroIds = playableHeroIds(catalogue).filter((heroId) => !owned.has(heroId));

    for (const heroId of sample(heroIds, rules.recruitOfferCount, rng)) {
      offers.push({ offerId: offerId(decisionId, offers.length), kind: "recruit", pieceId: null, heroId, heroSlot: null, rarity: null });
    }
  }

  seat.heroBuilds.forEach((build, heroSlot) => {
    const hero = catalogue.heroes[build.heroId];

    if (hero !== undefined && findSignatureAbilityId(hero, catalogue) !== null) {
      offers.push({ offerId: offerId(decisionId, offers.length), kind: "train", pieceId: null, heroId: build.heroId, heroSlot, rarity: null });
    }
  });

  return offers.length === 0 ? null : { decisionId, kind: "recruit", heroSlot: null, tier: null, offers };
}

export function generateRewardDecisions(
  catalogue: Catalogue,
  rules: RunRules,
  runSeed: number,
  round: number,
  seat: PlayerSeat,
  isLoser: boolean,
): PendingDecision[] {
  const decisions: PendingDecision[] = [];
  const item = itemDecision(catalogue, rules, round, seat.playerId, runSeed, isLoser);

  if (item !== null) {
    decisions.push(item);
  }

  const milestone = milestoneAfterRound(rules, round);

  switch (milestone) {
    case "rune": {
      const rune = runeDecision(catalogue, rules, round, seat, runSeed);

      if (rune !== null) {
        decisions.push(rune);
      }

      break;
    }

    case "talents": {
      const maxTier = talentTierAfterRound(rules, round);

      for (let heroSlot = 0; heroSlot < seat.heroBuilds.length; heroSlot += 1) {
        const talent = nextTalentDecision(catalogue, seat, heroSlot, maxTier, round);

        if (talent !== null) {
          decisions.push(talent);
        }
      }

      break;
    }

    case "recruit": {
      const recruit = recruitDecision(catalogue, rules, round, seat, runSeed);

      if (recruit !== null) {
        decisions.push(recruit);
      }

      break;
    }

    case "none":
      break;

    default: {
      const exhaustive: never = milestone;

      void exhaustive;
    }
  }

  return decisions;
}

export type RewardApplication =
  | { accepted: true; seat: PlayerSeat; followUps: PendingDecision[] }
  | { accepted: false; reason: RewardRejection };

function refused(reason: RewardRejection): RewardApplication {
  return { accepted: false, reason };
}

function placeNewItem(seat: PlayerSeat, rules: RunRules, requestedSlot: number | null, pieceId: string, catalogue: Catalogue): number | null {
  if (requestedSlot !== null && itemCanGoOn(seat, pieceId, requestedSlot, rules, catalogue, null)) {
    return requestedSlot;
  }

  if (hasStashRoom(seat, rules, null)) {
    return null;
  }

  for (let heroSlot = 0; heroSlot < seat.heroBuilds.length; heroSlot += 1) {
    if (itemCanGoOn(seat, pieceId, heroSlot, rules, catalogue, null)) {
      return heroSlot;
    }
  }

  return null;
}

function newPiece(seat: PlayerSeat, pieceId: string, heroSlot: number | null): OwnedPiece {
  return { instanceId: `${seat.playerId}-p${seat.nextInstanceId}`, pieceId, heroSlot };
}

export function applyRewardOffer(
  catalogue: Catalogue,
  rules: RunRules,
  round: number,
  seat: PlayerSeat,
  offer: RewardOffer,
  requestedSlot: number | null,
): RewardApplication {
  switch (offer.kind) {
    case "item": {
      if (offer.pieceId === null) {
        return refused("unknown-offer");
      }

      const slot = placeNewItem(seat, rules, requestedSlot, offer.pieceId, catalogue);

      return {
        accepted: true,
        seat: { ...seat, items: [...seat.items, newPiece(seat, offer.pieceId, slot)], nextInstanceId: seat.nextInstanceId + 1 },
        followUps: [],
      };
    }

    case "rune": {
      if (offer.pieceId === null) {
        return refused("unknown-offer");
      }

      const slot = requestedSlot !== null && runeCanGoOn(seat, offer.pieceId, requestedSlot, catalogue, null) ? requestedSlot : null;

      return {
        accepted: true,
        seat: { ...seat, runes: [...seat.runes, newPiece(seat, offer.pieceId, slot)], nextInstanceId: seat.nextInstanceId + 1 },
        followUps: [],
      };
    }

    case "talent": {
      const build = offer.heroSlot === null ? undefined : seat.heroBuilds[offer.heroSlot];
      const talent = offer.pieceId === null ? undefined : catalogue.upgrades[offer.pieceId];

      if (build === undefined || talent === undefined || offer.heroSlot === null) {
        return refused("unknown-offer");
      }

      let updated: HeroBuild;

      try {
        updated = applyUpgrade(build, talent.id, catalogue);
      } catch {
        return refused("ineligible-upgrade");
      }

      const heroSlot = offer.heroSlot;
      const nextSeat = { ...seat, heroBuilds: seat.heroBuilds.map((existing, slot) => (slot === heroSlot ? updated : existing)) };
      const followUp = nextTalentDecision(catalogue, nextSeat, heroSlot, talentTierAfterRound(rules, round), round);

      return { accepted: true, seat: nextSeat, followUps: followUp === null ? [] : [followUp] };
    }

    case "recruit": {
      if (offer.heroId === null || catalogue.heroes[offer.heroId] === undefined) {
        return refused("unknown-offer");
      }

      if (seat.heroBuilds.length >= rules.maxTeamSize) {
        return refused("team-full");
      }

      const heroSlot = seat.heroBuilds.length;
      const cell = nextFormationCell(seat.formation, offer.heroId);

      if (cell === null) {
        return refused("team-full");
      }

      const build = createHeroBuild(`${seat.playerId}-${heroSlot}`, offer.heroId, [], catalogue);
      const nextSeat = { ...seat, heroBuilds: [...seat.heroBuilds, build], formation: [...seat.formation, cell] };
      const followUp = nextTalentDecision(catalogue, nextSeat, heroSlot, talentTierAfterRound(rules, round), round);

      return { accepted: true, seat: nextSeat, followUps: followUp === null ? [] : [followUp] };
    }

    case "train": {
      const heroSlot = offer.heroSlot;
      const build = heroSlot === null ? undefined : seat.heroBuilds[heroSlot];

      if (build === undefined) {
        return refused("unknown-offer");
      }

      const trained = { ...build, extraRuneSockets: (build.extraRuneSockets ?? 0) + 1 };

      return {
        accepted: true,
        seat: { ...seat, heroBuilds: seat.heroBuilds.map((existing, slot) => (slot === heroSlot ? trained : existing)) },
        followUps: [],
      };
    }

    default: {
      const exhaustive: never = offer.kind;

      return exhaustive;
    }
  }
}
