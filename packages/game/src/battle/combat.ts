import type { UnitId } from "../ids.js";
import type {
  ComboKind,
  ConditionKind,
  ControlKind,
  DotKind,
  EffectDefinition,
  PassiveDefinition,
  PassiveKind,
  School,
} from "../definitions.js";
import type { BattleEvent, DamageDealtEvent, HpPaymentReason } from "./events.js";
import type { BattleState, UnitState } from "./state.js";
import type { LinkStatus } from "./statuses.js";
import type { Catalogue } from "../definitions.js";
import type { CompiledAbility } from "../builds/compile-build.js";
import { MAX_SLOW_FRACTION, compileBuild } from "../builds/compile-build.js";
import { createHeroBuild, withEquipment } from "../builds/state.js";
import { createUnitState } from "./create-battle.js";
import { DEFAULT_TICK_LIMIT } from "../constants.js";
import { applyDamage } from "./damage.js";
import { unitsInArea, unitsInCircle, unitsInRay, type AreaSide } from "./areas.js";
import { clampToArena, directionTo, distance, isWithinRange, type Vector2 } from "../math/vector.js";
import { nextFloat, nextInt } from "../random/rng.js";
import {
  COMBO_FOR_CONDITION,
  CONDITION_DURATION_TICKS,
  CRUSH_BONUS_FRACTION,
  CRUSH_MANA_DRAIN_FRACTION,
  DETONATED_BY,
  OVERLOAD_BONUS_FRACTION,
  OVERLOAD_KNOCKDOWN_TICKS,
  OVERLOAD_SPLASH_RANGE_UNITS,
  SHATTER_CRIT_MULTIPLIER,
  SHATTER_SHARD_FRACTION,
  SHATTER_SHARD_RANGE_UNITS,
  TIER_TWO_BRITTLE_DURATION_TICKS,
  TIER_TWO_CRUSH_SLOW_FRACTION,
  TIER_TWO_CRUSH_SLOW_TICKS,
  TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS,
  TIER_TWO_OVERLOAD_SPLASH_FRACTION,
  TIER_TWO_SHATTER_SHARD_FRACTION,
} from "./conditions.js";
import { TICK_RATE } from "../constants.js";

export const MAX_EVASION = 0.25;

export const BLINK_OFFSET_UNITS = 8;

export interface HitFlags {
  canApplyConditions: boolean;
  canDetonate: boolean;
  canTriggerPassives: boolean;
  canCrit: boolean;
  ignoresArmor: boolean;
  reaction: boolean;
}

export const CAST_FLAGS: HitFlags = {
  canApplyConditions: true,
  canDetonate: true,
  canTriggerPassives: true,
  canCrit: true,
  ignoresArmor: false,
  reaction: false,
};

export const RUNE_TRIGGER_FLAGS: HitFlags = {
  canApplyConditions: false,
  canDetonate: false,
  canTriggerPassives: false,
  canCrit: false,
  ignoresArmor: false,
  reaction: true,
};

export const REACTION_FLAGS: HitFlags = RUNE_TRIGGER_FLAGS;

export const DOT_FLAGS: HitFlags = { ...REACTION_FLAGS, ignoresArmor: true };

export const RETRIBUTION_FLAGS: HitFlags = { ...REACTION_FLAGS, canApplyConditions: true };

export const CROWN_FLAGS: HitFlags = { ...RUNE_TRIGGER_FLAGS, canApplyConditions: true, canDetonate: true, canCrit: true };

export const ALL_SCHOOLS: readonly School[] = ["might", "arcana", "cunning"];

export const OPENER_STAGGER_TICKS = 3;

export const OPENER_STAGGER_SLOTS = 6;

export interface DeferredMove {
  unitId: UnitId;
  to: Vector2;
  reason: "blink" | "knockback";
}

export interface TriggeredCast {
  sourceUnitId: UnitId;
  abilityId: string;
  scale: number;
  flags: HitFlags;
  causeSequence: number;
  fromCorpse?: boolean;
}

export interface PendingSpawn {
  summonerUnitId: UnitId;
  teamId: string;
  heroId: string;
  anchor: Vector2;
  maxActive: number | null;
  hpScale: number;
  damageScale: number;
  shieldFraction: number;
  passives: PassiveDefinition[];
  itemIds: string[];
}

export interface ResolutionContext {
  state: BattleState;
  catalogue: Catalogue;
  events: BattleEvent[];
  nextSequence: () => number;
  moves: DeferredMove[];
  triggered: TriggeredCast[];
  spawns: PendingSpawn[];
  reportedDeaths: Set<UnitId>;
}

export interface CastInfo {
  source: UnitState;
  ability: CompiledAbility;
  castSequence: number;
  isBasicAttack: boolean;
  scale: number;
  flags: HitFlags;
}

export interface HitRequest {
  source: UnitState;
  target: UnitState;
  amount: number;
  abilityId: string;
  causeSequence: number;
  school: School | null;
  isBasicAttack: boolean;
  flags: HitFlags;
  dot?: DotKind;
  redirectedFrom?: UnitId;
  alreadyScaled?: boolean;
  linkEcho?: boolean;
}

export interface HitOutcome {
  hpLost: number;
  shieldAbsorbed: number;
  combo: ComboKind | null;
  crit: boolean;
}

const NO_HIT: HitOutcome = { hpLost: 0, shieldAbsorbed: 0, combo: null, crit: false };

export function createResolutionContext(state: BattleState, events: BattleEvent[], nextSequence: () => number, catalogue: Catalogue): ResolutionContext {
  return { state, catalogue, events, nextSequence, moves: [], triggered: [], spawns: [], reportedDeaths: new Set() };
}

function isPassiveOfKind<K extends PassiveKind>(passive: PassiveDefinition, kind: K): passive is Extract<PassiveDefinition, { kind: K }> {
  return passive.kind === kind;
}

export function findPassive<K extends PassiveKind>(unit: UnitState, kind: K): Extract<PassiveDefinition, { kind: K }> | null {
  for (const passive of unit.passives) {
    if (isPassiveOfKind(passive, kind)) {
      return passive;
    }
  }

  return null;
}

function passivesOfKind<K extends PassiveKind>(unit: UnitState, kind: K): Extract<PassiveDefinition, { kind: K }>[] {
  const found: Extract<PassiveDefinition, { kind: K }>[] = [];

  for (const passive of unit.passives) {
    if (isPassiveOfKind(passive, kind)) {
      found.push(passive);
    }
  }

  return found;
}

export function findUnit(state: BattleState, unitId: UnitId): UnitState | null {
  return state.units.find((unit) => unit.unitId === unitId) ?? null;
}

function isTaunting(state: BattleState, unit: UnitState): boolean {
  return state.units.some((other) => other.alive && other.taunt !== null && other.taunt.byUnitId === unit.unitId);
}

function castSchool(cast: CastInfo): School | null {
  return cast.ability.school ?? cast.source.school;
}

function sideFor(policyAlly: boolean): AreaSide {
  return policyAlly ? "allies" : "enemies";
}

function rollDamage(state: BattleState, effect: Extract<EffectDefinition, { kind: "damage" }>): number {
  if (effect.maxAmount === undefined || effect.maxAmount <= effect.amount) {
    return effect.amount;
  }

  return effect.amount + nextInt(state.rng, effect.maxAmount - effect.amount + 1);
}

export function echoFlags(unit: UnitState): HitFlags {
  return findPassive(unit, "crown-of-echoes") === null ? RUNE_TRIGGER_FLAGS : CROWN_FLAGS;
}

function canDetonate(source: UnitState, school: School | null, condition: ConditionKind, conditionSource: UnitId, resonant: boolean): boolean {
  if (resonant) {
    return true;
  }

  const schools = new Set<School>();

  if (school !== null) {
    schools.add(school);
  }

  if (findPassive(source, "prism") !== null) {
    for (const every of ALL_SCHOOLS) {
      schools.add(every);
    }
  }

  let allowSelf = false;

  for (const passive of passivesOfKind(source, "extra-detonation")) {
    schools.add(passive.school);
    allowSelf ||= passive.allowSelf;
  }

  if (!schools.has(DETONATED_BY[condition])) {
    return false;
  }

  return conditionSource !== source.unitId || allowSelf;
}

