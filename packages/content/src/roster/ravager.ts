import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const ravagerAxes: AbilityDefinition = {
  id: "ravager-axes",
  name: "Twin Axes",
  hitType: "attack",
  cooldownTicks: 38,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 62, maxAmount: 76 }],
  tags: ["target"],
};

export const leapSlam: AbilityDefinition = {
  id: "leap-slam",
  name: "Leap Slam",
  hitType: "attack",
  description:
    "Leaps onto the most wounded enemy hero within 4 cells and strikes every enemy within 1.2 cells, Staggering them. Each strike is a full attack. Ready at the start of every fight.",
  tags: ["strike", "dash", "area"],
  cooldownTicks: 300,
  initialCooldownTicks: 0,
  targetPolicy: "lowest-hp-enemy",
  range: 40,
  effects: [
    { kind: "strike", scale: 1 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  dash: { hops: 1, periodTicks: 1, hopRangeUnits: 0, splashRadiusUnits: 12 },
};

export const whirlwind: AbilityDefinition = {
  id: "whirlwind",
  name: "Whirlwind",
  hitType: "attack",
  description:
    "Spins for 3 s, striking every enemy within 1.5 cells every 0.3 s at 50%. Each tick is an attack. He can't be stunned, slowed or taunted while spinning, and drifts towards the densest group.",
  tags: ["channel", "area", "self"],
  cooldownTicks: 30,
  manaCost: 200,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 15 },
  minTargets: 1,
  effects: [],
  channel: {
    durationTicks: 90,
    periodTicks: 9,
    radiusUnits: 15,
    effects: [{ kind: "strike", scale: 0.5 }],
    unstoppable: true,
    drifts: true,
  },
};

export const ravager: HeroDefinition = {
  id: "ravager",
  name: "Gorrak",
  title: "Spins until nothing stands",
  school: "might",
  archetype: "dive",
  appliesCondition: "staggered",
  maxHp: 2000,
  armor: 0.15,
  moveSpeedUnitsPerSecond: 20,
  critChance: 0.1,
  manaPerAttack: 21,
  basicAttackId: ravagerAxes.id,
  abilityId: leapSlam.id,
  ultimateId: whirlwind.id,
  passives: [
    {
      kind: "stacks",
      key: "fury",
      name: "Blood Frenzy",
      description:
        "Each attack hit gives 1 Fury, up to 20, and each gives +5% attack speed. After 3 s without a hit he loses 1 Fury every 0.5 s. At 20 Fury his attacks cleave 30%.",
      gains: [{ on: "attack-hit", amount: 1 }],
      max: 20,
      attackSpeedPerStack: 0.05,
      decay: { idleTicks: 90, everyTicks: 15, amount: 1 },
      atMax: { cleaveFraction: 0.3, cleaveRadiusUnits: 10 },
    },
  ],
};

export const ravagerAbilities: AbilityDefinition[] = [ravagerAxes, leapSlam, whirlwind];

export const ravagerLevels: UpgradeDefinition[] = [
  {
    id: "ravager-wide-swings",
    name: "Wide Swings",
    description: "Whirlwind reaches 50% further.",
    category: "level",
    heroId: ravager.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-area", abilityId: whirlwind.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "ravager-momentum",
    name: "Momentum",
    description: "Whirlwind strikes 5% faster for every 2 Fury.",
    category: "level",
    heroId: ravager.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    passiveChanges: [{ key: "fury", stacks: { channelHastePerStack: 0.025 } }],
  },
  {
    id: "ravager-maelstrom",
    name: "Maelstrom",
    description: "Every Whirlwind tick pulls enemies within 3 cells 1 cell towards him.",
    category: "level",
    heroId: ravager.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: whirlwind.id, patchChannel: { pull: { radiusUnits: 30, distanceUnits: 10 } } }],
  },
  {
    id: "ravager-blood-leap",
    name: "Blood Leap",
    description: "Reaching 20 Fury readies Leap Slam at once.",
    category: "level",
    heroId: ravager.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    passiveChanges: [{ key: "fury", stacks: { atMax: { resetsAbilityId: leapSlam.id } } }],
  },
  {
    id: "ravager-blade-vortex",
    name: "Blade Vortex",
    description: "When Whirlwind ends, spectral axes orbit him for 4 s, striking every enemy within 1.5 cells every 0.5 s at 50%.",
    category: "level",
    heroId: ravager.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: whirlwind.id,
        patchChannel: {
          endZone: {
            radiusUnits: 15,
            durationTicks: 120,
            periodTicks: 15,
            effects: [{ kind: "strike", scale: 0.5 }],
            followsSource: true,
            fullHits: true,
          },
        },
      },
    ],
  },
  {
    id: "ravager-unending-rage",
    name: "Unending Rage",
    description: "Fury never fades and starts every fight at 10. At 20 Fury he can't be stunned, frozen or knocked down.",
    category: "level",
    heroId: ravager.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    passiveChanges: [{ key: "fury", stacks: { removeDecay: true, startsAt: 10, atMax: { controlImmune: true } } }],
  },
];
