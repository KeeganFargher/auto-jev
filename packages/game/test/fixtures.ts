import { strict as assert } from "node:assert";
import {
  createBattle,
  stepBattle,
  unitById,
  type ArenaDefinition,
  type AttackDefinition,
  type BattleEvent,
  type BattleEventKind,
  type BattleSetup,
  type BattleState,
  type Catalogue,
  type HeroDefinition,
  type PassiveDefinition,
  type SignatureDefinition,
  type StepContext,
  type UnitSetup,
  type UnitState,
} from "../src/index.js";

export const FIELD: ArenaDefinition = {
  id: "field",
  name: "Field",
  width: 80,
  height: 80,
  columns: 8,
  rows: 8,
};

const JAB: AttackDefinition = {
  kind: "melee",
  name: "Jab",
  damage: 0,
  rangeUnits: 2,
  intervalTicks: 30,
  windupTicks: 10,
};

function hero(
  id: string,
  signature: SignatureDefinition | null,
  passive: PassiveDefinition | null,
): HeroDefinition {
  const mana = signature === null ? 0 : 100;

  return {
    id,
    name: id,
    title: id,
    description: id,
    role: "frontline",
    draftable: false,
    maxHp: 5000,
    moveUnitsPerSecond: 0,
    bodyRadiusUnits: 3,
    maxMana: mana,
    startingMana: mana,
    attack: JAB,
    signature,
    passive,
  };
}

export const HAMMER_IMPACT_TICKS = 20;

export const HAMMER_DAMAGE = 100;

export const BUBBLE_CAST_TICKS = 10;

export const BUBBLE_DURATION_TICKS = 90;

export const BLAST_RADIUS = 10;

export const HOT_POTATO_SCALE = 1.5;

export const YANK_DAMAGE = 50;

const post = hero("post", null, null);

const brawler: HeroDefinition = {
  ...hero("brawler", null, null),
  maxHp: 400,
  moveUnitsPerSecond: 12,
  attack: { ...JAB, damage: 60 },
};

const hammer = hero(
  "hammer",
  {
    kind: "hammerfall",
    name: "Test hammer",
    description: "Waits for floating targets.",
    wants: ["floating"],
    groupSize: 3,
    reachUnits: 10,
    radiusUnits: 16,
    damage: HAMMER_DAMAGE,
    impactTick: HAMMER_IMPACT_TICKS,
    durationTicks: 40,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 30,
      edgeDistanceUnits: 20,
      bowlingDamage: 0,
    },
  },
  null,
);

const smasher = hero(
  "smasher",
  {
    kind: "hammerfall",
    name: "Test smasher",
    description: "Waits for burning targets.",
    wants: ["burning"],
    groupSize: 3,
    reachUnits: 10,
    radiusUnits: 16,
    damage: HAMMER_DAMAGE,
    impactTick: HAMMER_IMPACT_TICKS,
    durationTicks: 40,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 12,
      edgeDistanceUnits: 12,
      bowlingDamage: 0,
    },
  },
  null,
);

const bubbler = hero(
  "bubbler",
  {
    kind: "big-bubble",
    name: "Test bubble",
    description: "Floats a group of three.",
    wants: ["grouped"],
    groupSize: 3,
    rangeUnits: 50,
    castTicks: BUBBLE_CAST_TICKS,
    radiusUnits: 12,
    maxMembers: 4,
    floatHeightUnits: 15,
    riseTicks: 10,
    durationTicks: BUBBLE_DURATION_TICKS,
  },
  null,
);

const fuser = hero(
  "fuser",
  {
    kind: "short-fuse",
    name: "Test fuse",
    description: "Primes anyone at once.",
    wants: ["grouped"],
    groupSize: 1,
    rangeUnits: 60,
    castTicks: 5,
    boltUnitsPerSecond: 300,
    fuseTicks: 300,
    panicMoveMultiplier: 1,
    burnDamagePerSecond: 0,
    burnTicks: 300,
    maxTouchHops: 2,
    blastRadiusUnits: BLAST_RADIUS,
    blastDamage: 100,
    blastLaunch: {
      centerRiseUnits: 10,
      edgeRiseUnits: 5,
      centerDistanceUnits: 20,
      edgeDistanceUnits: 10,
      bowlingDamage: 0,
    },
    hotPotatoScale: HOT_POTATO_SCALE,
  },
  null,
);

const thrower = hero(
  "thrower",
  {
    kind: "rampage",
    name: "Test rampage",
    description: "Grows and throws.",
    wants: ["burning"],
    groupSize: 3,
    triggerRangeUnits: 6,
    size: 2,
    growTicks: 10,
    bigTicks: 100,
    shrinkTicks: 10,
    moveMultiplier: 1,
    grabReachUnits: 3,
    grabWindupTicks: 5,
    throwIntervalTicks: 20,
    throwSearchUnits: 40,
    throwRiseUnits: 10,
    thrownDamage: 50,
    bowlingDamage: 40,
  },
  null,
);