function critChanceAgainst(source: UnitState, target: UnitState): number {
  const bonus = target.condition === null ? 0 : (findPassive(source, "crit-vs-condition")?.bonusChance ?? 0);

  return Math.min(1, source.critChance + bonus);
}

function grudgeMultiplier(unit: UnitState): number {
  const grudge = findPassive(unit, "grudge");

  return grudge === null ? 1 : 1 + Math.min(grudge.max, unit.memory.grudgeStacks * grudge.perHit);
}

function findInterposer(state: BattleState, target: UnitState): { unit: UnitState; fraction: number } | null {
  let chosen: { unit: UnitState; fraction: number } | null = null;

  for (const candidate of state.units) {
    if (!candidate.alive || candidate.unitId === target.unitId || candidate.teamId !== target.teamId) {
      continue;
    }

    const interpose = findPassive(candidate, "interpose");

    if (interpose === null || !isWithinRange(distance(candidate.position, target.position), interpose.rangeUnits)) {
      continue;
    }

    if (chosen === null || candidate.unitId < chosen.unit.unitId) {
      chosen = { unit: candidate, fraction: interpose.fraction };
    }
  }

  return chosen;
}

export function witheringOn(state: BattleState, unit: UnitState): Extract<PassiveDefinition, { kind: "withering" }> | null {
  if (findPassive(unit, "blight-ward") !== null) {
    return null;
  }

  for (const dot of unit.dots) {
    if (dot.dot !== "poison") {
      continue;
    }

    const holder = findUnit(state, dot.sourceUnitId);
    const withering = holder === null ? null : findPassive(holder, "withering");

    if (withering !== null) {
      return withering;
    }
  }

  return null;
}

export function manaGainMultiplier(state: BattleState, unit: UnitState): number {
  const withering = witheringOn(state, unit);

  return withering === null ? 1 : 1 - withering.manaReduction;
}

export function attackSpeedBonusFor(state: BattleState, unit: UnitState): number {
  let bonus = unit.attackSpeedBonus;
  const bloodlust = findPassive(unit, "bloodlust");

  if (bloodlust !== null && unit.maxHp > 0) {
    bonus += (1 - unit.hp / unit.maxHp) * bloodlust.attackSpeedPerMissingHp;
  }

  const overclock = findPassive(unit, "overclock");

  if (overclock !== null) {
    const partnered = state.units.some(
      (other) =>
        other.alive &&
        other.unitId !== unit.unitId &&
        other.teamId === unit.teamId &&
        other.heroId === unit.heroId &&
        isWithinRange(distance(unit.position, other.position), overclock.rangeUnits),
    );

    if (partnered) {
      bonus += overclock.attackSpeedBonus;
    }
  }

  return bonus;
}

function heal(ctx: ResolutionContext, source: UnitState, target: UnitState, amount: number, abilityId: string, causeSequence: number): number {
  if (!target.alive || amount <= 0) {
    return 0;
  }

  const withering = witheringOn(ctx.state, target);
  const received = withering === null ? amount : amount * (1 - withering.healingReduction);
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.round(received));

  const healed = target.hp - before;

  ctx.events.push({
    kind: "healing-done",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    abilityId,
    amount: healed,
  });

  return healed;
}

export function applyControl(ctx: ResolutionContext, source: UnitState, target: UnitState, control: ControlKind, durationTicks: number, causeSequence: number): void {
  if (!target.alive || target.invulnerableUntilTick !== 0 || target.channel !== null) {
    return;
  }

  const expiresAtTick = Math.max(target.control?.expiresAtTick ?? 0, ctx.state.tick + durationTicks);
  target.control = { control, sourceUnitId: source.unitId, expiresAtTick };

  ctx.events.push({
    kind: "status-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    status: control,
    expiresAtTick,
  });
}

function applySlow(
  ctx: ResolutionContext,
  source: UnitState,
  target: UnitState,
  slowFraction: number,
  durationTicks: number,
  abilityId: string,
  causeSequence: number,
): void {
  if (target.channel !== null) {
    return;
  }

  const expiresAtTick = ctx.state.tick + durationTicks;
  const speedMultiplier = Math.max(0, 1 - Math.min(MAX_SLOW_FRACTION, slowFraction));
  target.slow = { speedMultiplier, expiresAtTick };

  ctx.events.push({
    kind: "slow-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    abilityId,
    speedMultiplier,
    expiresAtTick,
  });
}

function applyConditionTo(ctx: ResolutionContext, source: UnitState, target: UnitState, condition: ConditionKind, causeSequence: number): void {
  if (!target.alive || target.invulnerableUntilTick !== 0) {
    return;
  }

  const tier = ctx.state.comboTiers[source.teamId]?.[condition] ?? 0;
  const base = condition === "brittle" && tier >= 2 ? TIER_TWO_BRITTLE_DURATION_TICKS : CONDITION_DURATION_TICKS;
  const expiresAtTick = ctx.state.tick + Math.max(1, base + source.conditionDurationBonusTicks);
  target.condition = { condition, sourceUnitId: source.unitId, expiresAtTick };

  ctx.events.push({
    kind: "condition-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    condition,
    expiresAtTick,
  });
}

function applyDot(
  ctx: ResolutionContext,
  source: UnitState,
  target: UnitState,
  effect: Extract<EffectDefinition, { kind: "dot" }>,
  causeSequence: number,
): void {
  if (!target.alive || target.invulnerableUntilTick !== 0) {
    return;
  }

  const tick = ctx.state.tick;
  const maxStacks = Math.max(1, effect.maxStacks + source.dotMaxStacksBonus);
  const damagePerStackPerSecond = effect.damagePerStackPerSecond * source.dotDamageMultiplier;
  const expiresAtTick = tick + effect.durationTicks;
  const existing = target.dots.find((dot) => dot.dot === effect.dot && dot.sourceUnitId === source.unitId);

  let stacks: number;
  const before = existing?.stacks ?? 0;

  if (existing === undefined) {
    stacks = Math.min(maxStacks, effect.stacks);
    target.dots.push({
      dot: effect.dot,
      sourceUnitId: source.unitId,
      stacks,
      maxStacks,
      damagePerStackPerSecond,
      expiresAtTick,
      nextTickAt: tick + TICK_RATE,
    });
  } else {
    existing.stacks = Math.min(Math.max(existing.maxStacks, maxStacks), existing.stacks + effect.stacks);
    existing.maxStacks = Math.max(existing.maxStacks, maxStacks);
    existing.damagePerStackPerSecond = Math.max(existing.damagePerStackPerSecond, damagePerStackPerSecond);
    existing.expiresAtTick = expiresAtTick;
    stacks = existing.stacks;
  }

  ctx.events.push({
    kind: "status-applied",
    tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    status: effect.dot,
    expiresAtTick,
    stacks,
  });

  const threshold = effect.conditionAtStacks;

  if (threshold !== undefined && before < threshold.stacks && stacks >= threshold.stacks) {
    applyConditionTo(ctx, source, target, threshold.condition, causeSequence);
  }
}

function startRetributionWindow(source: UnitState, expiresAtTick: number): void {
  if (findPassive(source, "retribution") === null) {
    return;
  }

  if (source.memory.retributionEndsAtTick === 0) {
    source.memory.retributionPool = 0;
  }

  source.memory.retributionEndsAtTick = Math.max(source.memory.retributionEndsAtTick, expiresAtTick);
}

function applyTaunt(ctx: ResolutionContext, source: UnitState, target: UnitState, durationTicks: number, causeSequence: number): boolean {
  if (!target.alive || target.invulnerableUntilTick !== 0 || target.channel !== null || findPassive(target, "taunt-immune") !== null) {
    return false;
  }

  const expiresAtTick = ctx.state.tick + durationTicks;
  target.taunt = { byUnitId: source.unitId, expiresAtTick };
  target.targetUnitId = source.unitId;
  startRetributionWindow(source, expiresAtTick);

  ctx.events.push({
    kind: "status-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    status: "taunted",
    expiresAtTick,
  });

  return true;
}

