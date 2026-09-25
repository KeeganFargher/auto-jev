import { PICK_LEVELS, fittingSlots, type Catalogue, type UpgradeDefinition } from "@jev-game/game";
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
  const gems = (pick.gems ?? []).length === 0 ? "" : `<${(pick.gems ?? []).map((gem) => `${gem.gemId}@${gem.slot}`).join("+")}>`;

  return `${pick.heroId}${upgrades}${items}${gems}`;
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

function firstPickAt(catalogue: Catalogue, heroId: string, level: number): UpgradeDefinition | null {
  let first: UpgradeDefinition | null = null;

  for (const upgrade of Object.values(catalogue.upgrades)) {
    if (upgrade.category !== "level" || upgrade.heroId !== heroId || upgrade.level !== level) {
      continue;
    }

    if (first === null || (upgrade.path ?? "").localeCompare(first.path ?? "") < 0) {
      first = upgrade;
    }
  }

  return first;
}

function levelPath(catalogue: Catalogue, heroId: string, pick: UpgradeDefinition): string[] | null {
  if (pick.level === undefined) {
    return null;
  }

  const path: string[] = [];

  for (const level of PICK_LEVELS) {
    if (level >= pick.level) {
      break;
    }

    const earlier = firstPickAt(catalogue, heroId, level);

    if (earlier === null) {
      return null;
    }

    path.push(earlier.id);
  }

  path.push(pick.id);

  return path;
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
        gems: [...(pick.gems ?? [])],
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

    case "gem": {
      const [slot] = fittingSlots(upgrade, heroId, catalogue);

      return slot === undefined
        ? null
        : {
            base: { heroId, upgradeIds: [] },
            variant: { heroId, upgradeIds: [], gems: [{ gemId: upgrade.id, slot }] },
            label: `${upgrade.id} in ${slot}`,
          };
    }

    case "level": {
      if (upgrade.heroId !== undefined && upgrade.heroId !== heroId) {
        return null;
      }

      const path = levelPath(catalogue, heroId, upgrade);

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
        rarePowerSpike: upgrade.rarity === "legendary" || (upgrade.category === "level" && (upgrade.level ?? 0) >= 4),
        heroId,
        label: piece.label,
        pairs,
      });
    }
  }

  return cases;
}
