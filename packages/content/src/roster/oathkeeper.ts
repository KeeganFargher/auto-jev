import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const oathHammer: AbilityDefinition = {
  id: "oath-hammer",
  name: "Oath Hammer",
  cooldownTicks: 55,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 48, maxAmount: 59 }],
  tags: ["target"],
};

export const consecrate: AbilityDefinition = {
  id: "consecrate",
  name: "Consecrate",
  description: "A hammer slam that damages and Staggers enemies within 1.5 cells, heals allies there, and leaves hallowed ground that keeps healing for 3 s.",
  cooldownTicks: 30,
  manaCost: 80,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 15 },
  minTargets: 1,
  effects: [
    { kind: "damage", amount: 130 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  allyEffects: [{ kind: "heal", amount: 180 }],
  zone: { radiusUnits: 15, durationTicks: 90, periodTicks: 30, effects: [], allyEffects: [{ kind: "heal", amount: 21 }] },
  canCrit: false,
  tags: ["area", "self", "heal", "zone"],
};

export const mend: AbilityDefinition = {
  id: "mend",
  name: "Mend",
  description: "Heals the most wounded ally within 4 cells.",
  cooldownTicks: 210,
  targetPolicy: "lowest-hp-fraction-ally",
  range: 40,
  effects: [{ kind: "heal", amount: 160 }],
  tags: ["heal", "target"],
};

export const oathkeeper: HeroDefinition = {
  id: "oathkeeper",
  name: "Morrow",
  title: "Keeps the promise nobody else would",
  school: "might",
  archetype: "wall",
  appliesCondition: "staggered",
  maxHp: 2100,
  armor: 0.25,
  moveSpeedUnitsPerSecond: 15,
  critChance: 0.05,
  manaPerAttack: 21,
  basicAttackId: oathHammer.id,
  abilityIds: [consecrate.id, mend.id],
  passives: [{ kind: "last-rites", charges: 1, untargetableTicks: 45 }],
};

export const oathkeeperAbilities: AbilityDefinition[] = [oathHammer, consecrate, mend];

const T1 = ["oathkeeper-devotion", "oathkeeper-zeal"];

const T2 = ["oathkeeper-twice-blessed", "oathkeeper-hammer-of-dawn"];

export const oathkeeperTalents: UpgradeDefinition[] = [
  {
    id: "oathkeeper-devotion",
    name: "Devotion",
    description: "Mend heals 40% more.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["oathkeeper-zeal"],
    statModifiers: [{ target: { kind: "ability-healing", abilityId: mend.id }, kind: "percent", value: 0.4 }],
  },
  {
    id: "oathkeeper-zeal",
    name: "Zeal",
    description: "+15% damage and 15% lifesteal.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["oathkeeper-devotion"],
    statModifiers: [
      { target: { kind: "damage" }, kind: "flat", value: 0.15 },
      { target: { kind: "lifesteal" }, kind: "flat", value: 0.15 },
    ],
  },
  {
    id: "oathkeeper-twice-blessed",
    name: "Twice Blessed",
    description: "Last Rites can save two allies each fight.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["oathkeeper-hammer-of-dawn"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "last-rites", charges: 2, untargetableTicks: 45 }],
  },
  {
    id: "oathkeeper-hammer-of-dawn",
    name: "Hammer of Dawn",
    description: "Consecrate deals 50% more damage.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["oathkeeper-twice-blessed"],
    unlocksRuneSocket: true,
    statModifiers: [{ target: { kind: "ability-damage", abilityId: consecrate.id }, kind: "percent", value: 0.5 }],
  },
  {
    id: "oathkeeper-martyrdom",
    name: "Martyrdom",
    description: "When Morrow falls, every ally heals 30% of max HP.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["oathkeeper-holy-ground"],
    statModifiers: [],
    grantsPassives: [{ kind: "martyrdom", healFraction: 0.3 }],
  },
  {
    id: "oathkeeper-holy-ground",
    name: "Holy Ground",
    description: "Hallowed ground lasts twice as long and burns enemies standing in it.",
    category: "talent",
    heroId: oathkeeper.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["oathkeeper-martyrdom"],
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: consecrate.id,
        setZone: {
          radiusUnits: 15,
          durationTicks: 180,
          periodTicks: 30,
          effects: [{ kind: "damage", amount: 30 }],
          allyEffects: [{ kind: "heal", amount: 21 }],
        },
      },
    ],
  },
];
