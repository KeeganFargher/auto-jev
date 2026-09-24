import { schema, t, type SchemaType } from "@colyseus/schema";

export const LobbySeat = schema({
  playerId: t.string().default(""),
  sessionId: t.string().default(""),
  displayName: t.string().default(""),
  controller: t.string().default("bot"),
  connected: t.boolean().default(false),
  thinking: t.boolean().default(false),
});

export type LobbySeat = SchemaType<typeof LobbySeat>;

export const MatchState = schema({
  started: t.boolean().default(false),
  hostPlayerId: t.string().default(""),
  phase: t.string().default("lobby"),
  phaseEpoch: t.number().default(0),
  deadlineAt: t.number().default(0),
  seats: t.array(LobbySeat),
});

export type MatchState = SchemaType<typeof MatchState>;
