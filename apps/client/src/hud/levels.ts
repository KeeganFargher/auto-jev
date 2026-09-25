import { heroLevel, type HeroBuild, type UpgradeDefinition } from "@jev-game/game";
import { gameCatalogue, upgradeDefinition } from "../game/catalogues.js";
import { el } from "./dom.js";

const ROMAN = ["I", "II", "III", "IV"];

const LEVEL_NAMES = new Map([
  [2, "Empower"],
  [3, "Mutation"],
  [4, "Ascension"],
]);

export function romanLevel(level: number): string {
  return ROMAN[Math.max(0, Math.min(ROMAN.length - 1, level - 1))] ?? "I";
}

export function levelStepName(level: number): string {
  return LEVEL_NAMES.get(level) ?? "";
}

export function buildLevel(build: HeroBuild): number {
  return heroLevel(build, gameCatalogue);
}

export function levelPicks(build: HeroBuild): UpgradeDefinition[] {
  const picks: UpgradeDefinition[] = [];

  for (const selection of build.upgrades) {
    const pick = upgradeDefinition(selection.upgradeId);

    if (pick?.category === "level") {
      picks.push(pick);
    }
  }

  return picks.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

export function levelBadge(level: number, className: string): HTMLElement {
  const badge = el("span", `level-badge ${className}`, romanLevel(level));
  badge.dataset.level = String(level);

  return badge;
}
