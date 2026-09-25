import type { AbilityDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

export const turretShot: AbilityDefinition = {
  id: "turret-shot",
  name: "Turret Shot",
  hitType: "attack",
  cooldownTicks: 42,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 31, maxAmount: 39 }],
  tags: ["projectile", "target"],
};

export const turretBlast: AbilityDefinition = {
  id: "self-destruct",
  name: "Self-Destruct",
  hitType: "spell",
  description: "The turret blows apart, hitting every enemy within 1.5 cells and Staggering them.",
  cooldownTicks: 1,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "self", radiusUnits: 15 },
  effects: [
    { kind: "damage", amount: 90 },
    { kind: "apply-condition", condition: "staggered" },
  ],
  canCrit: false,
  tags: ["area"],
};

export const turret: HeroDefinition = {
  id: "turret",
  name: "Turret",
  title: "Every one of them has a name",
  school: "cunning",
  summon: true,
  maxHp: 800,
  armor: 0.1,
  moveSpeedUnitsPerSecond: 0,
  basicAttackId: turretShot.id,
  passives: [{ kind: "first-hit-per-enemy", key: "flash-round", effects: [{ kind: "apply-condition", condition: "disoriented" }] }],
};

export const rivetGun: AbilityDefinition = {
  id: "rivet-gun",
  name: "Rivet Gun",
  hitType: "attack",
  cooldownTicks: 50,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 48, maxAmount: 56 }],
  tags: ["projectile", "target"],
};

export const mechRocket: AbilityDefinition = {
  id: "mech-rocket",
  name: "Rocket",
  hitType: "attack",
  cooldownTicks: 50,
  targetPolicy: "nearest-enemy",
  range: 40,
  area: { kind: "circle", center: "target", radiusUnits: 10 },
  effects: [{ kind: "damage", amount: 56, maxAmount: 66 }],
  tags: ["projectile", "area", "target"],
};

export const deployTurret: AbilityDefinition = {
  id: "deploy-turret",
  name: "Deploy Turret",
  hitType: "spell",
  description: "Builds a turret beside Brassjack, up to 3 at once. Its shots carry every gem socketed here, and its first shot at each enemy Disorients it.",
  cooldownTicks: 210,
  targetPolicy: "self",
  range: 0,
  effects: [{ kind: "summon", heroId: turret.id, count: 1, maxActive: 3, carriesGems: true }],
  tags: ["summon", "projectile"],
};

export const mechSuit: AbilityDefinition = {
  id: "mech-suit",
  name: "Mech Suit",
  hitType: "spell",
  description: "Brassjack climbs into a mech for 6 s, with a shield worth half his max HP. He fires rockets that hit everything within 1 cell of the target, every turret fires at his target, and he builds no mana until he climbs out.",
  cooldownTicks: 30,
  manaCost: 110,
  targetPolicy: "self",
  range: 0,
  form: { key: "mech", durationTicks: 180, basicAttackId: mechRocket.id, commandsSummons: true, locksMana: true },
  effects: [{ kind: "shield", amount: 0, maxHpFraction: 0.5, durationTicks: 180 }],
  tags: ["self", "channel"],
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
  abilityId: deployTurret.id,
  ultimateId: mechSuit.id,
  passives: [{ kind: "overclock", name: "Overclock", heroId: turret.id, rangeUnits: 20, bonusPerSecond: 0.1, maxBonus: 1 }],
};

export const clockwrightSummons: HeroDefinition[] = [turret];

export const clockwrightAbilities: AbilityDefinition[] = [turretShot, turretBlast, rivetGun, mechRocket, deployTurret, mechSuit];

export const clockwrightLevels: UpgradeDefinition[] = [
  {
    id: "clockwright-twin-deploy",
    name: "Twin Deploy",
    description: "Deploy Turret builds two turrets at once, but recharges in 16 s instead of 7.",
    category: "level",
    heroId: clockwright.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-cooldown", abilityId: deployTurret.id }, kind: "percent", value: 1.25 }],
    abilityChanges: [{ abilityId: deployTurret.id, setEffects: [{ kind: "summon", heroId: turret.id, count: 2, maxActive: 3, carriesGems: true }] }],
  },
  {
    id: "clockwright-tesla-coils",
    name: "Tesla Coils",
    description: "Turret shots chain to one more enemy nearby for 60% damage.",
    category: "level",
    heroId: clockwright.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "empower-summons", key: "tesla-coils", heroId: turret.id, gems: [{ kind: "chain", extraTargets: 1, fraction: 0.6, rangeUnits: 25 }] }],
  },
  {
    id: "clockwright-gadgeteer",
    name: "Gadgeteer",
    description: "Turrets carry copies of Brassjack's items.",
    category: "level",
    heroId: clockwright.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "heart-of-the-swarm" }],
  },
  {
    id: "clockwright-self-destruct",
    name: "Self-Destruct",
    description: "Turrets explode when destroyed or replaced, dealing 90 to every enemy within 1.5 cells and Staggering them.",
    category: "level",
    heroId: clockwright.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [
      { kind: "empower-summons", key: "self-destruct", heroId: turret.id, passives: [{ kind: "self-destruct", abilityId: turretBlast.id, delayTicks: 9 }] },
    ],
  },
  {
    id: "clockwright-walking-fortress",
    name: "Walking Fortress",
    description: "The Mech Suit lasts until its shield breaks, and his turrets walk with him.",
    category: "level",
    heroId: clockwright.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: mechSuit.id,
        patchForm: { durationTicks: 3600, endsWhenShieldBreaks: true, summonsFollow: true },
        setEffects: [{ kind: "shield", amount: 0, maxHpFraction: 0.5, durationTicks: 3600 }],
      },
    ],
  },
  {
    id: "clockwright-doomsday",
    name: "Doomsday",
    description: "The Mech Suit ends in an explosion that deals a quarter of Brassjack's max HP to every enemy within 2 cells.",
    category: "level",
    heroId: clockwright.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: mechSuit.id,
        patchForm: { endBurst: { damageTakenFraction: 0, radiusUnits: 20, effects: [{ kind: "damage", amount: 0, casterMaxHpFraction: 0.25 }] } },
      },
    ],
  },
];
