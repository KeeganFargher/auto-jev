import type { UnitId } from "../ids.js";
import { ABILITY_SKILL, ULTIMATE_SKILL } from "../definitions.js";
import type {
  BounceDefinition,
  ComboKind,
  ConditionKind,
  ControlKind,
  DotKind,
  EffectDefinition,
  EmitterDefinition,
  PandemicSpread,
  PassiveDefinition,
  PassiveKind,
  School,
  FormDefinition,
  PullDefinition,
  RaiseArmyEffect,
  ShowerDefinition,
  SplitDefinition,
  ZoneDefinition,
} from "../definitions.js";
import type { BattleEvent, DamageDealtEvent, HpPaymentReason } from "./events.js";
import type { ActiveBomb, ActiveEmitter, ActiveForm, ActiveShower, BattleState, CastStun, PendingBlessedBurst, PendingBurst, RepeatKind, UnitState } from "./state.js";
import { isUnstoppable, isUntargetable, type BlessedShield, type ChannelStatus, type DotStatus, type GraveMarkStatus, type LinkStatus } from "./statuses.js";
import type { Catalogue } from "../definitions.js";
import type { ArmedGem, CompiledAbility } from "../builds/compile-build.js";
import { MAX_SLOW_FRACTION, compileBuild } from "../builds/compile-build.js";
import { createHeroBuild, withEquipment, type HeroBuild } from "../builds/state.js";
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
import {
  creditBoundDamage,
  fireDetonationTriggers,
  fireTriggers,
  gainStacks,
  isAtStackMax,
  scheduleFreeCast,
  scheduleMulticast,
  scheduleMultistrike,
  scheduleShadowClone,
  stackControlImmune,
  trackDamageTaken,
  grantDashBuffs,
} from "./triggers.js";
import { cancelSequences, startSequence } from "./sequences.js";
import { findDensestEnemyCluster, findLowestHpFractionAlly, isCorpse, isExplodable, isRevivable } from "./targeting.js";

export const MAX_EVASION = 0.25;

export const BLINK_OFFSET_UNITS = 8;

export const CLEAVE_RADIUS_UNITS = 10;

export const SHIELD_STACK_CAP = 0.3;

const PULL_CLEARANCE_UNITS = 7;

export const PLAGUE_BURST = "plague-burst";

export const BLESSED_BURST = "blessed-burst";

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

export const REACTION_FLAGS: HitFlags = {
  canApplyConditions: false,
  canDetonate: false,
  canTriggerPassives: false,
  canCrit: false,
  ignoresArmor: false,
  reaction: true,
};

export const DOT_FLAGS: HitFlags = { ...REACTION_FLAGS, ignoresArmor: true };

export const PUPPET_FLAGS: HitFlags = { ...CAST_FLAGS, canApplyConditions: false, canDetonate: false, canTriggerPassives: false };

export const BURST_FLAGS: HitFlags = { ...REACTION_FLAGS, canApplyConditions: true };

export const ALL_SCHOOLS: readonly School[] = ["might", "arcana", "cunning"];

export interface DeferredMove {
  unitId: UnitId;
  to: Vector2;
  reason: "blink" | "dash" | "knockback" | "pull";
}

export interface ReactionCast {
  sourceUnitId: UnitId;
  abilityId: string;
  causeSequence: number;
  targetUnitId?: UnitId;
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
  build: HeroBuild | null;
  lifetimeTicks: number;
  corpseUnitId: UnitId | null;
  gems: ArmedGem[];
}

export interface ResolutionContext {
  state: BattleState;
  catalogue: Catalogue;
  events: BattleEvent[];
  nextSequence: () => number;
  moves: DeferredMove[];
  reactions: ReactionCast[];
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
  critBonus: number;
  repeat: RepeatKind | "multistrike" | null;
  triggered?: true;
  stun?: CastStun;
  origin?: CastOrigin;
  consumedMaxHp?: number;
}

export interface CastOrigin {
  position: Vector2;
  reachUnits: number;
}

export function withStun(cast: CastInfo, stun: CastStun | null): CastInfo {
  return stun === null ? cast : { ...cast, stun };
}

export interface HitRequest {
  source: UnitState;
  target: UnitState;
  amount: number;
  abilityId: string;
  causeSequence: number;
  school: School | null;
  isAttack: boolean;
  flags: HitFlags;
  critBonus?: number;
  dot?: DotKind;
  alreadyScaled?: boolean;
  linkEcho?: boolean;
}

export interface HitOutcome {
  hpLost: number;
  shieldAbsorbed: number;
  combo: ComboKind | null;
  crit: boolean;
}

export interface DeathCause {
  killer: UnitState | null;
  abilityId: string | null;
  causeSequence: number;
}

const NO_HIT: HitOutcome = { hpLost: 0, shieldAbsorbed: 0, combo: null, crit: false };

