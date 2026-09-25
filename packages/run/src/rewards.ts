import {
  SKILL_SLOTS,
  applyUpgrade,
  createHeroBuild,
  createRng,
  eligibleLevelPicks,
  gemFitsHero,
  nextFloat,
  nextInt,
  pickedLevels,
  skillIdFor,
  withTrainedSocket,
  type Catalogue,
  type HeroBuild,
  type PickLevel,
  type Rarity,
  type RngState,
  type SkillSlot,
  type UpgradeDefinition,
  PICK_LEVELS,
} from "@jev-game/game";
import type { OwnedGem, OwnedPiece, PendingDecision, PlayerSeat, RewardOffer } from "./types.js";
import {
  itemRarityForRound,
  milestoneAfterRound,
  rarityAbove,
  heroLevelAfterRound,
  type RunRules,
} from "./rules.js";
import { deriveOfferSeed } from "./seed.js";
import { playableHeroIds } from "./offers.js";
import { gemCanGoOn, hasStashRoom, itemCanGoOn, nextFormationCell } from "./inventory.js";

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

function fittingGems(catalogue: Catalogue, seat: PlayerSeat): UpgradeDefinition[] {
  return upgradesOf(
    catalogue,
    (upgrade) => upgrade.category === "gem" && seat.heroBuilds.some((build) => gemFitsHero(upgrade, build.heroId, catalogue)),
  );
}

