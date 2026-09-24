import { z } from "zod";
import type { Questions, SystemOneResult } from "@typesafe-ai/sdk";
import { JevProviderFailure, type ChoiceAnswer } from "./types.js";

const probability = z.number().min(0).max(1);

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: probability,
  probabilities: z.record(z.string(), probability),
});

export const answerEnvelopeSchema = z.object({
  model: z.string().min(1).optional(),
  answers: z.record(z.string(), z.object({ type: z.string() }).loose()),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type AnswerEnvelope = z.infer<typeof answerEnvelopeSchema>;

export function choiceFromEnvelope(
  envelope: AnswerEnvelope,
  questionId: string,
  optionKeys: readonly string[],
  requestedModel: string,
): ChoiceAnswer {
  const answer = choiceAnswerSchema.safeParse(envelope.answers[questionId]);

  if (!answer.success) {
    throw new JevProviderFailure("invalid-response", `the "${questionId}" answer did not validate: ${answer.error.message}`);
  }

  if (!optionKeys.includes(answer.data.choice)) {
    throw new JevProviderFailure("unknown-option", `"${answer.data.choice}" is not one of the offered options`);
  }

  return {
    choice: answer.data.choice,
    probabilities: answer.data.probabilities,
    confidence: answer.data.confidence,
    model: envelope.model ?? requestedModel,
    usage: { inputTokens: envelope.usage?.input_tokens ?? 0, outputTokens: envelope.usage?.output_tokens ?? 0 },
  };
}

export function parseChoiceAnswer(
  result: SystemOneResult<Questions>,
  questionId: string,
  optionKeys: readonly string[],
  requestedModel: string,
): ChoiceAnswer {
  const envelope = answerEnvelopeSchema.safeParse(result);

  if (!envelope.success) {
    throw new JevProviderFailure("invalid-response", `the response envelope did not validate: ${envelope.error.message}`);
  }

  return choiceFromEnvelope(envelope.data, questionId, optionKeys, requestedModel);
}
