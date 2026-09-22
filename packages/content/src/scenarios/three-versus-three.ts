import { createHeroBuild, type BattleSetup, type HeroDefinitionId, type UnitSetup, type UpgradeDefinitionId } from "@jev-game/game";
import { bruiser } from "../heroes/bruiser.js";
import { ranger } from "../heroes/ranger.js";
import { support } from "../heroes/support.js";
import { flatArena } from "../arenas/flat-arena.js";
import { catalogue } from "../catalogue.js";

function mirroredUnits(
  teamId: string,
  heroIds: readonly string[],
  side: "left" | "right",
  upgradeIdsByHero: ReadonlyMap<HeroDefinitionId, readonly UpgradeDefinitionId[]> = new Map(),
): UnitSetup[] {
  const frontX = side === "left" ? 15 : flatArena.width - 15;
  const backX = side === "left" ? 5 : flatArena.width - 5;

  const spawns = [
    { x: frontX, y: 30 },
    { x: backX, y: 15 },
    { x: backX, y: 45 },
  ];

  return heroIds.map((heroId, index) => {
    const unitId = `${teamId}-${index + 1}`;

    return {
      unitId,
      teamId,
      build: createHeroBuild(unitId, heroId, upgradeIdsByHero.get(heroId) ?? [], catalogue),
      spawn: spawns[index]!,
    };
  });
}

export function createThreeVersusThreeSetup(
  seed: number,
  teamAUpgradeIdsByHero: ReadonlyMap<HeroDefinitionId, readonly UpgradeDefinitionId[]> = new Map(),
): BattleSetup {
  return {
    rulesetId: "three-vs-three-prototype",
    rulesetVersion: 1,
    seed,
    arenaId: flatArena.id,
    units: [
      ...mirroredUnits("A", [bruiser.id, ranger.id, support.id], "left", teamAUpgradeIdsByHero),
      ...mirroredUnits("B", [bruiser.id, ranger.id, support.id], "right"),
    ],
  };
}

export function createThreeBruisersSetup(seed: number): BattleSetup {
  return {
    rulesetId: "three-bruisers-prototype",
    rulesetVersion: 1,
    seed,
    arenaId: flatArena.id,
    units: [
      ...mirroredUnits("A", [bruiser.id, bruiser.id, bruiser.id], "left"),
      ...mirroredUnits("B", [bruiser.id, bruiser.id, bruiser.id], "right"),
    ],
  };
}