function trackDeepFreeze(ctx: ResolutionContext, source: UnitState, target: UnitState, causeSequence: number): void {
  const deepFreeze = findPassive(source, "deep-freeze");

  if (deepFreeze === null || !target.alive) {
    return;
  }

  const tick = ctx.state.tick;
  const history = (source.memory.slowHistory[target.unitId] ?? []).filter((at) => tick - at < deepFreeze.windowTicks);
  history.push(tick);

  if (history.length < deepFreeze.slowsNeeded) {
    source.memory.slowHistory[target.unitId] = history;

    return;
  }

  source.memory.slowHistory[target.unitId] = [];

  ctx.events.push({ kind: "passive-triggered", tick, sequence: ctx.nextSequence(), unitId: source.unitId, passive: "deep-freeze" });

  const frozen =
    deepFreeze.radiusUnits > 0 ? unitsInCircle(ctx.state.units, source, target.position, deepFreeze.radiusUnits, "enemies") : [target];

  for (const unit of frozen) {
    applyControl(ctx, source, unit, "frozen", deepFreeze.freezeTicks, causeSequence);
  }
}

export function reportDeath(ctx: ResolutionContext, unit: UnitState, killer: UnitState | null): void {
  if (unit.alive || ctx.reportedDeaths.has(unit.unitId)) {
    return;
  }

  ctx.reportedDeaths.add(unit.unitId);
  ctx.events.push({ kind: "death", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId });

  const heldCondition = unit.condition;
  const heldDots = unit.dots;
  const heldLink = unit.link;

  unit.condition = null;
  unit.control = null;
  unit.taunt = null;
  unit.dots = [];
  unit.link = null;
  unit.channel = null;

  harvestSoul(ctx, unit);
  deathPassives(ctx, unit, heldLink);
  passLanternMana(ctx, unit);
  queueLastWord(ctx, unit);

  if (killer !== null && killer.alive && killer.teamId !== unit.teamId) {
    const onKillMana = findPassive(killer, "on-kill-mana");

    if (onKillMana !== null && killer.maxMana > 0) {
      killer.mana = Math.min(killer.maxMana, killer.mana + onKillMana.amount);
    }

    const onKillHeal = findPassive(killer, "on-kill-heal");

    if (onKillHeal !== null) {
      heal(ctx, killer, killer, killer.maxHp * onKillHeal.maxHpFraction, "on-kill", ctx.nextSequence());
    }
  }

  if (heldCondition?.condition === "brittle") {
    burstBrittle(ctx, unit);
  }

  for (const dot of heldDots) {
    spreadDot(ctx, unit, dot.dot, dot.stacks, dot.damagePerStackPerSecond, dot.expiresAtTick, dot.maxStacks);
  }
}

function passLanternMana(ctx: ResolutionContext, dead: UnitState): void {
  if (dead.summonerUnitId !== null || dead.mana <= 0) {
    return;
  }

  for (const holder of ctx.state.units) {
    if (!holder.alive || holder.teamId !== dead.teamId || holder.maxMana <= 0 || findPassive(holder, "soul-lantern") === null) {
      continue;
    }

    holder.mana = Math.min(holder.maxMana, holder.mana + dead.mana);
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: holder.unitId, passive: "soul-lantern" });
  }
}

function queueLastWord(ctx: ResolutionContext, dead: UnitState): void {
  const signatureId = dead.signatureAbilityId;

  if (signatureId === null || dead.memory.lastWordUsed || dead.abilities[signatureId]?.runes.lastWord !== true) {
    return;
  }

  dead.memory.lastWordUsed = true;
  ctx.triggered.push({
    sourceUnitId: dead.unitId,
    abilityId: signatureId,
    scale: 1,
    flags: RUNE_TRIGGER_FLAGS,
    causeSequence: ctx.nextSequence(),
    fromCorpse: true,
  });
}

function harvestSoul(ctx: ResolutionContext, dead: UnitState): void {
  if (dead.summonerUnitId !== null) {
    return;
  }

  for (const harvester of ctx.state.units) {
    const harvest = harvester.alive && harvester.unitId !== dead.unitId ? findPassive(harvester, "harvest") : null;

    if (harvest === null) {
      continue;
    }

    const heart = findPassive(harvester, "golem-heart");
    const colossus = findPassive(harvester, "bone-colossus");
    const needed = heart?.soulsPerGolem ?? harvest.soulsPerGolem;
    harvester.memory.souls += 1;

    if (harvester.memory.souls < needed) {
      continue;
    }

    harvester.memory.souls -= needed;
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: harvester.unitId, passive: "harvest" });
    ctx.spawns.push({
      summonerUnitId: harvester.unitId,
      teamId: harvester.teamId,
      heroId: harvest.golemHeroId,
      anchor: { x: harvester.position.x, y: harvester.position.y },
      maxActive: null,
      hpScale: colossus?.hpScale ?? 1,
      damageScale: colossus?.hpScale ?? 1,
      shieldFraction: heart?.shieldFraction ?? 0,
      passives: [],
      itemIds: colossus?.inheritsItems === true ? [...(harvester.build.itemIds ?? [])] : [],
    });
  }
}

function deathPassives(ctx: ResolutionContext, dead: UnitState, heldLink: LinkStatus | null): void {
  if (heldLink !== null) {
    const binder = findUnit(ctx.state, heldLink.sourceUnitId);
    const knell = binder === null ? null : findPassive(binder, "death-knell");

    if (binder !== null && knell !== null) {
      for (const other of ctx.state.units) {
        if (other.alive && other.link?.linkId === heldLink.linkId) {
          dealHitAndReport(ctx, {
            source: binder,
            target: other,
            amount: dead.maxHp * knell.maxHpFraction,
            abilityId: "death-knell",
            causeSequence: ctx.nextSequence(),
            school: binder.school,
            isBasicAttack: false,
            flags: REACTION_FLAGS,
            alreadyScaled: true,
            linkEcho: true,
          });
        }
      }
    }
  }

  const martyrdom = findPassive(dead, "martyrdom");

  if (martyrdom !== null) {
    const causeSequence = ctx.nextSequence();
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: causeSequence, unitId: dead.unitId, passive: "martyrdom" });

    for (const ally of ctx.state.units) {
      if (ally.alive && ally.teamId === dead.teamId) {
        heal(ctx, dead, ally, ally.maxHp * martyrdom.healFraction, "martyrdom", causeSequence);
      }
    }
  }

  for (const rising of passivesOfKind(dead, "summon-on-death")) {
    for (let index = 0; index < rising.count; index += 1) {
      ctx.spawns.push({
        summonerUnitId: dead.unitId,
        teamId: dead.teamId,
        heroId: rising.heroId,
        anchor: { x: dead.position.x, y: dead.position.y },
        maxActive: null,
        hpScale: 1,
        damageScale: 1,
        shieldFraction: 0,
        passives: [],
        itemIds: [],
      });
    }
  }
}

function burstBrittle(ctx: ResolutionContext, dead: UnitState): void {
  let holder: UnitState | null = null;
  let burst: Extract<PassiveDefinition, { kind: "brittle-burst" }> | null = null;

  for (const candidate of ctx.state.units) {
    const passive = candidate.alive && candidate.teamId !== dead.teamId ? findPassive(candidate, "brittle-burst") : null;

    if (passive !== null && (holder === null || candidate.unitId < holder.unitId)) {
      holder = candidate;
      burst = passive;
    }
  }

  if (holder === null || burst === null) {
    return;
  }

  const causeSequence = ctx.nextSequence();
  ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: causeSequence, unitId: holder.unitId, passive: "brittle-burst" });

  for (const victim of unitsInCircle(ctx.state.units, holder, dead.position, burst.radiusUnits, "enemies")) {
    dealHitAndReport(ctx, {
      source: holder,
      target: victim,
      amount: dead.maxHp * burst.maxHpFraction,
      abilityId: "brittle-burst",
      causeSequence,
      school: holder.school,
      isBasicAttack: false,
      flags: REACTION_FLAGS,
    });
  }
}

function spreadDot(
  ctx: ResolutionContext,
  dead: UnitState,
  dot: DotKind,
  stacks: number,
  damagePerStackPerSecond: number,
  expiresAtTick: number,
  maxStacks: number,
): void {
  let holder: UnitState | null = null;

  for (const candidate of ctx.state.units) {
    const spreads = candidate.alive && candidate.teamId !== dead.teamId && passivesOfKind(candidate, "dot-spread-on-death").some((passive) => passive.dot === dot);

    if (spreads && (holder === null || candidate.unitId < holder.unitId)) {
      holder = candidate;
    }
  }

  if (holder === null) {
    return;
  }

  let nearest: UnitState | null = null;

  for (const candidate of ctx.state.units) {
    if (!candidate.alive || candidate.teamId !== dead.teamId || candidate.unitId === dead.unitId) {
      continue;
    }

    if (nearest === null || distance(dead.position, candidate.position) < distance(dead.position, nearest.position)) {
      nearest = candidate;
    }
  }

  if (nearest === null) {
    return;
  }

  applyDot(
    ctx,
    holder,
    nearest,
    {
      kind: "dot",
      dot,
      stacks,
      damagePerStackPerSecond: damagePerStackPerSecond / Math.max(0.0001, holder.dotDamageMultiplier),
      durationTicks: Math.max(1, expiresAtTick - ctx.state.tick),
      maxStacks: Math.max(1, maxStacks - holder.dotMaxStacksBonus),
    },
    ctx.nextSequence(),
  );
}

