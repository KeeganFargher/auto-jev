import type {
  ActionKind,
  ColonyPriority,
  DecisionBatchResult,
  DecisionResult, Building, Incident, Strategy,
} from "./types.js";
import type { SkillId, Stock } from "./catalog.js";
import type { settlementSummary } from "./progression.js";
import { ORDER_JOB_LIMIT, REPEAT_JOBS } from "./development.js";
import { z } from "zod";

interface ChoiceQuestion {
  instructions: string;
  criteria: Record<string, string>;
}

export interface PriorityDecisionState extends ReturnType<typeof settlementSummary> {
  population: number;
  housing: number;
  averageHealth: number;
  food: number;
  water: number;
  wood: number;
  stone: number;
}

export interface ColonistDecisionState {
  colonist: {
    name: string;
    health: number;
    hunger: number;
    thirst: number;
    fatigue: number;
    trait: string;
    skills: { building: number; gathering: number };
    level: number; experience: number; talents: Partial<Record<SkillId, number>>; skillPoints: number; equipment: { tool: number; weapon: number };
  };
  colony: ReturnType<typeof settlementSummary> & {
    assignments: Record<string, number>;
    priority: ColonyPriority;
    population: number;
    housing: number;
    food: number;
    water: number;
    wood: number;
    stone: number;
  };
}

export interface ColonistDecisionRequest {
  colonistId: string;
  state: ColonistDecisionState;
  choices: Partial<Record<ActionKind, string>>;
}

interface ColonistBatchState {
  rules: string;
  actions: Record<string, string>;
  repeatableActions: ActionKind[];
  colony: ColonistDecisionState["colony"];
  colonists: Array<ColonistDecisionState["colonist"] & { id: string }>;
}

interface JevRunResult {
  response: JevModelResponse;
  latencyMs: number;
}

export interface CouncilState {
  colony:string; day:number; population:number; stock:Stock; plan:Strategy;
  development:ReturnType<typeof settlementSummary>; incident:Incident|null;
  buildings:Array<Pick<Building,"id"|"kind"|"tier"|"status"> & {staff:number}>; briefing:string;
}

export interface DecisionEngine {
  chooseCouncil(state: CouncilState, choices: Record<string,string>): Promise<DecisionResult>;
  chooseActions(requests: ColonistDecisionRequest[]): Promise<DecisionBatchResult>;
  choosePriority(
    state: PriorityDecisionState,
    choices: Record<ColonyPriority, string>,
  ): Promise<DecisionResult>;
}

