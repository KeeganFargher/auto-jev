import type { BattleResult } from "@jev-game/game";
import type {
  Pairing,
  PlayerId,
  PlayerView,
  PublicSeat,
  RoundBattle,
  RoundState,
} from "@jev-game/run";

export type Seats = Record<PlayerId, PublicSeat>;

export const URGENT_SECONDS = 3;

export const SEAT_COUNT = 8;

const SEAT_COLOR_COUNT = 8;

export type SeatTone = "neutral" | "live" | "won" | "lost";

export function seatOf(seats: Seats, playerId: string): PublicSeat {
  const seat = seats[playerId];

  if (seat === undefined) {
    throw new Error(`The match has no seat for player "${playerId}"`);
  }

  return seat;
}

export function displayName(seats: Seats, playerId: string): string {
  return seatOf(seats, playerId).displayName;
}

export function opponentOf(pairing: Pairing, playerId: string): PlayerId {
  if (pairing.teamAPlayerId === playerId) {
    return pairing.teamBPlayerId;
  }

  if (pairing.teamBPlayerId === playerId) {
    return pairing.teamAPlayerId;
  }

  throw new Error(`Player "${playerId}" is not in ${pairing.battleId}`);
}

export function pairingOf<T extends Pairing>(pairings: readonly T[], playerId: string): T | null {
  return (
    pairings.find(
      (pairing) => pairing.teamAPlayerId === playerId || pairing.teamBPlayerId === playerId,
    ) ?? null
  );
}

export function roundOf(view: PlayerView): RoundState {
  if (view.currentRound === null) {
    throw new Error(`The ${view.phase} phase arrived without a round`);
  }

  return view.currentRound;
}

export function winnersOf(view: PlayerView): PlayerId[] {
  const winners = view.winnerPlayerIds;

  if (winners === null || winners.length === 0) {
    throw new Error(`The ${view.phase} phase arrived without winners`);
  }

  return winners;
}

export function roundLabel(round: number): string {
  return `Round ${round + 1}`;
}

export function secondsUntil(deadline: number, now: number): number {
  return Math.max(1, Math.ceil((deadline - now) / 1000));
}

export function seatColorAt(index: number): string {
  return `var(--color-seat-${(index % SEAT_COLOR_COUNT) + 1})`;
}

export function seatColor(seats: Seats, playerId: string): string {
  const index = Object.keys(seats).indexOf(playerId);

  if (index === -1) {
    throw new Error(`The match has no seat for player "${playerId}"`);
  }

  return seatColorAt(index);
}

export function outcomeFor(result: BattleResult, playerId: string): SeatTone {
  if (result.kind === "draw") {
    return "neutral";
  }

  return result.winningTeamId === playerId ? "won" : "lost";
}

export function outcomeTag(result: BattleResult, playerId: string): string {
  if (result.kind === "draw") {
    return "Draw";
  }

  return result.winningTeamId === playerId ? "Won" : "Lost";
}

export function boardOwnerLabel(seats: Seats, ownerId: string, meId: string): string {
  return ownerId === meId ? "Your board" : `${displayName(seats, ownerId)}'s board`;
}

export function battleStatus(seats: Seats, battle: RoundBattle, ended: boolean): string {
  if (!ended) {
    return "Fighting";
  }

  const result = battle.result;

  if (result.kind === "draw") {
    return result.reason === "timeout" ? "Time's up · draw" : "Draw";
  }

  return `${displayName(seats, result.winningTeamId)} won`;
}