const hooker = hero(
  "hooker",
  {
    kind: "yank",
    name: "Test yank",
    description: "Hooks floating targets.",
    wants: ["floating"],
    groupSize: 3,
    rangeUnits: 60,
    minRangeUnits: 5,
    castTicks: 5,
    hookUnitsPerSecond: 300,
    landingOffsetUnits: 4,
    riseUnits: 10,
    damage: YANK_DAMAGE,
    bowlingDamage: 20,
    stunTicks: 30,
    recoverTicks: 10,
  },
  null,
);

export const PULL_DAMAGE = 10;

export const FROST_DAMAGE = 10;

export const FREEZE_TICKS = 90;

export const PULL_TICKS = 8;

export const PILE_TICKS = 45;

const puller = hero(
  "puller",
  {
    kind: "collection-day",
    name: "Test pull",
    description: "Gathers three enemies.",
    wants: ["grouped"],
    groupSize: 3,
    rangeUnits: 60,
    castTicks: 5,
    radiusUnits: 20,
    pileRadiusUnits: 3,
    pullTicks: PULL_TICKS,
    pileTicks: PILE_TICKS,
    damage: PULL_DAMAGE,
  },
  null,
);

const froster = hero(
  "froster",
  {
    kind: "blizzard",
    name: "Test blizzard",
    description: "Freezes a pile.",
    wants: ["grouped", "downed"],
    groupSize: 3,
    rangeUnits: 60,
    castTicks: 15,
    radiusUnits: 10,
    freezeTicks: FREEZE_TICKS,
    damage: FROST_DAMAGE,
  },
  null,
);

const shatterer = hero(
  "shatterer",
  {
    kind: "hammerfall",
    name: "Test shatterer",
    description: "Waits for frozen targets.",
    wants: ["frozen"],
    groupSize: 3,
    reachUnits: 10,
    radiusUnits: 16,
    damage: HAMMER_DAMAGE,
    impactTick: HAMMER_IMPACT_TICKS,
    durationTicks: 40,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 12,
      edgeDistanceUnits: 12,
      bowlingDamage: 0,
    },
  },
  null,
);

const medic = hero("medic", null, {
  kind: "safety-bubble",
  name: "Test safety bubble",
  description: "Floats a hurt ally.",
  thresholdFraction: 0.5,
  healFraction: 0.3,
  durationTicks: 60,
  riseTicks: 10,
  floatHeightUnits: 12,
  radiusUnits: 5,
});

const heroes = [
  post,
  brawler,
  hammer,
  smasher,
  bubbler,
  fuser,
  thrower,
  hooker,
  puller,
  froster,
  shatterer,
  medic,
];

export const CATALOGUE: Catalogue = {
  heroes: Object.fromEntries(heroes.map((definition) => [definition.id, definition])),
  arenas: { [FIELD.id]: FIELD },
};

export function place(
  unitId: string,
  teamId: string,
  heroId: string,
  x: number,
  y: number,
): UnitSetup {
  return { unitId, teamId, heroId, spawn: { x, y } };
}

export function fieldSetup(seed: number, units: UnitSetup[]): BattleSetup {
  return { rulesetId: "test", rulesetVersion: 1, seed, arenaId: FIELD.id, tickLimit: 900, units };
}

export function fieldBattle(units: UnitSetup[]): BattleState {
  return createBattle(fieldSetup(1, units), CATALOGUE);
}

export function context(state: BattleState): StepContext {
  return { state, events: [] };
}

export function unitIn(state: BattleState, unitId: string): UnitState {
  return unitById(state, unitId);
}

export function drain(state: BattleState, unitId: string): void {
  const unit = unitById(state, unitId);
  unit.mana = 0;
  unit.readySinceTick = -1;
}

export function fill(state: BattleState, unitId: string): void {
  const unit = unitById(state, unitId);
  unit.mana = unit.maxMana;
  unit.readySinceTick = state.tick;
}

export function stepTicks(state: BattleState, ticks: number): BattleEvent[] {
  const events: BattleEvent[] = [];

  for (let count = 0; count < ticks && state.result === null; count += 1) {
    events.push(...stepBattle(state).events);
  }

  return events;
}

export function stepUntil(
  state: BattleState,
  kind: BattleEventKind,
  maxTicks: number,
): BattleEvent[] {
  const events: BattleEvent[] = [];

  for (let count = 0; count < maxTicks; count += 1) {
    if (state.result !== null) {
      throw new Error(`Battle ended before a "${kind}" event`);
    }

    const step = stepBattle(state).events;
    events.push(...step);

    if (step.some((event) => event.kind === kind)) {
      return events;
    }
  }

  throw new Error(`No "${kind}" event within ${maxTicks} ticks`);
}

export function eventsOf<K extends BattleEventKind>(
  events: readonly BattleEvent[],
  kind: K,
): Extract<BattleEvent, { kind: K }>[] {
  return events.flatMap((event) => (isKind(event, kind) ? [event] : []));
}

function isKind<K extends BattleEventKind>(
  event: BattleEvent,
  kind: K,
): event is Extract<BattleEvent, { kind: K }> {
  return event.kind === kind;
}

export function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}
