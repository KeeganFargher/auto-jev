import type { AbilityDefinition, EffectDefinition, HeroDefinition, UpgradeDefinition, ZoneDefinition } from "@jev-game/game";

const poison: EffectDefinition = { kind: "dot", dot: "poison", stacks: 1, damagePerStackPerSecond: 1.5, durationTicks: 150 };

const bloom: ZoneDefinition = { radiusUnits: 15, durationTicks: 90, periodTicks: 15, effects: [poison] };

export const thornshot: AbilityDefinition = {
  id: "thornshot",
  name: "Thornshot",
  hitType: "attack",
  cooldownTicks: 50,
  targetPolicy: "nearest-enemy",
  range: 35,
  effects: [{ kind: "damage", amount: 42, maxAmount: 50 }],
  tags: ["projectile", "target"],
};

export const plagueBloom: AbilityDefinition = {
  id: "plague-bloom",
  name: "Plague Bloom",
  hitType: "spell",
  description: "Plants a flower at the densest enemy group. It adds a Poison stack to every enemy within 1.5 cells, then again every 0.5 s for 3 s.",
  tags: ["area", "zone"],
  cooldownTicks: 150,
  targetPolicy: "densest-enemy-cluster",
  range: 50,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  effects: [poison],
  zone: bloom,
  canCrit: false,
};

export const pandemic: AbilityDefinition = {
  id: "pandemic",
  name: "Pandemic",
  hitType: "spell",
  description: "Doubles every enemy's Poison stacks, and for 4 s her Poison ticks twice as fast. She waits until 2 enemies carry 5 stacks.",
  tags: ["area"],
  cooldownTicks: 30,
  manaCost: 140,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 120 },
  requiresPoisoned: { targets: 2, stacks: 5 },
  effects: [{ kind: "pandemic", stackMultiplier: 2, durationTicks: 120, tickRateMultiplier: 2 }],
  canCrit: false,
};

export const blightmother: HeroDefinition = {
  id: "blightmother",
  name: "Nettle",
  title: "Poison piles up until enemies pop",
  school: "cunning",
  archetype: "blight",
  appliesCondition: "disoriented",
  maxHp: 1600,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  critChance: 0.05,
  manaPerAttack: 21,
  basicAttackId: thornshot.id,
  abilityId: plagueBloom.id,
  ultimateId: pandemic.id,
  passives: [
    {
      kind: "virulence",
      name: "Virulence",
      condition: "disoriented",
      conditionAtStacks: 10,
      burstAtStacks: 20,
      spreadFraction: 0.5,
      spreadRadiusUnits: 15,
      windowTicks: 60,
    },
    { kind: "withering", healingReduction: 0.4, manaReduction: 0.3, fullAtStacks: 10 },
  ],
};

export const blightmotherAbilities: AbilityDefinition[] = [thornshot, plagueBloom, pandemic];

export const blightmotherLevels: UpgradeDefinition[] = [
  {
    id: "blightmother-big-bloom",
    name: "Big Bloom",
    description: "Plague Bloom reaches 50% further.",
    category: "level",
    heroId: blightmother.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-area", abilityId: plagueBloom.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "blightmother-twin-bloom",
    name: "Twin Bloom",
    description: "Plague Bloom plants a second flower at the next densest enemy group it didn't reach. Both flowers last 2 s.",
    category: "level",
    heroId: blightmother.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: plagueBloom.id, setZone: { ...bloom, durationTicks: 60, count: 2 } }],
  },
  {
    id: "blightmother-contagion",
    name: "Contagion",
    description: "A Burst shares all its stacks among the 3 nearest enemies, however far away they are.",
    category: "level",
    heroId: blightmother.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "contagion", targets: 3, fraction: 1 }],
  },
  {
    id: "blightmother-toxic-tether",
    name: "Toxic Tether",
    description: "20% of the Poison damage she deals heals her most wounded ally.",
    category: "level",
    heroId: blightmother.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "toxic-tether", fraction: 0.2 }],
  },
  {
    id: "blightmother-epidemic",
    name: "Epidemic",
    description: "While Pandemic lasts, every time her Poison ticks on an enemy, enemies within 3 cells catch up to its stacks.",
    category: "level",
    heroId: blightmother.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: pandemic.id,
        setEffects: [{ kind: "pandemic", stackMultiplier: 2, durationTicks: 120, tickRateMultiplier: 2, spread: { radiusUnits: 30, fraction: 1 } }],
      },
    ],
  },
  {
    id: "blightmother-black-death",
    name: "Black Death",
    description: "Pandemic also Bursts every enemy it leaves at 10 or more stacks without spending them, and while it lasts enemies Burst at 10 stacks instead of 20.",
    category: "level",
    heroId: blightmother.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: pandemic.id,
        setEffects: [{ kind: "pandemic", stackMultiplier: 2, durationTicks: 120, tickRateMultiplier: 2, burstAtStacks: 10 }],
      },
    ],
  },
];