class CloudflareJevDecisionEngine implements DecisionEngine {
  public constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly identity: string,
  ) {}

  public async chooseActions(
    requests: ColonistDecisionRequest[],
  ): Promise<DecisionBatchResult> {
    const firstRequest = requests[0];
    if (firstRequest === undefined) throw new Error("A Jev batch requires at least one colonist");

    const counts = new Map<string, number>();
    for (const request of requests) for (const description of Object.values(request.choices)) counts.set(description, (counts.get(description) ?? 0) + 1);
    const shared = new Map([...counts].filter(([, count]) => count > 1).map(([description], index) => [description, `a${index}`]));
    const state: ColonistBatchState = {
      rules: `Weigh needs, traits, skills and long-term development; decide trade-offs yourself. Criteria referencing actions use that shared description. Unlisted talents have rank zero. Repeatable actions authorize up to ${ORDER_JOB_LIMIT} jobs, with meal/drink/rest breaks and resumption. Stop for unavailable inputs, full stores, milestones or strategic changes. Coordinate with colony.assignments and other answers; avoid competing for the same materials or unique project.`,
      actions: Object.fromEntries([...shared].map(([description, key]) => [key, description])),
      repeatableActions: [...REPEAT_JOBS].filter((action) => requests.some((request) => action in request.choices)),
      colony: firstRequest.state.colony,
      colonists: requests.map((request) => ({
        id: request.colonistId,
        ...request.state.colonist,
      })),
    };
    const questions = Object.fromEntries(
      requests.map((request, index) => [
        `c${index}`,
        {
          instructions: `Choose state.colonists[${index}]'s action using state.rules.`,
          criteria: Object.fromEntries(Object.entries(request.choices).map(([action, description]) => [action, shared.has(description) ? `See state.actions.${shared.get(description)}` : description])),
        },
      ]),
    );
    const run = await this.run(state, questions);

    return {
      answers: requests.map((request, index) => {
        const answer = run.response.answers[`c${index}`];
        if (answer === undefined) throw new Error(`Jev returned no answer for ${request.colonistId}`);
        return {
          colonistId: request.colonistId,
          decision: {
            choice: answer.choice,
            probabilities: answer.probabilities,
            confidence: answer.confidence,
            latencyMs: run.latencyMs,
            source: "jev",
          },
        };
      }),
      usage: readUsage(run.response),
    };
  }

  /** Makes one strategic or event choice with a self-contained colony briefing. */
  public async chooseCouncil(state: CouncilState, choices: Record<string,string>): Promise<DecisionResult> {
    const run = await this.run(state, { decision: {instructions: "You lead this settlement. Choose a consequential investment or event response. Balance resilience, growth, industrial capability and frontier opportunity. Compare the future benefits, not just today's stock. A chosen project commits workers and materials until completion or a blocked-plan review. There is no prescribed build order. Choose only a supplied option.", criteria: choices} });
    const answer=run.response.answers.decision;
    if(answer===undefined)throw new Error("Jev returned no council answer");
    return {choice:answer.choice,probabilities:answer.probabilities,confidence:answer.confidence,source:"jev",latencyMs:run.latencyMs,usage:readUsage(run.response)};
  }

  public async choosePriority(
    state: PriorityDecisionState,
    choices: Record<ColonyPriority, string>,
  ): Promise<DecisionResult> {
    const run = await this.run(state, {
      decision: {
        instructions:
          "Choose the colony priority by balancing current needs, resilience, and long-term development. Only choose from the supplied priorities.",
        criteria: choices,
      },
    });
    const answer = run.response.answers.decision;
    if (answer === undefined) throw new Error("Jev returned no colony priority answer");
    return {
      choice: answer.choice,
      probabilities: answer.probabilities,
      confidence: answer.confidence,
      latencyMs: run.latencyMs,
      source: "jev",
      usage: readUsage(run.response),
    };
  }

  private async run(
    state: ColonistBatchState | PriorityDecisionState | CouncilState,
    questions: Record<string, ChoiceQuestion>,
  ): Promise<JevRunResult> {
    const startedAt = performance.now();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "typesafe/jev",
          input: {
            state: { commander: this.identity, ...state },
            questions: Object.fromEntries(
              Object.entries(questions).map(([key, question]) => [
                key,
                {
                type: "choice",
                instructions: question.instructions,
                criteria: question.criteria,
                },
              ]),
            ),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      const errorResult = cloudflareErrorSchema.safeParse(JSON.parse(responseText));
      throw new Error(
        errorResult.success
          ? (errorResult.data.errors[0]?.message ?? `Jev request failed with ${response.status}`)
          : `Jev request failed with ${response.status}`,
      );
    }
    return {
      response: jevApiResponseSchema.parse(JSON.parse(responseText)),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});

const jevModelResponseSchema = z.object({
  answers: z.record(z.string(), choiceAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().nonnegative().optional(),
      output_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
});

const jevApiResponseSchema = z
  .union([
    jevModelResponseSchema,
    z.object({ result: jevModelResponseSchema }),
    z.object({
      result: z.object({
        state: z.literal("Completed"),
        result: jevModelResponseSchema,
      }),
    }),
  ])
  .transform((response) => {
    if ("answers" in response) return response;
    if ("answers" in response.result) return response.result;
    return response.result.result;
  });

const cloudflareErrorSchema = z.object({
  errors: z.array(z.object({ message: z.string().optional() })),
});

type JevModelResponse = z.infer<typeof jevModelResponseSchema>;

const readUsage = (response: JevModelResponse): DecisionResult["usage"] => ({
  inputTokens: response.usage?.input_tokens ?? 0,
  outputTokens: response.usage?.output_tokens ?? 0,
});

/** Creates an independent, stateless Jev commander for one colony only. */
export const createDecisionEngine = (identity: string): DecisionEngine => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (accountId === undefined || apiToken === undefined) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required",
    );
  }

  return new CloudflareJevDecisionEngine(accountId, apiToken, identity);
};
