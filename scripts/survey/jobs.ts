import { isUpgradeEligible, runeFitsHero, type Catalogue, type HeroBuild, type UpgradeDefinition } from "@jev-game/game";
import type { BattleJob, BattleTier, HeroPick } from "./types.js";

export interface PieceCase {
  pieceId: string;
  category: string;
  rarePowerSpike: boolean;
  heroId: string;
  label: string;
  pairs: PiecePair[];
}

export interface PiecePair {
  baseJobIndex: number;
  variantJobIndex: number;
}

export function pickKey(pick: HeroPick): string {
  const upgrades = pick.upgradeIds.length === 0 ? "" : `[${pick.upgradeIds.join("+")}]`;
  const items = (pick.itemIds ?? []).length === 0 ? "" : `{${(pick.itemIds ?? []).join("+")}}`;
  const runes = (pick.runeIds ?? []).length === 0 ? "" : `<${(pick.runeIds ?? []).join("+")}>`;

  return `${pick.heroId}${upgrades}${items}${runes}`;
}

export function teamKey(team: readonly HeroPick[]): string {
  return team.map(pickKey).join(",");
}

export function heroTeams(heroIds: readonly string[], size: number): string[][] {
  const sorted = [...heroIds].sort();
  const teams: string[][] = [];

  function extend(start: number, current: string[]): void {
    if (current.length === size) {
      teams.push([...current]);

      return;
    }

    for (let index = start; index < sorted.length; index += 1) {
      current.push(sorted[index]!);
      extend(index + 1, current);
      current.pop();
    }
  }

  extend(0, []);

  return teams;
}

export function plainTeam(heroIds: readonly string[]): HeroPick[] {
  return heroIds.map((heroId) => ({ heroId, upgradeIds: [] }));
}

export class JobList {
  readonly jobs: BattleJob[] = [];

  private readonly indexByKey = new Map<string, number>();

  add(tier: BattleTier, first: HeroPick[], second: HeroPick[], seedBase: number, seedCount: number): number {
    const key = `${tier}|${teamKey(first)}|${teamKey(second)}|${seedBase}|${seedCount}`;
    const existing = this.indexByKey.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const index = this.jobs.length;
    this.jobs.push({ index, tier, key: `${teamKey(first)} vs ${teamKey(second)}`, first, second, seedBase, seedCount });
    this.indexByKey.set(key, index);

    return index;
  }
}

export function addSanityJobs(
  list: JobList,
  heroIds: readonly string[],
  seedBase: number,
  seedCount: number,
  mirrorSeedCount: number,
): number[] {
  const sorted = [...heroIds].sort();
  const indices: number[] = [];

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left; right < sorted.length; right += 1) {
      const count = left === right ? mirrorSeedCount : seedCount;
      indices.push(list.add("sanity", plainTeam([sorted[left]!]), plainTeam([sorted[right]!]), seedBase, count));
    }
  }

  return indices;
}

export function addTeamJobs(
  list: JobList,
  teams: readonly string[][],
  seedBase: number,
  seedCount: number,
): number[] {
  const indices: number[] = [];

  for (let left = 0; left < teams.length; left += 1) {
    for (let right = left; right < teams.length; right += 1) {
      indices.push(list.add("teams", plainTeam(teams[left]!), plainTeam(teams[right]!), seedBase, seedCount));
    }
  }

  return indices;
}

function resolvePath(catalogue: Catalogue, upgradeId: string, ordered: string[], visiting: Set<string>): boolean {
  if (ordered.includes(upgradeId)) {
    return true;
  }

  const upgrade = catalogue.upgrades[upgradeId];

  if (upgrade === undefined || visiting.has(upgradeId)) {
    return false;
  }

  visiting.add(upgradeId);

  const alternatives = upgrade.requiresAnyOfUpgradeIds ?? [];

  if (alternatives.length > 0 && !alternatives.some((id) => ordered.includes(id))) {
    const satisfied = alternatives.some((alternative) => {
      const attempt = [...ordered];

      if (resolvePath(catalogue, alternative, attempt, new Set(visiting))) {
        ordered.splice(0, ordered.length, ...attempt);

        return true;
      }

      return false;
    });

    if (!satisfied) {
      return false;
    }
  }

  visiting.delete(upgradeId);
  ordered.push(upgradeId);

  return true;
}

