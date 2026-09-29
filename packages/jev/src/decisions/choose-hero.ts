import type { HeroDefinitionId } from "@jev-game/game";
import type { PlayerView } from "@jev-game/run";
import type { ChoiceAnswer, ChoiceQuestionInput } from "../provider/types.js";
import { buildObservation } from "../observations/build-observation.js";
import { heroName, heroSummary } from "../observations/describe.js";

export interface DraftQuestion {
  question: ChoiceQuestionInput;
  heroIds: HeroDefinitionId[];
}

export function draftQuestion(
  view: PlayerView,
  picked: readonly HeroDefinitionId[],
): DraftQuestion {
  const picks = view.rules.draftPicks;
  const heroIds = view.draftPool.filter((heroId) => !picked.includes(heroId));

  if (picked.length >= picks || heroIds.length === 0) {
    throw new Error(`${view.you.playerId} has no draft pick left to ask about`);
  }

  return {
    question: {
      state: {
        ...buildObservation(view),
        draft: {
          picked: picked.map(heroName),
          picksLeft: picks - picked.length,
        },
      },
      instructions: `Draft pick ${picked.length + 1} of ${picks}. Choose the hero to add to your team. The heroes fight on their own, so choose the hero whose signature best sets up, or pays off, the heroes in \`draft.picked\`.`,
      options: Object.fromEntries(heroIds.map((heroId) => [heroId, heroSummary(heroId)])),
    },
    heroIds,
  };
}

export function chosenHero(step: DraftQuestion, answer: ChoiceAnswer): HeroDefinitionId {
  const heroId = step.heroIds.find((candidate) => candidate === answer.choice);

  if (heroId === undefined) {
    throw new Error(
      `The provider chose "${answer.choice}", which is not one of ${step.heroIds.join(", ")}`,
    );
  }

  return heroId;
}
