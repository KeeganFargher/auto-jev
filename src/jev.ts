import { z } from "zod";
import type { DecisionResult } from "./types.js";

export interface DecisionQuestion { instructions: string; criteria: Record<string, string>; hints: Record<string, number> }
export interface DecisionEngine { readonly source: "jev" | "offline"; choose(state: Record<string, unknown>, question: DecisionQuestion): Promise<DecisionResult> }

/** Calls the Jev model once per consequential faction decision; the model sees only the supplied state. */
class CloudflareJevDecisionEngine implements DecisionEngine {
  public readonly source = "jev";
  public constructor(private readonly accountId: string, private readonly apiToken: string, private readonly identity: string) {}

  public async choose(state: Record<string, unknown>, question: DecisionQuestion): Promise<DecisionResult> {
    const startedAt = performance.now();
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "typesafe/jev", input: { state: { commander: this.identity, ...state }, questions: { decision: { type: "choice", instructions: question.instructions, criteria: question.criteria } } } }),
      signal: AbortSignal.timeout(12_000),
    });
    const responseText = await response.text();
    if (!response.ok) {
      const errorResult = cloudflareErrorSchema.safeParse(JSON.parse(responseText));
      throw new Error(errorResult.success ? (errorResult.data.errors[0]?.message ?? `Jev request failed with ${response.status}`) : `Jev request failed with ${response.status}`);
    }
    const parsed = jevApiResponseSchema.parse(JSON.parse(responseText));
    const answer = parsed.answers.decision;
    if (answer === undefined) throw new Error("Jev returned no decision");
    return { choice: answer.choice, probabilities: answer.probabilities, confidence: answer.confidence, latencyMs: Math.round(performance.now() - startedAt), source: "jev", usage: { inputTokens: parsed.usage?.input_tokens ?? 0, outputTokens: parsed.usage?.output_tokens ?? 0 } };
  }
}

/** A deterministic stand-in for development and headless tests only; it is not an AI and never runs unless requested. */
export class OfflineDecisionEngine implements DecisionEngine {
  public readonly source = "offline";
  private seed: number;
  public constructor(seed: number, private readonly delayMs = 60) { this.seed = seed >>> 0; }
  private random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  public async choose(_state: Record<string, unknown>, question: DecisionQuestion): Promise<DecisionResult> {
    const startedAt = performance.now();
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const ids = Object.keys(question.criteria);
    if (ids.length === 0) throw new Error("Offline engine needs at least one option");
    const scores = ids.map((id) => Math.max(0.01, question.hints[id] ?? 1) * (0.55 + this.random() * 0.9));
    const total = scores.reduce((sum, score) => sum + score, 0);
    const probabilities = Object.fromEntries(ids.map((id, index) => [id, Number(((scores[index] ?? 0) / total).toFixed(3))]));
    let best = 0;
    scores.forEach((score, index) => { if (score > (scores[best] ?? 0)) best = index; });
    const choice = ids[best];
    if (choice === undefined) throw new Error("Offline engine lost its choice");
    return { choice, probabilities, confidence: probabilities[choice] ?? 0, latencyMs: Math.round(performance.now() - startedAt), source: "offline", usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

const choiceAnswerSchema = z.object({ type: z.literal("choice"), choice: z.string().min(1), confidence: z.number().min(0).max(1), probabilities: z.record(z.string(), z.number().min(0).max(1)) });
const jevModelResponseSchema = z.object({ answers: z.record(z.string(), choiceAnswerSchema), usage: z.object({ input_tokens: z.number().nonnegative().optional(), output_tokens: z.number().nonnegative().optional() }).optional() });
const jevApiResponseSchema = z.union([
  jevModelResponseSchema,
  z.object({ result: jevModelResponseSchema }),
  z.object({ result: z.object({ state: z.literal("Completed"), result: jevModelResponseSchema }) }),
]).transform((response) => {
  if ("answers" in response) return response;
  if ("answers" in response.result) return response.result;
  return response.result.result;
});
const cloudflareErrorSchema = z.object({ errors: z.array(z.object({ message: z.string().optional() })) });

/** Creates an independent, stateless commander for one faction; JEV_ENGINE=offline selects the development stub. */
export function createDecisionEngine(identity: string, seed: number): DecisionEngine {
  if (process.env.JEV_ENGINE === "offline") return new OfflineDecisionEngine(seed);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (accountId === undefined || apiToken === undefined) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required (or set JEV_ENGINE=offline for the development stub)");
  return new CloudflareJevDecisionEngine(accountId, apiToken, identity);
}
