import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const thrallBlade: AbilityDefinition = {
  id: "thrall-blade",
  name: "Rusted Blade",
  cooldownTicks: 42,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 31, maxAmount: 36 }],
  tags: ["target"],
};

export const golemSlam: AbilityDefinition = {
  id: "golem-slam",
  name: "Bone Slam",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 12,
  effects: [{ kind: "damage", amount: 70, maxAmount: 84 }],
  tags: ["target"],
};

export const thrall: HeroDefinition = {
  id: "thrall",
  name: "Thrall",
  title: "Rattling, loyal, disposable",
  school: "might",
  summon: true,
  maxHp: 480,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 18,
  basicAttackId: thrallBlade.id,
  abilityIds: [],
};

export const boneGolem: HeroDefinition = {
  id: "bone-golem",
  name: "Bone Golem",
  title: "A heap of the dead that stood up",
  school: "might",
  summon: true,
  maxHp: 1400,
  armor: 0.2,
  moveSpeedUnitsPerSecond: 14,
  basicAttackId: golemSlam.id,
  abilityIds: [],
};

export const graveBolt: AbilityDefinition = {
  id: "grave-bolt",
  name: "Grave Bolt",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 30,
  effects: [{ kind: "damage", amount: 42, maxAmount: 50 }],
  tags: ["projectile", "target"],
};

export const raiseDead: AbilityDefinition = {
  id: "raise-dead",
  name: "Raise Dead",
  description: "Raises 2 skeleton thralls beside the Sexton, up to 4 at once. Thralls hit with Might, so they can crush Disoriented enemies.",
  cooldownTicks: 30,
  manaCost: 80,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "summon", heroId: thrall.id, count: 2, maxActive: 4 }],
  tags: ["self", "summon"],
};

export const corpseExplosion: AbilityDefinition = {
  id: "corpse-explosion",
  name: "Corpse Explosion",
  description: "Blows up the thrall standing among the most enemies, damaging and Staggering everything within 1.5 cells.",
  cooldownTicks: 336,
  targetPolicy: "own-summon",
  range: 999,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  minTargets: 1,
  consumesTarget: true,
  effects: [
    { kind: "damage", amount: 120 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  canCrit: false,
  tags: ["area"],
};

export const bonecaller: HeroDefinition = {
  id: "bonecaller",
  name: "Sexton",
  title: "Every death is a recruit",
  school: "arcana",
  archetype: "swarm",
  appliesCondition: "staggered",
  maxHp: 1650,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 17,
  critChance: 0.05,
  manaPerAttack: 21,
  basicAttackId: graveBolt.id,
  abilityIds: [raiseDead.id, corpseExplosion.id],
  passives: [{ kind: "harvest", soulsPerGolem: 4, golemHeroId: boneGolem.id }],
};

export const bonecallerSummons: HeroDefinition[] = [thrall, boneGolem];

export const bonecallerAbilities: AbilityDefinition[] = [thrallBlade, golemSlam, graveBolt, raiseDead, corpseExplosion];

const T1 = ["bonecaller-brittle-bones", "bonecaller-soul-well"];

const T2 = ["bonecaller-horde", "bonecaller-golem-heart"];

export const bonecallerTalents: UpgradeDefinition[] = [
  {
    id: "bonecaller-brittle-bones",
    name: "Brittle Bones",
    description: "Each thrall's first hit on an enemy makes it Brittle.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["bonecaller-soul-well"],
    statModifiers: [],
    grantsPassives: [
      {
        kind: "empower-summons",
        key: "brittle-bones",
        heroId: thrall.id,
        passives: [{ kind: "first-hit-per-enemy", key: "brittle-bones", effects: [{ kind: "apply-condition", condition: "brittle" }] }],
      },
    ],
  },
  {
    id: "bonecaller-soul-well",
    name: "Soul Well",
    description: "Start every fight with 2 Souls.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["bonecaller-brittle-bones"],
    statModifiers: [],
    grantsPassives: [{ kind: "soul-well", souls: 2 }],
  },
  {
    id: "bonecaller-horde",
    name: "Horde",
    description: "Raise Dead raises 3 thralls, up to 6 at once.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["bonecaller-golem-heart"],
    unlocksRuneSocket: true,
    statModifiers: [],
    abilityChanges: [{ abilityId: raiseDead.id, setEffects: [{ kind: "summon", heroId: thrall.id, count: 3, maxActive: 6 }] }],
  },
  {
    id: "bonecaller-golem-heart",
    name: "Golem Heart",
    description: "A Golem needs only 3 Souls and arrives with a shield worth half its HP.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["bonecaller-horde"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "golem-heart", soulsPerGolem: 3, shieldFraction: 0.5 }],
  },
  {
    id: "bonecaller-army-of-the-dead",
    name: "Army of the Dead",
    description: "When the Sexton falls, 4 thralls claw their way out where he fell.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["bonecaller-bone-colossus"],
    statModifiers: [],
    grantsPassives: [{ kind: "summon-on-death", heroId: thrall.id, count: 4 }],
  },
  {
    id: "bonecaller-bone-colossus",
    name: "Bone Colossus",
    description: "Golems are 50% bigger and carry the Sexton's items.",
    category: "talent",
    heroId: bonecaller.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["bonecaller-army-of-the-dead"],
    statModifiers: [],
    grantsPassives: [{ kind: "bone-colossus", hpScale: 1.5, inheritsItems: true }],
  },
];
