import type { BattleResult, BattleSetup, BoardCell, HeroDefinitionId } from "@jev-game/game";
import type { PlayerId, RunId } from "./ids.js";
import type { Pairing, PairingHistory } from "./pairings.js";
import type { RunRules } from "./rules.js";

export type ControllerKind = "human" | "random-bot" | "jev";

export interface PlayerSeat {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
  heroIds: HeroDefinitionId[];
  formation: BoardCell[];
  runHealth: number;
  eliminated: boolean;
  forfeited: boolean;
  decisionRevision: number;
}

export type RunPhase = "lobby" | "draft" | "preparing" | "round-result" | "finished";

export interface RoundBattle extends Pairing {
  setup: BattleSetup;
  result: BattleResult;
  winnerSurvivors: number | null;
  presentationSeconds: number;
  digest: string;
}

export interface RoundState {
  round: number;
  pairings: Pairing[];
  byePlayerId: PlayerId | null;
  battles: RoundBattle[];
}

export interface RunState {
  runId: RunId;
  runSeed: number;
  phase: RunPhase;
  phaseEpoch: number;
  rules: RunRules;
  draftPool: HeroDefinitionId[];
  initialPlayerIds: PlayerId[];
  players: Record<PlayerId, PlayerSeat>;
  pairingHistory: PairingHistory;
  currentRound: RoundState | null;
  readyThresholdByPlayer: Record<PlayerId, number>;
  draftSelectionByPlayer: Record<PlayerId, HeroDefinitionId[]>;
  winnerPlayerIds: PlayerId[] | null;
}
