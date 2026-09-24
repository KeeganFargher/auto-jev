import type { AbilityDefinition, EffectDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

function poison(stacks: number): EffectDefinition {
  return {
    kind: "dot",
    dot: "poison",
    stacks,
    damagePerStackPerSecond: 7,
    durationTicks: 180,
    maxStacks: 8,
    conditionAtStacks: { stacks: 4, condition: "disoriented" },
  };
}

export const thornshot: AbilityDefinition = {
  id: "thornshot",
  name: "Thornshot",
  cooldownTicks: 50,
  targetPolicy: "nearest-enemy",
  range: 35,
  effects: [{ kind: "damage", amount: 42, maxAmount: 50 }],
  tags: ["projectile", "target"],
};

export const plagueCloud: AbilityDefinition = {
  id: "plague-cloud",
  name: "Plague Cloud",
  description: "A poison cloud 3 cells wide over the densest enemy group for 4 s. One Poison stack a second; at 4 stacks a target is Disoriented.",
  cooldownTicks: 30,
  manaCost: 60,
  targetPolicy: "densest-enemy-cluster",
  range: 50,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  effects: [poison(1)],
  zone: { radiusUnits: 15, durationTicks: 120, periodTicks: 30, effects: [poison(1)] },
  canCrit: false,
  tags: ["area", "zone"],
};

export const causticSpit: AbilityDefinition = {
  id: "caustic-spit",
  name: "Caustic Spit",
  description: "Hits the enemy with the biggest shield, strips the shield and adds 2 Poison stacks.",
  cooldownTicks: 210,
  targetPolicy: "biggest-shield-enemy",
  range: 45,
  effects: [{ kind: "strip-shield" }, { kind: "damage", amount: 40 }, poison(2)],
  tags: ["projectile", "target"],
};

export const blightmother: HeroDefinition = {
  id: "blightmother",
  name: "Nettle",
  title: "Makes the air itself hurt",
  school: "cunning",
  archetype: "blight",
  appliesCondition: "disoriented",
  maxHp: 1600,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  critChance: 0.05,
  manaPerAttack: 21,
  basicAttackId: thornshot.id,
  abilityIds: [plagueCloud.id, causticSpit.id],
  passives: [{ kind: "withering", healingReduction: 0.4, manaReduction: 0.3 }],
};

export const blightmotherAbilities: AbilityDefinition[] = [thornshot, plagueCloud, causticSpit];

const T1 = ["blightmother-contagion", "blightmother-virulence"];

const T2 = ["blightmother-miasma", "blightmother-festering"];

export const blightmotherTalents: UpgradeDefinition[] = [
  {
    id: "blightmother-contagion",
    name: "Contagion",
    description: "When a poisoned enemy dies, its Poison jumps to the nearest enemy.",
    category: "talent",
    heroId: blightmother.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["blightmother-virulence"],
    statModifiers: [],
    grantsPassives: [{ kind: "dot-spread-on-death", dot: "poison" }],
  },
  {
    id: "blightmother-virulence",
    name: "Virulence",
    description: "Poison deals 25% more damage.",
    category: "talent",
    heroId: blightmother.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["blightmother-contagion"],
    statModifiers: [{ target: { kind: "dot-damage" }, kind: "percent", value: 0.25 }],
  },
  {
    id: "blightmother-miasma",
    name: "Miasma",
    description: "Plague Cloud is 50% wider.",
    category: "talent",
    heroId: blightmother.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["blightmother-festering"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "ability-area", abilityId: plagueCloud.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "blightmother-festering",
    name: "Festering",
    description: "Poison stacks up to 12.",
    category: "talent",
    heroId: blightmother.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["blightmother-miasma"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "dot-max-stacks" }, kind: "flat", value: 4 }],
  },
  {
    id: "blightmother-pandemic",
    name: "Pandemic",
    description: "Plague Cloud lasts twice as long.",
    category: "talent",
    heroId: blightmother.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["blightmother-black-rot"],
    statModifiers: [{ target: { kind: "zone-duration", abilityId: plagueCloud.id }, kind: "percent", value: 1 }],
  },
  {
    id: "blightmother-black-rot",
    name: "Black Rot",
    description: "Caustic Spit adds 4 Poison stacks and Disorients its target.",
    category: "talent",
    heroId: blightmother.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["blightmother-pandemic"],
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: causticSpit.id,
        setEffects: [
          { kind: "strip-shield" },
          { kind: "damage", amount: 40 },
          poison(4),
          { kind: "apply-condition", condition: "disoriented" },
        ],
      },
    ],
  },
];