export function createResolutionContext(state: BattleState, events: BattleEvent[], nextSequence: () => number, catalogue: Catalogue): ResolutionContext {
  return { state, catalogue, events, nextSequence, moves: [], reactions: [], spawns: [], reportedDeaths: new Set() };
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

export function passivesOfKind<K extends PassiveKind>(unit: UnitState, kind: K): Extract<PassiveDefinition, { kind: K }>[] {
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

export function isAttackCast(cast: CastInfo): boolean {
  return cast.ability.hitType === "attack";
}

function castSchool(cast: CastInfo): School | null {
  return cast.ability.school ?? cast.source.school;
}

function sideFor(policyAlly: boolean): AreaSide {
  return policyAlly ? "allies" : "enemies";
}

function rollDamage(state: BattleState, amount: number, maxAmount: number | undefined): number {
  if (maxAmount === undefined || maxAmount <= amount) {
    return amount;
  }

  return amount + nextInt(state.rng, maxAmount - amount + 1);
}

function rollStrike(state: BattleState, source: UnitState, scale: number): number {
  const basic = source.abilities[source.basicAttackId];
  let amount = 0;

  for (const effect of basic?.effects ?? []) {
    if (effect.kind === "damage") {
      amount += rollDamage(state, effect.amount, effect.maxAmount);
    }
  }

  return amount * scale;
}

function canDetonate(source: UnitState, abilityId: string, school: School | null, condition: ConditionKind, conditionSource: UnitId, resonant: boolean): boolean {
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
    if (passive.abilityIds !== undefined && !passive.abilityIds.some((token) => resolveSkillToken(source, token) === abilityId)) {
      continue;
    }

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

function markMultiplier(unit: UnitState, tick: number): number {
  let bonus = 0;

  for (const mark of unit.marks) {
    if (mark.expiresAtTick > tick) {
      bonus += mark.bonus;
    }
  }

  return 1 + bonus;
}

export interface WitheringCut {
  healing: number;
  mana: number;
}

const NO_WITHERING: WitheringCut = { healing: 0, mana: 0 };

export function witheringOn(state: BattleState, unit: UnitState): WitheringCut {
  if (findPassive(unit, "blight-ward") !== null) {
    return NO_WITHERING;
  }

  for (const dot of unit.dots) {
    if (dot.dot !== "poison") {
      continue;
    }

    const holder = findUnit(state, dot.sourceUnitId);
    const withering = holder === null ? null : findPassive(holder, "withering");

    if (withering !== null) {
      const strength = withering.fullAtStacks === undefined ? 1 : Math.min(1, dot.stacks / withering.fullAtStacks);

      return { healing: withering.healingReduction * strength, mana: withering.manaReduction * strength };
    }
  }

  return NO_WITHERING;
}

export function manaGainMultiplier(state: BattleState, unit: UnitState): number {
  return 1 - witheringOn(state, unit).mana;
}

export function gainMana(state: BattleState, unit: UnitState, amount: number): void {
  if (unit.maxMana <= 0 || unit.form?.definition.locksMana === true) {
    return;
  }

  unit.mana = Math.min(unit.maxMana, unit.mana + amount * manaGainMultiplier(state, unit));
}

export function stackAttackSpeed(unit: UnitState): number {
  let bonus = 0;

  for (const passive of passivesOfKind(unit, "stacks")) {
    bonus += (unit.memory.stacks[passive.key] ?? 0) * passive.attackSpeedPerStack;
  }

  return bonus;
}

export function attackSpeedBonusFor(state: BattleState, unit: UnitState): number {
  let bonus = unit.attackSpeedBonus + stackAttackSpeed(unit) + (unit.form?.definition.attackSpeedBonus ?? 0);

  for (const buff of unit.speedBuffs) {
    if (buff.expiresAtTick > state.tick) {
      bonus += buff.bonus;
    }
  }

  return bonus + overclockBonus(state.units, unit);
}

type OverclockPassive = Extract<PassiveDefinition, { kind: "overclock" }>;

export function overclockOf(units: readonly UnitState[], unit: UnitState): OverclockPassive | null {
  const summoner = unit.summonerUnitId === null ? undefined : units.find((candidate) => candidate.unitId === unit.summonerUnitId);
  const overclock = summoner === undefined ? null : findPassive(summoner, "overclock");

  return overclock !== null && overclock.heroId === unit.heroId ? overclock : null;
}

export function overclockBonus(units: readonly UnitState[], unit: UnitState): number {
  const overclock = overclockOf(units, unit);

  return overclock === null ? 0 : Math.min(overclock.maxBonus, Math.floor(unit.memory.overclockTicks / TICK_RATE) * overclock.bonusPerSecond);
}

export function updateOverclock(state: BattleState): void {
  for (const unit of state.units) {
    const overclock = unit.alive ? overclockOf(state.units, unit) : null;

    if (overclock === null) {
      continue;
    }

    const partnered = state.units.some(
      (other) =>
        other.alive &&
        other.unitId !== unit.unitId &&
        other.summonerUnitId === unit.summonerUnitId &&
        other.heroId === unit.heroId &&
        isWithinRange(distance(unit.position, other.position), overclock.rangeUnits),
    );

    unit.memory.overclockTicks = partnered ? unit.memory.overclockTicks + 1 : 0;
  }
}

export function heal(ctx: ResolutionContext, source: UnitState, target: UnitState, amount: number, abilityId: string, causeSequence: number): number {
  if (!target.alive || amount <= 0 || findPassive(target, "unhealable") !== null) {
    return 0;
  }

  const received = amount * (1 - witheringOn(ctx.state, target).healing);
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

  blessOverflow(ctx, source, target, Math.round(received) - healed, causeSequence);

  return healed;
}

function blessOverflow(ctx: ResolutionContext, source: UnitState, target: UnitState, overflow: number, causeSequence: number): void {
  const blessing = overflow > 0 && target.alive ? findPassive(source, "blessed-overflow") : null;

  if (blessing === null) {
    return;
  }

  const current = target.shield?.amount ?? 0;
  const added = Math.min(overflow, Math.round(target.maxHp * blessing.capMaxHpFraction) - current);

  if (added <= 0) {
    return;
  }

  const amount = current + added;
  const expiresAtTick = Math.max(ctx.state.tick + blessing.durationTicks, target.shield?.expiresAtTick ?? 0);
  const peak = Math.max(amount, target.shield?.blessed?.peak ?? 0);
  target.shield = { amount, expiresAtTick, blessed: { sourceUnitId: source.unitId, peak } };

  ctx.events.push({
    kind: "shield-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    abilityId: "blessed-overflow",
    amount,
    expiresAtTick,
  });
}

function queueBlessedBurst(ctx: ResolutionContext, ally: UnitState, blessed: BlessedShield | null, causeSequence: number): void {
  const blesser = blessed === null ? null : findUnit(ctx.state, blessed.sourceUnitId);
  const blessing = blesser === null ? null : findPassive(blesser, "blessed-overflow");

  if (blessed === null || blesser === null || blessing === null) {
    return;
  }

  ctx.state.blessedBursts.push({
    allyUnitId: ally.unitId,
    sourceUnitId: blesser.unitId,
    amount: blessed.peak * blessing.burstFraction,
    dueTick: ctx.state.tick + 1,
    causeSequence,
  });
}

export function blessedBurst(ctx: ResolutionContext, burst: PendingBlessedBurst): void {
  const source = findUnit(ctx.state, burst.sourceUnitId);
  const ally = findUnit(ctx.state, burst.allyUnitId);
  const blessing = source === null ? null : findPassive(source, "blessed-overflow");

  if (source === null || ally === null || blessing === null) {
    return;
  }

  const tick = ctx.state.tick;
  const center = { x: ally.position.x, y: ally.position.y };
  const sequence = ctx.nextSequence();

  ctx.events.push({
    kind: "impact-landed",
    tick,
    sequence,
    sourceUnitId: source.unitId,
    abilityId: BLESSED_BURST,
    center,
    radiusUnits: blessing.burstRadiusUnits,
  });
  ctx.events.push({ kind: "passive-triggered", tick, sequence: ctx.nextSequence(), unitId: source.unitId, passive: "blessed-overflow", targetUnitId: ally.unitId });

  for (const victim of unitsInCircle(ctx.state.units, source, center, blessing.burstRadiusUnits, "enemies")) {
    dealHitAndReport(ctx, {
      source,
      target: victim,
      amount: burst.amount,
      abilityId: BLESSED_BURST,
      causeSequence: sequence,
      school: source.school,
      isAttack: false,
      flags: REACTION_FLAGS,
      alreadyScaled: true,
    });
  }
}

export function applyControl(ctx: ResolutionContext, source: UnitState, target: UnitState, control: ControlKind, durationTicks: number, causeSequence: number): void {
  if (!target.alive || target.invulnerableUntilTick !== 0 || isUnstoppable(target) || stackControlImmune(target)) {
    return;
  }

  if (target.channel !== null) {
    target.channel = null;
    ctx.events.push({ kind: "status-expired", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: target.unitId, status: "channel" });
  }

  const expiresAtTick = Math.max(target.control?.expiresAtTick ?? 0, ctx.state.tick + durationTicks);
  target.control = { control, sourceUnitId: source.unitId, expiresAtTick };
  cancelSequences(ctx, target.unitId);

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
  if (isUnstoppable(target)) {
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
  const uncapped = effect.maxStacks === undefined || (effect.dot === "poison" && findPassive(source, "virulence") !== null);

  addDotStacks(ctx, source, target, effect.dot, effect.stacks, effect.damagePerStackPerSecond, effect.durationTicks, uncapped ? null : (effect.maxStacks ?? null), causeSequence);
}

function addDotStacks(
  ctx: ResolutionContext,
  source: UnitState,
  target: UnitState,
  dot: DotKind,
  stacks: number,
  damagePerStackPerSecond: number,
  durationTicks: number,
  maxStacks: number | null,
  causeSequence: number,
): void {
  if (!target.alive || target.invulnerableUntilTick !== 0) {
    return;
  }

  const tick = ctx.state.tick;
  const expiresAtTick = tick + durationTicks;
  const existing = target.dots.find((candidate) => candidate.dot === dot && candidate.sourceUnitId === source.unitId);

  if (existing === undefined) {
    const status: DotStatus = { dot, sourceUnitId: source.unitId, stacks: 0, maxStacks, damagePerStackPerSecond, durationTicks, expiresAtTick, nextTickAt: tick + TICK_RATE };
    target.dots.push(status);
    changeDotStacks(ctx, source, target, status, stacks, causeSequence);

    return;
  }

  existing.maxStacks = existing.maxStacks === null || maxStacks === null ? null : Math.max(existing.maxStacks, maxStacks);
  const added = existing.maxStacks === null ? stacks : Math.max(0, Math.min(existing.maxStacks, existing.stacks + stacks) - existing.stacks);
  const blended = existing.stacks + added;

  if (blended > 0) {
    existing.damagePerStackPerSecond = (existing.damagePerStackPerSecond * existing.stacks + damagePerStackPerSecond * added) / blended;
  }

  existing.durationTicks = Math.max(existing.durationTicks, durationTicks);
  existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
  changeDotStacks(ctx, source, target, existing, existing.stacks + stacks, causeSequence);
}

function changeDotStacks(ctx: ResolutionContext, holder: UnitState, target: UnitState, dot: DotStatus, stacks: number, causeSequence: number): void {
  const before = dot.stacks;
  dot.stacks = dot.maxStacks === null ? stacks : Math.min(dot.maxStacks, stacks);

  ctx.events.push({
    kind: "status-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: holder.unitId,
    targetUnitId: target.unitId,
    status: dot.dot,
    expiresAtTick: dot.expiresAtTick,
    stacks: dot.stacks,
  });

  const virulence = dot.dot === "poison" ? findPassive(holder, "virulence") : null;

  if (virulence === null) {
    return;
  }

  if (before < virulence.conditionAtStacks && dot.stacks >= virulence.conditionAtStacks) {
    applyConditionTo(ctx, holder, target, virulence.condition, causeSequence);
  }

  queueBurst(ctx, holder, target, dot.stacks, burstThreshold(target, holder, virulence.burstAtStacks), causeSequence, true);
}

function burstThreshold(target: UnitState, holder: UnitState, normal: number): number {
  const lowered = target.pandemic !== null && target.pandemic.sourceUnitId === holder.unitId ? target.pandemic.burstAtStacks : null;

  return lowered === null ? normal : Math.min(normal, lowered);
}

function queueBurst(ctx: ResolutionContext, holder: UnitState, target: UnitState, stacks: number, threshold: number, causeSequence: number, spreads: boolean): void {
  const tick = ctx.state.tick;

  const locked = spreads && tick < target.burstLockedUntilTick;

  if (stacks < threshold || !holder.alive || !target.alive || locked || ctx.state.bursts.some((burst) => burst.targetUnitId === target.unitId && burst.spreads === spreads)) {
    return;
  }

  ctx.state.bursts.push({ targetUnitId: target.unitId, holderUnitId: holder.unitId, dueTick: tick + 1, causeSequence, spreads });
}

export function recheckBurst(ctx: ResolutionContext, holder: UnitState, target: UnitState, dot: DotStatus, causeSequence: number): void {
  const virulence = dot.dot === "poison" ? findPassive(holder, "virulence") : null;

  if (virulence !== null) {
    queueBurst(ctx, holder, target, dot.stacks, burstThreshold(target, holder, virulence.burstAtStacks), causeSequence, true);
  }
}

function heldPoison(target: UnitState, holder: UnitState): DotStatus | undefined {
  return target.dots.find((candidate) => candidate.dot === "poison" && candidate.sourceUnitId === holder.unitId);
}

function burstRecipients(ctx: ResolutionContext, holder: UnitState, target: UnitState, center: Vector2, radiusUnits: number, contagion: Extract<PassiveDefinition, { kind: "contagion" }> | null): UnitState[] {
  const others = (candidates: UnitState[]): UnitState[] => candidates.filter((candidate) => candidate.unitId !== target.unitId && candidate.invulnerableUntilTick === 0);

  if (contagion === null) {
    return others(unitsInCircle(ctx.state.units, holder, center, radiusUnits, "enemies"));
  }

  return others(unitsInCircle(ctx.state.units, holder, center, Number.POSITIVE_INFINITY, "enemies")).slice(0, contagion.targets);
}

export function burstPoison(ctx: ResolutionContext, burst: PendingBurst, strength: number): void {
  const holder = findUnit(ctx.state, burst.holderUnitId);
  const target = findUnit(ctx.state, burst.targetUnitId);

  if (holder === null || target === null || !holder.alive || !target.alive) {
    return;
  }

  const virulence = findPassive(holder, "virulence");
  const dot = heldPoison(target, holder);

  if (virulence === null || dot === undefined || dot.stacks <= 0) {
    return;
  }

  const tick = ctx.state.tick;
  const center = { x: target.position.x, y: target.position.y };
  const amount = (dot.stacks * dot.damagePerStackPerSecond * Math.max(0, dot.expiresAtTick - tick) * strength) / TICK_RATE;
  const contagion = findPassive(holder, "contagion");
  const recipients = burst.spreads ? burstRecipients(ctx, holder, target, center, virulence.spreadRadiusUnits, contagion) : [];
  const share = burst.spreads ? Math.min(dot.stacks, Math.floor(dot.stacks * (contagion?.fraction ?? virulence.spreadFraction))) : 0;
  const sequence = ctx.nextSequence();

  if (burst.spreads) {
    target.burstLockedUntilTick = tick + virulence.windowTicks;
  }

  ctx.events.push({
    kind: "impact-landed",
    tick,
    sequence,
    sourceUnitId: holder.unitId,
    abilityId: PLAGUE_BURST,
    center,
    radiusUnits: burst.spreads && contagion === null ? virulence.spreadRadiusUnits : 0,
  });
  ctx.events.push({ kind: "passive-triggered", tick, sequence: ctx.nextSequence(), unitId: holder.unitId, passive: "virulence", targetUnitId: target.unitId });

  if (share >= dot.stacks) {
    target.dots = target.dots.filter((candidate) => candidate !== dot);
    ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: target.unitId, status: "poison" });
  } else if (share > 0) {
    changeDotStacks(ctx, holder, target, dot, dot.stacks - share, sequence);
  }

  if (amount > 0) {
    dealHitAndReport(ctx, { source: holder, target, amount, abilityId: PLAGUE_BURST, causeSequence: sequence, school: null, isAttack: false, flags: DOT_FLAGS, dot: "poison" });
  }

  recipients.forEach((recipient, index) => {
    const stacks = Math.floor(share / recipients.length) + (index < share % recipients.length ? 1 : 0);

    if (stacks > 0) {
      addDotStacks(ctx, holder, recipient, "poison", stacks, dot.damagePerStackPerSecond, dot.durationTicks, null, sequence);
    }
  });
}

export function spreadEpidemic(ctx: ResolutionContext, holder: UnitState, carrier: UnitState, dot: DotStatus, spread: PandemicSpread, causeSequence: number): void {
  const virulence = findPassive(holder, "virulence");
  const floor = Math.min(Math.floor(dot.stacks * spread.fraction), virulence?.burstAtStacks ?? Number.POSITIVE_INFINITY);

  if (!holder.alive || floor <= 0) {
    return;
  }

  for (const neighbour of unitsInCircle(ctx.state.units, holder, carrier.position, spread.radiusUnits, "enemies")) {
    const held = neighbour.unitId === carrier.unitId ? floor : (heldPoison(neighbour, holder)?.stacks ?? 0);

    if (held < floor) {
      addDotStacks(ctx, holder, neighbour, "poison", floor - held, dot.damagePerStackPerSecond, dot.durationTicks, null, causeSequence);
    }
  }
}

function applyPandemic(ctx: ResolutionContext, source: UnitState, target: UnitState, effect: Extract<EffectDefinition, { kind: "pandemic" }>, causeSequence: number): void {
  if (!target.alive || target.teamId === source.teamId || target.invulnerableUntilTick !== 0) {
    return;
  }

  const tick = ctx.state.tick;
  const expiresAtTick = tick + effect.durationTicks;
  target.pandemic = {
    sourceUnitId: source.unitId,
    expiresAtTick,
    tickRateMultiplier: effect.tickRateMultiplier,
    spread: effect.spread ?? null,
    burstAtStacks: effect.burstAtStacks ?? null,
  };

  ctx.events.push({
    kind: "status-applied",
    tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    status: "pandemic",
    expiresAtTick,
  });

  const dot = heldPoison(target, source);

  if (dot === undefined) {
    return;
  }

  dot.nextTickAt = Math.min(dot.nextTickAt, tick + dotPeriod(target, dot));
  changeDotStacks(ctx, source, target, dot, Math.round(dot.stacks * effect.stackMultiplier), causeSequence);

  if (effect.burstAtStacks !== undefined) {
    queueBurst(ctx, source, target, dot.stacks, effect.burstAtStacks, causeSequence, false);
  }
}

export function dotPeriod(unit: UnitState, dot: DotStatus): number {
  const pandemic = unit.pandemic;

  return pandemic === null || pandemic.sourceUnitId !== dot.sourceUnitId ? TICK_RATE : Math.max(1, Math.round(TICK_RATE / pandemic.tickRateMultiplier));
}

export function settleTether(ctx: ResolutionContext): void {
  for (const unitId of ctx.state.resolutionPriority) {
    const unit = findUnit(ctx.state, unitId);

    if (unit === null || unit.memory.tetherPending <= 0) {
      continue;
    }

    const amount = unit.memory.tetherPending;
    unit.memory.tetherPending = 0;
    const ally = unit.alive ? findLowestHpFractionAlly(unit, ctx.state.units) : null;

    if (ally !== null) {
      heal(ctx, unit, ally, amount, findPassive(unit, "crusader") === null ? "toxic-tether" : "crusader", ctx.nextSequence());
    }
  }
}

function applyTaunt(ctx: ResolutionContext, source: UnitState, target: UnitState, durationTicks: number, causeSequence: number): boolean {
  if (!target.alive || target.invulnerableUntilTick !== 0 || isUnstoppable(target) || findPassive(target, "taunt-immune") !== null) {
    return false;
  }

  const expiresAtTick = ctx.state.tick + durationTicks;
  target.taunt = { byUnitId: source.unitId, expiresAtTick };
  target.targetUnitId = source.unitId;

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

function applyChill(ctx: ResolutionContext, source: UnitState, target: UnitState, stacks: number, causeSequence: number): void {
  const deepFreeze = findPassive(source, "deep-freeze");

  if (deepFreeze === null || !target.alive || target.invulnerableUntilTick !== 0 || target.teamId === source.teamId || target.control?.control === "frozen") {
    return;
  }

  const tick = ctx.state.tick;
  const held = target.chill !== null && target.chill.sourceUnitId === source.unitId ? target.chill.stacks : 0;
  const total = held + stacks;

  if (total < deepFreeze.chillsToFreeze) {
    const expiresAtTick = tick + deepFreeze.chillTicks;
    target.chill = { sourceUnitId: source.unitId, stacks: total, expiresAtTick };
    ctx.events.push({
      kind: "status-applied",
      tick,
      sequence: ctx.nextSequence(),
      causeSequence,
      sourceUnitId: source.unitId,
      targetUnitId: target.unitId,
      status: "chill",
      expiresAtTick,
      stacks: total,
    });

    return;
  }

  target.chill = null;
  ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: target.unitId, status: "chill" });
  ctx.events.push({ kind: "passive-triggered", tick, sequence: ctx.nextSequence(), unitId: source.unitId, passive: "deep-freeze", targetUnitId: target.unitId });
  applyControl(ctx, source, target, "frozen", deepFreeze.freezeTicks, causeSequence);
  applyConditionTo(ctx, source, target, deepFreeze.condition, causeSequence);
}

export function applyMark(ctx: ResolutionContext, source: UnitState, target: UnitState, bonus: number, durationTicks: number): void {
  if (target.alive && target.teamId !== source.teamId) {
    target.marks.push({ sourceUnitId: source.unitId, bonus, expiresAtTick: ctx.state.tick + durationTicks });
  }
}

function resetFromExecutioner(ctx: ResolutionContext, killer: UnitState, abilityId: string | null): void {
  const executioner = findPassive(killer, "executioner");

  if (executioner === null || abilityId === null || !executioner.fromAbilityIds.includes(abilityId)) {
    return;
  }

  killer.abilityCooldowns[executioner.resetsAbilityId] = ctx.state.tick;
  ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: killer.unitId, passive: "executioner" });
}

