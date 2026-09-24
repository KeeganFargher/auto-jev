import { ColyseusSDK, MatchMakeError, ServerError, type Room } from "@colyseus/sdk";
import type { GameServer } from "@jev-game/server-runtime/contract";
import { JOIN_REFUSAL_CODES, MATCH_ROOM_NAME, PROTOCOL_VERSION } from "@jev-game/protocol";

const DEFAULT_SERVER_PORT = 2567;

const RESUME_KEY = "jev-game.online-seat";

export type MatchConnectTarget =
  | { kind: "solo" }
  | { kind: "quick" }
  | { kind: "room"; roomId: string }
  | { kind: "resume"; token: string };

function serverEndpoint(): string {
  const configured = import.meta.env.VITE_SERVER_URL;

  if (configured !== undefined && configured !== "") {
    return configured;
  }

  const scheme = location.protocol === "https:" ? "wss" : "ws";

  return `${scheme}://${location.hostname}:${DEFAULT_SERVER_PORT}`;
}

const sdk = new ColyseusSDK<GameServer>(serverEndpoint());

type MatchRoomType = GameServer["~rooms"]["match"]["~room"];

export type MatchRoomConnection = Room<MatchRoomType>;

export async function connectMatchRoom(target: MatchConnectTarget): Promise<MatchRoomConnection> {
  const options = { protocolVersion: PROTOCOL_VERSION };

  if (target.kind === "resume") {
    return sdk.reconnect<typeof MATCH_ROOM_NAME>(target.token);
  }

  if (target.kind === "room") {
    return sdk.joinById(target.roomId, options);
  }

  if (target.kind === "solo") {
    return sdk.create(MATCH_ROOM_NAME, { ...options, solo: true });
  }

  return sdk.joinOrCreate(MATCH_ROOM_NAME, options);
}

export function savedResumeToken(): string | null {
  try {
    return sessionStorage.getItem(RESUME_KEY);
  } catch {
    return null;
  }
}

export function saveResumeToken(token: string | null): void {
  try {
    if (token === null) {
      sessionStorage.removeItem(RESUME_KEY);
    } else {
      sessionStorage.setItem(RESUME_KEY, token);
    }
  } catch {
    return;
  }
}

export function joinFailureMessage(reason: Error): string {
  const code = reason instanceof ServerError || reason instanceof MatchMakeError ? reason.code : null;

  if (code === JOIN_REFUSAL_CODES.started) {
    return "That match has already started";
  }

  if (code === JOIN_REFUSAL_CODES.full) {
    return "That lobby is full";
  }

  if (code === JOIN_REFUSAL_CODES.outdated) {
    return "The game was updated · reload the page";
  }

  return code !== null && Number.isInteger(code) ? "Couldn't join that match" : "Couldn't reach the game server · is it running?";
}
