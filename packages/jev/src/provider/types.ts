import type { JsonValue } from "@typesafe-ai/sdk";

export type JevSource = "jev" | "offline";

export interface JevState {
  [field: string]: JsonValue;
}

export interface ChoiceQuestionInput {
  state: JevState;
  instructions: string;
  options: Record<string, string>;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  model: string;
  usage: ProviderUsage;
}

export interface JevProvider {
  readonly source: JevSource;
  readonly model: string;
  choose(question: ChoiceQuestionInput, signal: AbortSignal): Promise<ChoiceAnswer>;
}

export type ProviderFailureReason =
  | "timeout"
  | "aborted"
  | "connection"
  | "rate-limited"
  | "http-error"
  | "invalid-response"
  | "unknown-option"
  | "provider-error";

export class JevProviderFailure extends Error {
  readonly reason: ProviderFailureReason;

  constructor(reason: ProviderFailureReason, message: string) {
    super(message);
    this.name = "JevProviderFailure";
    this.reason = reason;
  }
}
