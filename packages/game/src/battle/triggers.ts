import type { UnitId } from "../ids.js";
import type { AbilityDefinition, EffectDefinition, PassiveDefinition, StackGain, TriggerEvent } from "../definitions.js";
import type { BattleState, ChainLink, PendingCast, UnitState } from "./state.js";
import type { CastEvent } from "./events.js";
import type { CompiledTrigger } from "../builds/compile-build.js";
import { distance, isWithinRange } from "../math/vector.js";
import {
  CAST_FLAGS,
  enterForm,
  findPassive,
  findUnit,
  passivesOfKind,
  payAbilityHp,
  payHp,
  resolveCast,
  resolveOnTarget,
  resolveSkillToken,
  type CastInfo,
  type ResolutionContext,
} from "./combat.js";
import { resolveCastTarget } from "./targeting.js";
import { isUntargetable } from "./statuses.js";

export const TRIGGER_DELAY_TICKS = 3;

export const MAX_TRIGGERED_CASTS_PER_TICK = 32;

export const OPENER_STAGGER_TICKS = 3;

export const OPENER_STAGGER_SLOTS = 6;

const DAMAGE_TRIGGER_CAP = 2;

interface SkillTrigger {
  abilityId: string;
  trigger: CompiledTrigger;
}

export interface BudgetBreach {
  rootActionSequence: number;
  depthReached: number;
}

export function chainOf(state: BattleState, causeSequence: number): ChainLink {
  return state.castChains[causeSequence] ?? { root: causeSequence, link: 1 };
}

function nextLink(chain: ChainLink): ChainLink {
  return { root: chain.root, link: chain.link + 1 };
}

export function priorityRank(state: BattleState): Map<UnitId, number> {
  return new Map(state.resolutionPriority.map((unitId, index) => [unitId, index]));
}

function rankOf(rank: ReadonlyMap<UnitId, number>, unitId: UnitId): number {
  return rank.get(unitId) ?? Number.POSITIVE_INFINITY;
}

function schedule(ctx: ResolutionContext, entry: Omit<PendingCast, "order">): void {
  const order = ctx.state.nextEntityId;
  ctx.state.nextEntityId += 1;
  ctx.state.pendingCasts.push({ ...entry, order });
}

export function isTriggerBlocked(state: BattleState, unit: UnitState): boolean {
  for (const holder of state.units) {
    if (!holder.alive || holder.teamId === unit.teamId) {
      continue;
    }

    const talisman = findPassive(holder, "null-talisman");

    if (talisman !== null && isWithinRange(distance(holder.position, unit.position), talisman.radiusUnits)) {
      return true;
    }
  }

  return false;
}

function isOnce(trigger: CompiledTrigger): boolean {
  return trigger.on === "opener" || trigger.on === "last-word";
}

function triggerReady(state: BattleState, unit: UnitState, trigger: CompiledTrigger): boolean {
  if (isOnce(trigger)) {
    return !unit.memory.spentTriggers.includes(trigger.key);
  }

  return state.tick >= (unit.memory.triggerReadyAt[trigger.key] ?? 0);
}

function consumeTrigger(state: BattleState, unit: UnitState, trigger: CompiledTrigger): void {
  if (isOnce(trigger)) {
    unit.memory.spentTriggers.push(trigger.key);

    return;
  }

  const multiplier = passivesOfKind(unit, "infinity-band").reduce((product, band) => product * band.rechargeMultiplier, 1);
  unit.memory.triggerReadyAt[trigger.key] = state.tick + Math.max(1, Math.round(trigger.rechargeTicks * multiplier));
}

function skillTriggers(unit: UnitState): SkillTrigger[] {
  const found: SkillTrigger[] = [];

  for (const skillId of [unit.abilityId, unit.ultimateId]) {
    const ability = skillId === null ? undefined : unit.abilities[skillId];

    if (skillId === null || ability === undefined) {
      continue;
    }

    for (const trigger of ability.gems.triggers) {
      found.push({ abilityId: skillId, trigger });
    }
  }

  return found;
}

