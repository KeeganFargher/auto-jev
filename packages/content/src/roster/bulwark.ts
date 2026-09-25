import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const bulwarkStrike: AbilityDefinition = {
  id: "bulwark-strike",
  name: "Shield Strike",
  hitType: "attack",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 53, maxAmount: 64 }],
  tags: ["target"],
};

export const shieldToss: AbilityDefinition = {
  id: "shield-toss",
  name: "Shield Toss",
  hitType: "attack",
  description:
    "Throws his shield at the nearest enemy within 4 cells. It ricochets to 2 more enemies, then comes back. Each hit is an attack for 20 + 2% of his max HP and Staggers.",
  tags: ["projectile", "target"],
  cooldownTicks: 180,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [
    { kind: "damage", amount: 20, casterMaxHpFraction: 0.02 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  bounces: { count: 2, rangeUnits: 30 },
};

export const shieldBash: AbilityDefinition = {
  id: "shield-bash",
  name: "Shield Bash",
  hitType: "attack",
  description: "Last Stand's answer to an attack: a bash that Staggers.",
  tags: ["target"],
  cooldownTicks: 1,
  targetPolicy: "nearest-enemy",
  range: 15,
  effects: [
    { kind: "strike", scale: 0.4 },
    { kind: "apply-condition", condition: "staggered" },
  ],
};

export const lastStand: AbilityDefinition = {
  id: "last-stand",
  name: "Last Stand",
  hitType: "spell",
  description:
    "Taunts every enemy within 3 cells for 2.5 s and takes 10% less damage. Every attack that hits him is answered with a Shield Bash at 40%, at most once per attacker every 1.5 s. It ends in a shockwave for 15% of the damage he took, which Staggers.",
  tags: ["area", "self"],
  cooldownTicks: 30,
  manaCost: 160,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 30 },
  minTargets: 1,
  effects: [{ kind: "taunt", durationTicks: 75 }],
  form: {
    key: "last-stand",
    durationTicks: 75,
    damageTakenMultiplier: 0.9,
    retaliate: { abilityId: shieldBash.id, perAttackerTicks: 45 },
    endBurst: { damageTakenFraction: 0.15, radiusUnits: 30, effects: [{ kind: "apply-condition", condition: "staggered" }] },
  },
};

export const bulwark: HeroDefinition = {
  id: "bulwark",
  name: "Anvil",
  title: "The shield that doesn't move",
  school: "might",
  archetype: "wall",
  appliesCondition: "staggered",
  maxHp: 2200,
  armor: 0.28,
  moveSpeedUnitsPerSecond: 15,
  manaPerAttack: 21,
  critChance: 0.05,
  basicAttackId: bulwarkStrike.id,
  abilityId: shieldToss.id,
  ultimateId: lastStand.id,
  passives: [
    {
      kind: "damage-store",
      key: "vengeance",
      name: "Vengeance",
      description: "Stores 20% of the damage he takes from hits, up to 20% of his max HP. The next Shield Toss's first hit deals it all as bonus damage.",
      fraction: 0.2,
      capMaxHpFraction: 0.2,
      releasedBy: shieldToss.id,
    },
  ],
};

export const bulwarkAbilities: AbilityDefinition[] = [bulwarkStrike, shieldToss, lastStand, shieldBash];

export const bulwarkLevels: UpgradeDefinition[] = [
  {
    id: "bulwark-heavy-shield",
    name: "Heavy Shield",
    description: "Shield Toss ricochets 2 more times.",
    category: "level",
    heroId: bulwark.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: shieldToss.id, addBounces: 2 }],
  },
  {
    id: "bulwark-spiked-rim",
    name: "Spiked Rim",
    description: "Every ricochet knocks its target back 1 cell.",
    category: "level",
    heroId: bulwark.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: shieldToss.id, patchBounces: { knockbackUnits: 10 } }],
  },
  {
    id: "bulwark-captains-return",
    name: "Captain's Return",
    description: "The shield hits every enemy on its way back at 50%, and each of those hits shields Anvil for 3% of his max HP, up to 30%.",
    category: "level",
    heroId: bulwark.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      { abilityId: shieldToss.id, patchBounces: { returnSweep: { widthUnits: 10, fraction: 0.5, casterShieldMaxHpFraction: 0.03, shieldDurationTicks: 150 } } },
    ],
  },
  {
    id: "bulwark-oathbound",
    name: "Oathbound",
    description: "Between enemies, the shield also bounces to an ally, shielding it for 8% of Anvil's max HP.",
    category: "level",
    heroId: bulwark.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      { abilityId: shieldToss.id, patchBounces: { allyEffects: [{ kind: "shield", amount: 0, casterMaxHpFraction: 0.08, durationTicks: 150 }] } },
    ],
  },
  {
    id: "bulwark-unbreakable",
    name: "Unbreakable",
    description: "During Last Stand he can't drop below 1 HP, and Vengeance fills twice as fast.",
    category: "level",
    heroId: bulwark.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: lastStand.id, patchForm: { minHp: 1, storeMultiplier: 2 } }],
  },
  {
    id: "bulwark-reprisal",
    name: "Reprisal",
    description: "During Last Stand, every 3rd hit he takes throws a free Shield Toss, at most one every 0.5 s.",
    category: "level",
    heroId: bulwark.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: lastStand.id, patchForm: { castEveryNthHitTaken: { n: 3, abilityId: shieldToss.id, rechargeTicks: 15 } } }],
  },
];
