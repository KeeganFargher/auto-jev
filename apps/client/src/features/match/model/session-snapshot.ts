import type { PlayerView } from "@jev-game/run";
import type {
  ConnectionState,
  LobbyInfo,
  MatchSession,
  ResolvedRound,
} from "../../../session/match-session.js";

export interface SessionSnapshot {
  playerId: string | null;
  view: PlayerView | null;
  lobby: LobbyInfo | null;
  deadline: number | null;
  connection: ConnectionState;
  latestRound: ResolvedRound | null;
}

export function readSnapshot(session: MatchSession): SessionSnapshot {
  return {
    playerId: session.playerId(),
    view: session.getView(),
    lobby: session.getLobby(),
    deadline: session.getDeadline(),
    connection: session.connection(),
    latestRound: session.getLatestRound(),
  };
}

export function requireView(snapshot: SessionSnapshot): PlayerView {
  if (snapshot.view === null) {
    throw new Error("The match has not sent a view yet");
  }

  return snapshot.view;
}

export function requireDeadline(snapshot: SessionSnapshot, view: PlayerView): number {
  if (snapshot.deadline === null) {
    throw new Error(`The ${view.phase} phase arrived without a deadline`);
  }

  return snapshot.deadline;
}
