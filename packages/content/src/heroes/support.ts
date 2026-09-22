import type { HeroDefinition } from "@jev-game/game";

export const support: HeroDefinition = {
  id: "support",
  name: "Support",
  maxHp: 80,
  moveSpeedUnitsPerSecond: 40,
  basicAttackId: "strike",
  abilityIds: ["mend"],
};