function lastRitesSave(ctx: ResolutionContext, target: UnitState): boolean {
  if (target.alive || target.summonerUnitId !== null) {
    return false;
  }

  for (const keeper of ctx.state.units) {
    if (!keeper.alive || keeper.teamId !== target.teamId || keeper.unitId === target.unitId) {
      continue;
    }

    const rites = findPassive(keeper, "last-rites");

    if (rites === null || keeper.memory.lastRitesUsed >= rites.charges) {
      continue;
    }

    keeper.memory.lastRitesUsed += 1;
    target.alive = true;
    target.hp = 1;
    target.condition = null;
    target.control = null;
    target.dots = [];
    target.untargetableUntilTick = Math.max(target.untargetableUntilTick, ctx.state.tick + rites.untargetableTicks);

    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: keeper.unitId, passive: "last-rites" });
    ctx.events.push({ kind: "revived", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: target.unitId, hp: target.hp });

    return true;
  }

  return false;
}

function shareLinkedDamage(ctx: ResolutionContext, hit: HitRequest, target: UnitState, link: LinkStatus, hpLost: number): void {
  const binder = findUnit(ctx.state, link.sourceUnitId);
  const siphon = binder === null || !binder.alive ? null : findPassive(binder, "siphon");

  if (binder !== null && siphon !== null && binder.maxMana > 0) {
    binder.mana = Math.min(binder.maxMana, binder.mana + hpLost * siphon.manaPerDamage);
  }

  for (const other of ctx.state.units) {
    if (!other.alive || other.unitId === target.unitId || other.link?.linkId !== link.linkId) {
      continue;
    }

    dealHitAndReport(ctx, {
      source: hit.source,
      target: other,
      amount: hpLost * link.fraction,
      abilityId: "shared-fate",
      causeSequence: hit.causeSequence,
      school: null,
      isBasicAttack: false,
      flags: DOT_FLAGS,
      alreadyScaled: true,
      linkEcho: true,
    });
  }
}

function reviveIfPossible(ctx: ResolutionContext, target: UnitState): boolean {
  if (target.alive || target.memory.revived) {
    return false;
  }

  const revive = findPassive(target, "revive");

  if (revive === null) {
    return false;
  }

  target.memory.revived = true;
  target.alive = true;
  target.hp = Math.max(1, Math.round(target.maxHp * revive.hpFraction));
  target.condition = null;
  target.control = null;
  target.dots = [];

  ctx.events.push({ kind: "revived", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: target.unitId, hp: target.hp });

  return true;
}

function splash(ctx: ResolutionContext, source: UnitState, center: UnitState, amount: number, rangeUnits: number, abilityId: string, causeSequence: number): void {
  if (amount <= 0) {
    return;
  }

  for (const victim of unitsInCircle(ctx.state.units, source, center.position, rangeUnits, "enemies")) {
    if (victim.unitId === center.unitId) {
      continue;
    }

    dealHitAndReport(ctx, {
      source,
      target: victim,
      amount,
      abilityId,
      causeSequence,
      school: source.school,
      isBasicAttack: false,
      flags: REACTION_FLAGS,
      alreadyScaled: true,
    });
  }
}

function rallyTeam(ctx: ResolutionContext, detonator: UnitState): void {
  let bonus = 0;

  for (const unit of ctx.state.units) {
    if (unit.alive && unit.teamId === detonator.teamId) {
      bonus += findPassive(unit, "combo-rally")?.attackSpeedPerCombo ?? 0;
    }
  }

  if (bonus <= 0) {
    return;
  }

  for (const unit of ctx.state.units) {
    if (unit.alive && unit.teamId === detonator.teamId) {
      unit.attackSpeedBonus += bonus;
    }
  }
}

function resolveCombo(
  ctx: ResolutionContext,
  hit: HitRequest,
  condition: ConditionKind,
  combo: ComboKind,
  tier: number,
  dealt: number,
  bonus: number,
): void {
  const { source, target } = hit;

  target.condition = null;

  ctx.events.push({
    kind: "combo-detonated",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: hit.causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    condition,
    combo,
    tier,
    bonusDamage: Math.round(bonus),
  });

  switch (combo) {
    case "overload": {
      applyControl(ctx, source, target, "knocked-down", tier >= 2 ? TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS : OVERLOAD_KNOCKDOWN_TICKS, hit.causeSequence);

      if (tier >= 2) {
        splash(ctx, source, target, dealt * TIER_TWO_OVERLOAD_SPLASH_FRACTION, OVERLOAD_SPLASH_RANGE_UNITS, "overload", hit.causeSequence);
      }

      break;
    }

    case "shatter": {
      const fraction = tier >= 2 ? TIER_TWO_SHATTER_SHARD_FRACTION : SHATTER_SHARD_FRACTION;
      splash(ctx, source, target, dealt * fraction, SHATTER_SHARD_RANGE_UNITS, "shatter", hit.causeSequence);
      break;
    }

    case "crush": {
      if (target.alive) {
        target.mana = tier >= 2 ? 0 : target.mana * (1 - CRUSH_MANA_DRAIN_FRACTION);

        if (tier >= 2) {
          applySlow(ctx, source, target, TIER_TWO_CRUSH_SLOW_FRACTION, TIER_TWO_CRUSH_SLOW_TICKS, "crush", hit.causeSequence);
        }
      }

      break;
    }

    default: {
      const exhaustive: never = combo;

      void exhaustive;
    }
  }

  const comboSplash = findPassive(source, "combo-splash");

  if (comboSplash !== null) {
    splash(ctx, source, target, dealt, comboSplash.radiusUnits, "combo-splash", hit.causeSequence);
  }

  rallyTeam(ctx, source);
  triggerTandem(ctx, source);
}

function triggerTandem(ctx: ResolutionContext, detonator: UnitState): void {
  for (const ally of ctx.state.units) {
    const signatureId = ally.signatureAbilityId;
    const tandem = signatureId === null ? null : (ally.abilities[signatureId]?.runes.tandem ?? null);

    if (
      signatureId === null ||
      tandem === null ||
      !ally.alive ||
      ally.unitId === detonator.unitId ||
      ally.teamId !== detonator.teamId ||
      ctx.state.tick < ally.memory.tandemReadyTick
    ) {
      continue;
    }

    ally.memory.tandemReadyTick = ctx.state.tick + tandem.cooldownTicks;
    ctx.triggered.push({
      sourceUnitId: ally.unitId,
      abilityId: signatureId,
      scale: tandem.fraction,
      flags: RUNE_TRIGGER_FLAGS,
      causeSequence: ctx.nextSequence(),
    });
  }
}

