import type { Catalogue, PickLevel, UpgradeDefinition } from "../definitions.js";
import type { UpgradeDefinitionId } from "../ids.js";
import type { HeroBuild } from "./state.js";

function currentStacks(build: HeroBuild, upgradeId: UpgradeDefinitionId): number {
  return build.upgrades.find((selection) => selection.upgradeId === upgradeId)?.stacks ?? 0;
}

export function pickedLevels(build: HeroBuild, catalogue: Catalogue): Set<number> {
  const levels = new Set<number>();

  for (const selection of build.upgrades) {
    const upgrade = catalogue.upgrades[selection.upgradeId];

    if (upgrade?.category === "level" && upgrade.level !== undefined) {
      levels.add(upgrade.level);
    }
  }

  return levels;
}

export function heroLevel(build: HeroBuild, catalogue: Catalogue): number {
  return 1 + pickedLevels(build, catalogue).size;
}

export function isUpgradeEligible(build: HeroBuild, upgrade: UpgradeDefinition, catalogue: Catalogue): boolean {
  if (upgrade.heroId !== undefined && upgrade.heroId !== build.heroId) {
    return false;
  }

  if (currentStacks(build, upgrade.id) >= upgrade.maxStacks) {
    return false;
  }

  if (upgrade.category !== "level") {
    return true;
  }

  const picked = pickedLevels(build, catalogue);

  return upgrade.level !== undefined && !picked.has(upgrade.level) && (upgrade.level === 2 || picked.has(upgrade.level - 1));
}

export function eligibleLevelPicks(build: HeroBuild, catalogue: Catalogue, level: PickLevel): UpgradeDefinition[] {
  return Object.values(catalogue.upgrades).filter(
    (upgrade) => upgrade.category === "level" && upgrade.level === level && isUpgradeEligible(build, upgrade, catalogue),
  );
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

  if (!isUpgradeEligible(build, upgrade, catalogue)) {
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
