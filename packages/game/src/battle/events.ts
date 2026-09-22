import type { AbilityDefinitionId, UnitId } from "../ids.js";
import type { BattleResult } from "./result.js";

export type BattleEvent =
  | {
      kind: "cast";
      tick: number;
      sequence: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      targetUnitId: UnitId;
      isBasicAttack: boolean;
    }
  | {
      kind: "damage-dealt";
      tick: number;
      sequence: number;
      causeSequence: number;
      sourceUnitId: UnitId;
      targetUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      amount: number;
      shieldAbsorbed: number;
    }
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
      kind: "cast-fizzled";
      tick: number;
      sequence: number;
      sourceUnitId: UnitId;
      abilityId: AbilityDefinitionId;
      targetUnitId: UnitId;
    }
  | { kind: "status-expired"; tick: number; sequence: number; unitId: UnitId; status: "shield" }
  | { kind: "death"; tick: number; sequence: number; unitId: UnitId }
  | { kind: "battle-ended"; tick: number; sequence: number; result: BattleResult };
