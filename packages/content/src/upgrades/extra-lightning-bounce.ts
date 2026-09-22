import type { UpgradeDefinition } from "@jev-game/game";

export const extraLightningBounce: UpgradeDefinition = {
  id: "extra-lightning-bounce",
  name: "Extra Lightning Bounce",
  description: "Bolt chains to one more target, stacks up to 2 times.",
  heroId: "ranger",
  maxStacks: 2,
  statModifiers: [
    { target: { kind: "ability-chain-bounces", abilityId: "bolt" }, kind: "flat", value: 1 },
  ],
};
