import type { Catalogue, UpgradeDefinition } from "../definitions.js";
import type { UpgradeDefinitionId } from "../ids.js";
import type { HeroBuild } from "./state.js";

function currentStacks(build: HeroBuild, upgradeId: UpgradeDefinitionId): number {
  return build.upgrades.find((selection) => selection.upgradeId === upgradeId)?.stacks ?? 0;
}

export function isUpgradeEligible(build: HeroBuild, upgrade: UpgradeDefinition): boolean {
  if (upgrade.heroId !== undefined && upgrade.heroId !== build.heroId) {
    return false;
  }

  if (currentStacks(build, upgrade.id) >= upgrade.maxStacks) {
    return false;
  }

  if (upgrade.prerequisiteUpgradeIds !== undefined) {
    for (const prerequisiteId of upgrade.prerequisiteUpgradeIds) {
      if (currentStacks(build, prerequisiteId) <= 0) {
        return false;
      }
    }
  }

  return true;
}

export function generateUpgradeOffers(
  build: HeroBuild,
  catalogue: Catalogue,
): UpgradeDefinition[] {
  return Object.values(catalogue.upgrades).filter((upgrade) => isUpgradeEligible(build, upgrade));
}

export function applyUpgrade(
  build: HeroBuild,
  upgradeId: UpgradeDefinitionId,
  catalogue: Catalogue,
): HeroBuild {
  const upgrade = catalogue.upgrades[upgradeId];

  if (upgrade === undefined) {
    throw new Error(`unknown upgrade id "${upgradeId}"`);
  }

  if (!isUpgradeEligible(build, upgrade)) {
    throw new Error(`upgrade "${upgradeId}" is not a legal choice for build "${build.buildId}"`);
  }

  const existing = build.upgrades.find((selection) => selection.upgradeId === upgradeId);

  const upgrades =
    existing === undefined
      ? [...build.upgrades, { upgradeId, stacks: 1 }]
      : build.upgrades.map((selection) =>
          selection.upgradeId === upgradeId
            ? { ...selection, stacks: selection.stacks + 1 }
            : selection,
        );

  return { ...build, upgrades };
}
