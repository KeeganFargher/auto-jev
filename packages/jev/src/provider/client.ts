import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  choice,
  TypeSafeClient,
  type Fetch,
  type TypeSafeClientConfig,
} from "@typesafe-ai/sdk";
import { parseChoiceAnswer } from "./parse-response.js";
import { JevProviderFailure, type JevProvider } from "./types.js";

export const DEFAULT_JEV_MODEL = "jev-latest";

export const DEFAULT_REQUEST_TIMEOUT_MILLISECONDS = 5000;

const DECISION_QUESTION = "decision";

export interface TypeSafeProviderOptions {
  apiKey: string;
  model: string;
  timeoutMilliseconds: number;
  fetch: Fetch | null;
}

function failureFrom(error: Error | null): JevProviderFailure {
  if (error instanceof JevProviderFailure) {
    return error;
  }

  if (error instanceof APIUserAbortError) {
    return new JevProviderFailure("aborted", error.message);
  }

  if (error instanceof APITimeoutError) {
    return new JevProviderFailure("timeout", error.message);
  }

  if (error instanceof APIConnectionError) {
    return new JevProviderFailure("connection", error.message);
  }

  if (error instanceof APIError) {
    return new JevProviderFailure(error.status === 429 ? "rate-limited" : "http-error", `HTTP ${error.status}: ${error.message}`);
  }

  return new JevProviderFailure("provider-error", error?.message ?? "the provider failed without an error");
}

export function createTypeSafeProvider(options: TypeSafeProviderOptions): JevProvider {
  const config: TypeSafeClientConfig = {
    apiKey: options.apiKey,
    defaultModel: options.model,
    timeout: options.timeoutMilliseconds,
    retry: { maxRetries: 0 },
    logLevel: "off",
  };

  if (options.fetch !== null) {
    config.fetch = options.fetch;
  }

  const client = new TypeSafeClient(config);

  return {
    source: "jev",
    model: options.model,

    async choose(question, signal) {
      try {
        const result = await client.systemOne(
          { state: question.state, questions: { [DECISION_QUESTION]: choice(question.instructions, question.options) } },
          { signal },
        );

        return parseChoiceAnswer(result, DECISION_QUESTION, Object.keys(question.options), options.model);
      } catch (error) {
        throw failureFrom(error instanceof Error ? error : null);
      }
    },
  };
}
