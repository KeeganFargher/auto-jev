import type { ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import type { Catalogue } from "../definitions.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleState, UnitState } from "./state.js";
import { createRng, nextInt, type RngState } from "../random/rng.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";

export interface UnitSetup {
  unitId: UnitId;
  teamId: TeamId;
  heroId: HeroDefinitionId;
  spawn: Vector2;
}

export interface BattleSetup {
  rulesetId: string;
  rulesetVersion: number;
  seed: number;
  arenaId: ArenaDefinitionId;
  tickLimit?: number;
  units: UnitSetup[];
}

function isFiniteVector(vector: Vector2): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y);
}

function isWithinArena(vector: Vector2, arenaWidth: number, arenaHeight: number): boolean {
  return (
    vector.x >= 0 && vector.x <= arenaWidth && vector.y >= 0 && vector.y <= arenaHeight
  );
}

function shufflePriority(unitIds: readonly UnitId[], rng: RngState): UnitId[] {
  const order = [...unitIds];

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    const current = order[index]!;
    order[index] = order[swapIndex]!;
    order[swapIndex] = current;
  }

  return order;
}

export function createBattle(setup: BattleSetup, catalogue: Catalogue): BattleState {
  if (setup.units.length === 0) {
    throw new Error("battle setup has no units");
  }

  const seenUnitIds = new Set<UnitId>();
  const seenTeamIds = new Set<TeamId>();

  for (const unitSetup of setup.units) {
    if (seenUnitIds.has(unitSetup.unitId)) {
      throw new Error(`duplicate unit id "${unitSetup.unitId}"`);
    }

    seenUnitIds.add(unitSetup.unitId);
    seenTeamIds.add(unitSetup.teamId);
  }

  if (seenTeamIds.size < 2) {
    throw new Error("battle setup needs at least two distinct teams");
  }

  const arena = catalogue.arenas[setup.arenaId];

  if (arena === undefined) {
    throw new Error(`unknown arena id "${setup.arenaId}"`);
  }

  const units: UnitState[] = setup.units.map((unitSetup) => {
    const hero = catalogue.heroes[unitSetup.heroId];

    if (hero === undefined) {
      throw new Error(`unknown hero id "${unitSetup.heroId}"`);
    }

    if (!isFiniteVector(unitSetup.spawn)) {
      throw new Error(`unit "${unitSetup.unitId}" has a non-finite spawn position`);
    }

    if (!isWithinArena(unitSetup.spawn, arena.width, arena.height)) {
      throw new Error(`unit "${unitSetup.unitId}" has a spawn position outside the arena`);
    }

    return {
      unitId: unitSetup.unitId,
      heroId: unitSetup.heroId,
      teamId: unitSetup.teamId,
      position: { x: unitSetup.spawn.x, y: unitSetup.spawn.y },
      hp: hero.maxHp,
      maxHp: hero.maxHp,
      attackDamage: hero.attackDamage,
      attackRangeUnits: hero.attackRangeUnits,
      attackIntervalTicks: hero.attackIntervalTicks,
      moveSpeedUnitsPerSecond: hero.moveSpeedUnitsPerSecond,
      targetUnitId: null,
      nextAttackTick: 0,
      alive: true,
      damageDealt: 0,
    };
  });

  const rng = createRng(setup.seed);

  const resolutionPriority = shufflePriority(
    units.map((unit) => unit.unitId),
    rng,
  );

  return {
    rulesetId: setup.rulesetId,
    rulesetVersion: setup.rulesetVersion,
    seed: setup.seed,
    arenaId: setup.arenaId,
    arenaWidth: arena.width,
    arenaHeight: arena.height,
    tick: 0,
    tickLimit: setup.tickLimit ?? DEFAULT_TICK_LIMIT,
    units,
    rng,
    eventSequence: 0,
    result: null,
    resolutionPriority,
  };
}
