import type { PlayerId, PlayerView, PublicSeat, RoundBattle } from "@jev-game/run";
import type { BoardCell } from "@jev-game/game";

export interface ResolvedRound {
  round: number;
  battles: RoundBattle[];
  byePlayerId: PlayerId | null;
  seats: Record<PlayerId, PublicSeat>;
}

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "lost";

export interface LobbySeatInfo {
  playerId: string;
  sessionId: string;
  displayName: string;
  controller: "human" | "bot";
  connected: boolean;
  thinking: boolean;
}

export interface LobbyInfo {
  roomId: string;
  hostPlayerId: string;
  started: boolean;
  seats: LobbySeatInfo[];
}

export interface MatchSession {
  playerId(): string | null;
  getView(): PlayerView | null;
  getLobby(): LobbyInfo | null;
  getDeadline(): number | null;
  roundElapsedSeconds(): number;
  connection(): ConnectionState;
  isAway(playerId: string): boolean;
  isThinking(playerId: string): boolean;
  getLatestRound(): ResolvedRound | null;
  subscribe(listener: () => void): () => void;
  startMatch(): void;
  selectHeroes(heroIds: readonly string[]): void;
  pickHeroes(heroIds: readonly string[]): void;
  confirmReady(): void;
  markWatched(): void;
  placeHeroes(formation: readonly BoardCell[]): void;
  suspend(): void;
  dispose(): void;
}
