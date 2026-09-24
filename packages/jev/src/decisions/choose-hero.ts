import type { Catalogue } from "@jev-game/game";
import type { PlayerView } from "@jev-game/run";
import type { ChoiceQuestionInput } from "../provider/types.js";
import { buildObservation, type RoundOutcome } from "../observations/build-observation.js";
import { describeTraitChange, describeTraits, heroName, heroSummary, traitsOf } from "../observations/describe.js";
import { optionKey } from "./option-keys.js";

export interface DraftQuestion {
  question: ChoiceQuestionInput;
  offerIdByOption: Map<string, string>;
}

function pickedHeroIds(view: PlayerView, pickedOfferIds: readonly string[]): string[] {
  const heroIds: string[] = [];

  for (const offerId of pickedOfferIds) {
    const offer = view.heroOffers.find((candidate) => candidate.offerId === offerId);

    if (offer !== undefined) {
      heroIds.push(offer.heroId);
    }
  }

  return heroIds;
}

export function draftQuestion(
  view: PlayerView,
  catalogue: Catalogue,
  pickedOfferIds: readonly string[],
  history: readonly RoundOutcome[],
): DraftQuestion | null {
  const remaining = view.heroOffers.filter((offer) => !pickedOfferIds.includes(offer.offerId));

  if (remaining.length === 0) {
    return null;
  }

  const picked = pickedHeroIds(view, pickedOfferIds);
  const before = traitsOf(picked, catalogue);
  const options: Record<string, string> = {};
  const offerIdByOption = new Map<string, string>();

  for (const offer of remaining) {
    const key = optionKey(heroName(catalogue, offer.heroId), new Set(offerIdByOption.keys()));
    const change = picked.length === 0 ? [] : describeTraitChange(before, traitsOf([...picked, offer.heroId], catalogue));
    const synergy = change.length === 0 ? "" : ` With your picks it ${change.join(" and ")}.`;

    options[key] = `${heroSummary(catalogue, offer.heroId)}${synergy}`;
    offerIdByOption.set(key, offer.offerId);
  }

  const picks = view.rules.draftPicks;

  return {
    question: {
      state: {
        ...buildObservation(view, catalogue, history),
        draft: {
          picked: picked.map((heroId) => heroName(catalogue, heroId)),
          picksLeft: picks - picked.length,
          synergiesSoFar: describeTraits(before, catalogue),
        },
      },
      instructions: `Draft pick ${picked.length + 1} of ${picks}. Choose the hero to add to your team. The heroes fight on their own, so choose the hero that makes the strongest team together with the heroes in \`draft.picked\`.`,
      options,
    },
    offerIdByOption,
  };
}
