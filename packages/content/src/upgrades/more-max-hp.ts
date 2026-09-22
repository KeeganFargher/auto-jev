import type { UpgradeDefinition } from "@jev-game/game";

export const moreMaxHp: UpgradeDefinition = {
  id: "more-max-hp",
  name: "More Max HP",
  description: "+15 max HP, stacks up to 3 times.",
  maxStacks: 3,
  statModifiers: [{ target: { kind: "max-hp" }, kind: "flat", value: 15 }],
};
