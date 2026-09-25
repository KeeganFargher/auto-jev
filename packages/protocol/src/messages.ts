import { z } from "zod";
import type { PlayerView } from "@jev-game/run";

export const PROTOCOL_VERSION = 9;

export const MATCH_ROOM_NAME = "match";

export const MAX_DISPLAY_NAME_LENGTH = 20;

export const JOIN_REFUSAL_CODES = {
  started: 4403,
  full: 4409,
  outdated: 4426,
} as const;

const identifier = z.string().min(1).max(64);

const boardCell = z.object({
  column: z.number().int().min(0).max(63),
  row: z.number().int().min(0).max(63),
});

const heroSlot = z.number().int().min(0).max(15).nullable();

const skill = z.enum(["ability", "ultimate"]).nullable();

export const commandIntent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("select-heroes"), offerIds: z.array(identifier).max(16) }),
  z.object({ kind: z.literal("commit-draft"), offerIds: z.array(identifier).max(16) }),
  z.object({ kind: z.literal("confirm-ready") }),
  z.object({ kind: z.literal("place-heroes"), formation: z.array(boardCell).max(16) }),
  z.object({ kind: z.literal("choose-offer"), decisionId: identifier, offerId: identifier, heroSlot, skill }),
  z.object({ kind: z.literal("move-item"), instanceId: identifier, heroSlot }),
  z.object({ kind: z.literal("socket-gem"), instanceId: identifier, heroSlot, skill }),
  z.object({ kind: z.literal("discard-item"), instanceId: identifier }),
]);

export type CommandIntent = z.infer<typeof commandIntent>;

export const commandMessage = z.object({
  commandId: identifier,
  runId: identifier,
  phaseEpoch: z.number().int().min(0),
  expectedRevision: z.number().int().min(0),
  intent: commandIntent,
});

export type CommandMessage = z.infer<typeof commandMessage>;

export const startMessage = z.object({});

export type StartMessage = z.infer<typeof startMessage>;

export const syncMessage = z.object({});

export type SyncMessage = z.infer<typeof syncMessage>;

export const watchedMessage = z.object({
  phaseEpoch: z.number().int().nonnegative(),
});

export type WatchedMessage = z.infer<typeof watchedMessage>;

export const joinOptions = z.object({
  name: z.string().trim().max(MAX_DISPLAY_NAME_LENGTH).optional(),
  protocolVersion: z.number().int().optional(),
  solo: z.boolean().optional(),
});

export type JoinOptions = z.infer<typeof joinOptions>;

export type CommandRejectionReason =
  | "not-started"
  | "not-seated"
  | "stale-run"
  | "stale-epoch"
  | "wrong-phase"
  | "unknown-player"
  | "already-eliminated"
  | "already-decided"
  | "unknown-offer"
  | "duplicate-offer"
  | "invalid-offer-count"
  | "ineligible-upgrade"
  | "invalid-formation"
  | "stale-revision"
  | "unknown-decision"
  | "unknown-piece"
  | "no-room"
  | "team-full"
  | "gem-does-not-fit";

export interface AckMessage {
  commandId: string;
  accepted: boolean;
  reason: CommandRejectionReason | null;
}

export interface ViewMessage {
  view: PlayerView;
  phaseStartedAt: number;
  deadlineAt: number | null;
  serverNow: number;
}

export interface ServerMessages {
  ack: AckMessage;
  view: ViewMessage;
}

export const SERVER_MESSAGES = {
  ack: "ack",
  view: "view",
} as const;

export const CLIENT_MESSAGES = {
  command: "command",
  start: "start",
  sync: "sync",
  watched: "watched",
} as const;
