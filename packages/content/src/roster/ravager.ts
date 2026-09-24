import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const ravagerAxes: AbilityDefinition = {
  id: "ravager-axes",
  name: "Twin Axes",
  cooldownTicks: 38,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 62, maxAmount: 76 }],
  tags: ["target"],
};

export const whirlwind: AbilityDefinition = {
  id: "whirlwind",
  name: "Whirlwind",
  description: "Spins for 2 s, hitting every enemy within 1.2 cells every half second. Can't be slowed, stunned or taunted while spinning.",
  cooldownTicks: 30,
  manaCost: 100,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 12 },
  minTargets: 1,
  effects: [],
  channel: {
    durationTicks: 60,
    periodTicks: 15,
    radiusUnits: 12,
    effects: [{ kind: "damage", amount: 56 }],
  },
  canCrit: false,
  tags: ["self", "area", "channel"],
};

export const leap: AbilityDefinition = {
  id: "leap",
  name: "Leap",
  description: "Leaps onto the most wounded enemy within 4 cells. Ready at the start of every fight.",
  cooldownTicks: 336,
  targetPolicy: "lowest-hp-enemy",
  range: 40,
  blinkBehindTarget: true,
  effects: [{ kind: "damage", amount: 112 }],
  tags: ["dash", "target"],
};

export const ravager: HeroDefinition = {
  id: "ravager",
  name: "Gorrak",
  title: "Spins until nothing stands",
  school: "might",
  archetype: "dive",
  maxHp: 2000,
  armor: 0.15,
  moveSpeedUnitsPerSecond: 20,
  critChance: 0.1,
  manaPerAttack: 21,
  basicAttackId: ravagerAxes.id,
  abilityIds: [whirlwind.id, leap.id],
  passives: [{ kind: "bloodlust", attackSpeedPerMissingHp: 0.5 }],
};

export const ravagerAbilities: AbilityDefinition[] = [ravagerAxes, whirlwind, leap];

const T1 = ["ravager-rend", "ravager-thick-hide"];

const T2 = ["ravager-cleave", "ravager-unstoppable"];

export const ravagerTalents: UpgradeDefinition[] = [
  {
    id: "ravager-rend",
    name: "Rend",
    description: "Every 3rd basic attack Staggers its target.",
    category: "talent",
    heroId: ravager.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["ravager-thick-hide"],
    statModifiers: [],
    grantsPassives: [{ kind: "every-nth-basic-attack", key: "rend", n: 3, effects: [{ kind: "apply-condition", condition: "staggered" }] }],
  },
  {
    id: "ravager-thick-hide",
    name: "Thick Hide",
    description: "+10% armor and +10% max HP.",
    category: "talent",
    heroId: ravager.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["ravager-rend"],
    statModifiers: [
      { target: { kind: "armor" }, kind: "flat", value: 0.1 },
      { target: { kind: "max-hp" }, kind: "percent", value: 0.1 },
    ],
  },
  {
    id: "ravager-cleave",
    name: "Cleave",
    description: "Basic attacks also hit every enemy next to the target for 50%.",
    category: "talent",
    heroId: ravager.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["ravager-unstoppable"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "cleave", fraction: 0.5, radiusUnits: 12 }],
  },
  {
    id: "ravager-unstoppable",
    name: "Unstoppable",
    description: "Gorrak can't be taunted and moves 10% faster.",
    category: "talent",
    heroId: ravager.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["ravager-cleave"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "move-speed" }, kind: "percent", value: 0.1 }],
    grantsPassives: [{ kind: "taunt-immune" }],
  },
  {
    id: "ravager-bloodbath",
    name: "Bloodbath",
    description: "Whirlwind deals 60% more damage.",
    category: "talent",
    heroId: ravager.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["ravager-juggernaut"],
    statModifiers: [{ target: { kind: "ability-damage", abilityId: whirlwind.id }, kind: "percent", value: 0.6 }],
  },
  {
    id: "ravager-juggernaut",
    name: "Juggernaut",
    description: "25% lifesteal, and Whirlwind spins twice as long.",
    category: "talent",
    heroId: ravager.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["ravager-bloodbath"],
    statModifiers: [{ target: { kind: "lifesteal" }, kind: "flat", value: 0.25 }],
    abilityChanges: [
      {
        abilityId: whirlwind.id,
        setChannel: { durationTicks: 120, periodTicks: 15, radiusUnits: 12, effects: [{ kind: "damage", amount: 56 }] },
      },
    ],
  },
];
