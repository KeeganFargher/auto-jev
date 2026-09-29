import type { PlayerId, PlayerView, PublicSeat, RoundBattle } from "@jev-game/run";
import type { LobbyInfo, ResolvedRound } from "../../../session/match-session.js";
import {
  outcomeFor,
  outcomeTag,
  pairingOf,
  seatColor,
  type SeatTone,
  type Seats,
} from "./match-model.js";

export interface SeatRow {
  playerId: string;
  displayName: string;
  human: boolean;
  color: string;
  health: number;
  eliminated: boolean;
  tag: string | null;
  tone: SeatTone;
  isYou: boolean;
  isOpponent: boolean;
  isFocused: boolean;
  watchable: boolean;
}

export function isAway(lobby: LobbyInfo | null, playerId: string): boolean {
  const seat = lobby?.seats.find((candidate) => candidate.playerId === playerId);

  return seat !== undefined && seat.controller === "human" && !seat.connected;
}

export function isThinking(lobby: LobbyInfo | null, playerId: string): boolean {
  return lobby?.seats.find((candidate) => candidate.playerId === playerId)?.thinking === true;
}

function seatRow(
  seats: Seats,
  seat: PublicSeat,
  meId: string,
  overrides: Partial<SeatRow>,
): SeatRow {
  return {
    playerId: seat.playerId,
    displayName: seat.displayName,
    human: seat.controllerKind === "human",
    color: seatColor(seats, seat.playerId),
    health: seat.runHealth,
    eliminated: seat.eliminated,
    tag: null,
    tone: "neutral",
    isYou: seat.playerId === meId,
    isOpponent: false,
    isFocused: false,
    watchable: false,
    ...overrides,
  };
}

function planningTag(
  seat: PublicSeat,
  isYou: boolean,
  isOpponent: boolean,
  away: boolean,
  thinking: boolean,
): string | null {
  if (isYou) {
    return "You";
  }

  if (isOpponent) {
    return "VS";
  }

  if (seat.eliminated) {
    return "Out";
  }

  if (away) {
    return "Away";
  }

  return thinking ? "Thinking" : null;
}

export function planningRows(
  view: PlayerView,
  lobby: LobbyInfo | null,
  opponentId: PlayerId | null,
): SeatRow[] {
  const meId = view.you.playerId;

  return Object.values(view.players).map((seat) => {
    const isOpponent = seat.playerId === opponentId;

    return seatRow(view.players, seat, meId, {
      isOpponent,
      tag: planningTag(
        seat,
        seat.playerId === meId,
        isOpponent,
        isAway(lobby, seat.playerId),
        isThinking(lobby, seat.playerId),
      ),
    });
  });
}

export interface WatchRowInputs {
  resolved: ResolvedRound;
  meId: PlayerId;
  focusedBattleId: string;
  healthBeforeRound: ReadonlyMap<PlayerId, number>;
  hasEnded: (battle: RoundBattle) => boolean;
}

export function watchRows(inputs: WatchRowInputs): SeatRow[] {
  const { resolved, meId, focusedBattleId, healthBeforeRound, hasEnded } = inputs;

  return Object.values(resolved.seats).map((seat) => {
    const playerId = seat.playerId;
    const battle = pairingOf(resolved.battles, playerId);

    if (battle === null) {
      const isBye = resolved.byePlayerId === playerId;

      return seatRow(resolved.seats, seat, meId, {
        eliminated: !isBye && seat.eliminated,
        tag: isBye ? "Bye" : "Out",
      });
    }

    const ended = hasEnded(battle);

    return seatRow(resolved.seats, seat, meId, {
      health: ended ? seat.runHealth : (healthBeforeRound.get(playerId) ?? seat.runHealth),
      eliminated: ended && seat.eliminated,
      tag: ended ? outcomeTag(battle.result, playerId) : "Live",
      tone: ended ? outcomeFor(battle.result, playerId) : "live",
      isFocused: battle.battleId === focusedBattleId,
      watchable: true,
    });
  });
}
