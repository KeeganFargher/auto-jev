import type { UnitId } from "../ids.js";
import type { BattleResult } from "./result.js";

export type BattleEvent =
  | { kind: "attack-hit"; tick: number; sequence: number; sourceUnitId: UnitId; targetUnitId: UnitId; amount: number }
  | { kind: "death"; tick: number; sequence: number; unitId: UnitId }
  | { kind: "battle-ended"; tick: number; sequence: number; result: BattleResult };
