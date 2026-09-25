import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const oathHammer: AbilityDefinition = {
  id: "oath-hammer",
  name: "Oath Hammer",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 48, maxAmount: 59 }],
  tags: ["target"],
};

export const judgment: AbilityDefinition = {
  id: "judgment",
  name: "Judgment",
  hitType: "spell",
  description:
    "Throws a hammer at the nearest enemy within 4 cells. It bounces 4 more times, ally then enemy: enemies take 40 and are Staggered, allies heal 100.",
  tags: ["projectile", "target", "heal"],
  cooldownTicks: 210,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [
    { kind: "damage", amount: 40 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  bounces: { count: 2, rangeUnits: 35, allyEffects: [{ kind: "heal", amount: 100 }] },
};

export const avatarJudgment: AbilityDefinition = {
  id: "avatar-judgment",
  name: "Avatar's Judgment",
  hitType: "attack",
  description: "Avatar's attack: a Judgment hammer that bounces to an ally, healing 80, then to another enemy.",
  tags: ["projectile", "target"],
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [
    { kind: "damage", amount: 48, maxAmount: 59 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  bounces: { count: 1, rangeUnits: 35, allyEffects: [{ kind: "heal", amount: 80 }] },
};

export const hallowedPath: AbilityDefinition = {
  id: "hallowed-path",
  name: "Hallowed Path",
  hitType: "spell",
  description: "Hallowed ground where Judgment landed. For 2 s it heals allies standing in it for 10 every 0.5 s.",
  tags: ["zone", "heal"],
  cooldownTicks: 1,
  targetPolicy: "self",
  range: 0,
  effects: [],
  zone: { radiusUnits: 10, durationTicks: 60, periodTicks: 15, effects: [], allyEffects: [{ kind: "heal", amount: 10 }] },
};

export const resurrection: AbilityDefinition = {
  id: "resurrection",
  name: "Resurrection",
  hitType: "spell",
  description:
    "Raises the ally who fell most recently at 50% HP, Staggering enemies within 2 cells of them. If nobody has fallen, the whole team is invulnerable for 1 s instead. Each ally can be raised once per fight.",
  tags: ["self"],
  cooldownTicks: 30,
  manaCost: 120,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "resurrect", hpFraction: 0.5, all: false, staggerRadiusUnits: 20, fallbackInvulnerableTicks: 30, dangerHpFraction: 0.1 }],
};

export const oathkeeper: HeroDefinition = {
  id: "oathkeeper",
  name: "Morrow",
  title: "Heals by the hammer, then raises the fallen",
  school: "might",
  archetype: "wall",
  appliesCondition: "staggered",
  maxHp: 1800,
  armor: 0.25,
  moveSpeedUnitsPerSecond: 15,
  critChance: 0.05,
  manaPerAttack: 21,
  basicAttackId: oathHammer.id,
  abilityId: judgment.id,
  ultimateId: resurrection.id,
  passives: [{ kind: "blessed-overflow", name: "Blessed Overflow", capMaxHpFraction: 0.2, durationTicks: 150, burstFraction: 0.5, burstRadiusUnits: 15 }],
};

export const oathkeeperAbilities: AbilityDefinition[] = [oathHammer, judgment, avatarJudgment, hallowedPath, resurrection];

export const oathkeeperLevels: UpgradeDefinition[] = [
  {
    id: "oathkeeper-swift-judgment",
    name: "Swift Judgment",
    description: "Judgment bounces 2 more times.",
    category: "level",
    heroId: oathkeeper.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: judgment.id, addBounces: 1 }],
  },
  {
    id: "oathkeeper-hallowed-path",
    name: "Hallowed Path",
    description: "Everywhere Judgment lands turns to hallowed ground for 2 s, healing allies in it for 10 every 0.5 s.",
    category: "level",
    heroId: oathkeeper.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: judgment.id,
        patchBounces: { trail: hallowedPath.id },
      },
    ],
  },
  {
    id: "oathkeeper-crusader",
    name: "Crusader",
    description: "Her attacks heal her most wounded ally for 50% of the damage they deal.",
    category: "level",
    heroId: oathkeeper.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "crusader", fraction: 0.5 }],
  },
  {
    id: "oathkeeper-martyr",
    name: "Martyr",
    description: "Judgment costs 5% of her current HP and heals twice as much.",
    category: "level",
    heroId: oathkeeper.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-healing", abilityId: judgment.id }, kind: "percent", value: 1 }],
    abilityChanges: [{ abilityId: judgment.id, setHpCostFraction: 0.05 }],
  },
  {
    id: "oathkeeper-mass-resurrection",
    name: "Mass Resurrection",
    description: "Resurrection raises every fallen ally at 50% HP and Staggers enemies within 3 cells of them. If nobody has fallen, the team is invulnerable for 2 s instead.",
    category: "level",
    heroId: oathkeeper.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: resurrection.id,
        setEffects: [{ kind: "resurrect", hpFraction: 0.5, all: true, staggerRadiusUnits: 30, fallbackInvulnerableTicks: 60, dangerHpFraction: 0.1 }],
      },
    ],
  },
  {
    id: "oathkeeper-avatar",
    name: "Avatar",
    description: "Resurrection also makes her huge for 6 s: she takes 30% less damage and her attacks throw Judgments.",
    category: "level",
    heroId: oathkeeper.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: resurrection.id, setForm: { key: "avatar", durationTicks: 180, damageTakenMultiplier: 0.7, basicAttackId: avatarJudgment.id } }],
  },
];
