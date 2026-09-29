import type { BoardCell } from "@jev-game/game";
import {
  DEFAULT_RUN_RULES,
  type ControllerKind,
  type PlayerView,
  type PublicSeat,
  type RoundBattle,
  type RoundState,
  type RunPhase,
} from "@jev-game/run";
import type { MatchSession, LobbyInfo, ResolvedRound } from "../src/session/match-session.js";
import type { LiveMatch } from "../src/features/match/model/match-state.js";
import { openLive } from "../src/features/match/model/match-state.js";
import type { SessionSnapshot } from "../src/features/match/model/session-snapshot.js";

export const ME = "p1";

export const RIVAL = "p2";

export const THIRD = "p3";

export const FOURTH = "p4";

export const DRAFT_POOL: string[] = ["paladin", "firebrand", "training-dummy", "sharpshooter"];

export function seatOf(
  playerId: string,
  overrides: Partial<PublicSeat> = {},
  controllerKind: ControllerKind = "human",
): PublicSeat {
  return {
    playerId,
    displayName: `Name ${playerId}`,
    controllerKind,
    runHealth: 13,
    eliminated: false,
    ...overrides,
  };
}

export function battleBetween(
  battleId: string,
  teamA: string,
  teamB: string,
  winner: string | null,
): RoundBattle {
  return {
    battleId,
    teamAPlayerId: teamA,
    teamBPlayerId: teamB,
    setup: {
      rulesetId: "test",
      rulesetVersion: 1,
      seed: 1,
      arenaId: "board",
      tickLimit: 100,
      units: [],
    },
    result:
      winner === null
        ? { kind: "draw", reason: "timeout", endedAtTick: 100, damageDealt: {} }
        : { kind: "win", winningTeamId: winner, endedAtTick: 40, damageDealt: {} },
    winnerSurvivors: winner === null ? null : 1,
    presentationSeconds: 5,
    digest: `digest-${battleId}`,
  };
}

export function roundOf(
  round: number,
  battles: RoundBattle[],
  byePlayerId: string | null = null,
): RoundState {
  return {
    round,
    pairings: battles.map(({ battleId, teamAPlayerId, teamBPlayerId }) => ({
      battleId,
      teamAPlayerId,
      teamBPlayerId,
    })),
    byePlayerId,
    battles,
  };
}

export interface ViewOptions {
  phaseEpoch?: number;
  ready?: boolean;
  eliminated?: boolean;
  heroIds?: string[];
  draftSelection?: string[];
  players?: PublicSeat[];
  currentRound?: RoundState | null;
  winnerPlayerIds?: string[] | null;
  formation?: BoardCell[];
}

export function viewOf(phase: RunPhase, options: ViewOptions = {}): PlayerView {
  const players = options.players ?? [seatOf(ME), seatOf(RIVAL), seatOf(THIRD), seatOf(FOURTH)];
  const me = players.find((seat) => seat.playerId === ME);

  if (me === undefined) {
    throw new Error("A fixture view needs the local player among its seats");
  }

  return {
    runId: "run-1",
    phase,
    phaseEpoch: options.phaseEpoch ?? 1,
    rules: DEFAULT_RUN_RULES,
    you: {
      ...me,
      eliminated: options.eliminated ?? me.eliminated,
      heroIds: options.heroIds ?? [],
      formation: options.formation ?? [],
      decisionRevision: 0,
      ready: options.ready ?? false,
    },
    players: Object.fromEntries(players.map((seat) => [seat.playerId, seat])),
    currentRound: options.currentRound ?? null,
    draftPool: DRAFT_POOL,
    draftSelection: options.draftSelection ?? [],
    winnerPlayerIds: options.winnerPlayerIds ?? null,
  };
}

export function snapshotOf(
  view: PlayerView | null,
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    playerId: view === null ? null : view.you.playerId,
    view,
    lobby: null,
    deadline: null,
    connection: "connected",
    latestRound: null,
    ...overrides,
  };
}

export function resolvedRound(
  round: number,
  battles: RoundBattle[],
  players: PublicSeat[],
  byePlayerId: string | null = null,
): ResolvedRound {
  return {
    round,
    battles,
    byePlayerId,
    seats: Object.fromEntries(players.map((seat) => [seat.playerId, seat])),
  };
}

export function lobbyOf(
  hostPlayerId: string,
  seats: Partial<LobbyInfo["seats"][number]>[],
  roomId: string = "room-1",
): LobbyInfo {
  return {
    roomId,
    hostPlayerId,
    started: false,
    seats: seats.map((seat, index) => ({
      playerId: `p${index + 1}`,
      sessionId: `session-${index + 1}`,
      displayName: `Name p${index + 1}`,
      controller: "human",
      connected: true,
      thinking: false,
      ...seat,
    })),
  };
}

export interface FakeSession extends MatchSession {
  readonly calls: string[];
  readonly disposals: { disposed: number; suspended: number };
  publish(snapshot: SessionSnapshot): void;
}

export function createFakeSession(initial: SessionSnapshot): FakeSession {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const disposals = { disposed: 0, suspended: 0 };

  return {
    calls,
    disposals,

    publish(next) {
      snapshot = next;

      for (const listener of Array.from(listeners)) {
        listener();
      }
    },

    playerId: () => snapshot.playerId,
    getView: () => snapshot.view,
    getLobby: () => snapshot.lobby,
    getDeadline: () => snapshot.deadline,
    roundElapsedSeconds: () => 0,
    connection: () => snapshot.connection,
    isAway: () => false,
    isThinking: () => false,
    getLatestRound: () => snapshot.latestRound,

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    startMatch() {
      calls.push("startMatch");
    },

    selectHeroes(heroIds) {
      calls.push(`selectHeroes:${heroIds.join(",")}`);
    },

    pickHeroes(heroIds) {
      calls.push(`pickHeroes:${heroIds.join(",")}`);
    },

    confirmReady() {
      calls.push("confirmReady");
    },

    markWatched() {
      calls.push("markWatched");
    },

    placeHeroes(formation) {
      calls.push(`placeHeroes:${formation.length}`);
    },

    suspend() {
      disposals.suspended += 1;
    },

    dispose() {
      disposals.disposed += 1;
    },
  };
}

export function liveOf(
  view: PlayerView | null,
  overrides: Partial<SessionSnapshot> = {},
): LiveMatch {
  const snapshot = snapshotOf(view, overrides);

  return openLive(createFakeSession(snapshot), snapshot);
}
