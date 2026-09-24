import type { BoardCell } from "@jev-game/game";
import type { PlayerView } from "@jev-game/run";
import { CLIENT_MESSAGES, SERVER_MESSAGES, type CommandIntent, type ViewMessage } from "@jev-game/protocol";
import {
  connectMatchRoom,
  savedResumeToken,
  saveResumeToken,
  type MatchConnectTarget,
  type MatchRoomConnection,
} from "../network/connect-room.js";
import type { ConnectionState, LobbyInfo, MatchSession, ResolvedRound } from "./match-session.js";

const REPLAYED_PHASES = new Set(["round-result", "finished"]);

function resolvedRoundFrom(view: PlayerView): ResolvedRound | null {
  const current = view.currentRound;

  if (current === null) {
    return null;
  }

  const battles = Object.values(current.battles);

  if (battles.length === 0 || battles.some((battle) => battle.setup === null || battle.result === null)) {
    return null;
  }

  return {
    round: current.round,
    battles,
    byePlayerId: current.byePlayerId,
    seats: view.players,
    replay: REPLAYED_PHASES.has(view.phase),
  };
}

function nextCommandId(): string {
  return crypto.randomUUID();
}

export async function createOnlineSession(target: MatchConnectTarget): Promise<MatchSession> {
  const room: MatchRoomConnection = await connectMatchRoom(target);
  const listeners = new Set<() => void>();
  let view: PlayerView | null = null;
  let lobby: LobbyInfo | null = null;
  let deadlineAt: number | null = null;
  let clockOffset = 0;
  let latestRound: ResolvedRound | null = null;
  let latestRoundStartedAt = 0;
  let connection: ConnectionState = "connected";
  let leaving = false;
  let lastViewKey = "";

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function mySeatId(): string | null {
    return lobby?.seats.find((seat) => seat.sessionId === room.sessionId)?.playerId ?? null;
  }

  saveResumeToken(room.reconnectionToken);

  room.onStateChange((state) => {
    lobby = {
      roomId: room.roomId,
      hostPlayerId: state.hostPlayerId,
      started: state.started,
      seats: state.seats.map((seat) => ({
        playerId: seat.playerId,
        sessionId: seat.sessionId,
        displayName: seat.displayName,
        controller: seat.controller === "human" ? "human" : "bot",
        connected: seat.connected,
        thinking: seat.thinking,
      })),
    };

    notify();
  });

  room.onMessage(SERVER_MESSAGES.view, (message: ViewMessage) => {
    clockOffset = message.serverNow - Date.now();
    const key = JSON.stringify([message.view, message.phaseStartedAt, message.deadlineAt]);

    if (key === lastViewKey) {
      return;
    }

    lastViewKey = key;
    view = message.view;
    deadlineAt = message.deadlineAt;

    const resolved = resolvedRoundFrom(message.view);

    if (resolved !== null && (latestRound === null || latestRound.round !== resolved.round)) {
      latestRound = resolved;
      latestRoundStartedAt = message.phaseStartedAt;
    }

    notify();
  });

  room.onMessage(SERVER_MESSAGES.ack, (ack) => {
    if (!ack.accepted) {
      lastViewKey = "";
      room.send(CLIENT_MESSAGES.sync, {});
    }
  });

  room.onDrop(() => {
    connection = "reconnecting";
    notify();
  });

  room.onReconnect(() => {
    connection = "connected";
    saveResumeToken(room.reconnectionToken);
    room.send(CLIENT_MESSAGES.sync, {});
    notify();
  });

  room.onLeave(() => {
    if (!leaving) {
      connection = "lost";
      notify();
    }
  });

  room.send(CLIENT_MESSAGES.sync, {});

  function send(intent: CommandIntent): void {
    if (view === null) {
      return;
    }

    room.send(CLIENT_MESSAGES.command, {
      commandId: nextCommandId(),
      runId: view.runId,
      phaseEpoch: view.phaseEpoch,
      expectedRevision: view.you.decisionRevision,
      intent,
    });
  }

  return {
    playerId() {
      return view?.you.playerId ?? mySeatId();
    },

    getView() {
      return view;
    },

    getLobby() {
      return lobby;
    },

    getDeadline() {
      return deadlineAt === null ? null : deadlineAt - clockOffset;
    },

    roundElapsedSeconds() {
      return Math.max(0, (Date.now() + clockOffset - latestRoundStartedAt) / 1000);
    },

    connection() {
      return connection;
    },

    isAway(playerId) {
      const seat = lobby?.seats.find((candidate) => candidate.playerId === playerId);

      return seat !== undefined && seat.controller === "human" && !seat.connected;
    },

    isThinking(playerId) {
      return lobby?.seats.find((candidate) => candidate.playerId === playerId)?.thinking === true;
    },

    getLatestRound() {
      return latestRound;
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },

    startMatch() {
      room.send(CLIENT_MESSAGES.start, {});
    },

    selectHeroes(offerIds) {
      send({ kind: "select-heroes", offerIds: [...offerIds] });
    },

    pickHeroes(offerIds) {
      send({ kind: "commit-draft", offerIds: [...offerIds] });
    },

    chooseOffer(decisionId, offerId, heroSlot) {
      send({ kind: "choose-offer", decisionId, offerId, heroSlot });
    },

    moveItem(instanceId, heroSlot) {
      send({ kind: "move-item", instanceId, heroSlot });
    },

    socketRune(instanceId, heroSlot) {
      send({ kind: "socket-rune", instanceId, heroSlot });
    },

    discardItem(instanceId) {
      send({ kind: "discard-item", instanceId });
    },

    confirmReady() {
      send({ kind: "confirm-ready" });
    },

    markWatched() {
      if (view !== null) {
        room.send(CLIENT_MESSAGES.watched, { phaseEpoch: view.phaseEpoch });
      }
    },

    placeHeroes(formation: readonly BoardCell[]) {
      send({ kind: "place-heroes", formation: formation.map((cell) => ({ column: cell.column, row: cell.row })) });
    },

    suspend() {
      leaving = true;
      listeners.clear();
      room.reconnection.enabled = false;
      room.connection.close();
    },

    dispose() {
      leaving = true;
      listeners.clear();

      if (savedResumeToken()?.startsWith(`${room.roomId}:`) === true) {
        saveResumeToken(null);
      }

      room.leave(true).catch(() => {});
    },
  };
}
