import type { AbilityDefinition } from "@jev-game/game";

export const mend: AbilityDefinition = {
  id: "mend",
  name: "Mend",
  cooldownTicks: 90,
  targetPolicy: "lowest-hp-fraction-ally",
  range: 8,
  effects: [{ kind: "heal", amount: 20 }],
};
