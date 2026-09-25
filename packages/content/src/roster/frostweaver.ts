import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const frostBolt: AbilityDefinition = {
  id: "frost-bolt",
  name: "Frost Bolt",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [
    { kind: "damage", amount: 62, maxAmount: 73 },
    { kind: "slow", slowFraction: 0.2, durationTicks: 42 },
    { kind: "chill", stacks: 1 },
  ],
  tags: ["projectile", "target"],
};

export const frozenOrb: AbilityDefinition = {
  id: "frozen-orb",
  name: "Frozen Orb",
  hitType: "spell",
  description:
    "Sends a slow orb towards the nearest enemy. It crosses 6 cells over 3 s and shoots an ice shard at the nearest enemy within 2.5 cells every 0.2 s. Each shard deals 20 and Chills.",
  tags: ["projectile"],
  cooldownTicks: 180,
  targetPolicy: "nearest-enemy",
  range: 50,
  effects: [
    { kind: "damage", amount: 20 },
    { kind: "chill", stacks: 1 },
  ],
  emitter: { count: 1, spreadDegrees: 0, travelUnits: 60, durationTicks: 90, periodTicks: 6, radiusUnits: 25, targets: "nearest" },
};

export const glacialPrison: AbilityDefinition = {
  id: "glacial-prison",
  name: "Glacial Prison",
  hitType: "spell",
  description: "Freezes every enemy within 2 cells of the densest group for 2 s. Enemies it catches take 25% more damage for those 2 s.",
  tags: ["area"],
  cooldownTicks: 30,
  manaCost: 140,
  targetPolicy: "densest-enemy-cluster",
  range: 60,
  area: { kind: "circle", center: "target", radiusUnits: 20 },
  minTargets: 1,
  effects: [
    { kind: "control", control: "frozen", durationTicks: 60 },
    { kind: "mark", bonus: 0.25, durationTicks: 60 },
  ],
};

export const frostweaver: HeroDefinition = {
  id: "frostweaver",
  name: "Rime",
  title: "Fills the board with ice, then locks it",
  school: "arcana",
  archetype: "artillery",
  appliesCondition: "brittle",
  maxHp: 1750,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  manaPerAttack: 21,
  critChance: 0.05,
  basicAttackId: frostBolt.id,
  abilityId: frozenOrb.id,
  ultimateId: glacialPrison.id,
  passives: [
    {
      kind: "deep-freeze",
      name: "Deep Freeze",
      chillsToFreeze: 5,
      chillTicks: 90,
      freezeTicks: 30,
      condition: "brittle",
    },
  ],
};

export const frostweaverAbilities: AbilityDefinition[] = [frostBolt, frozenOrb, glacialPrison];

export const frostweaverLevels: UpgradeDefinition[] = [
  {
    id: "frost-twin-orbs",
    name: "Twin Orbs",
    description: "Frozen Orb sends two orbs, 30° apart, each shooting every 0.3 s.",
    category: "level",
    heroId: frostweaver.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: frozenOrb.id, patchEmitter: { count: 2, spreadDegrees: 30, periodTicks: 9 } }],
  },
  {
    id: "frost-slow-orb",
    name: "Slow Orb",
    description: "Frozen Orb moves at half speed and lasts 4 s, shooting a third more shards.",
    category: "level",
    heroId: frostweaver.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: frozenOrb.id, patchEmitter: { durationTicks: 120, travelUnits: 40 } }],
  },
  {
    id: "frost-shatterpoint",
    name: "Shatterpoint",
    description: "Her Frost Bolts also count as Cunning, so they Shatter Brittle enemies, even ones she froze.",
    category: "level",
    heroId: frostweaver.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "extra-detonation", school: "cunning", allowSelf: true, abilityIds: [frostBolt.id] }],
  },
  {
    id: "frost-ice-mirror",
    name: "Ice Mirror",
    description: "The first time she would die, she becomes an ice statue instead: 25% HP, and untouchable but unable to act for 2 s.",
    category: "level",
    heroId: frostweaver.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "revive", hpFraction: 0.25, statueTicks: 60 }],
  },
  {
    id: "frost-permafrost",
    name: "Permafrost",
    description: "Glacial Prison lasts 3 s and reaches 4 cells from the group, most of the enemy's half.",
    category: "level",
    heroId: frostweaver.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: glacialPrison.id,
        setArea: { kind: "circle", center: "target", radiusUnits: 40 },
        setEffects: [
          { kind: "control", control: "frozen", durationTicks: 90 },
          { kind: "mark", bonus: 0.25, durationTicks: 90 },
        ],
      },
    ],
  },
  {
    id: "frost-hailstorm",
    name: "Hailstorm",
    description: "Glacial Prison also calls a 4 s hailstorm: every enemy is hit by a Frozen Orb shard every 0.5 s. Frozen Orb's gems apply to the shards.",
    category: "level",
    heroId: frostweaver.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: glacialPrison.id,
        setEmitter: { count: 1, spreadDegrees: 0, travelUnits: 0, durationTicks: 120, periodTicks: 15, radiusUnits: 120, targets: "all", shotsAs: "@ability" },
      },
    ],
  },
];