function fire(ctx: ResolutionContext, unit: UnitState, entry: SkillTrigger, causeSequence: number): boolean {
  if (!triggerReady(ctx.state, unit, entry.trigger)) {
    return false;
  }

  consumeTrigger(ctx.state, unit, entry.trigger);
  schedule(ctx, {
    sourceUnitId: unit.unitId,
    abilityId: entry.abilityId,
    castAtTick: ctx.state.tick + TRIGGER_DELAY_TICKS,
    scale: entry.trigger.fraction,
    targetUnitId: null,
    chain: nextLink(chainOf(ctx.state, causeSequence)),
    repeat: null,
    trigger: entry.trigger.on,
    fromCorpse: entry.trigger.on === "last-word",
  });

  return true;
}

export function fireTriggers(ctx: ResolutionContext, unit: UnitState, event: TriggerEvent, causeSequence: number): void {
  if (event !== "last-word" && !unit.alive) {
    return;
  }

  const matching = skillTriggers(unit).filter(
    (entry) => entry.trigger.on === event && (event !== "nth-attack" || (entry.trigger.every > 0 && unit.memory.attackCasts % entry.trigger.every === 0)),
  );

  if (matching.length === 0 || isTriggerBlocked(ctx.state, unit)) {
    return;
  }

  for (const entry of matching) {
    fire(ctx, unit, entry, causeSequence);
  }
}

export function fireDetonationTriggers(ctx: ResolutionContext, detonator: UnitState, causeSequence: number): void {
  for (const ally of ctx.state.units) {
    if (ally.alive && ally.teamId === detonator.teamId && ally.unitId !== detonator.unitId) {
      fireTriggers(ctx, ally, "detonation", causeSequence);
    }
  }
}

export function trackDamageTaken(ctx: ResolutionContext, unit: UnitState, amount: number, causeSequence: number): void {
  if (amount <= 0 || !unit.alive) {
    return;
  }

  const damaged = skillTriggers(unit).filter((entry) => entry.trigger.on === "damaged");

  if (damaged.length === 0) {
    return;
  }

  const needed = Math.max(1, unit.maxHp * Math.min(...damaged.map((entry) => entry.trigger.hpLossFraction)));
  unit.memory.damageSinceTrigger = Math.min(needed * DAMAGE_TRIGGER_CAP, unit.memory.damageSinceTrigger + amount);

  if (unit.memory.damageSinceTrigger < needed || isTriggerBlocked(ctx.state, unit)) {
    return;
  }

  let fired = false;

  for (const entry of damaged) {
    fired = fire(ctx, unit, entry, causeSequence) || fired;
  }

  if (fired) {
    unit.memory.damageSinceTrigger -= needed;
  }
}

type StacksPassive = Extract<PassiveDefinition, { kind: "stacks" }>;

export function gainStacks(ctx: ResolutionContext, unit: UnitState, gain: StackGain): void {
  for (const passive of passivesOfKind(unit, "stacks")) {
    let amount = 0;

    for (const rule of passive.gains) {
      if (rule.on === gain) {
        amount += rule.amount;
      }
    }

    addStacks(ctx, unit, passive, amount);
  }
}

export function creditBoundDamage(ctx: ResolutionContext, target: UnitState, damage: number): void {
  const hexerId = target.control?.control === "hexed" ? target.control.sourceUnitId : null;
  const binderId = target.link?.sourceUnitId ?? null;

  if (damage <= 0 || (hexerId === null && binderId === null)) {
    return;
  }

  for (const unit of ctx.state.units) {
    if (unit.alive && (unit.unitId === hexerId || unit.unitId === binderId)) {
      gainDamageStacks(ctx, unit, damage);
    }
  }
}

function gainDamageStacks(ctx: ResolutionContext, unit: UnitState, damage: number): void {
  for (const passive of passivesOfKind(unit, "stacks")) {
    for (const rule of passive.gains) {
      if (rule.on !== "bound-damage" || isAtStackMax(unit, passive)) {
        continue;
      }

      const progress = (unit.memory.stackProgress[passive.key] ?? 0) + damage;
      const earned = Math.floor(progress / rule.per);
      unit.memory.stackProgress[passive.key] = progress - earned * rule.per;
      addStacks(ctx, unit, passive, earned * rule.amount);
    }
  }
}