export function dealHit(ctx: ResolutionContext, hit: HitRequest): HitOutcome {
  const { state } = ctx;
  const { source, target, flags } = hit;

  if (!target.alive || target.invulnerableUntilTick !== 0) {
    return NO_HIT;
  }

  let requested = Math.round(hit.amount);

  if (hit.dot === "poison") {
    const ward = findPassive(target, "blight-ward");

    if (ward !== null) {
      requested = Math.round(requested * (1 - ward.poisonReduction));
    }
  }

  const held = target.condition;
  const resonant = source.abilities[hit.abilityId]?.runes.resonance === true;

  const combo =
    held !== null && flags.canDetonate && canDetonate(source, hit.school, held.condition, held.sourceUnitId, resonant)
      ? COMBO_FOR_CONDITION[held.condition]
      : null;

  const tier = held === null || combo === null ? 0 : Math.max(1, state.comboTiers[source.teamId]?.[held.condition] ?? 1);

  let crit = false;
  let critMultiplier = 1;

  if (combo === "shatter") {
    crit = true;
    critMultiplier = SHATTER_CRIT_MULTIPLIER;
  } else if (flags.canCrit) {
    const chance = critChanceAgainst(source, target);

    if (chance > 0 && nextFloat(state.rng) < chance) {
      crit = true;
      critMultiplier = source.critMultiplier;
    }
  }

  let amount = requested * critMultiplier;
  let bonus = combo === "shatter" ? requested * (critMultiplier - 1) : 0;

  if (combo === "overload") {
    bonus = amount * OVERLOAD_BONUS_FRACTION;
    amount += bonus;
  } else if (combo === "crush") {
    bonus = amount * CRUSH_BONUS_FRACTION;
    amount += bonus;
  }

  if (hit.alreadyScaled !== true) {
    amount *= source.damageMultiplier * grudgeMultiplier(source);
  }

  let redirect: { unit: UnitState; amount: number } | null = null;

  if (hit.dot === undefined && hit.redirectedFrom === undefined && amount > 0) {
    const interposer = findInterposer(state, target);

    if (interposer !== null) {
      const share = amount * interposer.fraction;
      amount -= share;
      redirect = { unit: interposer.unit, amount: share };
    }
  }

  if (target.control?.control === "hexed") {
    const hexer = findUnit(state, target.control.sourceUnitId);
    const cruel = hexer === null ? null : findPassive(hexer, "cruel-hex");

    if (cruel !== null) {
      amount *= 1 + cruel.damageTakenBonus;
    }
  }

  if (!flags.ignoresArmor) {
    amount *= 1 - target.armor;
  }

  const finalAmount = Math.max(0, Math.round(amount));
  const shieldAbsorbed = target.shield === null ? 0 : Math.min(target.shield.amount, finalAmount);

  if (target.shield !== null) {
    target.shield.amount -= shieldAbsorbed;

    if (target.shield.amount <= 0) {
      target.shield = null;
    }
  }

  let toHp = finalAmount - shieldAbsorbed;

  if (toHp >= target.hp && findPassive(target, "unbreakable-while-taunting") !== null && isTaunting(state, target)) {
    toHp = Math.max(0, target.hp - 1);
  }

  const hpLost = applyDamage(target, toHp);

  source.damageDealt += hpLost;

  const event: DamageDealtEvent = {
    kind: "damage-dealt",
    tick: state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: hit.causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    abilityId: hit.abilityId,
    amount: hpLost,
    shieldAbsorbed,
  };

  if (crit) {
    event.crit = true;
  }

  if (combo !== null) {
    event.combo = combo;
  }

  if (hit.dot !== undefined) {
    event.dot = hit.dot;
  }

  if (flags.reaction) {
    event.reaction = true;
  }

  if (hit.redirectedFrom !== undefined) {
    event.redirectedFrom = hit.redirectedFrom;
  }

  ctx.events.push(event);

  if (!reviveIfPossible(ctx, target)) {
    lastRitesSave(ctx, target);
  }

  if (hpLost > 0 && hit.linkEcho !== true && target.link !== null) {
    shareLinkedDamage(ctx, hit, target, target.link, hpLost);
  }

  const dealt = hpLost + shieldAbsorbed;

  if (combo !== null && held !== null) {
    resolveCombo(ctx, hit, held.condition, combo, tier, dealt, bonus);
  }

  if (target.alive && target.maxMana > 0 && hpLost > 0) {
    target.mana = Math.min(target.maxMana, target.mana + (hpLost / target.maxHp) * 100 * manaGainMultiplier(state, target));
  }

  if (source.lifesteal > 0 && hit.dot === undefined && !flags.reaction && hpLost > 0 && source.alive) {
    heal(ctx, source, source, hpLost * source.lifesteal, "lifesteal", hit.causeSequence);
  }

  if (target.memory.retributionEndsAtTick !== 0) {
    target.memory.retributionPool += dealt;
  }

  trackRetaliate(ctx, target, hpLost);

  if (flags.canTriggerPassives && hit.dot === undefined && source.teamId !== target.teamId) {
    const grudge = findPassive(target, "grudge");

    if (grudge !== null) {
      target.memory.grudgeStacks += 1;
    }

    const thorns = findPassive(target, "thorns");

    if (thorns !== null && source.alive) {
      dealHitAndReport(ctx, {
        source: target,
        target: source,
        amount: thorns.amount,
        abilityId: "thorns",
        causeSequence: hit.causeSequence,
        school: target.school,
        isBasicAttack: false,
        flags: REACTION_FLAGS,
      });
    }
  }

  checkThresholds(ctx, target, hit.causeSequence);

  if (redirect !== null) {
    dealHitAndReport(ctx, {
      source,
      target: redirect.unit,
      amount: redirect.amount,
      abilityId: hit.abilityId,
      causeSequence: hit.causeSequence,
      school: hit.school,
      isBasicAttack: false,
      flags: { ...REACTION_FLAGS, ignoresArmor: false },
      redirectedFrom: target.unitId,
      alreadyScaled: true,
    });
  }

  return { hpLost, shieldAbsorbed, combo, crit };
}

export function dealHitAndReport(ctx: ResolutionContext, hit: HitRequest): HitOutcome {
  const outcome = dealHit(ctx, hit);
  reportDeath(ctx, hit.target, hit.source);

  return outcome;
}

function trackRetaliate(ctx: ResolutionContext, target: UnitState, dealt: number): void {
  if (target.signatureAbilityId === null || dealt <= 0 || !target.alive) {
    return;
  }

  const retaliate = target.abilities[target.signatureAbilityId]?.runes.retaliate ?? null;

  if (retaliate === null) {
    return;
  }

  target.memory.damageSinceRetaliate += dealt;

  if (target.memory.damageSinceRetaliate >= target.maxHp * retaliate.hpLossFraction) {
    target.memory.damageSinceRetaliate = 0;
    ctx.triggered.push({
      sourceUnitId: target.unitId,
      abilityId: target.signatureAbilityId,
      scale: retaliate.fraction,
      flags: RUNE_TRIGGER_FLAGS,
      causeSequence: ctx.nextSequence(),
    });
  }
}

function checkThresholds(ctx: ResolutionContext, target: UnitState, causeSequence: number): void {
  if (!target.alive) {
    return;
  }

  for (const threshold of passivesOfKind(target, "hp-threshold")) {
    if (target.memory.firedThresholds.includes(threshold.key) || target.hp / target.maxHp > threshold.fraction) {
      continue;
    }

    target.memory.firedThresholds.push(threshold.key);
    ctx.triggered.push({ sourceUnitId: target.unitId, abilityId: threshold.abilityId, scale: 1, flags: CAST_FLAGS, causeSequence });
  }
}

