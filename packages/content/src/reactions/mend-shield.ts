import type { ReactionDefinition } from "@jev-game/game";

export const mendShield: ReactionDefinition = {
  id: "mend-shield",
  trigger: "after-heal-effect",
  shieldDurationTicks: 60,
};
