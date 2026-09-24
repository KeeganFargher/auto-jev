import type { HeroDefinitionId, UpgradeDefinitionId } from "../ids.js";
import type { Catalogue } from "../definitions.js";
import { applyUpgrade } from "./apply-upgrade.js";

export interface HeroBuildUpgradeSelection {
  upgradeId: UpgradeDefinitionId;
  stacks: number;
}

export interface HeroBuild {
  buildId: string;
  heroId: HeroDefinitionId;
  upgrades: HeroBuildUpgradeSelection[];
  itemIds?: UpgradeDefinitionId[];
  runeIds?: UpgradeDefinitionId[];
  extraRuneSockets?: number;
}

export function createHeroBuild(
  buildId: string,
  heroId: HeroDefinitionId,
  upgradeIds: readonly UpgradeDefinitionId[],
  catalogue: Catalogue,
): HeroBuild {
  let build: HeroBuild = { buildId, heroId, upgrades: [] };

  for (const upgradeId of upgradeIds) {
    build = applyUpgrade(build, upgradeId, catalogue);
  }

  return build;
}

export function withEquipment(
  build: HeroBuild,
  itemIds: readonly UpgradeDefinitionId[],
  runeIds: readonly UpgradeDefinitionId[],
): HeroBuild {
  const equipped: HeroBuild = { ...build };

  if (itemIds.length > 0) {
    equipped.itemIds = [...itemIds];
  } else {
    delete equipped.itemIds;
  }

  if (runeIds.length > 0) {
    equipped.runeIds = [...runeIds];
  } else {
    delete equipped.runeIds;
  }

  return equipped;
}