function applySingleEffect(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effect: EffectDefinition): number {
  const { source, flags } = cast;
  const tick = ctx.state.tick;

  switch (effect.kind) {
    case "damage": {
      const outcome = dealHit(ctx, {
        source,
        target,
        amount: rollDamage(ctx.state, effect) * cast.scale,
        abilityId: cast.ability.id,
        causeSequence: cast.castSequence,
        school: castSchool(cast),
        isBasicAttack: cast.isBasicAttack,
        flags: cast.ability.canCrit === false ? { ...flags, canCrit: false } : flags,
      });

      return outcome.hpLost;
    }

    case "heal": {
      const amount = (effect.amount + target.maxHp * (effect.maxHpFraction ?? 0)) * cast.scale;
      heal(ctx, source, target, amount, cast.ability.id, cast.castSequence);

      return 0;
    }

    case "shield": {
      const expiresAtTick = tick + effect.durationTicks;
      const amount = Math.round((effect.amount + target.maxHp * (effect.maxHpFraction ?? 0)) * cast.scale);
      target.shield = { amount, expiresAtTick };

      ctx.events.push({
        kind: "shield-applied",
        tick,
        sequence: ctx.nextSequence(),
        causeSequence: cast.castSequence,
        sourceUnitId: source.unitId,
        targetUnitId: target.unitId,
        abilityId: cast.ability.id,
        amount: target.shield.amount,
        expiresAtTick,
      });

      return 0;
    }

    case "slow": {
      if (target.invulnerableUntilTick !== 0) {
        return 0;
      }

      applySlow(ctx, source, target, effect.slowFraction + source.slowStrengthBonus, effect.durationTicks, cast.ability.id, cast.castSequence);

      if (flags.canTriggerPassives) {
        trackDeepFreeze(ctx, source, target, cast.castSequence);
      }

      return 0;
    }

    case "apply-condition": {
      if (flags.canApplyConditions) {
        applyConditionTo(ctx, source, target, effect.condition, cast.castSequence);
      }

      return 0;
    }

    case "control": {
      applyControl(ctx, source, target, effect.control, effect.durationTicks, cast.castSequence);

      return 0;
    }

    case "taunt": {
      applyTaunt(ctx, source, target, effect.durationTicks, cast.castSequence);

      return 0;
    }

    case "dot": {
      if (cast.scale >= 1) {
        applyDot(ctx, source, target, effect, cast.castSequence);
      }

      return 0;
    }

    case "knockback": {
      if (target.unitId !== source.unitId && target.invulnerableUntilTick === 0) {
        const direction = directionTo(source.position, target.position);
        ctx.moves.push({
          unitId: target.unitId,
          to: clampToArena(
            { x: target.position.x + direction.x * effect.distanceUnits, y: target.position.y + direction.y * effect.distanceUnits },
            ctx.state.arenaWidth,
            ctx.state.arenaHeight,
          ),
          reason: "knockback",
        });
      }

      return 0;
    }

    case "summon": {
      if (cast.scale >= 1) {
        queueSummons(ctx, source, effect, target);
      }

      return 0;
    }

    case "bind": {
      if (target.alive && target.invulnerableUntilTick === 0 && target.teamId !== source.teamId) {
        const expiresAtTick = tick + effect.durationTicks;
        target.link = { linkId: cast.castSequence, sourceUnitId: source.unitId, fraction: effect.fraction, expiresAtTick };

        ctx.events.push({
          kind: "status-applied",
          tick,
          sequence: ctx.nextSequence(),
          causeSequence: cast.castSequence,
          sourceUnitId: source.unitId,
          targetUnitId: target.unitId,
          status: "linked",
          expiresAtTick,
        });
      }

      return 0;
    }

    case "strip-shield": {
      if (target.shield !== null && target.teamId !== source.teamId) {
        target.shield = null;
        ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: target.unitId, status: "shield" });
      }

      return 0;
    }

    case "invulnerable":
    case "untargetable": {
      const expiresAtTick = tick + effect.durationTicks;

      if (effect.kind === "invulnerable") {
        target.invulnerableUntilTick = Math.max(target.invulnerableUntilTick, expiresAtTick);
      } else {
        target.untargetableUntilTick = Math.max(target.untargetableUntilTick, expiresAtTick);
      }

      ctx.events.push({
        kind: "status-applied",
        tick,
        sequence: ctx.nextSequence(),
        causeSequence: cast.castSequence,
        sourceUnitId: source.unitId,
        targetUnitId: target.unitId,
        status: effect.kind,
        expiresAtTick,
      });

      return 0;
    }

    default: {
      const exhaustive: never = effect;

      return exhaustive;
    }
  }
}

function applyEffectList(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effects: readonly EffectDefinition[]): number {
  let damage = 0;

  for (const effect of effects) {
    if (!target.alive) {
      break;
    }

    damage += applySingleEffect(ctx, cast, target, effect);
  }

  return damage;
}

function applyOnHitPassives(ctx: ResolutionContext, cast: CastInfo, target: UnitState, dealtDamage: boolean): number {
  const { source, flags } = cast;

  if (!flags.canTriggerPassives || !target.alive || target.teamId === source.teamId) {
    return 0;
  }

  let damage = 0;

  if (cast.isBasicAttack && dealtDamage) {
    for (const cleave of passivesOfKind(source, "cleave")) {
      const basic = cast.ability.effects.find((effect) => effect.kind === "damage");
      const average = basic?.kind === "damage" ? (basic.amount + (basic.maxAmount ?? basic.amount)) / 2 : 0;
      splash(ctx, source, target, average * source.damageMultiplier * cleave.fraction, cleave.radiusUnits, "cleave", cast.castSequence);
    }
  }

  if (cast.isBasicAttack) {
    for (const passive of passivesOfKind(source, "every-nth-basic-attack")) {
      const count = (source.memory.basicAttackCounts[passive.key] ?? 0) + 1;
      source.memory.basicAttackCounts[passive.key] = count;

      if (count % passive.n === 0 && target.alive) {
        damage += applyEffectList(ctx, cast, target, passive.effects);
      }
    }
  }

  if (dealtDamage && !source.memory.firstHitTargets.includes(target.unitId)) {
    const firstHits = passivesOfKind(source, "first-hit-per-enemy");

    if (firstHits.length > 0) {
      source.memory.firstHitTargets.push(target.unitId);

      for (const passive of firstHits) {
        if (target.alive) {
          damage += applyEffectList(ctx, cast, target, passive.effects);
        }
      }
    }
  }

  return damage;
}

export function resolveOnTarget(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effects: readonly EffectDefinition[]): number {
  let damage = applyEffectList(ctx, cast, target, effects);

  damage += applyOnHitPassives(ctx, cast, target, damage > 0 || effects.some((effect) => effect.kind === "damage"));

  reportDeath(ctx, target, cast.source);

  return damage;
}

function scheduleImpact(ctx: ResolutionContext, cast: CastInfo, center: Vector2): void {
  const { ability, source } = cast;
  const radiusUnits = ability.area?.kind === "circle" ? ability.area.radiusUnits : 0;
  const landsAtTick = ctx.state.tick + (ability.delayTicks ?? 0);
  const impactId = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;

  ctx.state.impacts.push({
    impactId,
    sourceUnitId: source.unitId,
    teamId: source.teamId,
    abilityId: ability.id,
    center: { x: center.x, y: center.y },
    radiusUnits,
    landsAtTick,
    causeSequence: cast.castSequence,
    scale: cast.scale,
    triggered: cast.flags.reaction,
  });

  ctx.events.push({
    kind: "impact-scheduled",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: cast.castSequence,
    sourceUnitId: source.unitId,
    abilityId: ability.id,
    center: { x: center.x, y: center.y },
    radiusUnits,
    landsAtTick,
  });
}

export function createZone(ctx: ResolutionContext, source: UnitState, ability: CompiledAbility, center: Vector2): void {
  const zone = ability.zone;

  if (zone === undefined) {
    return;
  }

  const zoneId = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;
  const expiresAtTick = ctx.state.tick + zone.durationTicks;

  ctx.state.zones.push({
    zoneId,
    sourceUnitId: source.unitId,
    teamId: source.teamId,
    abilityId: ability.id,
    center: { x: center.x, y: center.y },
    radiusUnits: zone.radiusUnits,
    expiresAtTick,
    periodTicks: zone.periodTicks,
    nextPulseTick: ctx.state.tick + zone.periodTicks,
    effects: zone.effects,
    allyEffects: zone.allyEffects ?? [],
  });

  ctx.events.push({
    kind: "zone-created",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    zoneId,
    sourceUnitId: source.unitId,
    abilityId: ability.id,
    center: { x: center.x, y: center.y },
    radiusUnits: zone.radiusUnits,
    expiresAtTick,
  });
}

function blinkBehind(ctx: ResolutionContext, source: UnitState, target: UnitState): void {
  const direction = directionTo(source.position, target.position);

  const to = clampToArena(
    { x: target.position.x + direction.x * BLINK_OFFSET_UNITS, y: target.position.y + direction.y * BLINK_OFFSET_UNITS },
    ctx.state.arenaWidth,
    ctx.state.arenaHeight,
  );

  ctx.moves.push({ unitId: source.unitId, to, reason: "blink" });
}

function chainTargets(ctx: ResolutionContext, cast: CastInfo, primary: UnitState, alreadyHit: ReadonlySet<UnitId>): UnitState[] {
  const chain = cast.ability.runes.chain;

  if (chain === null) {
    return [];
  }

  const candidates = unitsInCircle(ctx.state.units, cast.source, primary.position, chain.rangeUnits, "enemies");
  const chosen: UnitState[] = [];

  for (const candidate of candidates) {
    if (chosen.length >= chain.extraTargets) {
      break;
    }

    if (!alreadyHit.has(candidate.unitId) && candidate.untargetableUntilTick === 0) {
      chosen.push(candidate);
    }
  }

  return chosen;
}

