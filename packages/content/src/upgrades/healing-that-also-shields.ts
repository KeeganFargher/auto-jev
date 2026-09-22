import type { UpgradeDefinition } from "@jev-game/game";

export const healingThatAlsoShields: UpgradeDefinition = {
  id: "healing-that-also-shields",
  name: "Healing That Also Shields",
  description: "Mend also grants the target a 15-point shield.",
  heroId: "support",
  maxStacks: 1,
  grantsReactionId: "mend-shield",
  statModifiers: [
    { target: { kind: "reaction-shield-amount", reactionId: "mend-shield" }, kind: "flat", value: 15 },
  ],
};
