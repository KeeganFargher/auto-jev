import type { TeamId, UnitId } from "../ids.js";

export type BattleResult =
  | {
      kind: "win";
      winningTeamId: TeamId;
      endedAtTick: number;
      damageDealt: Record<UnitId, number>;
    }
  | {
      kind: "draw";
      reason: "mutual-elimination" | "timeout";
      endedAtTick: number;
      damageDealt: Record<UnitId, number>;
    }
  | {
      kind: "failure";
      reason: string;
      endedAtTick: number;
      damageDealt: Record<UnitId, number>;
    };
