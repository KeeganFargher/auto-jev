import type { HeroDefinition } from "@jev-game/game";

export const paladin: HeroDefinition = {
  id: "paladin",
  name: "Paladin",
  title: "The hammer",
  description:
    "A frontline knight who summons a colossal hammer and slams it down, launching everything nearby up and out.",
  role: "frontline",
  draftable: true,
  maxHp: 900,
  moveUnitsPerSecond: 14,
  bodyRadiusUnits: 3.5,
  maxMana: 85,
  startingMana: 20,
  attack: {
    kind: "melee",
    name: "Two-handed chop",
    damage: 62,
    rangeUnits: 2,
    intervalTicks: 43,
    windupTicks: 15,
  },
  signature: {
    kind: "hammerfall",
    name: "Hammerfall",
    description:
      "Hauls a giant hammer up over the shoulder and slams it into the ground about two cells ahead. Everything within 1.6 cells of the blow is launched; anything already airborne or floating is juggled twice as high, and anything frozen shatters for double damage.",
    wants: ["frozen", "floating", "airborne", "grouped"],
    groupSize: 3,
    reachUnits: 18.5,
    radiusUnits: 16,
    damage: 190,
    impactTick: 34,
    durationTicks: 68,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 45,
      edgeDistanceUnits: 28,
      bowlingDamage: 40,
    },
  },
  passive: null,
};
