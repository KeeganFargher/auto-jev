import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const frostBolt: AbilityDefinition = {
  id: "frost-bolt",
  name: "Frost Bolt",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [
    { kind: "damage", amount: 62, maxAmount: 73 },
    { kind: "slow", slowFraction: 0.2, durationTicks: 42 },
  ],
  tags: ["projectile", "target"],
};

export const glacialLance: AbilityDefinition = {
  id: "glacial-lance",
  name: "Glacial Lance",
  description: "A piercing lance through a line of enemies: damage, a 40% slow for 3 s, and Brittle.",
  cooldownTicks: 30,
  manaCost: 70,
  targetPolicy: "nearest-enemy",
  range: 40,
  area: { kind: "line", lengthUnits: 70, widthUnits: 12 },
  effects: [
    { kind: "damage", amount: 250 },
    { kind: "slow", slowFraction: 0.4, durationTicks: 90 },
    { kind: "apply-condition", condition: "brittle" },
  ],
  canCrit: false,
  tags: ["projectile", "line"],
};

export const iceBlock: AbilityDefinition = {
  id: "ice-block",
  name: "Ice Block",
  description: "At 25% HP, once: invulnerable for 2 s and heals 15%.",
  cooldownTicks: 1,
  targetPolicy: "self",
  range: 0,
  effects: [
    { kind: "invulnerable", durationTicks: 60 },
    { kind: "heal", amount: 0, maxHpFraction: 0.15 },
  ],
  tags: ["self"],
};

export const frostweaver: HeroDefinition = {
  id: "frostweaver",
  name: "Rime",
  title: "Everything slows down near her",
  school: "arcana",
  archetype: "artillery",
  appliesCondition: "brittle",
  maxHp: 1750,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  manaPerAttack: 21,
  critChance: 0.05,
  basicAttackId: frostBolt.id,
  abilityIds: [glacialLance.id],
  passives: [
    { kind: "deep-freeze", slowsNeeded: 3, windowTicks: 168, freezeTicks: 30, radiusUnits: 0 },
    { kind: "hp-threshold", key: "ice-block", fraction: 0.25, abilityId: iceBlock.id },
  ],
};

export const frostweaverAbilities: AbilityDefinition[] = [frostBolt, glacialLance, iceBlock];

const T1 = ["frost-biting-cold", "frost-lingering-frost"];

const T2 = ["frost-blizzard", "frost-shatterpoint"];

export const frostweaverTalents: UpgradeDefinition[] = [
  {
    id: "frost-biting-cold",
    name: "Biting Cold",
    description: "Rime's slows are 20 points stronger.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["frost-lingering-frost"],
    statModifiers: [{ target: { kind: "slow-strength" }, kind: "flat", value: 0.2 }],
  },
  {
    id: "frost-lingering-frost",
    name: "Lingering Frost",
    description: "Brittle she applies lasts 2 s longer.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["frost-biting-cold"],
    statModifiers: [{ target: { kind: "condition-duration" }, kind: "flat", value: 60 }],
  },
  {
    id: "frost-blizzard",
    name: "Blizzard",
    description: "Glacial Lance leaves a freezing zone for 3 s that slows enemies inside by 50%.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["frost-shatterpoint"],
    unlocksRuneSocket: true,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: glacialLance.id,
        setZone: {
          radiusUnits: 20,
          durationTicks: 90,
          periodTicks: 15,
          effects: [{ kind: "slow", slowFraction: 0.5, durationTicks: 20 }],
        },
      },
    ],
  },
  {
    id: "frost-shatterpoint",
    name: "Shatterpoint",
    description: "Her hits also count as Cunning, so she can Shatter Brittle targets, even her own.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["frost-blizzard"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "extra-detonation", school: "cunning", allowSelf: true }],
  },
  {
    id: "frost-absolute-zero",
    name: "Absolute Zero",
    description: "Deep Freeze freezes every enemy within 1.2 cells of the target.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["frost-shardstorm"],
    statModifiers: [],
    grantsPassives: [{ kind: "deep-freeze", slowsNeeded: 3, windowTicks: 168, freezeTicks: 30, radiusUnits: 12 }],
  },
  {
    id: "frost-shardstorm",
    name: "Shardstorm",
    description: "Brittle enemies that die burst for 30% of their max HP to enemies within 1.5 cells.",
    category: "talent",
    heroId: frostweaver.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["frost-absolute-zero"],
    statModifiers: [],
    grantsPassives: [{ kind: "brittle-burst", maxHpFraction: 0.3, radiusUnits: 15 }],
  },
];
