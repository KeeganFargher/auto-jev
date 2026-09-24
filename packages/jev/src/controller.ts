import type { Catalogue } from "@jev-game/game";
import { decideBotCommand, type PlayerView, type RunCommand } from "@jev-game/run";
import { JevProviderFailure, type ChoiceAnswer, type ChoiceQuestionInput, type JevProvider } from "./provider/types.js";
import { OBSERVATION_VERSION, type RoundOutcome } from "./observations/build-observation.js";
import { draftQuestion } from "./decisions/choose-hero.js";
import { rewardQuestion, type PreviewLoadout } from "./decisions/choose-reward.js";
import type { DecisionRecord, JevDecisionKind } from "./decision-record.js";

export const SUPERSEDED = "superseded";

export interface SeatDecisionContext {
  view: PlayerView;
  catalogue: Catalogue;
  provider: JevProvider;
  history: readonly RoundOutcome[];
  controllerSeed: number;
  signal: AbortSignal;
  preview: PreviewLoadout;
  now: () => number;
}

export interface SeatDecision {
  command: RunCommand | null;
  records: DecisionRecord[];
}

interface Asked {
  answer: ChoiceAnswer | null;
  record: DecisionRecord;
}

export function needsJevDecision(view: PlayerView): boolean {
  if (view.you.eliminated) {
    return false;
  }

  if (view.phase === "draft") {
    return !view.you.ready;
  }

  return view.phase === "reward" && view.pendingDecisions.length > 0;
}

function baseRecord(context: SeatDecisionContext, kind: JevDecisionKind, options: string[]): DecisionRecord {
  const { view } = context;

  return {
    runId: view.runId,
    playerId: view.you.playerId,
    phase: view.phase,
    phaseEpoch: view.phaseEpoch,
    decisionRevision: view.you.decisionRevision,
    round: view.currentRound?.round ?? 0,
    kind,
    observationVersion: OBSERVATION_VERSION,
    model: null,
    source: "fallback",
    options,
    choice: null,
    probabilities: null,
    confidence: null,
    durationMilliseconds: 0,
    usage: null,
    fallbackReason: null,
  };
}

async function ask(context: SeatDecisionContext, kind: JevDecisionKind, question: ChoiceQuestionInput): Promise<Asked> {
  const record = baseRecord(context, kind, Object.keys(question.options));
  const startedAt = context.now();

  try {
    const answer = await context.provider.choose(question, context.signal);

    return {
      answer,
      record: {
        ...record,
        model: answer.model,
        source: context.provider.source,
        choice: answer.choice,
        probabilities: answer.probabilities,
        confidence: answer.confidence,
        durationMilliseconds: context.now() - startedAt,
        usage: answer.usage,
      },
    };
  } catch (error) {
    let reason: string = error instanceof JevProviderFailure ? error.reason : "provider-error";

    if (context.signal.aborted) {
      reason = context.signal.reason === SUPERSEDED ? SUPERSEDED : "deadline";
    }

    return {
      answer: null,
      record: { ...record, model: context.provider.model, durationMilliseconds: context.now() - startedAt, fallbackReason: reason },
    };
  }
}

function fallbackRecord(context: SeatDecisionContext, kind: JevDecisionKind, reason: string): DecisionRecord {
  return { ...baseRecord(context, kind, []), fallbackReason: reason };
}

function isLegal(context: SeatDecisionContext, command: RunCommand | null): boolean {
  return command !== null && context.preview(command) !== null;
}

async function decideDraft(context: SeatDecisionContext): Promise<SeatDecision> {
  const { view, catalogue } = context;
  const fallback = decideBotCommand(view, context.controllerSeed, catalogue);
  const fallbackOrder = fallback?.kind === "commit-draft" ? fallback.offerIds : [];
  const picked: string[] = [];
  const records: DecisionRecord[] = [];
  let failed = false;

  for (let pick = 0; pick < view.rules.draftPicks; pick += 1) {
    const step = draftQuestion(view, catalogue, picked, context.history);

    if (step === null) {
      break;
    }

    let offerId: string | undefined;

    if (!failed) {
      const asked = await ask(context, "draft-pick", step.question);
      offerId = asked.answer === null ? undefined : step.offerIdByOption.get(asked.answer.choice);
      records.push(asked.record);
      failed = offerId === undefined;
    }

    if (offerId === undefined) {
      offerId = fallbackOrder.find((candidate) => !picked.includes(candidate)) ?? [...step.offerIdByOption.values()][0];

      if (records.length < pick + 1) {
        records.push(fallbackRecord(context, "draft-pick", "earlier-pick-failed"));
      }
    }

    if (offerId === undefined) {
      break;
    }

    picked.push(offerId);
  }

  const command: RunCommand = {
    kind: "commit-draft",
    playerId: view.you.playerId,
    offerIds: picked,
    expectedRevision: view.you.decisionRevision,
  };

  if (isLegal(context, command)) {
    return { command, records };
  }

  return { command: fallback, records: [...records, fallbackRecord(context, "draft-pick", "illegal-command")] };
}

async function decideReward(context: SeatDecisionContext): Promise<SeatDecision> {
  const { view, catalogue } = context;
  const decision = view.pendingDecisions[0];
  const fallback = decideBotCommand(view, context.controllerSeed, catalogue);
  const step = decision === undefined ? null : rewardQuestion(view, catalogue, decision, context.history, context.preview);

  if (step === null) {
    return { command: fallback, records: [fallbackRecord(context, "reward", "no-legal-option")] };
  }

  const asked = await ask(context, "reward", step.question);
  const chosen = asked.answer === null ? undefined : step.commandByOption.get(asked.answer.choice);

  if (chosen !== undefined && isLegal(context, chosen)) {
    return { command: chosen, records: [asked.record] };
  }

  const reason = asked.record.fallbackReason ?? "illegal-command";

  return { command: fallback, records: [{ ...asked.record, source: "fallback", fallbackReason: reason }] };
}

export function decideForSeat(context: SeatDecisionContext): Promise<SeatDecision> {
  if (context.view.phase === "draft") {
    return decideDraft(context);
  }

  return decideReward(context);
}
