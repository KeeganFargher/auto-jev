import type { ArenaDefinitionId, TeamId, UnitId } from "../ids.js";
import type { Catalogue } from "../definitions.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleState, TeamComboTiers, UnitMemory, UnitState } from "./state.js";
import type { HeroBuild } from "../builds/state.js";
import { compileBuild, type CompiledUnitStats } from "../builds/compile-build.js";
import {
  ATTUNEMENT_ARCANA_MANA_GAIN,
  ATTUNEMENT_CUNNING_CRIT_CHANCE,
  ATTUNEMENT_MIGHT_MAX_HP,
  compileTeamTraits,
} from "../builds/traits.js";
import { createRng, nextInt, type RngState } from "../random/rng.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";

export interface UnitSetup {
  unitId: UnitId;
  teamId: TeamId;
  build: HeroBuild;
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

function initialAbilityCooldowns(compiled: CompiledUnitStats, abilityIds: readonly string[]) {
  const cooldowns: Record<string, number> = {};

  for (const abilityId of abilityIds) {
    cooldowns[abilityId] = compiled.abilities[abilityId]?.initialCooldownTicks ?? 0;
  }

  return cooldowns;
}

export function emptyUnitMemory(): UnitMemory {
  return {
    damageSinceTrigger: 0,
    firstHitTargets: [],
    attackCounts: {},
    attackCountedStrike: {},
    siphonedAt: {},
    ruthlessStunned: {},
    revived: false,
    souls: 0,
    fellAtTick: -1,
    resurrected: false,
    corpseSpent: false,
    summonsRaised: 0,
    overclockTicks: 0,
    spentTriggers: [],
    triggerReadyAt: {},
    stacks: {},
    stacksGainedAt: {},
    stackProgress: {},
    stored: {},
    storedIncoming: {},
    skillUses: {},
    attackCasts: 0,
    mirrorUsed: false,
    sentinelUsed: false,
    tetherPending: 0,
  };
}

function skillIds(compiled: CompiledUnitStats): string[] {
  const ids = [compiled.basicAttackId];

  if (compiled.abilityId !== null) {
    ids.push(compiled.abilityId);
  }

  if (compiled.ultimateId !== null) {
    ids.push(compiled.ultimateId);
  }

  return ids;
}

export function createUnitState(
  unitId: UnitId,
  teamId: TeamId,
  build: HeroBuild,
  spawn: Vector2,
  compiled: CompiledUnitStats,
  summonerUnitId: UnitId | null,
): UnitState {
  const memory = emptyUnitMemory();

  for (const passive of compiled.passives) {
    if (passive.kind === "stacks" && passive.startsAt !== undefined) {
      memory.stacks[passive.key] = Math.min(passive.max, passive.startsAt);
    }
  }

  return {
    unitId,
    heroId: build.heroId,
    build,
    teamId,
    position: { x: spawn.x, y: spawn.y },
    hp: compiled.maxHp,
    maxHp: compiled.maxHp,
    moveSpeedUnitsPerSecond: compiled.moveSpeedUnitsPerSecond,
    targetUnitId: null,
    abilityCooldowns: initialAbilityCooldowns(compiled, skillIds(compiled)),
    abilityCooldownDurations: compiled.abilityCooldownDurations,
    shield: null,
    slow: null,
    alive: true,
    damageDealt: 0,
    school: compiled.school,
    armor: compiled.armor,
    critChance: compiled.critChance,
    critMultiplier: compiled.critMultiplier,
    damageMultiplier: compiled.damageMultiplier,
    attackDamageMultiplier: compiled.attackDamageMultiplier,
    spellDamageMultiplier: compiled.spellDamageMultiplier,
    lifesteal: compiled.lifesteal,
    slowStrengthBonus: compiled.slowStrengthBonus,
    conditionDurationBonusTicks: compiled.conditionDurationBonusTicks,
    mana: 0,
    maxMana: compiled.maxMana,
    manaPerAttack: compiled.manaPerAttack,
    basicAttackId: compiled.basicAttackId,
    abilityId: compiled.abilityId,
    ultimateId: compiled.ultimateId,
    abilities: compiled.abilities,
    passives: compiled.passives,
    condition: null,
    control: null,
    taunt: null,
    invulnerableUntilTick: 0,
    untargetableUntilTick: 0,
    expiresAtTick: 0,
    dots: [],
    attackSpeedBonus: 0,
    speedBuffs: [],
    marks: [],
    chill: null,
    pandemic: null,
    graveMark: null,
    burstLockedUntilTick: 0,
    memory,
    summonerUnitId,
    link: null,
    channel: null,
    form: null,
  };
}

function applyAttunement(units: UnitState[], compiledByUnit: ReadonlyMap<UnitId, CompiledUnitStats>, catalogue: Catalogue): Record<TeamId, TeamComboTiers> {
  const comboTiers: Record<TeamId, TeamComboTiers> = {};
  const teamIds = [...new Set(units.map((unit) => unit.teamId))];

  for (const teamId of teamIds) {
    const teamUnits = units.filter((unit) => unit.teamId === teamId);
    const compiled: CompiledUnitStats[] = [];

    for (const unit of teamUnits) {
      const stats = compiledByUnit.get(unit.unitId);

      if (stats !== undefined) {
        compiled.push(stats);
      }
    }

    const traits = compileTeamTraits(compiled, catalogue);
    const tiers: TeamComboTiers = { staggered: 0, brittle: 0, disoriented: 0 };

    for (const combo of traits.combos) {
      tiers[combo.condition] = combo.tier;
    }

    comboTiers[teamId] = tiers;

    for (const attunement of traits.attunements) {
      if (!attunement.active) {
        continue;
      }

      for (const unit of teamUnits) {
        if (attunement.school === "might") {
          unit.maxHp = Math.round(unit.maxHp * (1 + ATTUNEMENT_MIGHT_MAX_HP));
          unit.hp = unit.maxHp;
        } else if (attunement.school === "arcana") {
          unit.manaPerAttack *= 1 + ATTUNEMENT_ARCANA_MANA_GAIN;
        } else {
          unit.critChance = Math.min(1, unit.critChance + ATTUNEMENT_CUNNING_CRIT_CHANCE);
        }
      }
    }
  }

  return comboTiers;
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

  const compiledByUnit = new Map<UnitId, CompiledUnitStats>();

  const units: UnitState[] = setup.units.map((unitSetup) => {
    const hero = catalogue.heroes[unitSetup.build.heroId];

    if (hero === undefined) {
      throw new Error(`unknown hero id "${unitSetup.build.heroId}"`);
    }

    if (!isFiniteVector(unitSetup.spawn)) {
      throw new Error(`unit "${unitSetup.unitId}" has a non-finite spawn position`);
    }

    if (!isWithinArena(unitSetup.spawn, arena.width, arena.height)) {
      throw new Error(`unit "${unitSetup.unitId}" has a spawn position outside the arena`);
    }

    if (catalogue.abilities[hero.basicAttackId] === undefined) {
      throw new Error(`hero "${hero.id}" has an unknown basic attack id "${hero.basicAttackId}"`);
    }

    for (const abilityId of [hero.abilityId, hero.ultimateId]) {
      if (abilityId !== undefined && catalogue.abilities[abilityId] === undefined) {
        throw new Error(`hero "${hero.id}" has an unknown skill id "${abilityId}"`);
      }
    }

    const compiled = compileBuild(unitSetup.build, catalogue);
    compiledByUnit.set(unitSetup.unitId, compiled);

    return createUnitState(unitSetup.unitId, unitSetup.teamId, unitSetup.build, unitSetup.spawn, compiled, null);
  });

  const comboTiers = applyAttunement(units, compiledByUnit, catalogue);

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
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    tick: 0,
    tickLimit: setup.tickLimit ?? DEFAULT_TICK_LIMIT,
    units,
    rng,
    eventSequence: 0,
    result: null,
    resolutionPriority,
    impacts: [],
    zones: [],
    pendingCasts: [],
    pendingStrikes: [],
    sequences: [],
    showers: [],
    emitters: [],
    bombs: [],
    bursts: [],
    blessedBursts: [],
    corpseBlasts: [],
    detonations: [],
    castChains: {},
    comboTiers,
    nextEntityId: 1,
  };
}
