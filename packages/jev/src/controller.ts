import type { HeroDefinitionId } from "@jev-game/game";
import { decideBotCommand, type PlayerView, type RunCommand } from "@jev-game/run";
import {
  JevProviderFailure,
  type ChoiceAnswer,
  type ChoiceQuestionInput,
  type JevProvider,
} from "./provider/types.js";
import { OBSERVATION_VERSION } from "./observations/build-observation.js";
import { chosenHero, draftQuestion } from "./decisions/choose-hero.js";
import type { DecisionRecord } from "./decision-record.js";

export const SUPERSEDED = "superseded";

export const DEADLINE = "deadline";

export const EARLIER_PICK_FAILED = "earlier-pick-failed";

export interface SeatDecisionContext {
  view: PlayerView;
  provider: JevProvider;
  controllerSeed: number;
  signal: AbortSignal;
  isLegal: (command: RunCommand) => boolean;
  now: () => number;
}

export interface SeatDecision {
  command: RunCommand;
  records: DecisionRecord[];
}

interface Asked {
  answer: ChoiceAnswer | null;
  record: DecisionRecord;
}

export function needsJevDecision(view: PlayerView): boolean {
  return view.phase === "draft" && !view.you.eliminated && !view.you.ready;
}

function baseRecord(view: PlayerView, pick: number, options: string[]): DecisionRecord {
  return {
    runId: view.runId,
    playerId: view.you.playerId,
    phaseEpoch: view.phaseEpoch,
    decisionRevision: view.you.decisionRevision,
    pick,
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

async function ask(
  context: SeatDecisionContext,
  pick: number,
  question: ChoiceQuestionInput,
): Promise<Asked> {
  const record = baseRecord(context.view, pick, Object.keys(question.options));
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
    if (!(error instanceof JevProviderFailure)) {
      throw error;
    }

    const abortedBy = context.signal.reason === SUPERSEDED ? SUPERSEDED : DEADLINE;
    const reason = context.signal.aborted ? abortedBy : error.reason;

    return {
      answer: null,
      record: {
        ...record,
        model: context.provider.model,
        durationMilliseconds: context.now() - startedAt,
        fallbackReason: reason,
      },
    };
  }
}

function botDraft(view: PlayerView, controllerSeed: number): readonly HeroDefinitionId[] {
  const command = decideBotCommand(view, controllerSeed);

  if (command === null || command.kind !== "commit-draft") {
    throw new Error(`The baseline bot has no draft for ${view.you.playerId}`);
  }

  return command.heroIds;
}

function nextBotPick(
  botPicks: readonly HeroDefinitionId[],
  picked: readonly HeroDefinitionId[],
): HeroDefinitionId {
  const heroId = botPicks.find((candidate) => !picked.includes(candidate));

  if (heroId === undefined) {
    throw new Error(`The baseline draft ${botPicks.join(", ")} has nothing left to add`);
  }

  return heroId;
}

export async function decideDraft(context: SeatDecisionContext): Promise<SeatDecision> {
  const { view } = context;

  if (!needsJevDecision(view)) {
    throw new Error(`${view.you.playerId} has no draft to decide in ${view.phase}`);
  }

  const botPicks = botDraft(view, context.controllerSeed);
  const picked: HeroDefinitionId[] = [];
  const records: DecisionRecord[] = [];
  let failed = false;

  for (let pick = 1; pick <= view.rules.draftPicks; pick += 1) {
    const step = draftQuestion(view, picked);

    if (failed) {
      records.push({
        ...baseRecord(view, pick, step.heroIds),
        fallbackReason: EARLIER_PICK_FAILED,
      });
      picked.push(nextBotPick(botPicks, picked));
      continue;
    }

    const asked = await ask(context, pick, step.question);
    records.push(asked.record);

    if (asked.answer === null) {
      failed = true;
      picked.push(nextBotPick(botPicks, picked));
      continue;
    }

    picked.push(chosenHero(step, asked.answer));
  }

  const command: RunCommand = {
    kind: "commit-draft",
    playerId: view.you.playerId,
    heroIds: picked,
    expectedRevision: view.you.decisionRevision,
  };

  if (!context.isLegal(command)) {
    throw new Error(`Jev drafted a team the run refuses: ${picked.join(", ")}`);
  }

  return { command, records };
}
