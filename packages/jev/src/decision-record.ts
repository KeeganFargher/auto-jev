import type { RunCommand, RunPhase } from "@jev-game/run";
import type { ProviderUsage } from "./provider/types.js";

export type DecisionSource = "jev" | "offline" | "fallback";

export type JevDecisionKind = "draft-pick" | "reward";

export interface DecisionRecord {
  runId: string;
  playerId: string;
  phase: RunPhase;
  phaseEpoch: number;
  decisionRevision: number;
  round: number;
  kind: JevDecisionKind;
  observationVersion: number;
  model: string | null;
  source: DecisionSource;
  options: string[];
  choice: string | null;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  durationMilliseconds: number;
  usage: ProviderUsage | null;
  fallbackReason: string | null;
}

export interface ReplayEntry {
  playerId: string;
  phaseEpoch: number;
  decisionRevision: number;
  command: RunCommand;
}

export function replayKey(playerId: string, phaseEpoch: number, decisionRevision: number): string {
  return `${playerId}:${phaseEpoch}:${decisionRevision}`;
}
