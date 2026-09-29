import {
  arenaDefinition,
  heroDefinition,
  type ArenaDefinition,
  type Catalogue,
  type HeroDefinition,
} from "../definitions.js";
import type { ArenaDefinitionId, HeroDefinitionId, TeamId, UnitId } from "../ids.js";
import { isInsideArena, type Vector2 } from "../math/vector.js";
import { createRng, nextInt, type RngState } from "../random/rng.js";
import type { BattleState, ChainState, UnitState } from "./state.js";

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
  tickLimit: number;
  units: UnitSetup[];
}

function validateSetup(setup: BattleSetup, arena: ArenaDefinition): void {
  if (!Number.isInteger(setup.seed)) {
    throw new Error(`Battle seed ${setup.seed} is not an integer`);
  }

  if (!Number.isInteger(setup.tickLimit) || setup.tickLimit <= 0) {
    throw new Error(`Battle tick limit ${setup.tickLimit} is not a positive integer`);
  }

  const unitIds = new Set<UnitId>();
  const teamIds = new Set<TeamId>();

  for (const unit of setup.units) {
    if (unitIds.has(unit.unitId)) {
      throw new Error(`Duplicate unit id "${unit.unitId}"`);
    }

    if (!Number.isFinite(unit.spawn.x) || !Number.isFinite(unit.spawn.y)) {
      throw new Error(`Unit "${unit.unitId}" has a non-finite spawn`);
    }

    if (!isInsideArena(unit.spawn, arena.width, arena.height)) {
      throw new Error(`Unit "${unit.unitId}" spawns outside the arena`);
    }

    unitIds.add(unit.unitId);
    teamIds.add(unit.teamId);
  }

  if (teamIds.size < 2) {
    throw new Error("A battle needs at least two teams");
  }
}

function createUnit(setup: UnitSetup, hero: HeroDefinition, arena: ArenaDefinition): UnitState {
  const ready = hero.signature !== null && hero.startingMana >= hero.maxMana;

  return {
    unitId: setup.unitId,
    teamId: setup.teamId,
    heroId: hero.id,
    position: { ...setup.spawn },
    elevation: 0,
    facing: { x: 0, y: setup.spawn.y > arena.height / 2 ? -1 : 1 },
    baseRadius: hero.bodyRadiusUnits,
    size: 1,
    radius: hero.bodyRadiusUnits,
    hp: hero.maxHp,
    maxHp: hero.maxHp,
    mana: hero.startingMana,
    maxMana: hero.maxMana,
    alive: true,
    diedAtTick: -1,
    moveUnitsPerSecond: hero.moveUnitsPerSecond,
    attack: hero.attack,
    signature: hero.signature,
    passive: hero.passive,
    targetUnitId: null,
    nextAttackTick: 0,
    readySinceTick: ready ? 0 : -1,
    action: { kind: "idle" },
    motion: { kind: "ground" },
    stunnedUntilTick: 0,
    burning: null,
    primed: null,
    rampage: null,
    safetyBubbled: false,
    damageDealt: 0,
  };
}

function shuffleOrder(unitIds: readonly UnitId[], rng: RngState): UnitId[] {
  const order = [...unitIds];

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(rng, index + 1);
    const current = order[index];
    const swapped = order[swapIndex];

    if (current === undefined || swapped === undefined) {
      throw new Error(`Shuffle index ${swapIndex} is outside ${order.length} units`);
    }

    order[index] = swapped;
    order[swapIndex] = current;
  }

  return order;
}

function emptyChain(teamId: TeamId): ChainState {
  return { teamId, count: 0, lastLinkTick: -1, unitIds: [], pairs: [] };
}

export function createBattle(setup: BattleSetup, catalogue: Catalogue): BattleState {
  const arena = arenaDefinition(catalogue, setup.arenaId);
  validateSetup(setup, arena);

  const units = setup.units.map((unit) =>
    createUnit(unit, heroDefinition(catalogue, unit.heroId), arena),
  );

  const rng = createRng(setup.seed);
  const teamIds = [...new Set(units.map((unit) => unit.teamId))];

  return {
    rulesetId: setup.rulesetId,
    rulesetVersion: setup.rulesetVersion,
    seed: setup.seed,
    arenaId: arena.id,
    arenaWidth: arena.width,
    arenaHeight: arena.height,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    tick: 0,
    tickLimit: setup.tickLimit,
    rng,
    units,
    resolutionOrder: shuffleOrder(
      units.map((unit) => unit.unitId),
      rng,
    ),
    projectiles: [],
    bubbles: [],
    fuses: [],
    chains: teamIds.map((teamId) => emptyChain(teamId)),
    nextEntityId: 1,
    sequence: 0,
    result: null,
  };
}
