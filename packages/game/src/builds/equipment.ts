import { SKILL_SLOTS, type AbilityDefinition, type Catalogue, type SkillSlot, type SkillTag, type UpgradeDefinition } from "../definitions.js";
import type { HeroBuild } from "./state.js";
import { gemSocketsFor, skillIdFor } from "./compile-build.js";
import { gemFitsAbility } from "./gem-fit.js";

export const ITEM_SLOTS = 3;

export type EquipmentProblem =
  | "unknown-piece"
  | "not-an-item"
  | "not-a-gem"
  | "too-many-items"
  | "too-many-gems"
  | "no-skill"
  | "gem-does-not-fit"
  | "duplicate-gem"
  | "item-over-stack-limit";

export function skillOf(heroId: string, slot: SkillSlot, catalogue: Catalogue): AbilityDefinition | null {
  const hero = catalogue.heroes[heroId];
  const skillId = hero === undefined ? null : skillIdFor(hero, slot);

  return skillId === null ? null : (catalogue.abilities[skillId] ?? null);
}

export function skillTags(heroId: string, slot: SkillSlot, catalogue: Catalogue): SkillTag[] {
  return skillOf(heroId, slot, catalogue)?.tags ?? [];
}

export function gemFitsSkill(gem: UpgradeDefinition, heroId: string, slot: SkillSlot, catalogue: Catalogue): boolean {
  const skill = skillOf(heroId, slot, catalogue);

  return skill !== null && gemFitsAbility(gem, skill, catalogue);
}

export function gemFitsHero(gem: UpgradeDefinition, heroId: string, catalogue: Catalogue): boolean {
  return SKILL_SLOTS.some((slot) => gemFitsSkill(gem, heroId, slot, catalogue));
}

export function fittingSlots(gem: UpgradeDefinition, heroId: string, catalogue: Catalogue): SkillSlot[] {
  return SKILL_SLOTS.filter((slot) => gemFitsSkill(gem, heroId, slot, catalogue));
}

function checkItems(build: HeroBuild, catalogue: Catalogue): EquipmentProblem | null {
  const itemIds = build.itemIds ?? [];

  if (itemIds.length > ITEM_SLOTS) {
    return "too-many-items";
  }

  for (const itemId of itemIds) {
    const item = catalogue.upgrades[itemId];

    if (item === undefined) {
      return "unknown-piece";
    }

    if (item.category !== "item") {
      return "not-an-item";
    }

    if (itemIds.filter((candidate) => candidate === itemId).length > item.maxStacks) {
      return "item-over-stack-limit";
    }
  }

  return null;
}

export function checkEquipment(build: HeroBuild, catalogue: Catalogue): EquipmentProblem | null {
  const itemProblem = checkItems(build, catalogue);

  if (itemProblem !== null) {
    return itemProblem;
  }

  const gems = build.gems ?? [];

  if (gems.length === 0) {
    return null;
  }

  const hero = catalogue.heroes[build.heroId];

  if (hero === undefined) {
    return "no-skill";
  }

  const sockets = gemSocketsFor(hero, build, catalogue);

  for (const slot of SKILL_SLOTS) {
    const inSlot = gems.filter((gem) => gem.slot === slot);

    if (inSlot.length === 0) {
      continue;
    }

    if (skillIdFor(hero, slot) === null) {
      return "no-skill";
    }

    if (new Set(inSlot.map((gem) => gem.gemId)).size !== inSlot.length) {
      return "duplicate-gem";
    }

    if (inSlot.length > sockets[slot]) {
      return "too-many-gems";
    }

    for (const equipped of inSlot) {
      const gem = catalogue.upgrades[equipped.gemId];

      if (gem === undefined) {
        return "unknown-piece";
      }

      if (gem.category !== "gem") {
        return "not-a-gem";
      }

      if (!gemFitsSkill(gem, build.heroId, slot, catalogue)) {
        return "gem-does-not-fit";
      }
    }
  }

  return null;
}
