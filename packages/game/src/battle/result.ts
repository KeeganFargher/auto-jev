import type { TeamId } from "../ids.js";

export type BattleResult =
  | { kind: "win"; winningTeamId: TeamId; endedAtTick: number }
  | { kind: "draw"; reason: "mutual-elimination" | "timeout"; endedAtTick: number }
  | { kind: "failure"; reason: string; endedAtTick: number };
