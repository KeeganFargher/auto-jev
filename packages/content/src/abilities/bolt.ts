import type { AbilityDefinition } from "@jev-game/game";

export const bolt: AbilityDefinition = {
  id: "bolt",
  name: "Bolt",
  cooldownTicks: 45,
  targetPolicy: "nearest-enemy",
  range: 30,
  effects: [
    { kind: "chain-damage", amount: 12, maxBounces: 1, bounceRangeUnits: 20 },
    { kind: "slow", slowFraction: 0.4, durationTicks: 30 },
  ],
};
