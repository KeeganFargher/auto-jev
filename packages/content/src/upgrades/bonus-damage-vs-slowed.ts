import type { UpgradeDefinition } from "@jev-game/game";

export const bonusDamageVsSlowed: UpgradeDefinition = {
  id: "bonus-damage-vs-slowed",
  name: "Bonus Damage vs. Slowed",
  description: "+50% basic attack damage against slowed targets.",
  heroId: "bruiser",
  maxStacks: 1,
  statModifiers: [
    { target: { kind: "slowed-target-basic-attack-damage-bonus" }, kind: "flat", value: 0.5 },
  ],
};
