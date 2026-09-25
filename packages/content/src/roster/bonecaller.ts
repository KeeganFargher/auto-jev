import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const thrallBlade: AbilityDefinition = {
  id: "thrall-blade",
  name: "Rusted Blade",
  hitType: "attack",
  cooldownTicks: 42,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 31, maxAmount: 36 }],
  tags: ["target"],
};

export const golemSlam: AbilityDefinition = {
  id: "golem-slam",
  name: "Bone Slam",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 12,
  area: { kind: "circle", center: "target", radiusUnits: 12 },
  effects: [
    { kind: "damage", amount: 70, maxAmount: 84 },
    { kind: "taunt", durationTicks: 45 },
  ],
  tags: ["area", "target"],
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
};

export const boneGolem: HeroDefinition = {
  id: "bone-golem",
  name: "Bone Colossus",
  title: "The whole army, standing up as one",
  school: "might",
  summon: true,
  maxHp: 1400,
  armor: 0.2,
  moveSpeedUnitsPerSecond: 14,
  basicAttackId: golemSlam.id,
};

export const graveBolt: AbilityDefinition = {
  id: "grave-bolt",
  name: "Grave Bolt",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 30,
  effects: [{ kind: "damage", amount: 42, maxAmount: 50 }],
  tags: ["projectile", "target"],
};

export const lichBolt: AbilityDefinition = {
  id: "lich-bolt",
  name: "Lich Bolt",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 30,
  effects: [{ kind: "damage", amount: 42, maxAmount: 50 }],
  bounces: { count: 3, rangeUnits: 30 },
  tags: ["projectile", "target"],
};

export const corpseExplosion: AbilityDefinition = {
  id: "corpse-explosion",
  name: "Corpse Explosion",
  hitType: "spell",
  description: "Blows up the corpse or thrall with the most enemies around it, dealing 60 plus a quarter of its max HP to every enemy within 1.5 cells and Staggering them.",
  cooldownTicks: 150,
  targetPolicy: "busiest-corpse",
  range: 999,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  minTargets: 1,
  consumes: { summonId: thrall.id },
  effects: [
    { kind: "damage", amount: 60, consumedMaxHpFraction: 0.25 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  canCrit: false,
  tags: ["area"],
};

export const armyOfTheDead: AbilityDefinition = {
  id: "army-of-the-dead",
  name: "Army of the Dead",
  hitType: "spell",
  description: "Every hero corpse on the board, from either side, rises to fight for the Sexton for 8 s at 40% strength, with 2 thralls beside him. Waits until there is a hero corpse to raise.",
  cooldownTicks: 30,
  manaCost: 100,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "raise-army", strength: 0.4, lifetimeTicks: 240, thrallHeroId: thrall.id, thralls: 2, thrallScale: 1 }],
  tags: ["self", "summon"],
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
  abilityId: corpseExplosion.id,
  ultimateId: armyOfTheDead.id,
  passives: [{ kind: "harvest", name: "Harvest", soulsPer: 2, heroId: thrall.id, maxActive: 4 }],
};

export const bonecallerSummons: HeroDefinition[] = [thrall, boneGolem];

export const bonecallerAbilities: AbilityDefinition[] = [thrallBlade, golemSlam, graveBolt, lichBolt, corpseExplosion, armyOfTheDead];

export const bonecallerLevels: UpgradeDefinition[] = [
  {
    id: "bonecaller-bigger-booms",
    name: "Bigger Booms",
    description: "Corpse Explosion reaches 50% further.",
    category: "level",
    heroId: bonecaller.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-area", abilityId: corpseExplosion.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "bonecaller-brittle-bones",
    name: "Brittle Bones",
    description: "Thralls' hits make enemies Brittle.",
    category: "level",
    heroId: bonecaller.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [
      {
        kind: "empower-summons",
        key: "brittle-bones",
        heroId: thrall.id,
        passives: [{ kind: "every-nth-attack", key: "brittle-bones", n: 1, effects: [{ kind: "apply-condition", condition: "brittle" }] }],
      },
    ],
  },
  {
    id: "bonecaller-grave-chain",
    name: "Grave Chain",
    description: "When an enemy hit by Corpse Explosion dies within 5 s, its corpse explodes too.",
    category: "level",
    heroId: bonecaller.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "grave-chain", delayTicks: 9, markTicks: 150 }],
  },
  {
    id: "bonecaller-bone-legion",
    name: "Bone Legion",
    description: "Every Soul raises a thrall at once.",
    category: "level",
    heroId: bonecaller.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "harvest", name: "Harvest", soulsPer: 1, heroId: thrall.id, maxActive: 4 }],
  },
  {
    id: "bonecaller-lich-form",
    name: "Lich Form",
    description: "Army of the Dead also makes the Sexton a Lich for 8 s. His bolts jump to 3 more enemies, and every kill raises a thrall.",
    category: "level",
    heroId: bonecaller.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: armyOfTheDead.id, setForm: { key: "lich", durationTicks: 240, basicAttackId: lichBolt.id, raisesOnKill: thrall.id } }],
  },
  {
    id: "bonecaller-bone-colossus",
    name: "Bone Colossus",
    description: "Army of the Dead raises one Bone Colossus for 12 s instead. It has the army's total HP, 50% more damage for each body in it and the Sexton's items, and its slams hit and taunt every enemy within 1.2 cells.",
    category: "level",
    heroId: bonecaller.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: armyOfTheDead.id,
        setEffects: [
          { kind: "raise-army", strength: 0.4, lifetimeTicks: 360, thrallHeroId: thrall.id, thralls: 2, thrallScale: 1, merge: { heroId: boneGolem.id, damagePerBody: 0.5 } },
        ],
      },
    ],
  },
];
