import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const bulwarkStrike: AbilityDefinition = {
  id: "bulwark-strike",
  name: "Shield Strike",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 53, maxAmount: 64 }],
  tags: ["target"],
};

export const challenge: AbilityDefinition = {
  id: "challenge",
  name: "Challenge",
  description: "Taunts every enemy within 2 cells for 3.5 s and gains a shield worth 6% of max HP for each one.",
  cooldownTicks: 30,
  manaCost: 80,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 20 },
  minTargets: 1,
  effects: [{ kind: "taunt", durationTicks: 105 }],
  casterShieldPerTarget: { maxHpFraction: 0.06, durationTicks: 168 },
  canCrit: false,
  tags: ["area", "self"],
};

export const shieldBash: AbilityDefinition = {
  id: "shield-bash",
  name: "Shield Bash",
  description: "Hits the current target and Staggers it.",
  cooldownTicks: 252,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [
    { kind: "damage", amount: 84 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  tags: ["target"],
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
  abilityIds: [challenge.id, shieldBash.id],
  passives: [{ kind: "interpose", fraction: 0.2, rangeUnits: 15 }],
};

export const bulwarkAbilities: AbilityDefinition[] = [bulwarkStrike, challenge, shieldBash];

const T1 = ["bulwark-heavy-shield", "bulwark-spiked-plate"];

const T2 = ["bulwark-rallying-presence", "bulwark-grudge"];

export const bulwarkTalents: UpgradeDefinition[] = [
  {
    id: "bulwark-heavy-shield",
    name: "Heavy Shield",
    description: "Shield Bash also Staggers every enemy next to its target.",
    category: "talent",
    heroId: bulwark.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["bulwark-spiked-plate"],
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: shieldBash.id,
        setSecondary: {
          area: { kind: "circle", center: "target", radiusUnits: 12 },
          effects: [{ kind: "apply-condition", condition: "staggered" }],
        },
      },
    ],
  },
  {
    id: "bulwark-spiked-plate",
    name: "Spiked Plate",
    description: "Every hit Anvil takes deals 17 Might damage back to the attacker.",
    category: "talent",
    heroId: bulwark.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["bulwark-heavy-shield"],
    statModifiers: [],
    grantsPassives: [{ kind: "thorns", amount: 17 }],
  },
  {
    id: "bulwark-rallying-presence",
    name: "Rallying Presence",
    description: "Interpose covers allies within 2.5 cells and takes 30% of their damage. +10% max HP.",
    category: "talent",
    heroId: bulwark.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["bulwark-grudge"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "max-hp" }, kind: "percent", value: 0.1 }],
    grantsPassives: [{ kind: "interpose", fraction: 0.3, rangeUnits: 25 }],
  },
  {
    id: "bulwark-grudge",
    name: "Grudge",
    description: "+1% damage each time Anvil is hit, up to +50%.",
    category: "talent",
    heroId: bulwark.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["bulwark-rallying-presence"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "grudge", perHit: 0.014, max: 0.5 }],
  },
  {
    id: "bulwark-unbreakable-oath",
    name: "Unbreakable Oath",
    description: "Anvil can't drop below 1 HP while any enemy is taunted by Challenge, and Challenge costs 25% less mana.",
    category: "talent",
    heroId: bulwark.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["bulwark-retribution"],
    statModifiers: [{ target: { kind: "ability-mana-cost", abilityId: "challenge" }, kind: "percent", value: -0.25 }],
    grantsPassives: [{ kind: "unbreakable-while-taunting" }],
  },
  {
    id: "bulwark-retribution",
    name: "Retribution",
    description: "When Challenge ends, 60% of the damage Anvil took during it is released as a Staggering shockwave.",
    category: "talent",
    heroId: bulwark.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["bulwark-unbreakable-oath"],
    statModifiers: [],
    grantsPassives: [{ kind: "retribution", radiusUnits: 20, fraction: 0.6 }],
  },
];
