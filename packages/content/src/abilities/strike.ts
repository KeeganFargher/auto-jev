import type { AbilityDefinition } from "@jev-game/game";

export const strike: AbilityDefinition = {
  id: "strike",
  name: "Strike",
  cooldownTicks: 30,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 10 }],
};
