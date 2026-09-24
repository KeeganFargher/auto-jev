import type { PlayerId } from "./ids.js";
import type { RunState } from "./types.js";

export function isSeatReady(state: RunState, playerId: PlayerId): boolean {
  const seat = state.players[playerId];

  if (seat === undefined) {
    return false;
  }

  if (state.phase === "reward") {
    return (state.pendingDecisionsByPlayer[playerId] ?? []).length === 0;
  }

  const threshold = state.readyThresholdByPlayer[playerId] ?? -1;

  return seat.decisionRevision > threshold;
}

export function activePairedPlayerIds(state: RunState): PlayerId[] {
  if (state.currentRound === null) {
    return [];
  }

  const ids: PlayerId[] = [];

  for (const battle of Object.values(state.currentRound.battles)) {
    ids.push(battle.teamAPlayerId, battle.teamBPlayerId);
  }

  return ids;
}

export function activePlayerIds(state: RunState): PlayerId[] {
  return Object.values(state.players)
    .filter((seat) => !seat.eliminated)
    .map((seat) => seat.playerId);
}

export function pairablePlayerIds(state: RunState): PlayerId[] {
  return Object.values(state.players)
    .filter((seat) => !seat.eliminated && !seat.forfeited)
    .map((seat) => seat.playerId);
}

export function allRequiredSeatsReady(state: RunState, requiredPlayerIds: readonly PlayerId[]): boolean {
  return requiredPlayerIds.every((playerId) => isSeatReady(state, playerId));
}
