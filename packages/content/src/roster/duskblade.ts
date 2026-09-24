import { SIGNATURE_ABILITY, type AbilityDefinition, type HeroDefinition, type UpgradeDefinition } from "@jev-game/game";

export const duskStrike: AbilityDefinition = {
  id: "dusk-strike",
  name: "Dusk Strike",
  cooldownTicks: 34,
  targetPolicy: "nearest-enemy",
  range: 10,
  effects: [{ kind: "damage", amount: 73, maxAmount: 90 }],
  tags: ["target"],
};

export const shadowstep: AbilityDefinition = {
  id: "shadowstep",
  name: "Shadowstep",
  description: "Blinks behind the lowest-HP enemy, strikes hard and Disorients it.",
  cooldownTicks: 30,
  manaCost: 100,
  targetPolicy: "lowest-hp-enemy",
  range: 999,
  blinkBehindTarget: true,
  effects: [
    { kind: "damage", amount: 280 },
    { kind: "apply-condition", condition: "disoriented" },
  ],
  tags: ["dash", "target"],
};

export const smoke: AbilityDefinition = {
  id: "smoke",
  name: "Smoke",
  description: "At 50% HP, once: can't be targeted for 1.5 s.",
  cooldownTicks: 1,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "untargetable", durationTicks: 45 }],
  tags: ["self"],
};

export const duskblade: HeroDefinition = {
  id: "duskblade",
  name: "Vesper",
  title: "Finds the weakest and finishes it",
  school: "cunning",
  archetype: "dive",
  appliesCondition: "disoriented",
  maxHp: 1550,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 25,
  manaPerAttack: 21,
  critChance: 0.18,
  basicAttackId: duskStrike.id,
  abilityIds: [shadowstep.id],
  passives: [
    { kind: "crit-vs-condition", bonusChance: 0.4 },
    { kind: "hp-threshold", key: "smoke", fraction: 0.5, abilityId: smoke.id },
  ],
};

export const duskbladeAbilities: AbilityDefinition[] = [duskStrike, shadowstep, smoke];

const T1 = ["dusk-ambush", "dusk-slippery"];

const T2 = ["dusk-blood-rush", "dusk-vanishing-act"];

export const duskbladeTalents: UpgradeDefinition[] = [
  {
    id: "dusk-ambush",
    name: "Ambush",
    description: "Shadowstep deals 30% more damage.",
    category: "talent",
    heroId: duskblade.id,
    tier: 1,
    path: "left",
    maxStacks: 1,
    excludesUpgradeIds: ["dusk-slippery"],
    statModifiers: [{ target: { kind: "ability-damage", abilityId: SIGNATURE_ABILITY }, kind: "percent", value: 0.3 }],
  },
  {
    id: "dusk-slippery",
    name: "Slippery",
    description: "15% chance to dodge basic attacks.",
    category: "talent",
    heroId: duskblade.id,
    tier: 1,
    path: "right",
    maxStacks: 1,
    excludesUpgradeIds: ["dusk-ambush"],
    statModifiers: [],
    grantsPassives: [{ kind: "evasion", chance: 0.15 }],
  },
  {
    id: "dusk-blood-rush",
    name: "Blood Rush",
    description: "Every kill restores 30% of max HP.",
    category: "talent",
    heroId: duskblade.id,
    tier: 2,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["dusk-vanishing-act"],
    unlocksRuneSocket: true,
    statModifiers: [],
    grantsPassives: [{ kind: "on-kill-heal", maxHpFraction: 0.3 }],
  },
  {
    id: "dusk-vanishing-act",
    name: "Vanishing Act",
    description: "Smoke also Disorients every enemy within 1.5 cells.",
    category: "talent",
    heroId: duskblade.id,
    tier: 2,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T1,
    excludesUpgradeIds: ["dusk-blood-rush"],
    unlocksRuneSocket: true,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: smoke.id,
        setSecondary: {
          area: { kind: "circle", center: "self", radiusUnits: 15 },
          effects: [{ kind: "apply-condition", condition: "disoriented" }],
        },
      },
    ],
  },
  {
    id: "dusk-executioner",
    name: "Executioner",
    description: "A kill fills Vesper's mana, so Shadowstep can chain from kill to kill.",
    category: "talent",
    heroId: duskblade.id,
    tier: 3,
    path: "left",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["dusk-phantom"],
    statModifiers: [],
    grantsPassives: [{ kind: "on-kill-mana", amount: 100 }],
  },
  {
    id: "dusk-phantom",
    name: "Phantom",
    description: "Smoke triggers a second time at 25% HP.",
    category: "talent",
    heroId: duskblade.id,
    tier: 3,
    path: "right",
    maxStacks: 1,
    requiresAnyOfUpgradeIds: T2,
    excludesUpgradeIds: ["dusk-executioner"],
    statModifiers: [],
    grantsPassives: [{ kind: "hp-threshold", key: "smoke-again", fraction: 0.25, abilityId: smoke.id }],
  },
];