function addStacks(ctx: ResolutionContext, unit: UnitState, passive: StacksPassive, amount: number): void {
  if (amount <= 0 || unit.form?.definition.drainsStacksKey === passive.key) {
    return;
  }

  const current = unit.memory.stacks[passive.key] ?? 0;
  const next = Math.min(passive.max, current + amount);
  unit.memory.stacks[passive.key] = next;
  unit.memory.stacksGainedAt[passive.key] = ctx.state.tick;

  if (current < passive.max && next >= passive.max) {
    reachStackMax(ctx, unit, passive);
  }
}

function reachStackMax(ctx: ResolutionContext, unit: UnitState, passive: StacksPassive): void {
  const form = passive.atMax?.form;

  if (form !== undefined && unit.form === null) {
    enterForm(ctx, unit, form, unit.basicAttackId, ctx.nextSequence());
  }

  const resets = passive.atMax?.resetsAbilityId;

  if (resets === undefined) {
    return;
  }

  const abilityId = resolveSkillToken(unit, resets);

  if (unit.abilityCooldowns[abilityId] === undefined) {
    return;
  }

  unit.abilityCooldowns[abilityId] = ctx.state.tick;
  ctx.events.push({ kind: "passive-triggered", tick: ctx.state.tick, sequence: ctx.nextSequence(), unitId: unit.unitId, passive: passive.key });
}

export function isAtStackMax(unit: UnitState, passive: StacksPassive): boolean {
  return (unit.memory.stacks[passive.key] ?? 0) >= passive.max;
}

export function stackControlImmune(unit: UnitState): boolean {
  for (const passive of passivesOfKind(unit, "stacks")) {
    if (passive.atMax?.controlImmune === true && isAtStackMax(unit, passive)) {
      return true;
    }
  }

  return false;
}

export function channelHaste(unit: UnitState): number {
  let haste = 0;

  for (const passive of passivesOfKind(unit, "stacks")) {
    haste += (unit.memory.stacks[passive.key] ?? 0) * (passive.channelHastePerStack ?? 0);
  }

  return haste;
}

export function processStackDecay(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const unit of ctx.state.units) {
    if (!unit.alive) {
      continue;
    }

    for (const passive of passivesOfKind(unit, "stacks")) {
      const decay = passive.decay;
      const current = unit.memory.stacks[passive.key] ?? 0;

      if (decay === undefined || current <= 0) {
        continue;
      }

      const idle = tick - (unit.memory.stacksGainedAt[passive.key] ?? 0) - decay.idleTicks;

      if (idle >= 0 && idle % decay.everyTicks === 0) {
        unit.memory.stacks[passive.key] = Math.max(0, current - decay.amount);
      }
    }
  }
}

export function grantDashBuffs(ctx: ResolutionContext, unit: UnitState): void {
  for (const passive of passivesOfKind(unit, "quicksilver")) {
    const expiresAtTick = ctx.state.tick + passive.durationTicks;
    unit.speedBuffs = [...unit.speedBuffs.filter((buff) => buff.key !== "quicksilver"), { key: "quicksilver", bonus: passive.attackSpeedBonus, expiresAtTick }];
  }
}

function crowned(unit: UnitState): boolean {
  return findPassive(unit, "crown-of-echoes") !== null;
}

export function scheduleMulticast(ctx: ResolutionContext, cast: CastInfo, primaryTarget: UnitState): void {
  const multicast = cast.ability.gems.multicast;

  if (multicast === null || cast.repeat !== null) {
    return;
  }

  schedule(ctx, {
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    castAtTick: ctx.state.tick + Math.max(TRIGGER_DELAY_TICKS, multicast.delayTicks),
    scale: crowned(cast.source) ? cast.scale : cast.scale * multicast.fraction,
    targetUnitId: primaryTarget.unitId,
    chain: nextLink(chainOf(ctx.state, cast.castSequence)),
    repeat: "multicast",
    trigger: null,
    fromCorpse: false,
  });
}

