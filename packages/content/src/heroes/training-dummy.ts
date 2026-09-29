import type { HeroDefinition } from "@jev-game/game";

export const trainingDummy: HeroDefinition = {
  id: "training-dummy",
  name: "Training Dummy",
  title: "Lab target",
  description: "A sturdy sparring partner for the battle lab. It never casts and can't be drafted.",
  role: "frontline",
  draftable: false,
  maxHp: 700,
  moveUnitsPerSecond: 10,
  bodyRadiusUnits: 3.5,
  maxMana: 0,
  startingMana: 0,
  attack: {
    kind: "melee",
    name: "Punch",
    damage: 30,
    rangeUnits: 2,
    intervalTicks: 45,
    windupTicks: 15,
  },
  signature: null,
  passive: null,
};
