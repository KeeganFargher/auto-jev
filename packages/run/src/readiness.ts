import type { PlayerId } from "./ids.js";
import type { PlayerSeat, RoundState, RunState } from "./types.js";

export function requireSeat(state: RunState, playerId: PlayerId): PlayerSeat {
  const seat = state.players[playerId];

  if (seat === undefined) {
    throw new Error(`Run ${state.runId} has no player "${playerId}"`);
  }

  return seat;
}

export function requireRound(state: RunState): RoundState {
  if (state.currentRound === null) {
    throw new Error(`Run ${state.runId} is in ${state.phase} without a round`);
  }

  return state.currentRound;
}

export function isSeatReady(state: RunState, playerId: PlayerId): boolean {
  const seat = requireSeat(state, playerId);
  const threshold = state.readyThresholdByPlayer[playerId];

  return threshold === undefined || seat.decisionRevision > threshold;
}

export function activePlayerIds(state: RunState): PlayerId[] {
  return Object.values(state.players).flatMap((seat) => (seat.eliminated ? [] : [seat.playerId]));
}

export function pairablePlayerIds(state: RunState): PlayerId[] {
  return Object.values(state.players).flatMap((seat) =>
    seat.eliminated || seat.forfeited ? [] : [seat.playerId],
  );
}

export function pairedPlayerIds(round: RoundState): PlayerId[] {
  return round.pairings.flatMap((pairing) => [pairing.teamAPlayerId, pairing.teamBPlayerId]);
}

export function allSeatsReady(state: RunState, playerIds: readonly PlayerId[]): boolean {
  return playerIds.every((playerId) => isSeatReady(state, playerId));
}