export function reportDeath(ctx: ResolutionContext, unit: UnitState, cause: DeathCause | null): void {
  if (unit.alive || ctx.reportedDeaths.has(unit.unitId)) {
    return;
  }

  ctx.reportedDeaths.add(unit.unitId);
  unit.memory.fellAtTick = ctx.state.tick;
  ctx.events.push({ kind: "death", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId });

  const heldLink = unit.link;
  const heldMark = unit.graveMark;
  const causeSequence = cause?.causeSequence ?? ctx.nextSequence();

  releaseUnit(ctx, unit);
  queueDetonation(ctx, unit);
  queueGraveChain(ctx, unit, heldMark, cause, causeSequence);
  harvestSoul(ctx, unit);
  deathPassives(ctx, unit, heldLink);
  fireTriggers(ctx, unit, "last-word", causeSequence);

  const killer = cause?.killer ?? null;

  if (killer !== null && killer.alive && killer.teamId !== unit.teamId) {
    raiseOnKill(ctx, killer, unit);

    queueVoidheart(ctx, unit, killer);
    resetFromExecutioner(ctx, killer, cause?.abilityId ?? null);
    fireTriggers(ctx, killer, "kill", causeSequence);
  }
}

function releaseUnit(ctx: ResolutionContext, unit: UnitState): void {
  unit.condition = null;
  unit.chill = null;
  unit.pandemic = null;
  unit.control = null;
  unit.taunt = null;
  unit.dots = [];
  unit.link = null;
  unit.channel = null;
  unit.graveMark = null;
  cancelSequences(ctx, unit.unitId, true);
}

export function removeUnit(ctx: ResolutionContext, unit: UnitState): void {
  unit.alive = false;
  unit.hp = 0;
  ctx.reportedDeaths.add(unit.unitId);
  releaseUnit(ctx, unit);
  ctx.events.push({ kind: "unit-dismissed", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId });
}

function queueDetonation(ctx: ResolutionContext, unit: UnitState): void {
  const detonation = findPassive(unit, "self-destruct");

  if (detonation !== null) {
    ctx.state.detonations.push({ unitId: unit.unitId, sourceUnitId: unit.unitId, abilityId: detonation.abilityId, dueTick: ctx.state.tick + detonation.delayTicks });
  }
}

function queueVoidheart(ctx: ResolutionContext, dead: UnitState, killer: UnitState): void {
  const voidheart = findPassive(killer, "voidheart");

  if (voidheart !== null) {
    ctx.state.detonations.push({ unitId: dead.unitId, sourceUnitId: killer.unitId, abilityId: voidheart.abilityId, dueTick: ctx.state.tick + voidheart.delayTicks });
  }
}

export function processDetonations(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.detonations.filter((detonation) => detonation.dueTick <= tick);

  if (due.length === 0) {
    return;
  }

  ctx.state.detonations = ctx.state.detonations.filter((detonation) => detonation.dueTick > tick);

  for (const detonation of due) {
    const body = findUnit(ctx.state, detonation.unitId);
    const source = findUnit(ctx.state, detonation.sourceUnitId);
    const ability = source?.abilities[detonation.abilityId];

    if (body === null || body.alive || source === null || ability === undefined || ability.area?.kind !== "circle") {
      continue;
    }

    const causeSequence = ctx.nextSequence();
    const cast: CastInfo = { source, ability, castSequence: causeSequence, isBasicAttack: false, scale: 1, flags: BURST_FLAGS, critBonus: 0, repeat: null, consumedMaxHp: body.maxHp };

    ctx.events.push({
      kind: "impact-landed",
      tick,
      sequence: causeSequence,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      center: { x: body.position.x, y: body.position.y },
      radiusUnits: ability.area.radiusUnits,
    });

    for (const victim of unitsInCircle(ctx.state.units, source, body.position, ability.area.radiusUnits, "enemies")) {
      resolveOnTarget(ctx, cast, victim, ability.effects);
    }

    if (isCorpse(body)) {
      spendCorpse(ctx, body);
    }
  }
}

function spendCorpse(ctx: ResolutionContext, corpse: UnitState): void {
  corpse.memory.corpseSpent = true;
  ctx.events.push({ kind: "corpse-spent", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: corpse.unitId });
}

function queueGraveChain(ctx: ResolutionContext, dead: UnitState, mark: GraveMarkStatus | null, cause: DeathCause | null, causeSequence: number): void {
  const killer = cause?.killer ?? null;
  const abilityId = cause?.abilityId ?? null;
  const blasted = killer !== null && abilityId !== null && killer.abilities[abilityId]?.consumes !== undefined ? { sourceUnitId: killer.unitId, abilityId } : null;
  const origin = blasted ?? (mark !== null && mark.expiresAtTick > ctx.state.tick ? mark : null);
  const source = origin === null ? null : findUnit(ctx.state, origin.sourceUnitId);
  const chain = source === null ? null : findPassive(source, "grave-chain");

  if (origin === null || source === null || chain === null || !source.alive || source.teamId === dead.teamId) {
    return;
  }

  ctx.state.corpseBlasts.push({ sourceUnitId: source.unitId, corpseUnitId: dead.unitId, abilityId: origin.abilityId, dueTick: ctx.state.tick + chain.delayTicks, causeSequence, scale: 1 });
}

function markGraves(ctx: ResolutionContext, cast: CastInfo, targets: readonly UnitState[]): void {
  const chain = findPassive(cast.source, "grave-chain");

  if (chain === null) {
    return;
  }

  const expiresAtTick = ctx.state.tick + chain.markTicks;

  for (const target of targets) {
    if (!target.alive || target.teamId === cast.source.teamId) {
      continue;
    }

    target.graveMark = { sourceUnitId: cast.source.unitId, abilityId: cast.ability.id, expiresAtTick };
    ctx.events.push({
      kind: "status-applied",
      tick: ctx.state.tick,
      sequence: ctx.nextSequence(),
      causeSequence: cast.castSequence,
      sourceUnitId: cast.source.unitId,
      targetUnitId: target.unitId,
      status: "grave-marked",
      expiresAtTick,
    });
  }
}

function raiseOnKill(ctx: ResolutionContext, killer: UnitState, dead: UnitState): void {
  const heroId = killer.form?.definition.raisesOnKill;

  if (heroId === undefined) {
    return;
  }

  ctx.spawns.push(summonSpawn(killer, heroId, dead.position, null));
}

function summonSpawn(summoner: UnitState, heroId: string, anchor: Vector2, maxActive: number | null): PendingSpawn {
  return {
    summonerUnitId: summoner.unitId,
    teamId: summoner.teamId,
    heroId,
    anchor: { x: anchor.x, y: anchor.y },
    maxActive,
    hpScale: 1,
    damageScale: 1,
    shieldFraction: 0,
    passives: [],
    itemIds: [],
    build: null,
    lifetimeTicks: 0,
    corpseUnitId: null,
    gems: [],
  };
}

export function processCorpseBlasts(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.corpseBlasts.filter((blast) => blast.dueTick <= tick);

  if (due.length === 0) {
    return;
  }

  ctx.state.corpseBlasts = ctx.state.corpseBlasts.filter((blast) => blast.dueTick > tick);

  for (const blast of due) {
    const source = findUnit(ctx.state, blast.sourceUnitId);
    const corpse = findUnit(ctx.state, blast.corpseUnitId);
    const ability = source?.abilities[blast.abilityId];

    if (source === null || corpse === null || ability === undefined || !source.alive || !isCorpse(corpse) || ability.area === undefined) {
      continue;
    }

    if (unitsInArea(ctx.state.units, source, ability.area, corpse.position, "enemies").length < (ability.minTargets ?? 1)) {
      continue;
    }

    const castSequence = ctx.nextSequence();

    ctx.events.push({
      kind: "cast",
      tick,
      sequence: castSequence,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      targetUnitId: corpse.unitId,
      isBasicAttack: false,
      triggered: true,
      trigger: "grave-chain",
    });

    resolveCastPayload(ctx, { source, ability, castSequence, isBasicAttack: false, scale: blast.scale, flags: CAST_FLAGS, critBonus: 0, repeat: null, triggered: true }, corpse, corpse.position);
  }
}

function harvestSoul(ctx: ResolutionContext, dead: UnitState): void {
  for (const harvester of ctx.state.units) {
    const harvest = harvester.alive && harvester.unitId !== dead.unitId && dead.summonerUnitId !== harvester.unitId ? findPassive(harvester, "harvest") : null;

    if (harvest === null) {
      continue;
    }

    harvester.memory.souls += 1;

    if (harvester.memory.souls < harvest.soulsPer) {
      continue;
    }

    harvester.memory.souls -= harvest.soulsPer;
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: harvester.unitId, passive: "harvest", targetUnitId: dead.unitId });
    ctx.spawns.push(summonSpawn(harvester, harvest.heroId, harvester.position, harvest.maxActive));
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
            isAttack: false,
            flags: REACTION_FLAGS,
            alreadyScaled: true,
            linkEcho: true,
          });
        }
      }
    }
  }
}

function shareLinkedDamage(ctx: ResolutionContext, hit: HitRequest, target: UnitState, link: LinkStatus, hpLost: number): void {
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
      isAttack: false,
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

  ctx.events.push({ kind: "revived", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: target.unitId, sourceUnitId: target.unitId, hp: target.hp });

  if (revive.form !== undefined) {
    enterForm(ctx, target, revive.form, target.basicAttackId, ctx.nextSequence());
  }

  if (revive.statueTicks !== undefined) {
    becomeStatue(ctx, target, revive.statueTicks);
  }

  return true;
}

function becomeStatue(ctx: ResolutionContext, unit: UnitState, durationTicks: number): void {
  const tick = ctx.state.tick;
  const expiresAtTick = tick + durationTicks;
  const causeSequence = ctx.nextSequence();
  unit.invulnerableUntilTick = Math.max(unit.invulnerableUntilTick, expiresAtTick);
  unit.untargetableUntilTick = Math.max(unit.untargetableUntilTick, expiresAtTick);
  unit.control = { control: "frozen", sourceUnitId: unit.unitId, expiresAtTick };
  unit.chill = null;

  if (unit.channel !== null) {
    unit.channel = null;
    ctx.events.push({ kind: "status-expired", tick, sequence: ctx.nextSequence(), unitId: unit.unitId, status: "channel" });
  }

  cancelSequences(ctx, unit.unitId);

  for (const status of ["frozen", "invulnerable", "untargetable"] as const) {
    ctx.events.push({ kind: "status-applied", tick, sequence: ctx.nextSequence(), causeSequence, sourceUnitId: unit.unitId, targetUnitId: unit.unitId, status, expiresAtTick });
  }
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
      isAttack: false,
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

  comboEffect(ctx, source, target, combo, tier, dealt, hit.causeSequence, false);
  echoOmen(ctx, hit, condition, combo, tier, bonus);

  const comboSplash = findPassive(source, "combo-splash");

  if (comboSplash !== null) {
    splash(ctx, source, target, dealt, comboSplash.radiusUnits, "combo-splash", hit.causeSequence);
  }

  rallyTeam(ctx, source);
  fireDetonationTriggers(ctx, source, hit.causeSequence);
}

