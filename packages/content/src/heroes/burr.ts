import type { HeroDefinition } from "@jev-game/game";

export const burr: HeroDefinition = {
  id: "burr",
  name: "Burr",
  title: "The winter",
  description:
    "A midline winter caretaker who sweeps enemies with a snow broom, then calls everybody to settle down and freezes them solid where they stand.",
  role: "midline",
  draftable: true,
  maxHp: 650,
  moveUnitsPerSecond: 12,
  bodyRadiusUnits: 3.2,
  maxMana: 80,
  startingMana: 20,
  attack: {
    kind: "melee",
    name: "Snow broom",
    damage: 48,
    rangeUnits: 2,
    intervalTicks: 40,
    windupTicks: 14,
  },
  signature: {
    kind: "blizzard",
    name: "Everybody Settle Down",
    description:
      "Whips up a blizzard over the enemy pile. Every grounded enemy in it freezes solid for three seconds and takes a little damage. A hammer or blast shatters frozen enemies for double damage.",
    wants: ["downed", "grouped"],
    groupSize: 3,
    rangeUnits: 40,
    castTicks: 15,
    radiusUnits: 12,
    freezeTicks: 90,
    damage: 35,
  },
  passive: null,
};
