import type { PlayerId, PlayerView } from "@jev-game/run";
import { seatColor, seatOf, type Seats } from "./match-model.js";

export interface Contestant {
  playerId: PlayerId;
  name: string;
  human: boolean;
  color: string;
}

export interface BattleHeaderState {
  friendly: Contestant;
  enemy: Contestant;
  status: string;
}

export function contestantOf(seats: Seats, playerId: PlayerId): Contestant {
  const seat = seatOf(seats, playerId);

  return {
    playerId,
    name: seat.displayName,
    human: seat.controllerKind === "human",
    color: seatColor(seats, playerId),
  };
}

export function versusHeader(
  seats: Seats,
  friendlyId: PlayerId,
  enemyId: PlayerId,
  status: string,
): BattleHeaderState {
  return {
    friendly: contestantOf(seats, friendlyId),
    enemy: contestantOf(seats, enemyId),
    status,
  };
}

export function placementHeader(view: PlayerView, opponentId: PlayerId): BattleHeaderState {
  const status = view.you.ready ? "Ready · waiting for the others" : "Drag heroes to place them";

  return versusHeader(view.players, view.you.playerId, opponentId, status);
}
