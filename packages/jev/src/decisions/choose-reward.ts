import { SKILL_SLOTS, skillIdFor, type Catalogue, type SkillSlot } from "@jev-game/game";
import {
  gemCanGoOn,
  hasStashRoom,
  itemCanGoOn,
  piecesOnHero,
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
  skill: SkillSlot | null;
  description: string;
}

function skillName(catalogue: Catalogue, heroId: string, skill: SkillSlot): string | null {
  const hero = catalogue.heroes[heroId];
  const skillId = hero === undefined ? null : skillIdFor(hero, skill);

  return skillId === null ? null : (catalogue.abilities[skillId]?.name ?? skillId);
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
        skill: null,
        description: `${pieceSummary(catalogue, pieceId)} Goes on ${heroAt(view, catalogue, heroSlot)}, who would then hold ${held} of ${view.rules.itemSlots} items.`,
      });
    }
  });

  if (candidates.length === 0 || hasStashRoom(view.you, view.rules, null)) {
    candidates.push({
      label: `${name} to stash`,
      heroSlot: null,
      skill: null,
      description: `${pieceSummary(catalogue, pieceId)} Kept in the stash to equip later.`,
    });
  }

  return candidates;
}

function gemCandidates(view: PlayerView, catalogue: Catalogue, pieceId: string): Candidate[] {
  const candidates: Candidate[] = [];
  const name = pieceName(catalogue, pieceId);

  view.you.heroBuilds.forEach((build, heroSlot) => {
    for (const skill of SKILL_SLOTS) {
      const skillLabel = skillName(catalogue, build.heroId, skill);

      if (skillLabel !== null && gemCanGoOn(view.you, pieceId, heroSlot, skill, catalogue, null)) {
        candidates.push({
          label: `${name} in ${heroName(catalogue, build.heroId)}'s ${skillLabel}`,
          heroSlot,
          skill,
          description: `${pieceSummary(catalogue, pieceId)} Socketed into ${heroAt(view, catalogue, heroSlot)}'s ${skill}, ${skillLabel}.`,
        });
      }
    }
  });

  candidates.push({
    label: `${name} to stash`,
    heroSlot: null,
    skill: null,
    description: `${pieceSummary(catalogue, pieceId)} Kept in the stash to socket later.`,
  });

  return candidates;
}

function trainCandidates(view: PlayerView, catalogue: Catalogue, heroSlot: number | null): Candidate[] {
  const heroId = heroSlot === null ? undefined : view.you.heroBuilds[heroSlot]?.heroId;

  if (heroId === undefined) {
    return [];
  }

  return SKILL_SLOTS.flatMap((skill): Candidate[] => {
    const skillLabel = skillName(catalogue, heroId, skill);

    return skillLabel === null
      ? []
      : [
          {
            label: `train ${heroName(catalogue, heroId)}'s ${skillLabel}`,
            heroSlot: null,
            skill,
            description: `${heroAt(view, catalogue, heroSlot)} gains one more gem socket in its ${skill}, ${skillLabel}.`,
          },
        ];
  });
}

function offerCandidates(view: PlayerView, catalogue: Catalogue, decision: PendingDecision, offer: RewardOffer): Candidate[] {
  switch (offer.kind) {
    case "item":
      return offer.pieceId === null ? [] : itemCandidates(view, catalogue, offer.pieceId);

    case "gem":
      return offer.pieceId === null ? [] : gemCandidates(view, catalogue, offer.pieceId);

    case "level": {
      const heroSlot = offer.heroSlot ?? decision.heroSlot;

      return offer.pieceId === null
        ? []
        : [
            {
              label: pieceName(catalogue, offer.pieceId),
              heroSlot: null,
              skill: null,
              description: `${pieceSummary(catalogue, offer.pieceId)} A level ${decision.level ?? 2} pick for ${heroAt(view, catalogue, heroSlot)}.`,
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
              skill: null,
              description: `Adds a new hero to your team: ${heroSummary(catalogue, offer.heroId)}`,
            },
          ];

    case "train":
      return trainCandidates(view, catalogue, offer.heroSlot);

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
      return `Choose one item and the hero who carries it, or the gem if one is offered and the skill it goes in. ${aim}`;

    case "gem":
      return `Choose one gem and the hero skill it is socketed into. ${aim}`;

    case "level":
      return `${heroAt(view, catalogue, decision.heroSlot)} reaches level ${decision.level ?? 2}. Choose how it levels up. ${aim}`;

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
        skill: candidate.skill,
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