function itemDecision(
  catalogue: Catalogue,
  rules: RunRules,
  round: number,
  seat: PlayerSeat,
  runSeed: number,
  isLoser: boolean,
): PendingDecision | null {
  const playerId = seat.playerId;
  const rng = createRng(deriveOfferSeed(runSeed, round, playerId, "item"));
  const count = rules.itemOfferCount + (isLoser ? rules.loserBonusOffers : 0);
  const band = itemRarityForRound(rules, round);
  const decisionId = `${playerId}-r${round}-item`;
  const offers: RewardOffer[] = [];
  const taken = new Set<string>();
  const gemCard = round >= rules.gemCardFromRound ? sample(fittingGems(catalogue, seat), 1, createRng(deriveOfferSeed(runSeed, round, playerId, "item-gem")))[0] : undefined;
  const itemCount = gemCard === undefined ? count : count - 1;

  for (let index = 0; index < itemCount; index += 1) {
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

  if (gemCard !== undefined) {
    offers.push({ offerId: offerId(decisionId, offers.length), kind: "gem", pieceId: gemCard.id, heroId: null, heroSlot: null, rarity: null });
  }

  return offers.length === 0 ? null : { decisionId, kind: "item", heroSlot: null, level: null, offers };
}

function gemDecision(catalogue: Catalogue, rules: RunRules, round: number, seat: PlayerSeat, runSeed: number): PendingDecision | null {
  const rng = createRng(deriveOfferSeed(runSeed, round, seat.playerId, "gem"));

  const pool = fittingGems(catalogue, seat);

  const decisionId = `${seat.playerId}-r${round}-gem`;

  const offers = sample(pool, rules.gemOfferCount, rng).map((gem, index): RewardOffer => ({
    offerId: offerId(decisionId, index),
    kind: "gem",
    pieceId: gem.id,
    heroId: null,
    heroSlot: null,
    rarity: null,
  }));

  return offers.length === 0 ? null : { decisionId, kind: "gem", heroSlot: null, level: null, offers };
}

export function nextLevelDecision(
  catalogue: Catalogue,
  seat: PlayerSeat,
  heroSlot: number,
  reachedLevel: number,
  round: number,
): PendingDecision | null {
  const build = seat.heroBuilds[heroSlot];

  if (build === undefined) {
    return null;
  }

  const picked = pickedLevels(build, catalogue);

  for (const level of PICK_LEVELS) {
    if (level > reachedLevel) {
      return null;
    }

    if (picked.has(level)) {
      continue;
    }

    return levelDecision(catalogue, seat, build, heroSlot, level, round);
  }

  return null;
}

function levelDecision(catalogue: Catalogue, seat: PlayerSeat, build: HeroBuild, heroSlot: number, level: PickLevel, round: number): PendingDecision | null {
  const eligible = eligibleLevelPicks(build, catalogue, level).sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.id.localeCompare(b.id));

  if (eligible.length === 0) {
    return null;
  }

  const decisionId = `${seat.playerId}-r${round}-level-${heroSlot}-l${level}`;

  return {
    decisionId,
    kind: "level",
    heroSlot,
    level,
    offers: eligible.map((pick, index) => ({
      offerId: offerId(decisionId, index),
      kind: "level",
      pieceId: pick.id,
      heroId: build.heroId,
      heroSlot,
      rarity: null,
    })),
  };
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

    if (hero !== undefined && SKILL_SLOTS.some((slot) => skillIdFor(hero, slot) !== null)) {
      offers.push({ offerId: offerId(decisionId, offers.length), kind: "train", pieceId: null, heroId: build.heroId, heroSlot, rarity: null });
    }
  });

  return offers.length === 0 ? null : { decisionId, kind: "recruit", heroSlot: null, level: null, offers };
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
  const item = itemDecision(catalogue, rules, round, seat, runSeed, isLoser);

  if (item !== null) {
    decisions.push(item);
  }

  const milestone = milestoneAfterRound(rules, round);

  switch (milestone) {
    case "gem": {
      const gem = gemDecision(catalogue, rules, round, seat, runSeed);

      if (gem !== null) {
        decisions.push(gem);
      }

      break;
    }

    case "level": {
      const reached = heroLevelAfterRound(rules, round);

      for (let heroSlot = 0; heroSlot < seat.heroBuilds.length; heroSlot += 1) {
        const levelUp = nextLevelDecision(catalogue, seat, heroSlot, reached, round);

        if (levelUp !== null) {
          decisions.push(levelUp);
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

function newGem(seat: PlayerSeat, pieceId: string, heroSlot: number | null, skill: SkillSlot | null): OwnedGem {
  return { ...newPiece(seat, pieceId, heroSlot), skill: heroSlot === null ? null : skill };
}

export function defaultTrainSkill(build: HeroBuild, catalogue: Catalogue): SkillSlot | null {
  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined) {
    return null;
  }

  return skillIdFor(hero, "ultimate") !== null ? "ultimate" : skillIdFor(hero, "ability") !== null ? "ability" : null;
}

function trainableSkill(build: HeroBuild, catalogue: Catalogue, requested: SkillSlot | null): SkillSlot | null {
  const hero = catalogue.heroes[build.heroId];

  if (hero !== undefined && requested !== null && skillIdFor(hero, requested) !== null) {
    return requested;
  }

  return defaultTrainSkill(build, catalogue);
}

export function applyRewardOffer(
  catalogue: Catalogue,
  rules: RunRules,
  round: number,
  seat: PlayerSeat,
  offer: RewardOffer,
  requestedSlot: number | null,
  requestedSkill: SkillSlot | null,
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

    case "gem": {
      if (offer.pieceId === null) {
        return refused("unknown-offer");
      }

      const fits =
        requestedSlot !== null && requestedSkill !== null && gemCanGoOn(seat, offer.pieceId, requestedSlot, requestedSkill, catalogue, null);

      return {
        accepted: true,
        seat: {
          ...seat,
          gems: [...seat.gems, newGem(seat, offer.pieceId, fits ? requestedSlot : null, fits ? requestedSkill : null)],
          nextInstanceId: seat.nextInstanceId + 1,
        },
        followUps: [],
      };
    }

    case "level": {
      const build = offer.heroSlot === null ? undefined : seat.heroBuilds[offer.heroSlot];
      const pick = offer.pieceId === null ? undefined : catalogue.upgrades[offer.pieceId];

      if (build === undefined || pick === undefined || offer.heroSlot === null) {
        return refused("unknown-offer");
      }

      let updated: HeroBuild;

      try {
        updated = applyUpgrade(build, pick.id, catalogue);
      } catch {
        return refused("ineligible-upgrade");
      }

      const heroSlot = offer.heroSlot;
      const nextSeat = { ...seat, heroBuilds: seat.heroBuilds.map((existing, slot) => (slot === heroSlot ? updated : existing)) };
      const followUp = nextLevelDecision(catalogue, nextSeat, heroSlot, heroLevelAfterRound(rules, round), round);

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
      const followUp = nextLevelDecision(catalogue, nextSeat, heroSlot, heroLevelAfterRound(rules, round), round);

      return { accepted: true, seat: nextSeat, followUps: followUp === null ? [] : [followUp] };
    }

    case "train": {
      const heroSlot = offer.heroSlot;
      const build = heroSlot === null ? undefined : seat.heroBuilds[heroSlot];

      if (build === undefined) {
        return refused("unknown-offer");
      }

      const skill = trainableSkill(build, catalogue, requestedSkill);

      if (skill === null) {
        return refused("unknown-offer");
      }

      const trained = withTrainedSocket(build, skill);

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
