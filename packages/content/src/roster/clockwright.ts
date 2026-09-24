import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const turretShot: AbilityDefinition = {
  id: "turret-shot",
  name: "Turret Shot",
  cooldownTicks: 42,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 31, maxAmount: 39 }],
  tags: ["projectile", "target"],
};

export const turret: HeroDefinition = {
  id: "turret",
  name: "Turret",
  title: "Every one of them has a name",
  school: "cunning",
  summon: true,
  maxHp: 640,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 0,
  basicAttackId: turretShot.id,
  abilityIds: [],
  passives: [{ kind: "overclock", rangeUnits: 20, attackSpeedBonus: 0.2 }],
};

export const rivetGun: AbilityDefinition = {
  id: "rivet-gun",
  name: "Rivet Gun",
  cooldownTicks: 50,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 48, maxAmount: 56 }],
  tags: ["projectile", "target"],
};

export const deployTurret: AbilityDefinition = {
  id: "deploy-turret",
  name: "Deploy Turret",
  description: "Builds a turret beside Brassjack, up to 3 at once. Turrets near another turret fire 20% faster.",
  cooldownTicks: 30,
  manaCost: 70,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "summon", heroId: turret.id, count: 1, maxActive: 3 }],
  tags: ["self", "summon"],
};

export const flashbang: AbilityDefinition = {
  id: "flashbang",
  name: "Flashbang",
  description: "Hits the densest enemy group and Disorients everything in it.",
  cooldownTicks: 378,
  targetPolicy: "densest-enemy-cluster",
  range: 50,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  effects: [
    { kind: "damage", amount: 50 },
    { kind: "apply-condition", condition: "disoriented" },
  ],
  canCrit: false,
  tags: ["area"],
};

export const clockwright: HeroDefinition = {
  id: "clockwright",
  name: "Brassjack",
  title: "Builds a fortress mid-fight",
  school: "cunning",
  archetype: "swarm",
  appliesCondition: "disoriented",
  maxHp: 1600,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 17,
  critChance: 0.1,
  manaPerAttack: 21,
  basicAttackId: rivetGun.id,
  abilityIds: [deployTurret.id, flashbang.id],
};

export const clockwrightSummons: HeroDefinition[] = [turret];

export const clockwrightAbilities: AbilityDefinition[] = [turretShot, rivetGun, deployTurret, flashbang];

const T1 = ["clockwright-reinforced-plating", "clockwright-quick-build"];

const T2 = ["clockwright-barrier-turrets", "clockwright-flash-powder"];

export const clockwrightTalents: UpgradeDefinition[] = [
  {
    id: "clockwright-reinforced-plating",
    name: "Reinforced Plating",
    description: "Turrets have 40% more HP.",
    category: "talent",
    heroId: clockwright.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["clockwright-quick-build"],
    statModifiers: [],
    grantsPassives: [{ kind: "empower-summons", key: "plating", heroId: turret.id, hpScale: 1.4 }],
  },
  {
    id: "clockwright-quick-build",
    name: "Quick Build",
    description: "Deploy Turret costs 25% less mana.",
    category: "talent",
    heroId: clockwright.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["clockwright-reinforced-plating"],
    statModifiers: [{ target: { kind: "ability-mana-cost", abilityId: deployTurret.id }, kind: "percent", value: -0.25 }],
  },
  {
    id: "clockwright-barrier-turrets",
    name: "Barrier Turrets",
    description: "Turrets arrive with a shield worth 30% of their HP.",
    category: "talent",
    heroId: clockwright.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["clockwright-flash-powder"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "empower-summons", key: "barrier", heroId: turret.id, shieldFraction: 0.3 }],
  },
  {
    id: "clockwright-flash-powder",
    name: "Flash Powder",
    description: "Flashbang is 50% wider.",
    category: "talent",
    heroId: clockwright.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["clockwright-barrier-turrets"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "ability-area", abilityId: flashbang.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "clockwright-fortress",
    name: "Fortress",
    description: "Up to 5 turrets at once.",
    category: "talent",
    heroId: clockwright.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["clockwright-twin-barrels"],
    statModifiers: [],
    abilityChanges: [{ abilityId: deployTurret.id, setEffects: [{ kind: "summon", heroId: turret.id, count: 1, maxActive: 5 }] }],
  },
  {
    id: "clockwright-twin-barrels",
    name: "Twin Barrels",
    description: "Turret shots also hit every enemy next to the target for 50%.",
    category: "talent",
    heroId: clockwright.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["clockwright-fortress"],
    statModifiers: [],
    grantsPassives: [
      { kind: "empower-summons", key: "barrels", heroId: turret.id, passives: [{ kind: "cleave", fraction: 0.5, radiusUnits: 12 }] },
    ],
  },
];
