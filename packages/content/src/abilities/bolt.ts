import type { AbilityDefinition } from "@jev-game/game";

export const bolt: AbilityDefinition = {
  id: "bolt",
  name: "Bolt",
  cooldownTicks: 45,
  targetPolicy: "nearest-enemy",
  range: 30,
  effects: [{ kind: "damage", amount: 12 }],
};
