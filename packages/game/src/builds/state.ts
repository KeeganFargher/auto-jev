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
