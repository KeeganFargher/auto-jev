import type { UnitId } from "../ids.js";
import type { AbilityDefinitionId } from "../ids.js";
import type { ConditionKind, ControlKind, DotKind, EffectDefinition } from "../definitions.js";
import type { UnitState } from "./state.js";

export interface ShieldStatus {
  amount: number;
  expiresAtTick: number;
}

export interface SlowStatus {
  speedMultiplier: number;
  expiresAtTick: number;
}

export interface ConditionStatus {
  condition: ConditionKind;
  sourceUnitId: UnitId;
  expiresAtTick: number;
}

export interface ControlStatus {
  control: ControlKind;
  sourceUnitId: UnitId;
  expiresAtTick: number;
}

export interface LinkStatus {
  linkId: number;
  sourceUnitId: UnitId;
  fraction: number;
  expiresAtTick: number;
}

export interface ChannelStatus {
  abilityId: AbilityDefinitionId;
  castSequence: number;
  endsAtTick: number;
  nextPulseTick: number;
  periodTicks: number;
  radiusUnits: number;
  effects: EffectDefinition[];
}

export interface TauntStatus {
  byUnitId: UnitId;
  expiresAtTick: number;
}

export interface DotStatus {
  dot: DotKind;
  sourceUnitId: UnitId;
  stacks: number;
  maxStacks: number;
  damagePerStackPerSecond: number;
  expiresAtTick: number;
  nextTickAt: number;
}

export type ExpiringStatus = "shield" | "slow" | "condition" | "control" | "taunt" | "invulnerable" | "untargetable" | "link" | "channel";

export function expireShield(unit: UnitState, tick: number): boolean {
  if (unit.shield === null || unit.shield.expiresAtTick > tick) {
    return false;
  }

  unit.shield = null;

  return true;
}

export function expireSlow(unit: UnitState, tick: number): boolean {
  if (unit.slow === null || unit.slow.expiresAtTick > tick) {
    return false;
  }

  unit.slow = null;

  return true;
}

export function expireTimedStatuses(unit: UnitState, tick: number): ExpiringStatus[] {
  const expired: ExpiringStatus[] = [];

  if (unit.condition !== null && unit.condition.expiresAtTick <= tick) {
    unit.condition = null;
    expired.push("condition");
  }

  if (unit.control !== null && unit.control.expiresAtTick <= tick) {
    unit.control = null;
    expired.push("control");
  }

  if (unit.taunt !== null && unit.taunt.expiresAtTick <= tick) {
    unit.taunt = null;
    expired.push("taunt");
  }

  if (unit.invulnerableUntilTick !== 0 && unit.invulnerableUntilTick <= tick) {
    unit.invulnerableUntilTick = 0;
    expired.push("invulnerable");
  }

  if (unit.untargetableUntilTick !== 0 && unit.untargetableUntilTick <= tick) {
    unit.untargetableUntilTick = 0;
    expired.push("untargetable");
  }

  if (unit.link !== null && unit.link.expiresAtTick <= tick) {
    unit.link = null;
    expired.push("link");
  }

  if (unit.channel !== null && unit.channel.endsAtTick <= tick) {
    unit.channel = null;
    expired.push("channel");
  }

  return expired;
}

export function isControlled(unit: UnitState): boolean {
  return unit.control !== null;
}

export function isUnstoppable(unit: UnitState): boolean {
  return unit.channel !== null;
}

export function isSummon(unit: UnitState): boolean {
  return unit.summonerUnitId !== null;
}

export function isInvulnerable(unit: UnitState): boolean {
  return unit.invulnerableUntilTick !== 0;
}

export function isUntargetable(unit: UnitState): boolean {
  return unit.untargetableUntilTick !== 0;
}
