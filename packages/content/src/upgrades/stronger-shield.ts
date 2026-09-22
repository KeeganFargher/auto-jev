import type { UpgradeDefinition } from "@jev-game/game";

export const strongerShield: UpgradeDefinition = {
  id: "stronger-shield",
  name: "Stronger Shield",
  description: "+50% to Mend's shield amount, stacks up to 2 times. Requires Healing That Also Shields.",
  heroId: "support",
  maxStacks: 2,
  prerequisiteUpgradeIds: ["healing-that-also-shields"],
  statModifiers: [
    {
      target: { kind: "reaction-shield-amount", reactionId: "mend-shield" },
      kind: "percent",
      value: 0.5,
    },
  ],
};