function comboEffect(ctx: ResolutionContext, source: UnitState, target: UnitState, combo: ComboKind, tier: number, dealt: number, causeSequence: number, echo: boolean): void {
  switch (combo) {
    case "overload": {
      applyControl(ctx, source, target, "knocked-down", tier >= 2 ? TIER_TWO_OVERLOAD_KNOCKDOWN_TICKS : OVERLOAD_KNOCKDOWN_TICKS, causeSequence);

      if (tier >= 2 && !echo) {
        splash(ctx, source, target, dealt * TIER_TWO_OVERLOAD_SPLASH_FRACTION, OVERLOAD_SPLASH_RANGE_UNITS, "overload", causeSequence);
      }

      break;
    }

    case "shatter": {
      if (!echo) {
        const fraction = tier >= 2 ? TIER_TWO_SHATTER_SHARD_FRACTION : SHATTER_SHARD_FRACTION;
        splash(ctx, source, target, dealt * fraction, SHATTER_SHARD_RANGE_UNITS, "shatter", causeSequence);
      }

      break;
    }

    case "crush": {
      if (target.alive) {
        target.mana = tier >= 2 ? 0 : target.mana * (1 - CRUSH_MANA_DRAIN_FRACTION);

        if (tier >= 2) {
          applySlow(ctx, source, target, TIER_TWO_CRUSH_SLOW_FRACTION, TIER_TWO_CRUSH_SLOW_TICKS, "crush", causeSequence);
        }
      }

      break;
    }

    default: {
      const exhaustive: never = combo;

      void exhaustive;
    }
  }
}

function echoOmen(ctx: ResolutionContext, hit: HitRequest, condition: ConditionKind, combo: ComboKind, tier: number, bonus: number): void {
  const { source, target } = hit;
  const link = target.link;
  const binder = link === null || hit.linkEcho === true ? null : findUnit(ctx.state, link.sourceUnitId);

  if (link === null || binder === null || findPassive(binder, "ill-omen") === null) {
    return;
  }

  for (const other of ctx.state.units) {
    if (!other.alive || other.unitId === target.unitId || other.link?.linkId !== link.linkId) {
      continue;
    }

    ctx.events.push({
      kind: "combo-detonated",
      tick: ctx.state.tick,
      sequence: ctx.nextSequence(),
      causeSequence: hit.causeSequence,
      sourceUnitId: source.unitId,
      targetUnitId: other.unitId,
      condition,
      combo,
      tier,
      bonusDamage: Math.round(bonus),
      echo: true,
    });

    if (bonus > 0) {
      dealHitAndReport(ctx, {
        source,
        target: other,
        amount: bonus,
        abilityId: "ill-omen",
        causeSequence: hit.causeSequence,
        school: null,
        isAttack: false,
        flags: REACTION_FLAGS,
        alreadyScaled: hit.alreadyScaled === true,
        linkEcho: true,
      });
    }

    if (other.alive) {
      comboEffect(ctx, source, other, combo, tier, 0, hit.causeSequence, true);
    }
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
  const resonant = source.abilities[hit.abilityId]?.gems.resonance === true;

  const combo =
    held !== null && flags.canDetonate && canDetonate(source, hit.abilityId, hit.school, held.condition, held.sourceUnitId, resonant)
      ? COMBO_FOR_CONDITION[held.condition]
      : null;

  const tier = held === null || combo === null ? 0 : Math.max(1, state.comboTiers[source.teamId]?.[held.condition] ?? 1);

  let crit = false;
  let critMultiplier = 1;

  if (combo === "shatter") {
    crit = true;
    critMultiplier = SHATTER_CRIT_MULTIPLIER;
  } else if (flags.canCrit && hit.isAttack) {
    const chance = Math.min(1, critChanceAgainst(source, target) + (hit.critBonus ?? 0));

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
    amount *= source.damageMultiplier * (hit.isAttack ? source.attackDamageMultiplier : source.spellDamageMultiplier);
  }

  amount *= markMultiplier(target, state.tick) * (target.form?.definition.damageTakenMultiplier ?? 1);

  if (!flags.ignoresArmor) {
    amount *= 1 - target.armor;
  }

  const finalAmount = Math.max(0, Math.round(amount));
  const shieldAbsorbed = target.shield === null ? 0 : Math.min(target.shield.amount, finalAmount);

  if (target.shield !== null) {
    target.shield.amount -= shieldAbsorbed;

    if (target.shield.amount <= 0) {
      queueBlessedBurst(ctx, target, target.shield.blessed, hit.causeSequence);
      target.shield = null;
    }
  }

  let toHp = finalAmount - shieldAbsorbed;
  const floor = target.form?.definition.minHp;

  if (floor !== undefined && toHp > target.hp - floor) {
    toHp = Math.max(0, target.hp - floor);
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

  ctx.events.push(event);

  reviveIfPossible(ctx, target);

  if (hpLost > 0 && hit.linkEcho !== true && target.link !== null) {
    shareLinkedDamage(ctx, hit, target, target.link, hpLost);
  }

  const dealt = hpLost + shieldAbsorbed;

  creditBoundDamage(ctx, target, dealt);

  if (combo !== null && held !== null) {
    resolveCombo(ctx, hit, held.condition, combo, tier, dealt, bonus);
  }

  if (target.alive && target.maxMana > 0 && hpLost > 0) {
    target.mana = Math.min(target.maxMana, target.mana + (hpLost / target.maxHp) * 100 * manaGainMultiplier(state, target));
  }

  const tether = hit.dot === "poison" && dealt > 0 && source.alive ? findPassive(source, "toxic-tether") : null;

  if (tether !== null) {
    source.memory.tetherPending += dealt * tether.fraction;
  }

  const crusader = hit.isAttack && dealt > 0 && source.alive && source.teamId !== target.teamId ? findPassive(source, "crusader") : null;

  if (crusader !== null) {
    source.memory.tetherPending += dealt * crusader.fraction;
  }

  if (source.lifesteal > 0 && (hit.isAttack || findPassive(source, "spellblade-hilt") !== null) && hit.dot === undefined && !flags.reaction && hpLost > 0 && source.alive) {
    heal(ctx, source, source, hpLost * source.lifesteal, "lifesteal", hit.causeSequence);
  }

  if (hit.dot === undefined && hit.linkEcho !== true) {
    trackDamageTaken(ctx, target, hpLost, hit.causeSequence);
    storeDamage(target, dealt);
    noteFormHit(ctx, hit, target, dealt);
  }

  if (flags.canTriggerPassives && hit.dot === undefined && source.teamId !== target.teamId) {
    const thorns = findPassive(target, "thorns");

    if (thorns !== null && source.alive && (thorns.attacksOnly !== true || hit.isAttack)) {
      dealHitAndReport(ctx, {
        source: target,
        target: source,
        amount: thorns.amount + target.maxHp * (thorns.maxHpFraction ?? 0),
        abilityId: "thorns",
        causeSequence: hit.causeSequence,
        school: target.school,
        isAttack: false,
        flags: REACTION_FLAGS,
      });
    }
  }

  cullIfLow(ctx, hit, target);

  if (crit && flags.canTriggerPassives && source.teamId !== target.teamId && source.alive) {
    gainStacks(ctx, source, "crit");
    fireTriggers(ctx, source, "crit", hit.causeSequence);
  }

  return { hpLost, shieldAbsorbed, combo, crit };
}

function cullIfLow(ctx: ResolutionContext, hit: HitRequest, target: UnitState): void {
  const threshold = hit.isAttack ? (hit.source.abilities[hit.abilityId]?.gems.cullThreshold ?? 0) : 0;

  if (threshold <= 0 || !target.alive || target.hp >= target.maxHp * threshold) {
    return;
  }

  const culled = applyDamage(target, target.hp);
  hit.source.damageDealt += culled;

  ctx.events.push({
    kind: "damage-dealt",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: hit.causeSequence,
    sourceUnitId: hit.source.unitId,
    targetUnitId: target.unitId,
    abilityId: "culling-strike",
    amount: culled,
    shieldAbsorbed: 0,
  });
}

function storeDamage(target: UnitState, dealt: number): void {
  if (dealt <= 0) {
    return;
  }

  for (const store of passivesOfKind(target, "damage-store")) {
    const gained = dealt * store.fraction * (target.form?.definition.storeMultiplier ?? 1);
    target.memory.storedIncoming[store.key] = (target.memory.storedIncoming[store.key] ?? 0) + gained;
  }
}

export function settleStoredDamage(ctx: ResolutionContext): void {
  for (const unit of ctx.state.units) {
    for (const store of passivesOfKind(unit, "damage-store")) {
      const incoming = unit.memory.storedIncoming[store.key] ?? 0;

      if (incoming <= 0) {
        continue;
      }

      unit.memory.storedIncoming[store.key] = 0;
      unit.memory.stored[store.key] = Math.min(unit.maxHp * store.capMaxHpFraction, (unit.memory.stored[store.key] ?? 0) + incoming);
    }
  }
}

function noteFormHit(ctx: ResolutionContext, hit: HitRequest, target: UnitState, dealt: number): void {
  const form = target.form;

  if (form === null || !target.alive || hit.source.teamId === target.teamId) {
    return;
  }

  form.damageTaken += dealt;
  form.hitsTaken += 1;
  const retaliate = form.definition.retaliate;
  const attacker = hit.source;

  if (retaliate !== undefined && hit.isAttack && attacker.alive && ctx.state.tick - (form.retaliatedAt[attacker.unitId] ?? -Infinity) >= retaliate.perAttackerTicks) {
    form.retaliatedAt[attacker.unitId] = ctx.state.tick;
    ctx.reactions.push({ sourceUnitId: target.unitId, abilityId: retaliate.abilityId, causeSequence: hit.causeSequence, targetUnitId: attacker.unitId });
  }

  const every = form.definition.castEveryNthHitTaken;

  if (every !== undefined && form.hitsTaken % every.n === 0 && ctx.state.tick >= form.freeCastReadyAt) {
    form.freeCastReadyAt = ctx.state.tick + every.rechargeTicks;
    scheduleFreeCast(ctx, target, resolveSkillToken(target, every.abilityId), hit.causeSequence);
  }
}

export function resolveSkillToken(unit: UnitState, token: string): string {
  if (token === ABILITY_SKILL) {
    return unit.abilityId ?? token;
  }

  if (token === ULTIMATE_SKILL) {
    return unit.ultimateId ?? token;
  }

  return token;
}

export function enterForm(ctx: ResolutionContext, source: UnitState, form: FormDefinition, abilityId: string, castSequence: number): void {
  const endsAtTick = ctx.state.tick + form.durationTicks;
  source.form = { abilityId, castSequence, endsAtTick, damageTaken: 0, hitsTaken: 0, freeCastReadyAt: 0, retaliatedAt: {}, definition: form };

  ctx.events.push({
    kind: "status-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence: castSequence,
    sourceUnitId: source.unitId,
    targetUnitId: source.unitId,
    status: "form",
    expiresAtTick: endsAtTick,
  });
}

export function endForm(ctx: ResolutionContext, unit: UnitState): ActiveForm | null {
  const form = unit.form;

  if (form === null) {
    return null;
  }

  unit.form = null;
  ctx.events.push({ kind: "status-expired", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId, status: "form" });

  return form;
}

export function burstForm(ctx: ResolutionContext, unit: UnitState, form: ActiveForm): void {
  const burst = form.definition.endBurst;
  const ability = unit.abilities[form.abilityId];

  if (burst === undefined || ability === undefined || !unit.alive) {
    return;
  }

  const amount = Math.round(form.damageTaken * burst.damageTakenFraction);
  const causeSequence = ctx.nextSequence();
  const cast: CastInfo = { source: unit, ability, castSequence: causeSequence, isBasicAttack: false, scale: 1, flags: BURST_FLAGS, critBonus: 0, repeat: null };

  ctx.events.push({
    kind: "impact-landed",
    tick: ctx.state.tick,
    sequence: causeSequence,
    sourceUnitId: unit.unitId,
    abilityId: ability.id,
    center: { x: unit.position.x, y: unit.position.y },
    radiusUnits: burst.radiusUnits,
  });

  for (const victim of unitsInCircle(ctx.state.units, unit, unit.position, burst.radiusUnits, "enemies")) {
    resolveOnTarget(ctx, cast, victim, amount > 0 ? [{ kind: "damage", amount }, ...burst.effects] : burst.effects);
  }
}

function releaseStored(ctx: ResolutionContext, cast: CastInfo, target: UnitState): void {
  const { source, ability } = cast;

  for (const store of passivesOfKind(source, "damage-store")) {
    const amount = Math.round(source.memory.stored[store.key] ?? 0);

    if (resolveSkillToken(source, store.releasedBy) !== ability.id || amount <= 0 || !target.alive || target.teamId === source.teamId) {
      continue;
    }

    source.memory.stored[store.key] = 0;
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: source.unitId, passive: store.key });

    dealHitAndReport(ctx, {
      source,
      target,
      amount,
      abilityId: ability.id,
      causeSequence: cast.castSequence,
      school: castSchool(cast),
      isAttack: isAttackCast(cast),
      flags: { ...cast.flags, canCrit: false, canTriggerPassives: false },
    });
  }
}

