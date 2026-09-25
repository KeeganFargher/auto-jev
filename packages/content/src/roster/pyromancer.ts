import type { AbilityDefinition, EffectDefinition, FormDefinition, HeroDefinition, UpgradeDefinition } from "@jev-game/game";

const burn: EffectDefinition = {
  kind: "dot",
  dot: "burn",
  stacks: 1,
  damagePerStackPerSecond: 8,
  durationTicks: 126,
  maxStacks: 3,
};

export const firebolt: AbilityDefinition = {
  id: "firebolt",
  name: "Firebolt",
  hitType: "attack",
  cooldownTicks: 59,
  targetPolicy: "nearest-enemy",
  range: 40,
  effects: [{ kind: "damage", amount: 59, maxAmount: 73 }, burn],
  tags: ["projectile", "target"],
};

export const infernoBolt: AbilityDefinition = {
  id: "inferno-bolt",
  name: "Inferno Bolt",
  hitType: "attack",
  description: "Inferno's basic attack: a small fireball that bursts in 0.6 cells for 45 and Burns.",
  cooldownTicks: 59,
  targetPolicy: "nearest-enemy",
  range: 40,
  area: { kind: "circle", center: "target", radiusUnits: 6 },
  effects: [{ kind: "damage", amount: 45 }, burn],
  tags: ["projectile", "area"],
};

export const fireball: AbilityDefinition = {
  id: "fireball",
  name: "Fireball",
  hitType: "spell",
  description: "Hurls a fireball at the densest group within 5 cells. It explodes in 1 cell for 60 and Burns.",
  cooldownTicks: 150,
  targetPolicy: "densest-enemy-cluster",
  range: 50,
  area: { kind: "circle", center: "target", radiusUnits: 10 },
  effects: [{ kind: "damage", amount: 60 }, burn],
  tags: ["projectile", "area"],
};

export const livingBomb: AbilityDefinition = {
  id: "living-bomb",
  name: "Living Bomb",
  hitType: "spell",
  description: "Living Bomb's blast: 80 to every enemy within 1.5 cells of the marked target.",
  cooldownTicks: 1,
  targetPolicy: "self",
  range: 0,
  area: { kind: "circle", center: "target", radiusUnits: 15 },
  effects: [{ kind: "damage", amount: 80 }],
  tags: ["area"],
};

export const meteor: AbilityDefinition = {
  id: "meteor",
  name: "Meteor Shower",
  hitType: "spell",
  description:
    "Calls 6 meteors over 2 s onto the enemy heroes, crowds first. Each lands 0.6 s after its marker for 60 in 1.2 cells and leaves burning ground for 2 s.",
  cooldownTicks: 30,
  manaCost: 200,
  targetPolicy: "densest-enemy-cluster",
  range: 60,
  area: { kind: "circle", center: "target", radiusUnits: 12 },
  effects: [{ kind: "damage", amount: 60 }, burn],
  zone: { radiusUnits: 12, durationTicks: 60, periodTicks: 30, effects: [burn] },
  shower: { count: 6, intervalTicks: 10, landDelayTicks: 18 },
  tags: ["area", "delayed", "zone"],
};

const inferno: FormDefinition = {
  key: "inferno",
  durationTicks: 120,
  attackSpeedBonus: 1,
  basicAttackId: infernoBolt.id,
  drainsStacksKey: "heat",
};

export const pyromancer: HeroDefinition = {
  id: "pyromancer",
  name: "Cinder",
  title: "Wants you to stand still",
  school: "arcana",
  archetype: "artillery",
  maxHp: 1600,
  armor: 0.05,
  moveSpeedUnitsPerSecond: 17,
  manaPerAttack: 21,
  critChance: 0.05,
  basicAttackId: firebolt.id,
  abilityId: fireball.id,
  ultimateId: meteor.id,
  passives: [
    {
      kind: "stacks",
      key: "heat",
      name: "Heat",
      description:
        "Every spell she casts adds 20 Heat, triggered casts included, and every basic attack adds 5. At 100 Heat she goes Inferno for 4 s: her basic attacks become small Fireballs and come twice as fast while Heat drains to 0.",
      gains: [
        { on: "spell-cast", amount: 20 },
        { on: "basic-attack", amount: 5 },
      ],
      max: 100,
      attackSpeedPerStack: 0,
      atMax: { form: inferno },
    },
  ],
};

export const pyromancerAbilities: AbilityDefinition[] = [firebolt, fireball, meteor, infernoBolt, livingBomb];

export const pyromancerLevels: UpgradeDefinition[] = [
  {
    id: "pyro-big-bang",
    name: "Big Bang",
    description: "Fireball's blast is 60% wider.",
    category: "level",
    heroId: pyromancer.id,
    level: 2,
    path: "left",
    maxStacks: 1,
    statModifiers: [{ target: { kind: "ability-area", abilityId: fireball.id }, kind: "percent", value: 0.6 }],
  },
  {
    id: "pyro-twin-fire",
    name: "Twin Fire",
    description: "Fireball splits into 2 at its target, each bursting on another enemy within 3 cells at 60%.",
    category: "level",
    heroId: pyromancer.id,
    level: 2,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: fireball.id, setSplits: { count: 2, rangeUnits: 30, fraction: 0.6 } }],
  },
  {
    id: "pyro-living-bomb",
    name: "Living Bomb",
    description: "Fireball's target explodes 2 s later for 80 in 1.5 cells, or at once if it dies first.",
    category: "level",
    heroId: pyromancer.id,
    level: 3,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: fireball.id, setBomb: { delayTicks: 60, abilityId: livingBomb.id } }],
  },
  {
    id: "pyro-phoenix",
    name: "Phoenix",
    description: "The first time she would die, she bursts into flames instead, heals to 30% and goes Inferno.",
    category: "level",
    heroId: pyromancer.id,
    level: 3,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    grantsPassives: [{ kind: "revive", hpFraction: 0.3, form: inferno }],
  },
  {
    id: "pyro-armageddon",
    name: "Armageddon",
    description: "Meteor Shower calls 12 meteors over 3 s.",
    category: "level",
    heroId: pyromancer.id,
    level: 4,
    path: "left",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [{ abilityId: meteor.id, patchShower: { count: 12, intervalTicks: 8 } }],
  },
  {
    id: "pyro-supernova",
    name: "Supernova",
    description: "Meteor Shower calls one giant meteor. For 1 s it pulls enemies within 3 cells to its centre, then lands for 250 in 2 cells.",
    category: "level",
    heroId: pyromancer.id,
    level: 4,
    path: "right",
    maxStacks: 1,
    statModifiers: [],
    abilityChanges: [
      {
        abilityId: meteor.id,
        patchShower: { count: 1, landDelayTicks: 30, pull: { radiusUnits: 30, distanceUnits: 1.2 } },
        setEffects: [{ kind: "damage", amount: 250 }, burn],
        setArea: { kind: "circle", center: "target", radiusUnits: 20 },
        setZone: { radiusUnits: 20, durationTicks: 60, periodTicks: 30, effects: [burn] },
      },
    ],
  },
];
