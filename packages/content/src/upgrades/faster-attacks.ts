import type { UpgradeDefinition } from "@jev-game/game";

export const fasterAttacks: UpgradeDefinition = {
  id: "faster-attacks",
  name: "Faster Attacks",
  description: "+15% basic attack rate, stacks up to 2 times.",
  maxStacks: 2,
  statModifiers: [{ target: { kind: "basic-attack-cooldown" }, kind: "percent", value: 0.15 }],
};