function bounceCandidates(ctx: ResolutionContext, source: UnitState, from: Vector2, rangeUnits: number, side: AreaSide): UnitState[] {
  return unitsInCircle(ctx.state.units, source, from, rangeUnits, side).filter((candidate) => candidate.unitId !== source.unitId && !isUntargetable(candidate));
}

function nearestBounce(ctx: ResolutionContext, source: UnitState, from: Vector2, rangeUnits: number, side: AreaSide, visited: ReadonlySet<UnitId>, left: UnitId): UnitState | null {
  const candidates = bounceCandidates(ctx, source, from, rangeUnits, side).filter((candidate) => candidate.unitId !== left);

  return candidates.find((candidate) => !visited.has(candidate.unitId)) ?? candidates[0] ?? null;
}

function knockFrom(ctx: ResolutionContext, from: Vector2, victim: UnitState, distanceUnits: number): void {
  if (!victim.alive || victim.invulnerableUntilTick !== 0 || isUnstoppable(victim)) {
    return;
  }

  const direction = directionTo(from, victim.position);

  ctx.moves.push({
    unitId: victim.unitId,
    to: clampToArena(
      { x: victim.position.x + direction.x * distanceUnits, y: victim.position.y + direction.y * distanceUnits },
      ctx.state.arenaWidth,
      ctx.state.arenaHeight,
    ),
    reason: "knockback",
  });
}

function resolveBounces(ctx: ResolutionContext, cast: CastInfo, first: UnitState, hitIds: Set<UnitId>): number {
  const { source, ability } = cast;
  const bounces = ability.bounces;

  if (bounces === undefined) {
    return 0;
  }

  const visitedAllies = new Set<UnitId>();
  let damage = 0;
  let current: Vector2 = { x: first.position.x, y: first.position.y };
  let last: Vector2 = current;
  let left: UnitId = first.unitId;
  leaveTrail(ctx, source, bounces, current);

  for (let index = 0; index < bounces.count; index += 1) {
    if (bounces.allyEffects !== undefined) {
      const ally = nearestBounce(ctx, source, current, bounces.rangeUnits, "allies", visitedAllies, left);

      if (ally !== null) {
        visitedAllies.add(ally.unitId);
        resolveOnTarget(ctx, cast, ally, bounces.allyEffects);
        current = { x: ally.position.x, y: ally.position.y };
        left = ally.unitId;
        leaveTrail(ctx, source, bounces, current);
      }
    }

    const next = nearestBounce(ctx, source, current, bounces.rangeUnits, "enemies", hitIds, left);

    if (next === null) {
      break;
    }

    hitIds.add(next.unitId);
    damage += resolveOnTarget(ctx, cast, next, ability.effects);

    if (bounces.knockbackUnits !== undefined) {
      knockFrom(ctx, current, next, bounces.knockbackUnits);
    }

    current = { x: next.position.x, y: next.position.y };
    last = current;
    left = next.unitId;
    leaveTrail(ctx, source, bounces, current);
  }

  const sweep = bounces.returnSweep;

  if (sweep === undefined || !source.alive) {
    return damage;
  }

  const length = distance(last, source.position);
  let swept = 0;

  for (const victim of unitsInRay(ctx.state.units, source, last, source.position, length, sweep.widthUnits, "enemies")) {
    damage += resolveOnTarget(ctx, { ...cast, scale: cast.scale * sweep.fraction }, victim, ability.effects);
    swept += 1;
  }

  if (swept > 0 && source.alive) {
    grantShield(ctx, source, source, source.maxHp * sweep.casterShieldMaxHpFraction * swept * cast.scale, sweep.shieldDurationTicks, ability.id, cast.castSequence);
  }

  return damage;
}

function leaveTrail(ctx: ResolutionContext, source: UnitState, bounces: BounceDefinition, center: Vector2): void {
  const trail = bounces.trail === undefined ? undefined : source.abilities[bounces.trail];

  if (trail?.zone !== undefined) {
    spawnZone(ctx, source, trail.id, trail.zone, center);
  }
}

function resolveSplits(ctx: ResolutionContext, cast: CastInfo, primary: UnitState, hitIds: Set<UnitId>, splits: SplitDefinition): number {
  const { source, ability } = cast;

  const candidates = unitsInCircle(ctx.state.units, source, primary.position, splits.rangeUnits, "enemies").filter(
    (candidate) => candidate.unitId !== primary.unitId && !isUntargetable(candidate),
  );

  const fresh = candidates.filter((candidate) => !hitIds.has(candidate.unitId));
  const chosen = [...fresh, ...candidates.filter((candidate) => hitIds.has(candidate.unitId))].slice(0, splits.count);
  const split: CastInfo = { ...cast, scale: cast.scale * splits.fraction };
  let damage = 0;

  for (const target of chosen) {
    const victims = ability.area === undefined ? [target] : unitsInArea(ctx.state.units, source, ability.area, target.position, "enemies");

    for (const victim of victims) {
      damage += resolveOnTarget(ctx, split, victim, ability.effects);
    }
  }

  return damage;
}

function attachBomb(ctx: ResolutionContext, cast: CastInfo, target: UnitState, delayTicks: number): void {
  const bombId = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;

  ctx.state.bombs.push({
    bombId,
    sourceUnitId: cast.source.unitId,
    targetUnitId: target.unitId,
    abilityId: cast.ability.id,
    castSequence: cast.castSequence,
    scale: cast.scale,
    stun: cast.stun ?? null,
    detonatesAtTick: ctx.state.tick + delayTicks,
    position: { x: target.position.x, y: target.position.y },
  });
}

export function detonateBomb(ctx: ResolutionContext, bomb: ActiveBomb): void {
  const source = findUnit(ctx.state, bomb.sourceUnitId);
  const planted = source?.abilities[bomb.abilityId]?.bomb;
  const blast = planted === undefined ? undefined : source?.abilities[planted.abilityId];

  if (source === null || blast === undefined || blast.area?.kind !== "circle") {
    return;
  }

  const radiusUnits = blast.area.radiusUnits;
  const causeSequence = ctx.nextSequence();

  ctx.events.push({
    kind: "impact-landed",
    tick: ctx.state.tick,
    sequence: causeSequence,
    sourceUnitId: source.unitId,
    abilityId: blast.id,
    center: { x: bomb.position.x, y: bomb.position.y },
    radiusUnits,
  });

  const cast = withStun({ source, ability: blast, castSequence: causeSequence, isBasicAttack: false, scale: bomb.scale, flags: CAST_FLAGS, critBonus: 0, repeat: null }, bomb.stun);

  for (const victim of unitsInCircle(ctx.state.units, source, bomb.position, radiusUnits, "enemies")) {
    resolveOnTarget(ctx, cast, victim, blast.effects);
  }
}

function startShower(ctx: ResolutionContext, cast: CastInfo, shower: ShowerDefinition): void {
  const showerId = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;

  ctx.state.showers.push({
    showerId,
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    castSequence: cast.castSequence,
    scale: cast.scale,
    stun: cast.stun ?? null,
    remaining: shower.count,
    fired: 0,
    nextTick: ctx.state.tick,
  });
}

function showerTarget(ctx: ResolutionContext, source: UnitState, radiusUnits: number, fired: number): UnitState | null {
  const enemies = ctx.state.units.filter((unit) => unit.alive && unit.teamId !== source.teamId && !isUntargetable(unit));
  const heroes = enemies.filter((unit) => unit.summonerUnitId === null);
  const pool = heroes.length > 0 ? heroes : enemies;

  if (pool.length === 0) {
    return null;
  }

  const crowd = (unit: UnitState): number => unitsInCircle(ctx.state.units, source, unit.position, radiusUnits, "enemies").length;
  const ranked = [...pool].sort((a, b) => crowd(b) - crowd(a) || (a.unitId < b.unitId ? -1 : 1));

  return ranked[fired % ranked.length] ?? null;
}

export function fireShowerMarker(ctx: ResolutionContext, shower: ActiveShower): void {
  const source = findUnit(ctx.state, shower.sourceUnitId);
  const ability = source?.abilities[shower.abilityId];
  const definition = ability?.shower;

  shower.remaining -= 1;

  if (source === null || !source.alive || ability === undefined || definition === undefined) {
    shower.remaining = 0;

    return;
  }

  shower.nextTick = ctx.state.tick + definition.intervalTicks;
  const radiusUnits = ability.area?.kind === "circle" ? ability.area.radiusUnits : 0;
  const target = showerTarget(ctx, source, radiusUnits, shower.fired);
  shower.fired += 1;

  if (target === null) {
    return;
  }

  const cast = withStun({ source, ability, castSequence: shower.castSequence, isBasicAttack: false, scale: shower.scale, flags: CAST_FLAGS, critBonus: 0, repeat: null }, shower.stun);
  scheduleImpactAt(ctx, cast, target.position, ctx.state.tick + definition.landDelayTicks, definition.pull ?? null);
}

function startEmitters(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState, definition: EmitterDefinition): void {
  const { source, ability } = cast;
  const tick = ctx.state.tick;
  const shotAbilityId = definition.shotsAs === undefined ? ability.id : resolveSkillToken(source, definition.shotsAs);
  const aim = directionTo(source.position, primaryTarget.position);
  const speed = definition.travelUnits > 0 ? definition.travelUnits / definition.durationTicks : 0;
  const start = speed > 0 ? source.position : primaryTarget.position;
  const endsAtTick = tick + definition.durationTicks;

  for (let index = 0; index < definition.count; index += 1) {
    const heading = rotate(aim, (index - (definition.count - 1) / 2) * definition.spreadDegrees);
    const emitterId = ctx.state.nextEntityId;
    ctx.state.nextEntityId += 1;

    ctx.state.emitters.push({
      emitterId,
      sourceUnitId: source.unitId,
      teamId: source.teamId,
      abilityId: ability.id,
      shotAbilityId,
      scale: cast.scale,
      stun: cast.stun ?? null,
      position: { x: start.x, y: start.y },
      velocity: { x: heading.x * speed, y: heading.y * speed },
      endsAtTick,
      nextShotTick: tick + definition.periodTicks,
    });

    ctx.events.push({
      kind: "emitter-started",
      tick,
      sequence: ctx.nextSequence(),
      causeSequence: cast.castSequence,
      emitterId,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      from: { x: start.x, y: start.y },
      endsAtTick,
    });
  }
}

function emitterTargets(ctx: ResolutionContext, source: UnitState, emitter: ActiveEmitter, definition: EmitterDefinition): UnitState[] {
  const inRange = unitsInCircle(ctx.state.units, source, emitter.position, definition.radiusUnits, "enemies").filter((unit) => !isUntargetable(unit));

  return definition.targets === "all" ? inRange : inRange.slice(0, 1);
}

export function advanceEmitter(ctx: ResolutionContext, emitter: ActiveEmitter): void {
  const source = findUnit(ctx.state, emitter.sourceUnitId);
  const definition = source?.abilities[emitter.abilityId]?.emitter;
  const shot = source?.abilities[emitter.shotAbilityId];

  if (source === null || !source.alive || definition === undefined || shot === undefined) {
    emitter.endsAtTick = ctx.state.tick;

    return;
  }

  emitter.position = clampToArena(
    { x: emitter.position.x + emitter.velocity.x, y: emitter.position.y + emitter.velocity.y },
    ctx.state.arenaWidth,
    ctx.state.arenaHeight,
  );

  if (ctx.state.tick < emitter.nextShotTick) {
    return;
  }

  emitter.nextShotTick += definition.periodTicks;

  for (const target of emitterTargets(ctx, source, emitter, definition)) {
    const shotSequence = ctx.nextSequence();
    const from = { x: emitter.position.x, y: emitter.position.y };

    ctx.events.push({
      kind: "emitter-fired",
      tick: ctx.state.tick,
      sequence: shotSequence,
      emitterId: emitter.emitterId,
      sourceUnitId: source.unitId,
      abilityId: shot.id,
      from,
      targetUnitId: target.unitId,
    });

    const cast = withStun(
      {
        source,
        ability: shot,
        castSequence: shotSequence,
        isBasicAttack: false,
        scale: emitter.scale,
        flags: CAST_FLAGS,
        critBonus: 0,
        repeat: null,
        origin: { position: from, reachUnits: definition.radiusUnits },
      },
      emitter.stun,
    );

    resolveCastPayload(ctx, cast, target, target.position);
    fireBarrage(ctx, cast, target);
  }
}