export function scheduleUnstableEcho(ctx: ResolutionContext, source: UnitState, abilityId: string, target: UnitState, castSequence: number): void {
  const core = findPassive(source, "unstable-core");

  if (core === null || !source.alive) {
    return;
  }

  payHp(ctx, source, source.maxHp * core.hpFraction, "unstable-core");
  schedule(ctx, {
    sourceUnitId: source.unitId,
    abilityId,
    castAtTick: ctx.state.tick + Math.max(TRIGGER_DELAY_TICKS, core.delayTicks),
    scale: 1,
    targetUnitId: target.unitId,
    chain: nextLink(chainOf(ctx.state, castSequence)),
    repeat: "multicast",
    trigger: null,
    fromCorpse: false,
  });
}

export function scheduleFreeCast(ctx: ResolutionContext, unit: UnitState, abilityId: string, causeSequence: number): void {
  if (!unit.alive || unit.abilities[abilityId] === undefined) {
    return;
  }

  schedule(ctx, {
    sourceUnitId: unit.unitId,
    abilityId,
    castAtTick: ctx.state.tick + TRIGGER_DELAY_TICKS,
    scale: 1,
    targetUnitId: null,
    chain: nextLink(chainOf(ctx.state, causeSequence)),
    repeat: null,
    trigger: null,
    fromCorpse: false,
  });
}

export function scheduleShadowClone(ctx: ResolutionContext, cast: CastInfo): void {
  if (cast.repeat !== null) {
    return;
  }

  const clone = findPassive(cast.source, "shadow-clone");

  if (clone === null || clone.abilityId !== cast.ability.id) {
    return;
  }

  schedule(ctx, {
    sourceUnitId: cast.source.unitId,
    abilityId: cast.ability.id,
    castAtTick: ctx.state.tick + Math.max(TRIGGER_DELAY_TICKS, clone.delayTicks),
    scale: cast.scale * clone.fraction,
    targetUnitId: null,
    chain: nextLink(chainOf(ctx.state, cast.castSequence)),
    repeat: "clone",
    trigger: null,
    fromCorpse: false,
  });
}

export function scheduleMultistrike(ctx: ResolutionContext, cast: CastInfo, target: UnitState, effects: readonly EffectDefinition[]): void {
  const multistrike = cast.ability.gems.multistrike;

  if (multistrike === null) {
    return;
  }

  const scale = crowned(cast.source) ? cast.scale : cast.scale * multistrike.fraction;

  for (let index = 1; index <= multistrike.repeats; index += 1) {
    const order = ctx.state.nextEntityId;
    ctx.state.nextEntityId += 1;
    ctx.state.pendingStrikes.push({
      order,
      sourceUnitId: cast.source.unitId,
      targetUnitId: target.unitId,
      abilityId: cast.ability.id,
      atTick: ctx.state.tick + multistrike.delayTicks * index,
      scale,
      causeSequence: cast.castSequence,
      effects: [...effects],
    });
  }
}

export function processOpeners(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;

  for (const [index, unitId] of ctx.state.resolutionPriority.entries()) {
    const unit = findUnit(ctx.state, unitId);

    if (unit === null || !unit.alive) {
      continue;
    }

    for (const entry of skillTriggers(unit)) {
      if (entry.trigger.on !== "opener" || unit.memory.spentTriggers.includes(entry.trigger.key)) {
        continue;
      }

      if (tick < entry.trigger.atTick + (index % OPENER_STAGGER_SLOTS) * OPENER_STAGGER_TICKS || isTriggerBlocked(ctx.state, unit)) {
        continue;
      }

      fire(ctx, unit, entry, ctx.nextSequence());
    }
  }
}

