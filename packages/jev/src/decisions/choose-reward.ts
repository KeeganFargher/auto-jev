import type { Catalogue } from "@jev-game/game";
import {
  hasStashRoom,
  itemCanGoOn,
  piecesOnHero,
  runeCanGoOn,
  type Loadout,
  type PendingDecision,
  type PlayerView,
  type RewardOffer,
  type RunCommand,
} from "@jev-game/run";
import type { ChoiceQuestionInput } from "../provider/types.js";
import { buildObservation, type RoundOutcome } from "../observations/build-observation.js";
import {
  describeTraitChange,
  heroName,
  heroRole,
  heroSummary,
  loadoutTraits,
  pieceName,
  pieceSummary,
} from "../observations/describe.js";
import { optionKey } from "./option-keys.js";

export type PreviewLoadout = (command: RunCommand) => Loadout | null;

export interface RewardQuestion {
  question: ChoiceQuestionInput;
  commandByOption: Map<string, RunCommand>;
}

interface Candidate {
  label: string;
  heroSlot: number | null;
  description: string;
}

function heroAt(view: PlayerView, catalogue: Catalogue, heroSlot: number | null): string {
  const heroId = heroSlot === null ? undefined : view.you.heroBuilds[heroSlot]?.heroId;

  return heroId === undefined ? "a hero" : `${heroName(catalogue, heroId)} (${heroRole(catalogue, heroId)})`;
}

function itemCandidates(view: PlayerView, catalogue: Catalogue, pieceId: string): Candidate[] {
  const candidates: Candidate[] = [];
  const name = pieceName(catalogue, pieceId);

  view.you.heroBuilds.forEach((build, heroSlot) => {
    if (itemCanGoOn(view.you, pieceId, heroSlot, view.rules, catalogue, null)) {
      const held = piecesOnHero(view.you.items, heroSlot).length + 1;

      candidates.push({
        label: `${name} on ${heroName(catalogue, build.heroId)}`,
        heroSlot,
        description: `${pieceSummary(catalogue, pieceId)} Goes on ${heroAt(view, catalogue, heroSlot)}, who would then hold ${held} of ${view.rules.itemSlots} items.`,
      });
    }
  });

  if (candidates.length === 0 || hasStashRoom(view.you, view.rules, null)) {
    candidates.push({
      label: `${name} to stash`,
      heroSlot: null,
      description: `${pieceSummary(catalogue, pieceId)} Kept in the stash to equip later.`,
    });
  }

  return candidates;
}

function runeCandidates(view: PlayerView, catalogue: Catalogue, pieceId: string): Candidate[] {
  const candidates: Candidate[] = [];
  const name = pieceName(catalogue, pieceId);

  view.you.heroBuilds.forEach((build, heroSlot) => {
    if (runeCanGoOn(view.you, pieceId, heroSlot, catalogue, null)) {
      candidates.push({
        label: `${name} in ${heroName(catalogue, build.heroId)}`,
        heroSlot,
        description: `${pieceSummary(catalogue, pieceId)} Socketed into ${heroAt(view, catalogue, heroSlot)}.`,
      });
    }
  });

  candidates.push({
    label: `${name} to stash`,
    heroSlot: null,
    description: `${pieceSummary(catalogue, pieceId)} Kept in the stash to socket later.`,
  });

  return candidates;
}

function offerCandidates(view: PlayerView, catalogue: Catalogue, decision: PendingDecision, offer: RewardOffer): Candidate[] {
  switch (offer.kind) {
    case "item":
      return offer.pieceId === null ? [] : itemCandidates(view, catalogue, offer.pieceId);

    case "rune":
      return offer.pieceId === null ? [] : runeCandidates(view, catalogue, offer.pieceId);

    case "talent": {
      const heroSlot = offer.heroSlot ?? decision.heroSlot;

      return offer.pieceId === null
        ? []
        : [
            {
              label: pieceName(catalogue, offer.pieceId),
              heroSlot: null,
              description: `${pieceSummary(catalogue, offer.pieceId)} A talent for ${heroAt(view, catalogue, heroSlot)}.`,
            },
          ];
    }

    case "recruit":
      return offer.heroId === null
        ? []
        : [
            {
              label: `recruit ${heroName(catalogue, offer.heroId)}`,
              heroSlot: null,
              description: `Adds a new hero to your team: ${heroSummary(catalogue, offer.heroId)}`,
            },
          ];

    case "train":
      return [
        {
          label: `train ${offer.heroId === null ? "hero" : heroName(catalogue, offer.heroId)}`,
          heroSlot: null,
          description: `${heroAt(view, catalogue, offer.heroSlot)} gains one more rune socket.`,
        },
      ];

    default: {
      const exhaustive: never = offer.kind;

      return exhaustive;
    }
  }
}

function instructionsFor(view: PlayerView, catalogue: Catalogue, decision: PendingDecision): string {
  const aim = "The heroes fight on their own, so choose the option that makes your team strongest for the rounds ahead.";

  switch (decision.kind) {
    case "item":
      return `Choose one item and the hero who carries it. ${aim}`;

    case "rune":
      return `Choose one rune and the hero it is socketed into. ${aim}`;

    case "talent":
      return `Choose a tier ${decision.tier ?? 1} talent for ${heroAt(view, catalogue, decision.heroSlot)}. ${aim}`;

    case "recruit":
      return `Choose a new hero to recruit, or train a hero you already have. ${aim}`;

    default: {
      const exhaustive: never = decision.kind;

      return exhaustive;
    }
  }
}

export function rewardQuestion(
  view: PlayerView,
  catalogue: Catalogue,
  decision: PendingDecision,
  history: readonly RoundOutcome[],
  preview: PreviewLoadout,
): RewardQuestion | null {
  const before = loadoutTraits(view.you, catalogue);
  const options: Record<string, string> = {};
  const commandByOption = new Map<string, RunCommand>();

  for (const offer of decision.offers) {
    for (const candidate of offerCandidates(view, catalogue, decision, offer)) {
      const command: RunCommand = {
        kind: "choose-offer",
        playerId: view.you.playerId,
        decisionId: decision.decisionId,
        offerId: offer.offerId,
        heroSlot: candidate.heroSlot,
        expectedRevision: view.you.decisionRevision,
      };

      const after = preview(command);

      if (after === null) {
        continue;
      }

      const change = describeTraitChange(before, loadoutTraits(after, catalogue));
      const key = optionKey(candidate.label, new Set(commandByOption.keys()));

      options[key] = change.length === 0 ? candidate.description : `${candidate.description} This ${change.join(" and ")}.`;
      commandByOption.set(key, command);
    }
  }

  if (commandByOption.size === 0) {
    return null;
  }

  return {
    question: {
      state: buildObservation(view, catalogue, history),
      instructions: instructionsFor(view, catalogue, decision),
      options,
    },
    commandByOption,
  };
}