function upgradePath(catalogue: Catalogue, heroId: string, upgradeId: string): string[] | null {
  const ordered: string[] = [];

  if (!resolvePath(catalogue, upgradeId, ordered, new Set())) {
    return null;
  }

  const build: HeroBuild = { buildId: "path-check", heroId, upgrades: [] };

  for (const id of ordered) {
    const upgrade = catalogue.upgrades[id];

    if (upgrade === undefined || !isUpgradeEligible(build, upgrade)) {
      return null;
    }

    build.upgrades.push({ upgradeId: id, stacks: 1 });
  }

  return ordered;
}

function withPieceOnFirstCopy(team: readonly string[], heroId: string, pick: HeroPick): HeroPick[] {
  let applied = false;

  return team.map((id) => {
    if (!applied && id === heroId) {
      applied = true;

      return {
        heroId: id,
        upgradeIds: [...pick.upgradeIds],
        itemIds: [...(pick.itemIds ?? [])],
        runeIds: [...(pick.runeIds ?? [])],
      };
    }

    return { heroId: id, upgradeIds: [] };
  });
}

interface PieceVariant {
  base: HeroPick;
  variant: HeroPick;
  label: string;
}

function pieceVariant(catalogue: Catalogue, heroId: string, upgrade: UpgradeDefinition): PieceVariant | null {
  switch (upgrade.category) {
    case "item":
      return {
        base: { heroId, upgradeIds: [] },
        variant: { heroId, upgradeIds: [], itemIds: [upgrade.id] },
        label: upgrade.id,
      };

    case "rune":
      return runeFitsHero(upgrade, heroId, catalogue)
        ? {
            base: { heroId, upgradeIds: [] },
            variant: { heroId, upgradeIds: [], runeIds: [upgrade.id] },
            label: upgrade.id,
          }
        : null;

    case "talent": {
      if (upgrade.heroId !== undefined && upgrade.heroId !== heroId) {
        return null;
      }

      const path = upgradePath(catalogue, heroId, upgrade.id);

      if (path === null) {
        return null;
      }

      const prerequisites = path.filter((id) => id !== upgrade.id);

      return {
        base: { heroId, upgradeIds: prerequisites },
        variant: { heroId, upgradeIds: path },
        label: prerequisites.length === 0 ? upgrade.id : `${upgrade.id} (on top of ${prerequisites.join(", ")})`,
      };
    }

    default: {
      const exhaustive: never = upgrade.category;

      return exhaustive;
    }
  }
}

export function addPieceJobs(
  list: JobList,
  catalogue: Catalogue,
  teams: readonly string[][],
  field: readonly string[][],
  seedBase: number,
  seedCount: number,
): PieceCase[] {
  const cases: PieceCase[] = [];
  const heroIds = Object.keys(catalogue.heroes).sort();

  for (const upgradeId of Object.keys(catalogue.upgrades).sort()) {
    const upgrade = catalogue.upgrades[upgradeId];

    if (upgrade === undefined) {
      continue;
    }

    for (const heroId of heroIds) {
      const piece = pieceVariant(catalogue, heroId, upgrade);

      if (piece === null) {
        continue;
      }

      const pairs: PiecePair[] = [];

      for (const team of teams) {
        if (!team.includes(heroId)) {
          continue;
        }

        const base = withPieceOnFirstCopy(team, heroId, piece.base);
        const variant = withPieceOnFirstCopy(team, heroId, piece.variant);

        for (const opponent of field) {
          pairs.push({
            baseJobIndex: list.add("pieces", base, plainTeam(opponent), seedBase, seedCount),
            variantJobIndex: list.add("pieces", variant, plainTeam(opponent), seedBase, seedCount),
          });
        }
      }

      cases.push({
        pieceId: upgradeId,
        category: upgrade.category ?? "upgrade",
        rarePowerSpike: upgrade.rarity === "legendary" || (upgrade.category === "talent" && (upgrade.tier ?? 0) >= 3),
        heroId,
        label: piece.label,
        pairs,
      });
    }
  }

  return cases;
}
