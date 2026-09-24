import type { AbilityDefinitionId, UnitId } from "../ids.js";
import type { ComboKind, ConditionKind, ControlKind, DotKind } from "../definitions.js";
import type { Vector2 } from "../math/vector.js";
import type { BattleResult } from "./result.js";

export type AppliedStatusKind = ControlKind | DotKind | "taunted" | "invulnerable" | "untargetable" | "linked" | "channeling";

export type ExpiredStatusKind =
  | "shield"
  | "slow"
  | "condition"
  | "control"
  | "taunt"
  | "invulnerable"
  | "untargetable"
  | "link"
  | "channel"
  | DotKind;

export type HpPaymentReason = "overcharge" | "blood-contract" | "soulbound";

export interface CastEvent {
  kind: "cast";
  tick: number;
  sequence: number;
  sourceUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  targetUnitId: UnitId;
  isBasicAttack: boolean;
  signature?: true;
  triggered?: true;
}

export interface DamageDealtEvent {
  kind: "damage-dealt";
  tick: number;
  sequence: number;
  causeSequence: number;
  sourceUnitId: UnitId;
  targetUnitId: UnitId;
  abilityId: AbilityDefinitionId;
  amount: number;
  shieldAbsorbed: number;
  crit?: true;
  combo?: ComboKind;
  dot?: DotKind;
  reaction?: true;
  redirectedFrom?: UnitId;
}

export type BattleEvent =
  | CastEvent
  | DamageDealtEvent
  | {
      kind: "healing-done";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      amount: number;
    }
  | {
      kind: "shield-applied";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      amount: number;
      expiresAtTick: number;
    }
  | {
      kind: "slow-applied";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      speedMultiplier: number;
      expiresAtTick: number;
    }
  | {
      kind: "condition-applied";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      condition: ConditionKind;
      expiresAtTick: number;
    }
  | {
      kind: "combo-detonated";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      condition: ConditionKind;
      combo: ComboKind;
      tier: number;
      bonusDamage: number;
    }
  | {
      kind: "status-applied";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      status: AppliedStatusKind;
      expiresAtTick: number;
      stacks?: number;
    }
  | {
      kind: "unit-moved";
      tick: number;
      sequence: number;
      unitId: UnitId;
      from: Vector2;
      to: Vector2;
      reason: "blink" | "knockback";
    }
  | {
      kind: "impact-scheduled";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      center: Vector2;
      radiusUnits: number;
      landsAtTick: number;
    }
  | {
      kind: "impact-landed";
      tick: number;
      sequence: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      center: Vector2;
      radiusUnits: number;
    }
  | {
      kind: "zone-created";
      tick: number;
      sequence: number;
      zoneId: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      center: Vector2;
      radiusUnits: number;
      expiresAtTick: number;
    }
  | { kind: "zone-expired"; tick: number; sequence: number; zoneId: number }
  | {
      kind: "attack-evaded";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
    }
  | { kind: "revived"; tick: number; sequence: number; unitId: UnitId; hp: number }
  | {
      kind: "unit-spawned";
      tick: number;
      sequence: number;
      unitId: UnitId;
      heroId: string;
      teamId: string;
      summonerUnitId: UnitId;
      position: Vector2;
    }
  | { kind: "unit-dismissed"; tick: number; sequence: number; unitId: UnitId }
  | { kind: "passive-triggered"; tick: number; sequence: number; unitId: UnitId; passive: string }
  | { kind: "hp-paid"; tick: number; sequence: number; unitId: UnitId; amount: number; reason: HpPaymentReason }
  | {
      kind: "cast-fizzled";
      tick: number;
      sequence: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      targetUnitId: UnitId;
    }
  | {
      kind: "reaction-budget-exceeded";
      tick: number;
      sequence: number;
      rootActionSequence: number;
      depthReached: number;
    }
  | { kind: "status-expired"; tick: number; sequence: number; unitId: UnitId; status: ExpiredStatusKind }
  | { kind: "death"; tick: number; sequence: number; unitId: UnitId }
  | { kind: "battle-ended"; tick: number; sequence: number; result: BattleResult };
