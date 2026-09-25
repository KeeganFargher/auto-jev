import type { BoardCell, HeroBuild } from "@jev-game/game";
import type { PlayerId, RunId } from "./ids.js";
import { isSeatReady } from "./readiness.js";
import type {
  ControllerKind,
  HeroOffer,
  OwnedGem,
  OwnedPiece,
  PendingDecision,
  PlayerSeat,
  RoundState,
  RunPhase,
  RunState,
} from "./types.js";
import type { RunRules } from "./rules.js";

export interface PublicSeat {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
  runHealth: number;
  eliminated: boolean;
}

export interface OwnSeat extends PublicSeat {
  heroBuilds: HeroBuild[];
  formation: BoardCell[];
  items: OwnedPiece[];
  gems: OwnedGem[];
  decisionRevision: number;
  ready: boolean;
}

export interface PlayerView {
  runId: RunId;
  phase: RunPhase;
  phaseEpoch: number;
  roundCap: number;
  rules: RunRules;
  you: OwnSeat;
  players: Record<PlayerId, PublicSeat>;
  currentRound: RoundState | null;
  heroOffers: HeroOffer[];
  draftSelection: string[];
  pendingDecisions: PendingDecision[];
  winnerPlayerIds: PlayerId[] | null;
  abortReason: string | null;
}

function toPublicSeat(seat: PlayerSeat): PublicSeat {
  return {
    playerId: seat.playerId,
    displayName: seat.displayName,
    controllerKind: seat.controllerKind,
    runHealth: seat.runHealth,
    eliminated: seat.eliminated,
  };
}

export function getPlayerView(state: RunState, playerId: PlayerId): PlayerView | null {
  const seat = state.players[playerId];

  if (seat === undefined) {
    return null;
  }

  const players: Record<PlayerId, PublicSeat> = {};

  for (const other of Object.values(state.players)) {
    players[other.playerId] = toPublicSeat(other);
  }

  return {
    runId: state.runId,
    phase: state.phase,
    phaseEpoch: state.phaseEpoch,
    roundCap: state.roundCap,
    rules: state.rules,
    you: {
      ...toPublicSeat(seat),
      heroBuilds: seat.heroBuilds,
      formation: seat.formation,
      items: seat.items,
      gems: seat.gems,
      decisionRevision: seat.decisionRevision,
      ready: isSeatReady(state, playerId),
    },
    players,
    currentRound: state.currentRound,
    heroOffers: state.heroOffersByPlayer[playerId] ?? [],
    draftSelection: state.draftSelectionByPlayer[playerId] ?? [],
    pendingDecisions: state.pendingDecisionsByPlayer[playerId] ?? [],
    winnerPlayerIds: state.winnerPlayerIds,
    abortReason: state.abortReason,
  };
}
