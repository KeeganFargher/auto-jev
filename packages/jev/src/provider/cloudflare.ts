import { z } from "zod";
import type { Fetch, JsonValue } from "@typesafe-ai/sdk";
import { answerEnvelopeSchema, choiceFromEnvelope } from "./parse-response.js";
import { JevProviderFailure, type JevProvider } from "./types.js";

export const CLOUDFLARE_JEV_MODEL = "typesafe/jev";

const DECISION_QUESTION = "decision";

export interface CloudflareProviderOptions {
  accountId: string;
  apiToken: string;
  model: string;
  timeoutMilliseconds: number;
  fetch: Fetch | null;
}

const cloudflareResponseSchema = z
  .union([
    answerEnvelopeSchema,
    z.object({ result: answerEnvelopeSchema }),
    z.object({ result: z.object({ state: z.literal("Completed"), result: answerEnvelopeSchema }) }),
  ])
  .transform((response) => {
    if ("answers" in response) {
      return response;
    }

    return "answers" in response.result ? response.result : response.result.result;
  });

const cloudflareErrorSchema = z.object({
  errors: z.array(z.object({ message: z.string().optional() })),
});

function readJson(text: string): JsonValue | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createCloudflareProvider(options: CloudflareProviderOptions): JevProvider {
  const send = options.fetch ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run`;

  return {
    source: "jev",
    model: options.model,

    async choose(question, signal) {
      const timeout = AbortSignal.timeout(options.timeoutMilliseconds);
      let status = 0;
      let text = "";

      try {
        const response = await send(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.apiToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.model,
            input: {
              state: question.state,
              questions: {
                [DECISION_QUESTION]: { type: "choice", instructions: question.instructions, criteria: question.options },
              },
            },
          }),
          signal: AbortSignal.any([signal, timeout]),
        });

        status = response.status;
        text = await response.text();
      } catch (error) {
        if (signal.aborted) {
          throw new JevProviderFailure("aborted", "the request was aborted");
        }

        if (timeout.aborted) {
          throw new JevProviderFailure("timeout", `no answer within ${options.timeoutMilliseconds} ms`);
        }

        throw new JevProviderFailure("connection", error instanceof Error ? error.message : "the request failed");
      }

      const body = readJson(text);

      if (status < 200 || status >= 300) {
        const failure = cloudflareErrorSchema.safeParse(body);
        const detail = failure.success ? (failure.data.errors[0]?.message ?? "") : "";

        throw new JevProviderFailure(status === 429 ? "rate-limited" : "http-error", `HTTP ${status}: ${detail}`);
      }

      const parsed = cloudflareResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw new JevProviderFailure("invalid-response", `the Cloudflare response did not validate: ${parsed.error.message}`);
      }

      return choiceFromEnvelope(parsed.data, DECISION_QUESTION, Object.keys(question.options), options.model);
    },
  };
}
