import type { HeroDefinitionId, UpgradeDefinitionId } from "../ids.js";
import type { Catalogue, SkillSlot } from "../definitions.js";
import { applyUpgrade } from "./apply-upgrade.js";

export interface HeroBuildUpgradeSelection {
  upgradeId: UpgradeDefinitionId;
  stacks: number;
}

export interface EquippedGem {
  gemId: UpgradeDefinitionId;
  slot: SkillSlot;
}

export interface HeroBuild {
  buildId: string;
  heroId: HeroDefinitionId;
  upgrades: HeroBuildUpgradeSelection[];
  itemIds?: UpgradeDefinitionId[];
  gems?: EquippedGem[];
  trainedSockets?: Partial<Record<SkillSlot, number>>;
}

export function createHeroBuild(
  buildId: string,
  heroId: HeroDefinitionId,
  upgradeIds: readonly UpgradeDefinitionId[],
  catalogue: Catalogue,
): HeroBuild {
  let build: HeroBuild = { buildId, heroId, upgrades: [] };
  const ordered = [...upgradeIds].sort((a, b) => (catalogue.upgrades[a]?.level ?? 0) - (catalogue.upgrades[b]?.level ?? 0));

  for (const upgradeId of ordered) {
    build = applyUpgrade(build, upgradeId, catalogue);
  }

  return build;
}

export function withEquipment(
  build: HeroBuild,
  itemIds: readonly UpgradeDefinitionId[],
  gems: readonly EquippedGem[],
): HeroBuild {
  const equipped: HeroBuild = { ...build };

  if (itemIds.length > 0) {
    equipped.itemIds = [...itemIds];
  } else {
    delete equipped.itemIds;
  }

  if (gems.length > 0) {
    equipped.gems = gems.map((gem) => ({ gemId: gem.gemId, slot: gem.slot }));
  } else {
    delete equipped.gems;
  }

  return equipped;
}

export function trainedSocketCount(build: HeroBuild, slot: SkillSlot): number {
  return build.trainedSockets?.[slot] ?? 0;
}

export function withTrainedSocket(build: HeroBuild, slot: SkillSlot): HeroBuild {
  return { ...build, trainedSockets: { ...build.trainedSockets, [slot]: trainedSocketCount(build, slot) + 1 } };
}
