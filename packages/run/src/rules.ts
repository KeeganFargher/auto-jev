import type { Rarity } from "@jev-game/game";

export type Milestone = "none" | "rune" | "talents" | "recruit";

export interface RunRules {
  startingHealth: number;
  roundCap: number;
  maxLossCost: number;
  draftPicks: number;
  heroOfferCount: number;
  maxTeamSize: number;
  itemSlots: number;
  stashCapacity: number;
  itemOfferCount: number;
  loserBonusOffers: number;
  recruitOfferCount: number;
  runeOfferCount: number;
  surpriseChance: number;
  surpriseFromRound: number;
  commonUntilRound: number;
  rareUntilRound: number;
  milestones: Milestone[];
}

export const DEFAULT_RUN_RULES: RunRules = {
  startingHealth: 13,
  roundCap: 15,
  maxLossCost: 3,
  draftPicks: 3,
  heroOfferCount: 5,
  maxTeamSize: 5,
  itemSlots: 3,
  stashCapacity: 3,
  itemOfferCount: 3,
  loserBonusOffers: 1,
  recruitOfferCount: 3,
  runeOfferCount: 3,
  surpriseChance: 0.05,
  surpriseFromRound: 3,
  commonUntilRound: 3,
  rareUntilRound: 6,
  milestones: ["rune", "talents", "recruit", "rune", "talents", "recruit", "talents", "rune"],
};

export function milestoneAfterRound(rules: RunRules, round: number): Milestone {
  if (round < 1) {
    return "none";
  }

  if (round <= rules.milestones.length) {
    return rules.milestones[round - 1] ?? "none";
  }

  return round % 2 === 0 ? "rune" : "none";
}

export function talentTierAfterRound(rules: RunRules, round: number): number {
  let tier = 0;

  for (let passed = 1; passed <= round; passed += 1) {
    if (milestoneAfterRound(rules, passed) === "talents") {
      tier += 1;
    }
  }

  return tier;
}

export function itemRarityForRound(rules: RunRules, round: number): Rarity {
  if (round <= rules.commonUntilRound) {
    return "common";
  }

  return round <= rules.rareUntilRound ? "rare" : "legendary";
}

export function rarityAbove(rarity: Rarity): Rarity {
  return rarity === "common" ? "rare" : "legendary";
}

export interface TrackEntry {
  round: number;
  itemRarity: Rarity;
  milestone: Milestone;
  talentTier: number;
}

export function roundTrack(rules: RunRules): TrackEntry[] {
  const entries: TrackEntry[] = [];

  for (let round = 1; round < rules.roundCap; round += 1) {
    const milestone = milestoneAfterRound(rules, round);

    entries.push({
      round,
      itemRarity: itemRarityForRound(rules, round),
      milestone,
      talentTier: milestone === "talents" ? talentTierAfterRound(rules, round) : 0,
    });
  }

  return entries;
}
