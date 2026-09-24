import type {
  BattleResult,
  BattleSetup,
  BoardCell,
  HeroBuild,
  HeroDefinitionId,
  Rarity,
  UpgradeDefinitionId,
} from "@jev-game/game";
import type { BattleId, PlayerId, RunId } from "./ids.js";
import type { PairingHistory } from "./pairings.js";
import type { RunRules } from "./rules.js";

export type ControllerKind = "human" | "random-bot" | "heuristic-bot" | "jev";

export interface OwnedPiece {
  instanceId: string;
  pieceId: UpgradeDefinitionId;
  heroSlot: number | null;
}

export interface PlayerSeat {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
  heroBuilds: HeroBuild[];
  formation: BoardCell[];
  items: OwnedPiece[];
  runes: OwnedPiece[];
  nextInstanceId: number;
  runHealth: number;
  eliminated: boolean;
  forfeited: boolean;
  decisionRevision: number;
}

export type RunPhase =
  | "lobby"
  | "draft"
  | "preparing"
  | "battle"
  | "round-result"
  | "reward"
  | "finished";

export interface HeroOffer {
  offerId: string;
  heroId: HeroDefinitionId;
}

export type RewardOfferKind = "item" | "rune" | "talent" | "recruit" | "train";

export interface RewardOffer {
  offerId: string;
  kind: RewardOfferKind;
  pieceId: UpgradeDefinitionId | null;
  heroId: HeroDefinitionId | null;
  heroSlot: number | null;
  rarity: Rarity | null;
}

export type DecisionKind = "item" | "rune" | "talent" | "recruit";

export interface PendingDecision {
  decisionId: string;
  kind: DecisionKind;
  heroSlot: number | null;
  tier: number | null;
  offers: RewardOffer[];
}

export interface RoundBattle {
  battleId: BattleId;
  teamAPlayerId: PlayerId;
  teamBPlayerId: PlayerId;
  setup: BattleSetup | null;
  result: BattleResult | null;
  winnerSurvivors: number | null;
}

export interface RoundState {
  round: number;
  battles: Record<BattleId, RoundBattle>;
  byePlayerId: PlayerId | null;
}

export interface RunState {
  runId: RunId;
  runSeed: number;
  phase: RunPhase;
  phaseEpoch: number;
  roundCap: number;
  rules: RunRules;
  initialPlayerIds: PlayerId[];
  players: Record<PlayerId, PlayerSeat>;
  pairingHistory: PairingHistory;
  currentRound: RoundState | null;
  readyThresholdByPlayer: Record<PlayerId, number>;
  heroOffersByPlayer: Record<PlayerId, HeroOffer[]>;
  draftSelectionByPlayer: Record<PlayerId, string[]>;
  pendingDecisionsByPlayer: Record<PlayerId, PendingDecision[]>;
  lastRoundLoserIds: PlayerId[];
  winnerPlayerIds: PlayerId[] | null;
  abortReason: string | null;
}
