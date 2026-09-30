import type { HeroDefinition } from "@jev-game/game";

export const mags: HeroDefinition = {
  id: "mags",
  name: "Mags",
  title: "The magnet",
  description:
    "A backline scrap witch who flings rusty nails, then calls collection day and drags every loose enemy into one pile.",
  role: "backline",
  draftable: true,
  maxHp: 480,
  moveUnitsPerSecond: 12,
  bodyRadiusUnits: 3,
  maxMana: 75,
  startingMana: 25,
  attack: {
    kind: "projectile",
    name: "Scrap nail",
    damage: 44,
    rangeUnits: 26,
    intervalTicks: 36,
    windupTicks: 12,
    unitsPerSecond: 60,
    splashRadiusUnits: 0,
    splashFraction: 0,
    allyHeal: 0,
  },
  signature: {
    kind: "collection-day",
    name: "Collection Day",
    description:
      "Holds up a magnet and drags every grounded enemy within two cells of the target into one tight pile, dealing a little damage. The pile is downed for half a second.",
    wants: ["grouped"],
    groupSize: 3,
    rangeUnits: 45,
    castTicks: 15,
    radiusUnits: 20,
    pileRadiusUnits: 4,
    pullTicks: 18,
    pileTicks: 45,
    damage: 30,
  },
  passive: null,
};
