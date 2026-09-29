import type { BoardCell, HeroDefinitionId } from "@jev-game/game";
import type { PlayerId, RunId } from "./ids.js";
import { isSeatReady, requireSeat } from "./readiness.js";
import type { ControllerKind, PlayerSeat, RoundState, RunPhase, RunState } from "./types.js";
import type { RunRules } from "./rules.js";

export interface PublicSeat {
  playerId: PlayerId;
  displayName: string;
  controllerKind: ControllerKind;
  runHealth: number;
  eliminated: boolean;
}

export interface OwnSeat extends PublicSeat {
  heroIds: HeroDefinitionId[];
  formation: BoardCell[];
  decisionRevision: number;
  ready: boolean;
}

export interface PlayerView {
  runId: RunId;
  phase: RunPhase;
  phaseEpoch: number;
  rules: RunRules;
  you: OwnSeat;
  players: Record<PlayerId, PublicSeat>;
  currentRound: RoundState | null;
  draftPool: HeroDefinitionId[];
  draftSelection: HeroDefinitionId[];
  winnerPlayerIds: PlayerId[] | null;
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

export function getPlayerView(state: RunState, playerId: PlayerId): PlayerView {
  const seat = requireSeat(state, playerId);
  const players: Record<PlayerId, PublicSeat> = {};

  for (const other of Object.values(state.players)) {
    players[other.playerId] = toPublicSeat(other);
  }

  return {
    runId: state.runId,
    phase: state.phase,
    phaseEpoch: state.phaseEpoch,
    rules: state.rules,
    you: {
      ...toPublicSeat(seat),
      heroIds: seat.heroIds,
      formation: seat.formation,
      decisionRevision: seat.decisionRevision,
      ready: isSeatReady(state, playerId),
    },
    players,
    currentRound: state.currentRound,
    draftPool: state.draftPool,
    draftSelection: state.draftSelectionByPlayer[playerId] ?? [],
    winnerPlayerIds: state.winnerPlayerIds,
  };
}