function scheduleEcho(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState): void {
  const echo = cast.ability.runes.echo;

  if (echo === null || cast.flags.reaction) {
    return;
  }

  const crowned = findPassive(cast.source, "crown-of-echoes") !== null;

  ctx.state.echoes.push({
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    targetUnitId: primaryTarget.unitId,
    castAtTick: ctx.state.tick + echo.delayTicks,
    scale: crowned ? cast.scale : cast.scale * echo.fraction,
    causeSequence: cast.castSequence,
  });
}

function rollTwincast(ctx: ResolutionContext, cast: CastInfo): void {
  const chance = cast.ability.runes.twincast;

  if (chance <= 0 || cast.flags.reaction || nextFloat(ctx.state.rng) >= chance) {
    return;
  }

  ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: cast.source.unitId, passive: "twincast" });
  ctx.triggered.push({
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    scale: 1,
    flags: echoFlags(cast.source),
    causeSequence: cast.castSequence,
  });
}

function rotate(direction: Vector2, degrees: number): Vector2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return { x: direction.x * cos - direction.y * sin, y: direction.x * sin + direction.y * cos };
}

function forkBranches(ctx: ResolutionContext, cast: CastInfo, targets: readonly UnitState[], center: Vector2, hitIds: Set<UnitId>): number {
  const fork = cast.ability.runes.fork;
  const area = cast.ability.area;
  const first = targets.find((target) => target.teamId !== cast.source.teamId);

  if (fork === null || cast.flags.reaction || area?.kind !== "line" || first === undefined) {
    return 0;
  }

  const heading = directionTo(cast.source.position, center);
  const branchCast = { ...cast, scale: cast.scale * fork.fraction };
  let damage = 0;

  for (let index = 0; index < fork.branches; index += 1) {
    const side = index % 2 === 0 ? 1 : -1;
    const spread = fork.angleDegrees * (1 + Math.floor(index / 2));
    const direction = rotate(heading, side * spread);
    const from = { x: first.position.x, y: first.position.y };
    const toward = { x: from.x + direction.x, y: from.y + direction.y };

    for (const victim of unitsInRay(ctx.state.units, cast.source, from, toward, fork.lengthUnits, area.widthUnits, "enemies")) {
      if (hitIds.has(victim.unitId)) {
        continue;
      }

      hitIds.add(victim.unitId);
      damage += resolveOnTarget(ctx, branchCast, victim, cast.ability.effects);
    }
  }

  return damage;
}

function landedOnEnemies(ctx: ResolutionContext, cast: CastInfo, targets: readonly UnitState[], firstEvent: number): number {
  if (!cast.ability.effects.some((effect) => effect.kind === "taunt")) {
    return targets.filter((target) => target.teamId !== cast.source.teamId).length;
  }

  let taunts = 0;

  for (let index = firstEvent; index < ctx.events.length; index += 1) {
    const event = ctx.events[index];

    if (event?.kind === "status-applied" && event.status === "taunted" && event.sourceUnitId === cast.source.unitId) {
      taunts += 1;
    }
  }

  return taunts;
}

export function resolveCastPayload(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState | null, center: Vector2): void {
  const { ability, source } = cast;
  const side = sideFor(ability.targetPolicy === "lowest-hp-fraction-ally");
  let targets: UnitState[] = [];

  if (ability.area !== undefined) {
    targets = unitsInArea(ctx.state.units, source, ability.area, center, side);
  } else if (primaryTarget !== null) {
    targets = [primaryTarget];
  }

  if (ability.consumesTarget === true && primaryTarget !== null) {
    targets = targets.filter((target) => target.unitId !== primaryTarget.unitId);
  }

  if (ability.maxTargets !== undefined) {
    targets = targets.slice(0, ability.maxTargets);
  }

  const hitIds = new Set<UnitId>();
  let damage = 0;
  const firstEvent = ctx.events.length;

  for (const target of targets) {
    hitIds.add(target.unitId);
    damage += resolveOnTarget(ctx, cast, target, ability.effects);
  }

  if (ability.casterShieldPerTarget !== undefined && source.alive) {
    const enemiesHit = landedOnEnemies(ctx, cast, targets, firstEvent);

    if (enemiesHit > 0) {
      const granted = Math.round(source.maxHp * ability.casterShieldPerTarget.maxHpFraction * enemiesHit * cast.scale);
      const amount = Math.max(granted, source.shield?.amount ?? 0);
      const expiresAtTick = Math.max(ctx.state.tick + ability.casterShieldPerTarget.durationTicks, source.shield?.expiresAtTick ?? 0);
      source.shield = { amount, expiresAtTick };

      ctx.events.push({
        kind: "shield-applied",
        tick: ctx.state.tick,
        sequence: ctx.nextSequence(),
        causeSequence: cast.castSequence,
        sourceUnitId: source.unitId,
        targetUnitId: source.unitId,
        abilityId: ability.id,
        amount,
        expiresAtTick,
      });
    }
  }

  if (ability.secondary !== undefined) {
    for (const target of unitsInArea(ctx.state.units, source, ability.secondary.area, center, "enemies")) {
      damage += resolveOnTarget(ctx, cast, target, ability.secondary.effects);
    }
  }

  if (ability.allyEffects !== undefined && ability.area !== undefined) {
    for (const ally of unitsInArea(ctx.state.units, source, ability.area, center, "allies")) {
      resolveOnTarget(ctx, cast, ally, ability.allyEffects);
    }
  }

  if (ability.consumesTarget === true && primaryTarget !== null && primaryTarget.summonerUnitId === source.unitId && primaryTarget.alive) {
    primaryTarget.alive = false;
    primaryTarget.hp = 0;
    reportDeath(ctx, primaryTarget, null);
  }

  if (ability.zone !== undefined && ability.delayTicks === undefined && cast.scale >= 1) {
    createZone(ctx, source, ability, ability.area?.kind === "circle" && ability.area.center === "self" ? source.position : center);
  }

  damage += forkBranches(ctx, cast, targets, center, hitIds);

  if (!cast.flags.reaction && primaryTarget !== null) {
    for (const extra of chainTargets(ctx, cast, primaryTarget, hitIds)) {
      damage += resolveOnTarget(ctx, { ...cast, scale: cast.scale * (ability.runes.chain?.fraction ?? 1) }, extra, ability.effects);
    }
  }

  if (ability.runes.leech > 0 && damage > 0 && source.alive) {
    heal(ctx, source, source, damage * ability.runes.leech, "leech", cast.castSequence);
  }
}

export function resolveCast(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState): void {
  const { ability, source } = cast;

  scheduleEcho(ctx, cast, primaryTarget);
  rollTwincast(ctx, cast);

  if (ability.delayTicks !== undefined && ability.delayTicks > 0) {
    scheduleImpact(ctx, cast, primaryTarget.position);

    return;
  }

  if (ability.blinkBehindTarget === true && primaryTarget.unitId !== source.unitId) {
    blinkBehind(ctx, source, primaryTarget);
  }

  if (ability.channel !== undefined && cast.scale >= 1) {
    startChannel(ctx, source, ability, cast.castSequence);
  }

  resolveCastPayload(ctx, cast, primaryTarget, primaryTarget.position);
}

function startChannel(ctx: ResolutionContext, source: UnitState, ability: CompiledAbility, castSequence: number): void {
  const channel = ability.channel;

  if (channel === undefined) {
    return;
  }

  const tick = ctx.state.tick;
  source.control = null;
  source.slow = null;
  source.taunt = null;
  source.channel = {
    abilityId: ability.id,
    castSequence,
    endsAtTick: tick + channel.durationTicks,
    nextPulseTick: tick,
    periodTicks: channel.periodTicks,
    radiusUnits: channel.radiusUnits,
    effects: channel.effects,
  };

  ctx.events.push({
    kind: "status-applied",
    tick,
    sequence: ctx.nextSequence(),
    causeSequence: castSequence,
    sourceUnitId: source.unitId,
    targetUnitId: source.unitId,
    status: "channeling",
    expiresAtTick: tick + channel.durationTicks,
  });
}

const SUMMON_RING_DIRECTIONS: readonly Vector2[] = [
  { x: 0, y: -1 },
  { x: 0.7071, y: -0.7071 },
  { x: -0.7071, y: -0.7071 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0.7071, y: 0.7071 },
  { x: -0.7071, y: 0.7071 },
  { x: 0, y: 1 },
];

const SUMMON_RING_UNITS = 10;

const SUMMON_CLEARANCE_UNITS = 6;