function grantShield(ctx: ResolutionContext, source: UnitState, target: UnitState, amount: number, durationTicks: number, abilityId: string, causeSequence: number): void {
  const granted = Math.round(amount);

  if (granted <= 0 || !target.alive) {
    return;
  }

  const expiresAtTick = Math.max(ctx.state.tick + durationTicks, target.shield?.expiresAtTick ?? 0);
  const current = target.shield?.amount ?? 0;
  const stacked = Math.max(current, Math.min(granted + current, Math.max(granted, Math.round(target.maxHp * SHIELD_STACK_CAP))));
  target.shield = { amount: stacked, expiresAtTick, blessed: target.shield?.blessed ?? null };

  ctx.events.push({
    kind: "shield-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    abilityId,
    amount: target.shield.amount,
    expiresAtTick,
  });
}

export function dealHitAndReport(ctx: ResolutionContext, hit: HitRequest): HitOutcome {
  const outcome = dealHit(ctx, hit);
  reportDeath(ctx, hit.target, { killer: hit.source, abilityId: hit.abilityId, causeSequence: hit.causeSequence });

  return outcome;
}

function applySingleEffect(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effect: EffectDefinition): number {
  const { source, flags } = cast;
  const tick = ctx.state.tick;

  switch (effect.kind) {
    case "damage":
    case "strike": {
      const amount =
        effect.kind === "damage"
          ? rollDamage(ctx.state, effect.amount, effect.maxAmount) + source.maxHp * (effect.casterMaxHpFraction ?? 0) + (cast.consumedMaxHp ?? 0) * (effect.consumedMaxHpFraction ?? 0)
          : rollStrike(ctx.state, source, effect.scale);

      const outcome = dealHit(ctx, {
        source,
        target,
        amount: amount * cast.scale,
        abilityId: cast.ability.id,
        causeSequence: cast.castSequence,
        school: castSchool(cast),
        isAttack: isAttackCast(cast),
        flags: cast.ability.canCrit === false ? { ...flags, canCrit: false } : flags,
        critBonus: cast.critBonus,
      });

      return outcome.hpLost + outcome.shieldAbsorbed;
    }

    case "heal": {
      const amount = (effect.amount + target.maxHp * (effect.maxHpFraction ?? 0)) * cast.scale;
      heal(ctx, source, target, amount, cast.ability.id, cast.castSequence);

      return 0;
    }

    case "shield": {
      const expiresAtTick = tick + effect.durationTicks;
      const amount = Math.round((effect.amount + target.maxHp * (effect.maxHpFraction ?? 0) + source.maxHp * (effect.casterMaxHpFraction ?? 0)) * cast.scale);
      target.shield = { amount, expiresAtTick, blessed: target.shield?.blessed ?? null };

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

      return 0;
    }

    case "chill": {
      if (cast.scale >= 1) {
        applyChill(ctx, source, target, effect.stacks, cast.castSequence);
      }

      return 0;
    }

    case "mark": {
      applyMark(ctx, source, target, effect.bonus, effect.durationTicks);

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
        queueSummons(ctx, cast, effect, target);
      }

      return 0;
    }

    case "raise-army": {
      if (cast.scale >= 1) {
        raiseArmy(ctx, source, effect);
      }

      return 0;
    }

    case "bind": {
      if (target.alive && target.invulnerableUntilTick === 0 && target.teamId !== source.teamId) {
        const expiresAtTick = tick + effect.durationTicks;
        const puppetUntilTick = effect.puppetTicks === undefined ? 0 : Math.min(expiresAtTick, tick + effect.puppetTicks);
        target.link = { linkId: cast.castSequence, sourceUnitId: source.unitId, fraction: effect.fraction, expiresAtTick, puppetUntilTick };

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

        if (puppetUntilTick !== 0) {
          ctx.events.push({
            kind: "status-applied",
            tick,
            sequence: ctx.nextSequence(),
            causeSequence: cast.castSequence,
            sourceUnitId: source.unitId,
            targetUnitId: target.unitId,
            status: "puppeted",
            expiresAtTick: puppetUntilTick,
          });
        }
      }

      return 0;
    }

    case "pandemic": {
      if (cast.scale >= 1) {
        applyPandemic(ctx, source, target, effect, cast.castSequence);
      }

      return 0;
    }

    case "resurrect": {
      resurrect(ctx, cast, effect);

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

function revivableAllies(state: BattleState, caster: UnitState): UnitState[] {
  const rank = new Map(state.resolutionPriority.map((unitId, index) => [unitId, index]));

  return state.units
    .filter((unit) => isRevivable(caster, unit))
    .sort((a, b) => b.memory.fellAtTick - a.memory.fellAtTick || (rank.get(a.unitId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.unitId) ?? Number.POSITIVE_INFINITY));
}

function resurrect(ctx: ResolutionContext, cast: CastInfo, effect: Extract<EffectDefinition, { kind: "resurrect" }>): void {
  if (cast.triggered === true || cast.repeat !== null || cast.scale < 1) {
    return;
  }

  const fallen = revivableAllies(ctx.state, cast.source);
  const raised = effect.all ? fallen : fallen.slice(0, 1);

  if (raised.length === 0) {
    sanctifyTeam(ctx, cast, effect.fallbackInvulnerableTicks);

    return;
  }

  for (const ally of raised) {
    raiseAlly(ctx, cast, ally, effect);
  }
}

function raiseAlly(ctx: ResolutionContext, cast: CastInfo, ally: UnitState, effect: Extract<EffectDefinition, { kind: "resurrect" }>): void {
  const tick = ctx.state.tick;

  ally.alive = true;
  ally.hp = Math.max(1, Math.round(ally.maxHp * effect.hpFraction));
  ally.memory.resurrected = true;
  ally.condition = null;
  ally.control = null;
  ally.taunt = null;
  ally.dots = [];
  ally.chill = null;
  ally.pandemic = null;
  ally.link = null;
  ally.slow = null;
  ally.marks = [];
  ally.shield = null;
  ally.channel = null;
  ally.form = null;
  ally.targetUnitId = null;
  cancelSequences(ctx, ally.unitId, true);
  ctx.reportedDeaths.delete(ally.unitId);

  ctx.events.push({ kind: "revived", tick, sequence: ctx.nextSequence(), unitId: ally.unitId, sourceUnitId: cast.source.unitId, hp: ally.hp });
  ctx.events.push({
    kind: "impact-landed",
    tick,
    sequence: ctx.nextSequence(),
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    center: { x: ally.position.x, y: ally.position.y },
    radiusUnits: effect.staggerRadiusUnits,
  });

  for (const enemy of unitsInCircle(ctx.state.units, cast.source, ally.position, effect.staggerRadiusUnits, "enemies")) {
    applyConditionTo(ctx, cast.source, enemy, "staggered", cast.castSequence);
  }
}

function sanctifyTeam(ctx: ResolutionContext, cast: CastInfo, durationTicks: number): void {
  const expiresAtTick = ctx.state.tick + durationTicks;

  for (const ally of ctx.state.units) {
    if (ally.alive && ally.teamId === cast.source.teamId && ally.invulnerableUntilTick === 0) {
      shelter(ctx, cast.source, ally, expiresAtTick, cast.castSequence);
    }
  }
}

function shelter(ctx: ResolutionContext, source: UnitState, target: UnitState, expiresAtTick: number, causeSequence: number): void {
  target.invulnerableUntilTick = expiresAtTick;

  ctx.events.push({
    kind: "status-applied",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    causeSequence,
    sourceUnitId: source.unitId,
    targetUnitId: target.unitId,
    status: "invulnerable",
    expiresAtTick,
  });
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

function applyOnHitPassives(ctx: ResolutionContext, cast: CastInfo, target: UnitState, dealt: number, damaging: boolean): number {
  const { source, flags } = cast;

  if (!flags.canTriggerPassives || target.teamId === source.teamId || !damaging) {
    return 0;
  }

  let damage = 0;

  if (isAttackCast(cast) || (cast.ability.hitType === "spell" && findPassive(source, "spellblade-hilt") !== null)) {
    if (dealt > 0) {
      stealAttackSpeed(ctx, source, target);
      damage += throwLightning(ctx, source, target, cast.castSequence);

      for (const cleave of passivesOfKind(source, "cleave")) {
        splash(ctx, source, target, dealt * cleave.fraction, cleave.radiusUnits, "cleave", cast.castSequence);
      }

      for (const stacks of passivesOfKind(source, "stacks")) {
        const cleave = stacks.atMax;

        if (cleave?.cleaveFraction !== undefined && isAtStackMax(source, stacks)) {
          splash(ctx, source, target, dealt * cleave.cleaveFraction, cleave.cleaveRadiusUnits ?? CLEAVE_RADIUS_UNITS, "cleave", cast.castSequence);
        }
      }

      gainStacks(ctx, source, "attack-hit");
    }

    const strike = `${cast.castSequence}:${ctx.state.tick}`;

    for (const passive of passivesOfKind(source, "every-nth-attack")) {
      if (cast.repeat !== "barrage" && source.memory.attackCountedStrike[passive.key] !== strike) {
        source.memory.attackCountedStrike[passive.key] = strike;
        source.memory.attackCounts[passive.key] = (source.memory.attackCounts[passive.key] ?? 0) + 1;
      }

      const procs = source.memory.attackCountedStrike[passive.key] === strike && (source.memory.attackCounts[passive.key] ?? 0) % passive.n === 0;

      if (procs && target.alive) {
        damage += applyEffectList(ctx, cast, target, passive.effects);
      }
    }
  }

  if (cast.ability.hitType === "spell") {
    siphonMana(ctx, source, target);
  }

  if (!source.memory.firstHitTargets.includes(target.unitId)) {
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

function siphonMana(ctx: ResolutionContext, source: UnitState, target: UnitState): void {
  for (const siphon of passivesOfKind(source, "spell-siphon")) {
    const last = source.memory.siphonedAt[target.unitId];

    if (last !== undefined && ctx.state.tick - last < siphon.perTargetTicks) {
      continue;
    }

    source.memory.siphonedAt[target.unitId] = ctx.state.tick;
    gainMana(ctx.state, source, siphon.mana);
  }
}

const LIGHTNING_FLAGS: HitFlags = { canApplyConditions: false, canDetonate: true, canTriggerPassives: false, canCrit: false, ignoresArmor: false, reaction: true };

function stealAttackSpeed(ctx: ResolutionContext, source: UnitState, target: UnitState): void {
  for (const siphon of passivesOfKind(source, "essence-siphon")) {
    const expiresAtTick = ctx.state.tick + siphon.durationTicks;
    source.speedBuffs.push({ key: "essence-siphon", bonus: siphon.steal, expiresAtTick });

    if (target.alive) {
      target.speedBuffs.push({ key: "essence-siphoned", bonus: -siphon.steal, expiresAtTick });
    }
  }
}

function throwLightning(ctx: ResolutionContext, source: UnitState, first: UnitState, causeSequence: number): number {
  let damage = 0;

  for (const lightning of passivesOfKind(source, "chain-lightning")) {
    if (nextFloat(ctx.state.rng) >= lightning.chance) {
      continue;
    }

    const struck = new Set<UnitId>();
    let current: UnitState | null = first;

    for (let bounce = 0; bounce < lightning.bounces && current !== null; bounce += 1) {
      struck.add(current.unitId);

      if (current.alive) {
        const outcome = dealHitAndReport(ctx, {
          source,
          target: current,
          amount: lightning.damage,
          abilityId: "chain-lightning",
          causeSequence,
          school: lightning.school,
          isAttack: false,
          flags: LIGHTNING_FLAGS,
        });

        damage += outcome.hpLost + outcome.shieldAbsorbed;
        reportDeath(ctx, current, { killer: source, abilityId: "chain-lightning", causeSequence });
      }

      current = bounceCandidates(ctx, source, current.position, lightning.rangeUnits, "enemies").find((candidate) => !struck.has(candidate.unitId)) ?? null;
    }
  }

  return damage;
}

function isDamaging(effects: readonly EffectDefinition[]): boolean {
  return effects.some((effect) => effect.kind === "damage" || effect.kind === "strike");
}

export function resolveOnTarget(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effects: readonly EffectDefinition[]): number {
  const damaging = isDamaging(effects);
  let damage = applyEffectList(ctx, cast, target, effects);

  const stun = cast.stun;

  if (stun !== undefined && target.alive && target.teamId !== cast.source.teamId && cast.source.memory.ruthlessStunned[target.unitId] !== stun.useId) {
    cast.source.memory.ruthlessStunned[target.unitId] = stun.useId;
    applyControl(ctx, cast.source, target, "stunned", stun.ticks, cast.castSequence);
  }

  damage += applyOnHitPassives(ctx, cast, target, damage, damaging);

  if (damaging && !cast.isBasicAttack && cast.repeat !== "multistrike" && cast.flags.canTriggerPassives && target.teamId !== cast.source.teamId) {
    scheduleMultistrike(ctx, cast, target, effects);
  }

  reportDeath(ctx, target, { killer: cast.source, abilityId: cast.ability.id, causeSequence: cast.castSequence });

  return damage;
}

function scheduleImpact(ctx: ResolutionContext, cast: CastInfo, center: Vector2): void {
  scheduleImpactAt(ctx, cast, center, ctx.state.tick + (cast.ability.delayTicks ?? 0), null);
}

export function scheduleImpactAt(ctx: ResolutionContext, cast: CastInfo, center: Vector2, landsAtTick: number, pull: PullDefinition | null): void {
  const { ability, source } = cast;
  const radiusUnits = ability.area?.kind === "circle" ? ability.area.radiusUnits : 0;
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
    stun: cast.stun ?? null,
    pull,
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

  spawnZone(ctx, source, ability.id, zone, center);
  const covered = new Set(unitsInCircle(ctx.state.units, source, center, zone.radiusUnits, "enemies").map((unit) => unit.unitId));

  for (let flower = 1; flower < (zone.count ?? 1); flower += 1) {
    const uncovered = ctx.state.units.filter((unit) => !covered.has(unit.unitId));
    const next = findDensestEnemyCluster(source, uncovered, Number.POSITIVE_INFINITY, zone.radiusUnits);

    if (next === null) {
      return;
    }

    spawnZone(ctx, source, ability.id, zone, next.position);

    for (const unit of unitsInCircle(ctx.state.units, source, next.position, zone.radiusUnits, "enemies")) {
      covered.add(unit.unitId);
    }
  }
}

export function spawnZone(ctx: ResolutionContext, source: UnitState, abilityId: string, zone: ZoneDefinition, center: Vector2): void {
  const zoneId = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;
  const expiresAtTick = ctx.state.tick + zone.durationTicks;

  ctx.state.zones.push({
    zoneId,
    sourceUnitId: source.unitId,
    teamId: source.teamId,
    abilityId,
    center: { x: center.x, y: center.y },
    radiusUnits: zone.radiusUnits,
    expiresAtTick,
    periodTicks: zone.periodTicks,
    nextPulseTick: ctx.state.tick + zone.periodTicks,
    effects: zone.effects,
    allyEffects: zone.allyEffects ?? [],
    followsUnitId: zone.followsSource === true ? source.unitId : null,
    fullHits: zone.fullHits === true,
  });

  ctx.events.push({
    kind: "zone-created",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    zoneId,
    sourceUnitId: source.unitId,
    abilityId,
    center: { x: center.x, y: center.y },
    radiusUnits: zone.radiusUnits,
    expiresAtTick,
  });
}

export function behindTarget(ctx: ResolutionContext, from: Vector2, target: UnitState): Vector2 {
  const direction = directionTo(from, target.position);

  return clampToArena(
    { x: target.position.x + direction.x * BLINK_OFFSET_UNITS, y: target.position.y + direction.y * BLINK_OFFSET_UNITS },
    ctx.state.arenaWidth,
    ctx.state.arenaHeight,
  );
}

function blinkBehind(ctx: ResolutionContext, source: UnitState, target: UnitState): void {
  ctx.moves.push({ unitId: source.unitId, to: behindTarget(ctx, source.position, target), reason: "blink" });
}

export function chainTargets(ctx: ResolutionContext, cast: CastInfo, primary: UnitState, alreadyHit: ReadonlySet<UnitId>): UnitState[] {
  const chain = cast.ability.gems.chain;

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

function fullMeterTargets(ctx: ResolutionContext, cast: CastInfo, primary: UnitState, alreadyHit: ReadonlySet<UnitId>): UnitState[] {
  const { source, ability } = cast;
  const chosen: UnitState[] = [];

  if (cast.repeat !== null) {
    return chosen;
  }

  for (const passive of passivesOfKind(source, "stacks")) {
    const extra = passive.atMax?.extraTargets;

    if (extra === undefined || passive.spentBy !== ability.id || !isAtStackMax(source, passive)) {
      continue;
    }

    source.memory.stacks[passive.key] = 0;
    ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: source.unitId, passive: passive.key });

    const candidates = unitsInCircle(ctx.state.units, source, primary.position, extra.rangeUnits, "enemies").filter(
      (candidate) => !alreadyHit.has(candidate.unitId) && !chosen.includes(candidate) && !isUntargetable(candidate),
    );

    chosen.push(...candidates.slice(0, extra.count));
  }

  return chosen;
}

function rotate(direction: Vector2, degrees: number): Vector2 {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return { x: direction.x * cos - direction.y * sin, y: direction.x * sin + direction.y * cos };
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

export function resolveCastPayload(ctx: ResolutionContext, base: CastInfo, primaryTarget: UnitState | null, center: Vector2): void {
  const consumes = base.ability.consumes;
  const consumed = consumes !== undefined && primaryTarget !== null && isExplodable(base.source, primaryTarget, consumes.summonId) ? primaryTarget : null;
  const cast = consumed === null ? base : { ...base, consumedMaxHp: consumed.maxHp };
  const { ability, source } = cast;
  const turned = cast.isBasicAttack && primaryTarget !== null && primaryTarget.teamId === source.teamId;
  const side = turned ? "allies" : sideFor(ability.targetPolicy === "lowest-hp-fraction-ally");
  let targets: UnitState[] = [];

  if (ability.area !== undefined) {
    targets = unitsInArea(ctx.state.units, source, ability.area, center, side).filter((unit) => !turned || unit.unitId !== source.unitId);
  } else if (primaryTarget !== null) {
    targets = [primaryTarget];
  }

  if (consumed !== null) {
    targets = targets.filter((target) => target.unitId !== consumed.unitId);
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

  if (primaryTarget !== null && targets.includes(primaryTarget)) {
    for (const extra of fullMeterTargets(ctx, cast, primaryTarget, hitIds)) {
      hitIds.add(extra.unitId);
      damage += resolveOnTarget(ctx, cast, extra, ability.effects);
    }

    releaseStored(ctx, cast, primaryTarget);
  }

  if (primaryTarget !== null && !cast.flags.reaction && cast.repeat !== "barrage" && targets.includes(primaryTarget) && !turned) {
    damage += resolveBounces(ctx, cast, primaryTarget, hitIds);
  }

  if (primaryTarget !== null && ability.splits !== undefined && !cast.flags.reaction && cast.repeat !== "barrage") {
    damage += resolveSplits(ctx, cast, primaryTarget, hitIds, ability.splits);
  }

  if (primaryTarget !== null && ability.gems.pierceWidthUnits > 0 && primaryTarget.teamId !== source.teamId) {
    const from = cast.origin?.position ?? source.position;
    const reach = cast.origin?.reachUnits ?? ability.range;

    for (const victim of unitsInRay(ctx.state.units, source, from, primaryTarget.position, reach, ability.gems.pierceWidthUnits, "enemies")) {
      if (!hitIds.has(victim.unitId)) {
        hitIds.add(victim.unitId);
        damage += resolveOnTarget(ctx, cast, victim, ability.effects);
      }
    }
  }

  if (ability.casterShieldPerTarget !== undefined && source.alive) {
    const enemiesHit = landedOnEnemies(ctx, cast, targets, firstEvent);

    if (enemiesHit > 0) {
      const granted = Math.round(source.maxHp * ability.casterShieldPerTarget.maxHpFraction * enemiesHit * cast.scale);
      const amount = Math.max(granted, source.shield?.amount ?? 0);
      const expiresAtTick = Math.max(ctx.state.tick + ability.casterShieldPerTarget.durationTicks, source.shield?.expiresAtTick ?? 0);
      source.shield = { amount, expiresAtTick, blessed: source.shield?.blessed ?? null };

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

  if (consumed !== null) {
    markGraves(ctx, cast, targets);
    consumeCorpse(ctx, cast, consumed);
  }

  if (ability.zone !== undefined && ability.delayTicks === undefined && cast.scale >= 1) {
    createZone(ctx, source, ability, ability.area?.kind === "circle" && ability.area.center === "self" ? source.position : center);
  }

  const fork = ability.gems.fork;

  if (fork !== null && primaryTarget !== null && primaryTarget.teamId !== source.teamId && !cast.flags.reaction && cast.repeat !== "barrage" && targets.includes(primaryTarget)) {
    damage += resolveSplits(ctx, cast, primaryTarget, hitIds, { count: fork.branches, rangeUnits: fork.rangeUnits, fraction: fork.fraction });
  }

  if (!cast.flags.reaction && primaryTarget !== null) {
    for (const extra of chainTargets(ctx, cast, primaryTarget, hitIds)) {
      damage += resolveOnTarget(ctx, { ...cast, scale: cast.scale * (ability.gems.chain?.fraction ?? 1) }, extra, ability.effects);
    }
  }

  if (ability.gems.leech > 0 && damage > 0 && source.alive) {
    heal(ctx, source, source, damage * ability.gems.leech, "leech", cast.castSequence);
  }
}

export function resolveCast(ctx: ResolutionContext, base: CastInfo, primaryTarget: UnitState): void {
  const cast = ruthlessCast(base);
  const { ability, source } = cast;

  if (cast.isBasicAttack) {
    gainStacks(ctx, source, "basic-attack");
  } else if (ability.hitType === "spell") {
    gainStacks(ctx, source, "spell-cast");
  }

  if (ability.hitType === "attack" && cast.repeat === null) {
    source.memory.attackCasts += 1;
    fireTriggers(ctx, source, "nth-attack", cast.castSequence);
  }

  const vortex = ability.gems.vortex;

  if (vortex !== null && ability.area?.kind === "circle" && cast.repeat === null) {
    const center = ability.area.center === "self" ? source.position : primaryTarget.position;
    pullToward(ctx, source, center, ability.area.radiusUnits * vortex.reachMultiplier, vortex.pullUnits);
  }

  if (!cast.isBasicAttack) {
    scheduleMulticast(ctx, cast, primaryTarget);
    scheduleShadowClone(ctx, cast);
  }

  if (ability.emitter !== undefined) {
    startEmitters(ctx, cast, primaryTarget, ability.emitter);

    if (ability.emitter.shotsAs === undefined) {
      return;
    }
  }

  if (ability.shower !== undefined) {
    startShower(ctx, cast, ability.shower);

    return;
  }

  if (ability.delayTicks !== undefined && ability.delayTicks > 0) {
    scheduleImpact(ctx, cast, primaryTarget.position);

    return;
  }

  if (ability.dash !== undefined) {
    startSequence(ctx, cast, primaryTarget);

    return;
  }

  if (ability.blinkBehindTarget === true && primaryTarget.unitId !== source.unitId) {
    blinkBehind(ctx, source, primaryTarget);
  }

  if (ability.channel !== undefined) {
    startChannel(ctx, source, ability, cast.castSequence, cast.scale, cast.stun ?? null);
  }

  if (ability.form !== undefined && cast.repeat === null) {
    enterForm(ctx, source, ability.form, ability.id, cast.castSequence);
  }

  if (ability.bomb !== undefined && primaryTarget.teamId !== source.teamId) {
    attachBomb(ctx, cast, primaryTarget, ability.bomb.delayTicks);
  }

  resolveCastPayload(ctx, cast, primaryTarget, primaryTarget.position);
  fireBarrage(ctx, cast, primaryTarget);
}

function ruthlessCast(cast: CastInfo): CastInfo {
  const ruthless = cast.ability.gems.ruthless;

  if (ruthless === null || cast.repeat !== null || cast.isBasicAttack) {
    return cast;
  }

  const uses = (cast.source.memory.skillUses[cast.ability.id] ?? 0) + 1;
  cast.source.memory.skillUses[cast.ability.id] = uses;

  return uses % ruthless.every === 0 ? { ...cast, scale: cast.scale * ruthless.damageMultiplier, stun: { ticks: ruthless.stunTicks, useId: cast.castSequence } } : cast;
}

function fireBarrage(ctx: ResolutionContext, cast: CastInfo, primary: UnitState): void {
  const barrage = cast.ability.gems.barrage;

  if (barrage === null || cast.repeat !== null || primary.teamId === cast.source.teamId) {
    return;
  }

  const extras = unitsInCircle(ctx.state.units, cast.source, cast.origin?.position ?? cast.source.position, cast.origin?.reachUnits ?? cast.ability.range, "enemies")
    .filter((candidate) => candidate.unitId !== primary.unitId && !isUntargetable(candidate))
    .slice(0, barrage.extraProjectiles);

  for (const extra of extras) {
    const shot: CastInfo = { ...cast, castSequence: ctx.nextSequence(), scale: cast.scale * barrage.fraction, repeat: "barrage" };
    resolveCastPayload(ctx, shot, extra, extra.position);
  }
}

function scaledEffects(effects: readonly EffectDefinition[], scale: number): EffectDefinition[] {
  if (scale >= 1) {
    return [...effects];
  }

  return effects.map((effect): EffectDefinition => {
    if (effect.kind === "damage") {
      const scaled: EffectDefinition = { kind: "damage", amount: Math.max(1, Math.round(effect.amount * scale)) };

      if (effect.maxAmount !== undefined) {
        scaled.maxAmount = Math.max(scaled.amount, Math.round(effect.maxAmount * scale));
      }

      return scaled;
    }

    return effect.kind === "strike" ? { kind: "strike", scale: effect.scale * scale } : effect;
  });
}

function startChannel(ctx: ResolutionContext, source: UnitState, ability: CompiledAbility, castSequence: number, scale: number, stun: CastStun | null): void {
  const channel = ability.channel;

  if (channel === undefined) {
    return;
  }

  const tick = ctx.state.tick;
  const unstoppable = channel.unstoppable === true;

  if (unstoppable) {
    source.control = null;
    source.slow = null;
    source.taunt = null;
  }

  source.channel = {
    abilityId: ability.id,
    castSequence,
    endsAtTick: tick + channel.durationTicks,
    nextPulseTick: tick,
    periodTicks: channel.periodTicks,
    radiusUnits: channel.radiusUnits,
    effects: scaledEffects(channel.effects, scale),
    stun,
    unstoppable,
    drifts: channel.drifts === true,
    pull: channel.pull ?? null,
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

export function finishChannel(ctx: ResolutionContext, unit: UnitState, channel: ChannelStatus): void {
  const endZone = unit.alive ? unit.abilities[channel.abilityId]?.channel?.endZone : undefined;

  if (endZone !== undefined) {
    spawnZone(ctx, unit, channel.abilityId, endZone, unit.position);
  }
}

export function pullToward(ctx: ResolutionContext, source: UnitState, center: Vector2, radiusUnits: number, distanceUnits: number): void {
  for (const victim of unitsInCircle(ctx.state.units, source, center, radiusUnits, "enemies")) {
    if (victim.invulnerableUntilTick !== 0 || isUnstoppable(victim)) {
      continue;
    }

    const gap = distance(victim.position, center);
    const step = Math.min(distanceUnits, gap - PULL_CLEARANCE_UNITS);

    if (step <= 0) {
      continue;
    }

    const direction = directionTo(victim.position, center);

    ctx.moves.push({
      unitId: victim.unitId,
      to: clampToArena(
        { x: victim.position.x + direction.x * step, y: victim.position.y + direction.y * step },
        ctx.state.arenaWidth,
        ctx.state.arenaHeight,
      ),
      reason: "pull",
    });
  }
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

function queueSummons(ctx: ResolutionContext, cast: CastInfo, effect: Extract<EffectDefinition, { kind: "summon" }>, anchor: UnitState): void {
  for (let index = 0; index < effect.count; index += 1) {
    ctx.spawns.push({
      ...summonSpawn(cast.source, effect.heroId, anchor.position, effect.maxActive ?? null),
      hpScale: effect.hpScale ?? 1,
      damageScale: effect.damageScale ?? 1,
      shieldFraction: effect.shieldFraction ?? 0,
      passives: effect.passives ?? [],
      gems: effect.carriesGems === true ? [...cast.ability.gems.carried] : [],
    });
  }
}

function consumeCorpse(ctx: ResolutionContext, cast: CastInfo, consumed: UnitState): void {
  ctx.events.push({
    kind: "impact-landed",
    tick: ctx.state.tick,
    sequence: ctx.nextSequence(),
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    center: { x: consumed.position.x, y: consumed.position.y },
    radiusUnits: cast.ability.area?.kind === "circle" ? cast.ability.area.radiusUnits : 0,
  });

  if (consumed.alive) {
    removeUnit(ctx, consumed);
  } else {
    spendCorpse(ctx, consumed);
  }
}

function raiseArmy(ctx: ResolutionContext, source: UnitState, effect: RaiseArmyEffect): void {
  const corpses = ctx.state.units.filter((unit) => isCorpse(unit) && unit.summonerUnitId === null);
  const thrall = ctx.catalogue.heroes[effect.thrallHeroId];

  for (const corpse of corpses) {
    spendCorpse(ctx, corpse);
  }

  if (effect.merge !== undefined) {
    const colossus = ctx.catalogue.heroes[effect.merge.heroId];
    const totalHp = corpses.reduce((sum, corpse) => sum + corpse.maxHp * effect.strength, 0) + effect.thralls * (thrall?.maxHp ?? 0) * effect.thrallScale;

    if (colossus !== undefined && totalHp > 0) {
      ctx.spawns.push({
        ...summonSpawn(source, colossus.id, source.position, null),
        hpScale: totalHp / colossus.maxHp,
        damageScale: 1 + effect.merge.damagePerBody * (corpses.length + effect.thralls),
        itemIds: sharedSwarmItems(ctx, source),
        lifetimeTicks: effect.lifetimeTicks,
      });
    }

    return;
  }

  for (const corpse of corpses) {
    ctx.spawns.push({
      ...summonSpawn(source, corpse.heroId, corpse.position, null),
      hpScale: effect.strength,
      damageScale: effect.strength,
      build: corpse.build,
      lifetimeTicks: effect.lifetimeTicks,
      corpseUnitId: corpse.unitId,
    });
  }

  for (let index = 0; index < effect.thralls; index += 1) {
    ctx.spawns.push({ ...summonSpawn(source, effect.thrallHeroId, source.position, null), hpScale: effect.thrallScale, damageScale: effect.thrallScale, lifetimeTicks: effect.lifetimeTicks });
  }
}

function spawnPosition(ctx: ResolutionContext, spawn: PendingSpawn): Vector2 {
  if (spawn.corpseUnitId !== null) {
    return { x: spawn.anchor.x, y: spawn.anchor.y };
  }

  const facing = spawn.anchor.y > ctx.state.arenaHeight / 2 ? 1 : -1;
  let fallback: Vector2 | null = null;

  for (const direction of SUMMON_RING_DIRECTIONS) {
    const candidate = clampToArena(
      { x: spawn.anchor.x + direction.x * facing * SUMMON_RING_UNITS, y: spawn.anchor.y + direction.y * facing * SUMMON_RING_UNITS },
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
    (unit) => unit.alive && unit.summonerUnitId === spawn.summonerUnitId && unit.heroId === spawn.heroId && unit.expiresAtTick === 0,
  );

  for (let index = 0; index <= active.length - spawn.maxActive; index += 1) {
    const oldest = active[index];

    if (oldest !== undefined) {
      queueDetonation(ctx, oldest);
      removeUnit(ctx, oldest);
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
    const gems = [...spawn.gems];

    for (const empower of passivesOfKind(summoner, "empower-summons")) {
      if (empower.heroId === spawn.heroId) {
        hpScale *= empower.hpScale ?? 1;
        shieldFraction = Math.max(shieldFraction, empower.shieldFraction ?? 0);
        passives.push(...(empower.passives ?? []));
        gems.push(...(empower.gems ?? []).map((gem) => ({ id: empower.key, gem })));
      }
    }

    const unitId = `${spawn.summonerUnitId}.${spawn.heroId}.${ctx.state.nextEntityId}`;
    ctx.state.nextEntityId += 1;
    summoner.memory.summonsRaised += 1;

    const build = spawn.build === null ? summonBuild(ctx, summoner, spawn, unitId) : { ...spawn.build, buildId: unitId };
    const compiled = compileBuild(build, ctx.catalogue, { passives, gems });
    const position = spawnPosition(ctx, spawn);
    const unit = createUnitState(unitId, spawn.teamId, build, position, compiled, spawn.summonerUnitId);

    unit.maxHp = Math.max(1, Math.round(unit.maxHp * hpScale));
    unit.hp = unit.maxHp;
    unit.damageMultiplier *= spawn.damageScale;
    unit.expiresAtTick = spawn.lifetimeTicks > 0 ? ctx.state.tick + spawn.lifetimeTicks : 0;

    if (shieldFraction > 0) {
      unit.shield = { amount: Math.round(unit.maxHp * shieldFraction), expiresAtTick: DEFAULT_TICK_LIMIT * 2, blessed: null };
    }

    ctx.state.units.push(unit);
    ctx.state.resolutionPriority.push(unitId);

    const spawned: Extract<BattleEvent, { kind: "unit-spawned" }> = {
      kind: "unit-spawned",
      tick: ctx.state.tick,
      sequence: ctx.nextSequence(),
      unitId,
      heroId: spawn.heroId,
      teamId: spawn.teamId,
      summonerUnitId: spawn.summonerUnitId,
      position: { x: position.x, y: position.y },
    };

    if (spawn.corpseUnitId !== null) {
      spawned.corpseUnitId = spawn.corpseUnitId;
    }

    if (unit.expiresAtTick > 0) {
      spawned.expiresAtTick = unit.expiresAtTick;
    }

    ctx.events.push(spawned);
  }
}

function summonBuild(ctx: ResolutionContext, summoner: UnitState, spawn: PendingSpawn, unitId: UnitId): HeroBuild {
  const itemIds = findPassive(summoner, "heart-of-the-swarm") === null ? spawn.itemIds : sharedSwarmItems(ctx, summoner);
  const baseBuild = createHeroBuild(unitId, spawn.heroId, [], ctx.catalogue);

  return itemIds.length === 0 ? baseBuild : withEquipment(baseBuild, itemIds, []);
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

    if (move.reason !== "knockback" && move.reason !== "pull") {
      springSentinelWard(ctx, unit);
      grantDashBuffs(ctx, unit);
      leaveDashTrail(ctx, unit, from, move.to);
      fireTriggers(ctx, unit, "dash", ctx.nextSequence());
    }
  }

  ctx.moves = [];
}

function leaveDashTrail(ctx: ResolutionContext, unit: UnitState, from: Vector2, to: Vector2): void {
  for (const trail of passivesOfKind(unit, "dash-trail")) {
    const ability = unit.abilities[trail.abilityId];

    if (ability?.zone === undefined) {
      continue;
    }

    const count = Math.min(trail.maxZones, Math.max(1, Math.round(distance(from, to) / trail.spacingUnits)));

    for (let index = 0; index < count; index += 1) {
      const along = count === 1 ? 1 : index / (count - 1);
      spawnZone(ctx, unit, ability.id, ability.zone, { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along });
    }
  }
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

export function payAbilityHp(ctx: ResolutionContext, unit: UnitState, ability: CompiledAbility): void {
  if (ability.gems.overchargeHpCost > 0) {
    payHp(ctx, unit, unit.hp * ability.gems.overchargeHpCost, "overcharge");
  }

  if (ability.hpCostFraction !== undefined) {
    payHp(ctx, unit, unit.hp * ability.hpCostFraction, "martyr");
  }
}

export function payHp(ctx: ResolutionContext, unit: UnitState, amount: number, reason: HpPaymentReason): void {
  const paid = Math.min(Math.max(0, unit.hp - 1), Math.round(amount));

  if (!unit.alive || paid <= 0) {
    return;
  }

  unit.hp -= paid;
  ctx.events.push({ kind: "hp-paid", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId, amount: paid, reason });
  trackDamageTaken(ctx, unit, paid, ctx.nextSequence());
}

export function reflectUltimate(ctx: ResolutionContext, caster: UnitState, ability: CompiledAbility, holder: UnitState): boolean {
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

  resolveCast(
    ctx,
    { source: holder, ability: reflected, castSequence, isBasicAttack: false, scale: 1, flags: CAST_FLAGS, critBonus: 0, repeat: null },
    caster,
  );

  return true;
}