function pendingTarget(ctx: ResolutionContext, pending: PendingCast, source: UnitState, ability: AbilityDefinition): UnitState | null {
  if (pending.targetUnitId !== null && ability.targetPolicy !== "busiest-corpse") {
    const original = findUnit(ctx.state, pending.targetUnitId);

    if (original !== null && original.alive && (original.teamId === source.teamId || !isUntargetable(original))) {
      return original;
    }
  }

  if (!source.alive && ability.targetPolicy === "self") {
    return source;
  }

  return resolveCastTarget(ability, source, ctx.state.units);
}

export function processPendingCasts(ctx: ResolutionContext): BudgetBreach | null {
  const tick = ctx.state.tick;
  const due = ctx.state.pendingCasts.filter((pending) => pending.castAtTick <= tick);

  if (due.length === 0) {
    return null;
  }

  ctx.state.pendingCasts = ctx.state.pendingCasts.filter((pending) => pending.castAtTick > tick);

  const rank = priorityRank(ctx.state);
  due.sort((a, b) => rankOf(rank, a.sourceUnitId) - rankOf(rank, b.sourceUnitId) || a.order - b.order);

  const castThisTick = new Set<UnitId>();
  let processed = 0;

  for (const pending of due) {
    if (castThisTick.has(pending.sourceUnitId)) {
      ctx.state.pendingCasts.push({ ...pending, castAtTick: tick + 1 });

      continue;
    }

    const source = findUnit(ctx.state, pending.sourceUnitId);
    const ability = source?.abilities[pending.abilityId];

    if (source === null || ability === undefined || (!source.alive && !pending.fromCorpse) || (source.alive && source.control !== null)) {
      continue;
    }

    const target = pendingTarget(ctx, pending, source, ability);

    if (target === null) {
      continue;
    }

    castThisTick.add(source.unitId);
    processed += 1;

    if (processed > MAX_TRIGGERED_CASTS_PER_TICK) {
      return { rootActionSequence: pending.chain.root, depthReached: processed };
    }

    const castSequence = ctx.nextSequence();
    ctx.state.castChains[castSequence] = pending.chain;

    const event: CastEvent = {
      kind: "cast",
      tick,
      sequence: castSequence,
      sourceUnitId: source.unitId,
      abilityId: ability.id,
      targetUnitId: target.unitId,
      isBasicAttack: false,
      triggered: true,
      chainRoot: pending.chain.root,
      chainLink: pending.chain.link,
    };

    if (ability.id === source.ultimateId) {
      event.ultimate = true;
    }

    if (pending.repeat !== null) {
      event.repeat = pending.repeat;
    }

    if (pending.trigger !== null) {
      event.trigger = pending.trigger;
    }

    ctx.events.push(event);

    payAbilityHp(ctx, source, ability);

    resolveCast(
      ctx,
      { source, ability, castSequence, isBasicAttack: false, scale: pending.scale, flags: CAST_FLAGS, critBonus: 0, repeat: pending.repeat, triggered: true },
      target,
    );
  }

  return null;
}

export function processPendingStrikes(ctx: ResolutionContext): void {
  const tick = ctx.state.tick;
  const due = ctx.state.pendingStrikes.filter((strike) => strike.atTick <= tick);

  if (due.length === 0) {
    return;
  }

  ctx.state.pendingStrikes = ctx.state.pendingStrikes.filter((strike) => strike.atTick > tick);

  const rank = priorityRank(ctx.state);
  due.sort((a, b) => rankOf(rank, a.sourceUnitId) - rankOf(rank, b.sourceUnitId) || a.order - b.order);

  for (const strike of due) {
    const source = findUnit(ctx.state, strike.sourceUnitId);
    const target = findUnit(ctx.state, strike.targetUnitId);
    const ability = source?.abilities[strike.abilityId];

    if (source === null || target === null || ability === undefined || !source.alive || !target.alive || source.control !== null || isUntargetable(target)) {
      continue;
    }

    resolveOnTarget(
      ctx,
      { source, ability, castSequence: strike.causeSequence, isBasicAttack: false, scale: strike.scale, flags: CAST_FLAGS, critBonus: 0, repeat: "multistrike" },
      target,
      strike.effects,
    );
  }
}