function queueSummons(ctx: ResolutionContext, source: UnitState, effect: Extract<EffectDefinition, { kind: "summon" }>, anchor: UnitState): void {
  for (let index = 0; index < effect.count; index += 1) {
    ctx.spawns.push({
      summonerUnitId: source.unitId,
      teamId: source.teamId,
      heroId: effect.heroId,
      anchor: { x: anchor.position.x, y: anchor.position.y },
      maxActive: effect.maxActive ?? null,
      hpScale: effect.hpScale ?? 1,
      damageScale: effect.damageScale ?? 1,
      shieldFraction: effect.shieldFraction ?? 0,
      passives: effect.passives ?? [],
      itemIds: [],
    });
  }
}

function spawnPosition(ctx: ResolutionContext, spawn: PendingSpawn): Vector2 {
  const facing = spawn.anchor.y > ctx.state.arenaHeight / 2 ? 1 : -1;
  let fallback: Vector2 | null = null;

  for (const direction of SUMMON_RING_DIRECTIONS) {
    const candidate = clampToArena(
      { x: spawn.anchor.x + direction.x * SUMMON_RING_UNITS, y: spawn.anchor.y + direction.y * facing * SUMMON_RING_UNITS },
      ctx.state.arenaWidth,
      ctx.state.arenaHeight,
    );

    fallback ??= candidate;

    if (ctx.state.units.every((unit) => !unit.alive || distance(unit.position, candidate) >= SUMMON_CLEARANCE_UNITS)) {
      return candidate;
    }
  }

  return fallback ?? { x: spawn.anchor.x, y: spawn.anchor.y };
}

function dismissOldest(ctx: ResolutionContext, spawn: PendingSpawn): void {
  if (spawn.maxActive === null) {
    return;
  }

  const active = ctx.state.units.filter(
    (unit) => unit.alive && unit.summonerUnitId === spawn.summonerUnitId && unit.heroId === spawn.heroId,
  );

  for (let index = 0; index <= active.length - spawn.maxActive; index += 1) {
    const oldest = active[index];

    if (oldest !== undefined) {
      oldest.alive = false;
      oldest.hp = 0;
      ctx.reportedDeaths.add(oldest.unitId);
      ctx.events.push({ kind: "unit-dismissed", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: oldest.unitId });
    }
  }
}

function sharedSwarmItems(ctx: ResolutionContext, summoner: UnitState): string[] {
  return (summoner.build.itemIds ?? []).filter(
    (itemId) => !(ctx.catalogue.upgrades[itemId]?.grantsPassives ?? []).some((passive) => passive.kind === "heart-of-the-swarm"),
  );
}

export function applySpawns(ctx: ResolutionContext): void {
  const spawns = ctx.spawns;
  ctx.spawns = [];

  for (const spawn of spawns) {
    const hero = ctx.catalogue.heroes[spawn.heroId];
    const summoner = findUnit(ctx.state, spawn.summonerUnitId);

    if (hero === undefined || summoner === null) {
      continue;
    }

    dismissOldest(ctx, spawn);

    let hpScale = spawn.hpScale;
    let shieldFraction = spawn.shieldFraction;
    const passives = [...spawn.passives];

    for (const empower of passivesOfKind(summoner, "empower-summons")) {
      if (empower.heroId === spawn.heroId) {
        hpScale *= empower.hpScale ?? 1;
        shieldFraction = Math.max(shieldFraction, empower.shieldFraction ?? 0);
        passives.push(...(empower.passives ?? []));
      }
    }

    const unitId = `${spawn.summonerUnitId}.${spawn.heroId}.${ctx.state.nextEntityId}`;
    ctx.state.nextEntityId += 1;
    summoner.memory.summonsRaised += 1;

    const itemIds = findPassive(summoner, "heart-of-the-swarm") === null ? spawn.itemIds : sharedSwarmItems(ctx, summoner);
    const baseBuild = createHeroBuild(unitId, spawn.heroId, [], ctx.catalogue);
    const build = itemIds.length === 0 ? baseBuild : withEquipment(baseBuild, itemIds, []);
    const compiled = compileBuild(build, ctx.catalogue);
    const position = spawnPosition(ctx, spawn);
    const unit = createUnitState(unitId, spawn.teamId, build, position, hero, compiled, spawn.summonerUnitId);

    unit.maxHp = Math.max(1, Math.round(unit.maxHp * hpScale));
    unit.hp = unit.maxHp;
    unit.damageMultiplier *= spawn.damageScale;
    unit.passives = [...unit.passives, ...passives];

    if (shieldFraction > 0) {
      unit.shield = { amount: Math.round(unit.maxHp * shieldFraction), expiresAtTick: DEFAULT_TICK_LIMIT * 2 };
    }

    ctx.state.units.push(unit);
    ctx.state.resolutionPriority.push(unitId);

    ctx.events.push({
      kind: "unit-spawned",
      tick: ctx.state.tick,
      sequence: ctx.nextSequence(),
      unitId,
      heroId: spawn.heroId,
      teamId: spawn.teamId,
      summonerUnitId: spawn.summonerUnitId,
      position: { x: position.x, y: position.y },
    });
  }
}

export function isEvaded(ctx: ResolutionContext, source: UnitState, target: UnitState, castSequence: number): boolean {
  const evasion = findPassive(target, "evasion");

  if (evasion === null || evasion.chance <= 0) {
    return false;
  }

  if (nextFloat(ctx.state.rng) >= Math.min(MAX_EVASION, evasion.chance)) {
    return false;
  }

  ctx.events.push({
    kind: "attack-evaded",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: castSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
  });

  return true;
}

export function applyDeferredMoves(ctx: ResolutionContext): void {
  for (const move of ctx.moves) {
    const unit = findUnit(ctx.state, move.unitId);

    if (unit === null || !unit.alive) {
      continue;
    }

    const from = { x: unit.position.x, y: unit.position.y };
    unit.position = { x: move.to.x, y: move.to.y };

    ctx.events.push({
      kind: "unit-moved",
      tick: ctx.state.tick,
      sequence: ctx.nextSequence(),
      unitId: unit.unitId,
      from,
      to: { x: move.to.x, y: move.to.y },
      reason: move.reason,
    });

    if (move.reason === "blink") {
      springSentinelWard(ctx, unit);
    }
  }

  ctx.moves = [];
}

function springSentinelWard(ctx: ResolutionContext, arrival: UnitState): void {
  for (const holder of ctx.state.units) {
    const ward = holder.alive && holder.teamId !== arrival.teamId && !holder.memory.sentinelUsed ? findPassive(holder, "sentinel-ward") : null;

    if (ward === null || !isWithinRange(distance(holder.position, arrival.position), ward.radiusUnits)) {
      continue;
    }

    holder.memory.sentinelUsed = true;
    const causeSequence = ctx.nextSequence();
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: causeSequence, unitId: holder.unitId, passive: "sentinel-ward" });
    applyControl(ctx, holder, arrival, "stunned", ward.stunTicks, causeSequence);

    return;
  }
}

export function payHp(ctx: ResolutionContext, unit: UnitState, amount: number, reason: HpPaymentReason): void {
  const paid = Math.min(Math.max(0, unit.hp - 1), Math.round(amount));

  if (!unit.alive || paid <= 0) {
    return;
  }

  unit.hp -= paid;
  ctx.events.push({ kind: "hp-paid", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId, amount: paid, reason });
}

export function reflectSignature(ctx: ResolutionContext, caster: UnitState, ability: CompiledAbility, holder: UnitState): boolean {
  if (!holder.alive || holder.teamId === caster.teamId || holder.memory.mirrorUsed || findPassive(holder, "obsidian-mirror") === null) {
    return false;
  }

  holder.memory.mirrorUsed = true;
  ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: holder.unitId, passive: "obsidian-mirror" });

  const reflected = holder.abilities[ability.id] ?? ability;
  holder.abilities[ability.id] = reflected;

  const castSequence = ctx.nextSequence();

  ctx.events.push({
    kind: "cast",
    tick: ctx.state.tick,
    sequence: castSequence,
    sourceUnitId: holder.unitId,
    abilityId: reflected.id,
    targetUnitId: caster.unitId,
    isBasicAttack: false,
    triggered: true,
  });

  resolveCast(ctx, { source: holder, ability: reflected, castSequence, isBasicAttack: false, scale: 1, flags: CAST_FLAGS }, caster);

  return true;
}
