import type { HeroDefinitionId } from "@jev-game/game";
import { berserker } from "../heroes/berserker.js";
import { bubbleCleric } from "../heroes/bubble-cleric.js";
import { firebrand } from "../heroes/firebrand.js";
import { burr } from "../heroes/burr.js";
import { harpooner } from "../heroes/harpooner.js";
import { mags } from "../heroes/mags.js";
import { paladin } from "../heroes/paladin.js";
import { trainingDummy } from "../heroes/training-dummy.js";

export interface LabPreset {
  id: string;
  name: string;
  description: string;
  teamA: readonly HeroDefinitionId[];
  teamB: readonly HeroDefinitionId[];
}

const dummies = [trainingDummy.id, trainingDummy.id, trainingDummy.id];

export const LAB_PRESETS: readonly LabPreset[] = [
  {
    id: "bubble-and-bat",
    name: "Bubble and bat",
    description: "The Cleric lifts the dummies, and the Paladin juggles the bubble.",
    teamA: [paladin.id, bubbleCleric.id],
    teamB: dummies,
  },
  {
    id: "hot-potato",
    name: "Hot potato",
    description: "The Firebrand lights a fuse, and the Berserker throws the carrier.",
    teamA: [berserker.id, firebrand.id],
    teamB: dummies,
  },
  {
    id: "reel-in",
    name: "Reel in",
    description: "The Harpooner yanks dummies into the Paladin's hammer ring.",
    teamA: [paladin.id, harpooner.id],
    teamB: dummies,
  },
  {
    id: "comet",
    name: "Comet",
    description:
      "The Paladin launches the Firebrand's burning targets into a crowd of five dummies.",
    teamA: [paladin.id, firebrand.id],
    teamB: [...dummies, trainingDummy.id, trainingDummy.id],
  },
  {
    id: "gather-freeze-smash",
    name: "Gather, freeze, smash",
    description: "Mags drags the dummies into a pile, Burr freezes it, and the Paladin shatters it.",
    teamA: [mags.id, burr.id, paladin.id],
    teamB: [...dummies, trainingDummy.id, trainingDummy.id],
  },
  {
    id: "full-chain",
    name: "Full chain",
    description: "Fuse, bubble and hammer against a mixed team.",
    teamA: [paladin.id, firebrand.id, bubbleCleric.id],
    teamB: [berserker.id, harpooner.id, paladin.id],
  },
  {
    id: "mirror",
    name: "Mirror",
    description: "Both sides field the same three heroes.",
    teamA: [berserker.id, firebrand.id, harpooner.id],
    teamB: [berserker.id, firebrand.id, harpooner.id],
  },
];

export function labPreset(presetId: string): LabPreset {
  const preset = LAB_PRESETS.find((candidate) => candidate.id === presetId);

  if (preset === undefined) {
    throw new Error(`Unknown lab preset "${presetId}"`);
  }

  return preset;
}
