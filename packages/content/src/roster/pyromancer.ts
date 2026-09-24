import type { AbilityDefinition, HeroDefinition, EffectDefinition, UpgradeDefinition } from "@jev-game/game";

const burn: EffectDefinition = {
  kind: "dot",
  dot: "burn",
  stacks: 1,
  damagePerStackPerSecond: 8,
  durationTicks: 126,
  maxStacks: 3,
};

export const firebolt: AbilityDefinition = {
  id: "firebolt",
  name: "Firebolt",
  cooldownTicks: 59,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 59, maxAmount: 73 }, burn],
  tags: ["projectile", "target"],
};

export const meteor: AbilityDefinition = {
  id: "meteor",
  name: "Meteor",
  description: "Marks the densest enemy cluster. It lands 1.5 s later for heavy damage and leaves burning ground.",
  cooldownTicks: 30,
  manaCost: 80,
  targetPolicy: "densest-enemy-cluster",
  range: 60,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  delayTicks: 45,
  effects: [{ kind: "damage", amount: 280 }, burn],
  zone: { radiusUnits: 15, durationTicks: 90, periodTicks: 30, effects: [burn] },
  canCrit: false,
  tags: ["area", "delayed", "zone"],
};

export const flameWard: AbilityDefinition = {
  id: "flame-ward",
  name: "Flame Ward",
  description: "When an enemy gets next to Cinder, a ring of fire burns and knocks it back.",
  cooldownTicks: 336,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 12 },
  minTargets: 1,
  effects: [
    { kind: "damage", amount: 56 },
    { kind: "knockback", distanceUnits: 15 },
  ],
  canCrit: false,
  tags: ["area", "self"],
};

export const pyromancer: HeroDefinition = {
  id: "pyromancer",
  name: "Cinder",
  title: "Wants you to stand still",
  school: "arcana",
  archetype: "artillery",
  maxHp: 1600,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  manaPerAttack: 21,
  critChance: 0.05,
  basicAttackId: firebolt.id,
  abilityIds: [meteor.id, flameWard.id],
};

export const pyromancerAbilities: AbilityDefinition[] = [firebolt, meteor, flameWard];

const T1 = ["pyro-heavy-meteor", "pyro-quick-cast"];

const T2 = ["pyro-molten-core", "pyro-wildfire"];

export const pyromancerTalents: UpgradeDefinition[] = [
  {
    id: "pyro-heavy-meteor",
    name: "Heavy Meteor",
    description: "Meteor deals 25% more damage.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["pyro-quick-cast"],
    statModifiers: [{ target: { kind: "ability-damage", abilityId: meteor.id }, kind: "percent", value: 0.25 }],
  },
  {
    id: "pyro-quick-cast",
    name: "Quick Cast",
    description: "Meteor costs 20% less mana.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["pyro-heavy-meteor"],
    statModifiers: [{ target: { kind: "ability-mana-cost", abilityId: meteor.id }, kind: "percent", value: -0.2 }],
  },
  {
    id: "pyro-molten-core",
    name: "Molten Core",
    description: "Meteor's burning ground lasts 2 s longer.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["pyro-wildfire"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "zone-duration", abilityId: meteor.id }, kind: "flat", value: 60 }],
  },
  {
    id: "pyro-wildfire",
    name: "Wildfire",
    description: "When a burning enemy dies, its Burn jumps to the nearest enemy. Burn stacks once more.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["pyro-molten-core"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "dot-max-stacks" }, kind: "flat", value: 1 }],
    grantsPassives: [{ kind: "dot-spread-on-death", dot: "burn" }],
  },
  {
    id: "pyro-cataclysm",
    name: "Cataclysm",
    description: "Meteor Staggers everything it hits, setting up Overloads for other Arcana heroes.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["pyro-inferno"],
    statModifiers: [],
    abilityChanges: [{ abilityId: meteor.id, addEffects: [{ kind: "apply-condition", condition: "staggered" }] }],
  },
  {
    id: "pyro-inferno",
    name: "Inferno",
    description: "Burn stacks up to 6 times and burns 25% hotter.",
    category: "talent",
    heroId: pyromancer.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["pyro-cataclysm"],
    statModifiers: [
      { target: { kind: "dot-max-stacks" }, kind: "flat", value: 3 },
      { target: { kind: "dot-damage" }, kind: "percent", value: 0.25 },
    ],
  },
];
