import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BOWLING_MAX_HOPS,
  CHAIN_WINDOW_TICKS,
  DOWNED_TICKS,
  JUGGLE_DAMAGE_MULTIPLIER,
  cloneRng,
  createRng,
  launchPeak,
  nextFloat,
  type BattleState,
  type BigBubbleDefinition,
  type LandingEffect,
  type UnitState,
} from "../src/index.js";
import {
  createBubble,
  launchBubble,
  popBubble,
  resolveBubbles,
  type BubbleSpec,
} from "../src/battle/bubbles.js";
import {
  chainDamageMultiplier,
  expireChains,
  recordComboLink,
  teamChain,
} from "../src/battle/chain.js";
import { dealDamage } from "../src/battle/damage.js";
import { primeUnit, spreadFire } from "../src/battle/fire.js";
import { landBodies } from "../src/battle/landing.js";
import {
  launchUnit,
  radialStrike,
  type LaunchPlan,
  type RadialStrike,
} from "../src/battle/launch.js";
import { isSetUpAt } from "../src/battle/prediction.js";
import { CRIT_CHANCE } from "../src/battle/rules.js";
import {
  advanceBigBubble,
  bigBubbleOf,
  planBigBubble,
} from "../src/battle/signatures/big-bubble.js";
import { hammerfallOf, planHammerfall } from "../src/battle/signatures/hammerfall.js";
import { shortFuseOf } from "../src/battle/signatures/short-fuse.js";
import { setupMarks } from "../src/battle/state.js";
import {
  BLAST_RADIUS,
  HAMMER_DAMAGE,
  HOT_POTATO_SCALE,
  YANK_DAMAGE,
  context,
  eventsOf,
  fieldBattle,
  near,
  place,
  stepUntil,
  unitIn,
} from "./fixtures.js";

function bubbleSpec(owner: UnitState, members: UnitState[]): BubbleSpec {
  const first = members[0];

  if (first === undefined) {
    throw new Error("A test bubble needs a member");
  }

  return {
    kind: "big",
    owner,
    center: { ...first.position },
    radiusUnits: 12,
    members,
    floatHeightUnits: 15,
    riseTicks: 10,
    durationTicks: 90,
    healPerPulse: 0,
  };
}

function prime(state: BattleState, makerId: string, targetId: string): void {
  const maker = unitIn(state, makerId);
  primeUnit(context(state), maker, unitIn(state, targetId), shortFuseOf(maker));
}

function landing(launcherUnitId: string, overrides: Partial<LandingEffect>): LandingEffect {
  return {
    hard: true,
    cause: "throw",
    launcherUnitId,
    launcherTeamId: "A",
    bowlingHop: 0,
    bowlingDamage: 0,
    landingDamage: 0,
    stunTicks: 0,
    ...overrides,
  };
}

function hammerStrike(source: UnitState, radiusUnits: number): RadialStrike {
  return {
    cause: "hammer",
    damageCause: "hammer",
    source,
    center: { x: 40, y: 40 },
    radiusUnits,
    damage: HAMMER_DAMAGE,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 30,
      edgeDistanceUnits: 20,
      bowlingDamage: 0,
    },
  };
}

function critOnNextRoll(state: BattleState): void {
  for (let seed = 0; seed < 100; seed += 1) {
    const rng = createRng(seed);

    if (nextFloat(cloneRng(rng)) < CRIT_CHANCE) {
      state.rng = rng;

      return;
    }
  }

  throw new Error("No seed under 100 rolls a crit first");
}

function plan(launcher: UnitState, overrides: Partial<LaunchPlan>): LaunchPlan {
  return {
    cause: "throw",
    launcher,
    destination: { ...launcher.position },
    riseUnits: 5,
    hard: true,
    bowlingHop: 0,
    bowlingDamage: 0,
    landingDamage: 0,
    stunTicks: 0,
    ...overrides,
  };
}

test("a hammer waiting for floating targets bats the bubble and juggles its members", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 52),
    place("A-2", "A", "bubbler", 40, 70),
    place("B-1", "B", "post", 33, 40),
    place("B-2", "B", "post", 40, 40),
    place("B-3", "B", "post", 47, 40),
  ]);

  const events = stepUntil(state, "hammer-impact", 80);

  assert.deepEqual(
    eventsOf(events, "signature").map((cast) => [cast.unitId, cast.tick === 1, cast.wanted]),
    [
      ["A-2", true, true],
      ["A-1", false, true],
    ],
  );

  const links = eventsOf(events, "combo-link");
  assert.equal(links.length, 1);
  assert.equal(links[0]?.setupUnitId, "A-2");
  assert.equal(links[0]?.payoffUnitId, "A-1");
  assert.equal(links[0]?.state, "floating");
  assert.equal(links[0]?.count, 1);
  assert.equal(eventsOf(events, "pop").length, 1);

  const expected = Math.round(HAMMER_DAMAGE * 1.1 * JUGGLE_DAMAGE_MULTIPLIER);
  assert.deepEqual(
    eventsOf(events, "damage")
      .filter((event) => event.cause === "hammer")
      .map((event) => [event.targetUnitId, event.amount]),
    [
      ["B-1", expected],
      ["B-2", expected],
      ["B-3", expected],
    ],
  );

  const juggles = eventsOf(events, "launch").filter((event) => event.juggle);
  assert.deepEqual(
    juggles.map((event) => [event.unitId, event.motion.landing.cause]),
    [
      ["B-1", "hammer"],
      ["B-2", "hammer"],
      ["B-3", "hammer"],
    ],
  );

  for (const juggle of juggles) {
    assert.ok(juggle.motion.startHeight > 10, "the juggle starts from bubble height");
  }
});

test("a strike that pops a bubble flings every enemy in it, even those outside its radius", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 70),
    place("A-2", "A", "bubbler", 10, 70),
    place("B-1", "B", "post", 30, 40),
    place("B-2", "B", "post", 40, 40),
    place("B-3", "B", "post", 60, 40),
  ]);

  const ctx = context(state);
  createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [unitIn(state, "B-1"), unitIn(state, "B-2")]));

  const struck = radialStrike(ctx, {
    cause: "hammer",
    damageCause: "hammer",
    source: unitIn(state, "A-1"),
    center: { x: 30, y: 40 },
    radiusUnits: 4,
    damage: HAMMER_DAMAGE,
    launch: {
      centerRiseUnits: 15,
      edgeRiseUnits: 9,
      centerDistanceUnits: 30,
      edgeDistanceUnits: 20,
      bowlingDamage: 0,
    },
  });

  assert.deepEqual(
    struck.map((unit) => unit.unitId),
    ["B-1", "B-2"],
  );
  assert.equal(eventsOf(ctx.events, "pop").length, 1);
  assert.equal(eventsOf(ctx.events, "combo-link").length, 1);
  assert.deepEqual(
    eventsOf(ctx.events, "launch")
      .filter((event) => event.motion.landing.cause === "hammer")
      .map((event) => [event.unitId, event.juggle]),
    [
      ["B-1", true],
      ["B-2", true],
    ],
  );
  assert.equal(unitIn(state, "B-3").motion.kind, "ground");
});

test("a strike on a body falling out of a popped bubble does not juggle it", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 70),
    place("A-2", "A", "bubbler", 10, 70),
    place("B-1", "B", "post", 36, 40),
    place("B-2", "B", "post", 44, 40),
  ]);

  const ctx = context(state);
  const falling = unitIn(state, "B-1");
  popBubble(ctx, createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [falling])));
  assert.equal(falling.motion.kind === "flight" && falling.motion.landing.cause, "drop");

  radialStrike(ctx, hammerStrike(unitIn(state, "A-1"), 8));

  assert.deepEqual(
    eventsOf(ctx.events, "launch")
      .filter((event) => event.motion.landing.cause === "hammer")
      .map((event) => [event.unitId, event.juggle]),
    [
      ["B-1", false],
      ["B-2", false],
    ],
  );
  assert.deepEqual(
    eventsOf(ctx.events, "damage").map((event) => [event.targetUnitId, event.amount]),
    [
      ["B-1", HAMMER_DAMAGE],
      ["B-2", HAMMER_DAMAGE],
    ],
  );
  assert.equal(eventsOf(ctx.events, "combo-link").length, 0);
});

test("the hammer aims for any setup it can pay off, not only the ones it waits for", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 40),
    place("A-2", "A", "fuser", 40, 70),
    place("B-1", "B", "post", 18, 40),
    place("B-2", "B", "post", 62, 40),
  ]);

  const ctx = context(state);
  prime(state, "A-2", "B-2");
  const hammer = unitIn(state, "A-1");

  assert.deepEqual(planHammerfall(ctx, hammer, hammerfallOf(hammer), false), {
    targetUnitId: null,
    point: { x: 50, y: 40 },
    wanted: false,
  });
  assert.equal(planHammerfall(ctx, hammer, hammerfallOf(hammer), true), null);
});

test("each setup state counts for the hammer's aim until it ends, and a fall does not", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 40, 70),
    place("A-2", "A", "bubbler", 10, 70),
    place("B-1", "B", "post", 40, 40),
  ]);

  const ctx = context(state);
  const post = unitIn(state, "B-1");
  const tick = state.tick;
  assert.equal(isSetUpAt(state, post, tick), false);

  prime(state, "A-1", "B-1");
  const primed = post.primed;
  assert.ok(primed !== null);
  post.burning = null;
  assert.equal(isSetUpAt(state, post, primed.explodeTick - 1), true);
  assert.equal(isSetUpAt(state, post, primed.explodeTick), false);
  post.primed = null;

  const hop = launchUnit(ctx, post, plan(unitIn(state, "A-1"), { cause: "crit" }));
  assert.equal(isSetUpAt(state, post, hop.endTick - 1), true);
  assert.equal(isSetUpAt(state, post, hop.endTick), false);

  post.motion = { kind: "ground" };
  popBubble(ctx, createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [post])));
  const fall = unitIn(state, "B-1").motion;
  assert.equal(fall.kind === "flight" && fall.landing.cause, "drop");
  assert.equal(isSetUpAt(state, post, tick), false);

  post.motion = {
    kind: "skid",
    from: { x: 40, y: 40 },
    to: { x: 44, y: 40 },
    startTick: tick,
    endTick: tick + 5,
    makerUnitId: "A-1",
  };
  assert.equal(isSetUpAt(state, post, tick + 5 + DOWNED_TICKS - 1), true);
  assert.equal(isSetUpAt(state, post, tick + 5 + DOWNED_TICKS), false);

  post.motion = { kind: "downed", startTick: tick, endTick: tick + 4, makerUnitId: "A-1" };
  assert.equal(isSetUpAt(state, post, tick + 3), true);
  assert.equal(isSetUpAt(state, post, tick + 4), false);
});

test("a primed carrier launched by an ally lands as a Hot Potato", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 40, 70),
    place("A-2", "A", "smasher", 40, 52),
    place("B-1", "B", "post", 40, 40),
  ]);

  const events = stepUntil(state, "explode", 120);
  const links = eventsOf(events, "combo-link");
  assert.equal(links.length, 1);
  assert.equal(links[0]?.setupUnitId, "A-1");
  assert.equal(links[0]?.payoffUnitId, "A-2");
  assert.equal(links[0]?.state, "primed");

  const explosion = eventsOf(events, "explode")[0];
  assert.ok(explosion !== undefined);
  assert.equal(explosion.hotPotato, true);
  assert.equal(explosion.radius, BLAST_RADIUS * HOT_POTATO_SCALE);
  assert.equal(explosion.unitId, "B-1");
  assert.equal(eventsOf(events, "land").at(-1)?.tick, explosion.tick);
});

test("a fuse left alone explodes at normal size when it runs out", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 40, 70),
    place("B-1", "B", "post", 40, 40),
  ]);

  const events = stepUntil(state, "explode", 400);
  const primed = eventsOf(events, "prime")[0];
  const explosion = eventsOf(events, "explode")[0];

  assert.equal(explosion?.hotPotato, false);
  assert.equal(explosion?.radius, BLAST_RADIUS);
  assert.equal(explosion?.tick, primed?.explodeTick);
});

test("fire inside a bubble fills it but cannot spread out of it by touch", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 40, 70),
    place("A-2", "A", "bubbler", 40, 60),
    place("B-1", "B", "post", 36, 40),
    place("B-2", "B", "post", 40, 40),
    place("B-3", "B", "post", 44, 40),
    place("B-4", "B", "post", 48, 40),
  ]);

  const ctx = context(state);
  prime(state, "A-1", "B-1");
  createBubble(
    ctx,
    bubbleSpec(unitIn(state, "A-2"), [
      unitIn(state, "B-1"),
      unitIn(state, "B-2"),
      unitIn(state, "B-3"),
    ]),
  );
  spreadFire(ctx);

  assert.deepEqual(
    eventsOf(ctx.events, "ignite").map((event) => [event.unitId, event.cause, event.hop]),
    [
      ["B-2", "bubble", 2],
      ["B-3", "bubble", 2],
    ],
  );
  assert.equal(unitIn(state, "B-4").burning, null);
});

test("fire spreads by touch to teammates only, one hop per step, up to the hop limit", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 70, 70),
    place("A-3", "A", "post", 20, 26),
    place("B-1", "B", "post", 20, 20),
    place("B-2", "B", "post", 26, 20),
    place("B-3", "B", "post", 32, 20),
    place("B-4", "B", "post", 38, 20),
  ]);

  const ctx = context(state);
  prime(state, "A-1", "B-1");
  spreadFire(ctx);
  assert.equal(unitIn(state, "B-2").burning?.hop, 1);
  assert.equal(unitIn(state, "B-3").burning, null);
  spreadFire(ctx);
  spreadFire(ctx);

  assert.equal(unitIn(state, "B-3").burning?.hop, 2);
  assert.equal(unitIn(state, "B-4").burning, null);
  assert.equal(unitIn(state, "A-3").burning, null);
});

test("a burning body that lands among its teammates sets them alight", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 70, 70),
    place("B-1", "B", "post", 10, 10),
    place("B-2", "B", "post", 16, 10),
    place("B-3", "B", "post", 50, 40),
    place("B-4", "B", "post", 70, 40),
  ]);

  const ctx = context(state);
  prime(state, "A-1", "B-1");
  spreadFire(ctx);
  const comet = unitIn(state, "B-2");
  assert.equal(comet.burning?.hop, 1);
  comet.position = { x: 46, y: 40 };
  landBodies(ctx, [comet], comet.position, landing("A-1", { cause: "hammer" }), { x: 1, y: 0 }, 10);

  assert.deepEqual(
    eventsOf(ctx.events, "ignite")
      .filter((event) => event.cause === "comet")
      .map((event) => [event.unitId, event.hop]),
    [["B-3", 2]],
  );
  assert.equal(unitIn(state, "B-4").burning, null);
});

test("a body dropped by a popping bubble is not airborne and lands without Comet or Hot Potato", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 70, 70),
    place("A-2", "A", "bubbler", 10, 70),
    place("B-1", "B", "post", 40, 40),
    place("B-2", "B", "post", 46, 40),
  ]);

  const ctx = context(state);
  prime(state, "A-1", "B-1");
  const carrier = unitIn(state, "B-1");
  popBubble(ctx, createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [carrier])));
  const drop = carrier.motion;
  assert.ok(drop.kind === "flight");
  assert.equal(drop.landing.cause, "drop");
  assert.deepEqual(
    setupMarks(state, carrier).map((mark) => mark.state),
    ["primed", "burning"],
  );

  const comets = (): string[] =>
    eventsOf(ctx.events, "ignite")
      .filter((event) => event.cause === "comet")
      .map((event) => event.unitId);

  landBodies(ctx, [carrier], carrier.position, drop.landing, { x: 1, y: 0 }, 0);
  assert.equal(eventsOf(ctx.events, "explode").length, 0);
  assert.deepEqual(comets(), []);
  assert.notEqual(carrier.primed, null);

  const hop = landing("A-1", { cause: "crit", hard: false });
  landBodies(ctx, [carrier], carrier.position, hop, { x: 1, y: 0 }, 0);
  assert.equal(eventsOf(ctx.events, "explode")[0]?.hotPotato, true);
  assert.deepEqual(comets(), ["B-2"]);
});

test("each setup-payoff pair links once per chain, and chains expire", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 70),
    place("A-2", "A", "bubbler", 30, 70),
    place("A-3", "A", "fuser", 50, 70),
    place("B-1", "B", "post", 20, 20),
    place("B-2", "B", "post", 60, 20),
  ]);

  const ctx = context(state);
  createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [unitIn(state, "B-1")]));
  recordComboLink(ctx, unitIn(state, "A-2"), [unitIn(state, "B-1")]);
  assert.equal(teamChain(state, "A").count, 0, "a hero cannot pay off its own setup");

  recordComboLink(ctx, unitIn(state, "A-1"), [unitIn(state, "B-1")]);
  recordComboLink(ctx, unitIn(state, "A-1"), [unitIn(state, "B-1")]);
  assert.equal(teamChain(state, "A").count, 1);

  prime(state, "A-3", "B-2");
  recordComboLink(ctx, unitIn(state, "A-1"), [unitIn(state, "B-2")]);
  assert.equal(teamChain(state, "A").count, 2);
  assert.equal(chainDamageMultiplier(state, "A"), 1.2);
  assert.deepEqual(teamChain(state, "A").unitIds, ["A-2", "A-1", "A-3"]);

  recordComboLink(ctx, unitIn(state, "B-1"), [unitIn(state, "B-2")]);
  assert.equal(teamChain(state, "B").count, 0, "an enemy's setup is no link");

  state.tick += CHAIN_WINDOW_TICKS;
  expireChains(state);
  assert.equal(teamChain(state, "A").count, 2);
  state.tick += 1;
  expireChains(state);
  assert.equal(teamChain(state, "A").count, 0);
  assert.deepEqual(teamChain(state, "A").pairs, []);
  assert.deepEqual(teamChain(state, "A").unitIds, []);
});

test("one payoff adds at most one link, however many setups it hits", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 70),
    place("A-2", "A", "bubbler", 30, 70),
    place("A-3", "A", "fuser", 50, 70),
    place("B-1", "B", "post", 20, 20),
    place("B-2", "B", "post", 60, 20),
  ]);

  const ctx = context(state);
  createBubble(ctx, bubbleSpec(unitIn(state, "A-2"), [unitIn(state, "B-1")]));
  prime(state, "A-3", "B-2");
  recordComboLink(ctx, unitIn(state, "A-1"), [unitIn(state, "B-1"), unitIn(state, "B-2")]);

  assert.equal(teamChain(state, "A").count, 1);
  assert.equal(eventsOf(ctx.events, "combo-link").length, 1);
});

test("a melee crit hop is an Airborne setup that a teammate's signature links", () => {
  const state = fieldBattle([
    place("A-1", "A", "brawler", 40, 70),
    place("A-2", "A", "hammer", 10, 70),
    place("B-1", "B", "post", 40, 40),
  ]);

  const ctx = context(state);
  const post = unitIn(state, "B-1");

  const hop = plan(unitIn(state, "A-1"), {
    cause: "crit",
    destination: { x: 40, y: 36 },
    riseUnits: 3,
    hard: false,
  });

  launchUnit(ctx, post, hop);
  assert.deepEqual(setupMarks(state, post), [{ state: "airborne", makerUnitId: "A-1" }]);

  recordComboLink(ctx, unitIn(state, "A-2"), [post]);
  assert.deepEqual(
    eventsOf(ctx.events, "combo-link").map((event) => [
      event.setupUnitId,
      event.payoffUnitId,
      event.state,
    ]),
    [["A-1", "A-2", "airborne"]],
  );
});

test("a melee crit knocks its target into a hop that counts as Airborne", () => {
  const state = fieldBattle([
    place("A-1", "A", "brawler", 40, 47),
    place("B-1", "B", "post", 40, 40),
  ]);

  const post = unitIn(state, "B-1");
  post.stunnedUntilTick = 1000;
  critOnNextRoll(state);

  const hop = eventsOf(stepUntil(state, "launch", 60), "launch")[0];
  assert.ok(hop !== undefined);
  assert.equal(hop.unitId, "B-1");
  assert.equal(hop.motion.landing.cause, "crit");
  assert.equal(hop.juggle, false);
  assert.deepEqual(setupMarks(state, post), [{ state: "airborne", makerUnitId: "A-1" }]);
});

test("a hard landing bowls over nearby enemies of the thrower, and bowling decays", () => {
  const state = fieldBattle([
    place("A-1", "A", "thrower", 10, 70),
    place("A-2", "A", "post", 40, 44),
    place("B-1", "B", "post", 40, 40),
    place("B-2", "B", "post", 44, 40),
  ]);

  const ctx = context(state);
  landBodies(
    ctx,
    [unitIn(state, "B-1")],
    { x: 40, y: 40 },
    landing("A-1", { bowlingDamage: 40, landingDamage: 50 }),
    { x: 1, y: 0 },
    20,
  );

  assert.deepEqual(
    eventsOf(ctx.events, "damage").map((event) => [event.targetUnitId, event.cause, event.amount]),
    [
      ["B-1", "throw", 50],
      ["B-2", "bowling", 40],
    ],
  );

  const shoves = eventsOf(ctx.events, "launch");
  assert.equal(shoves.length, 1);
  assert.equal(shoves[0]?.unitId, "B-2");
  assert.equal(shoves[0]?.motion.landing.cause, "bowling");
  assert.equal(shoves[0]?.motion.landing.bowlingHop, 1);
  assert.equal(shoves[0]?.motion.landing.bowlingDamage, 20);
  assert.equal(unitIn(state, "B-1").motion.kind, "skid");
});

test("bowling stops at the hop limit", () => {
  const state = fieldBattle([
    place("A-1", "A", "thrower", 10, 70),
    place("B-1", "B", "post", 40, 40),
    place("B-2", "B", "post", 44, 40),
  ]);

  const ctx = context(state);
  landBodies(
    ctx,
    [unitIn(state, "B-1")],
    { x: 40, y: 40 },
    landing("A-1", { cause: "bowling", bowlingHop: BOWLING_MAX_HOPS, bowlingDamage: 10 }),
    { x: 1, y: 0 },
    10,
  );

  assert.equal(eventsOf(ctx.events, "damage").length, 0);
  assert.equal(eventsOf(ctx.events, "launch").length, 0);
});

test("launching something already in the air juggles it higher and harder", () => {
  const state = fieldBattle([
    place("A-1", "A", "thrower", 10, 70),
    place("B-1", "B", "post", 40, 40),
  ]);

  const ctx = context(state);
  const post = unitIn(state, "B-1");

  const throwPlan = plan(unitIn(state, "A-1"), {
    destination: { x: 50, y: 40 },
    landingDamage: 10,
  });

  const first = launchUnit(ctx, post, throwPlan);
  near(first.peak, 5);
  assert.equal(first.landing.landingDamage, 10);
  post.elevation = 4;

  const second = launchUnit(ctx, post, throwPlan);
  assert.equal(second.peak, launchPeak(4, 10));
  assert.equal(second.landing.landingDamage, 10 * JUGGLE_DAMAGE_MULTIPLIER);
  assert.deepEqual(
    eventsOf(ctx.events, "launch").map((event) => event.juggle),
    [false, true],
  );
});

test("the Big Bubble catches rampaging and airborne enemies alike", () => {
  const state = fieldBattle([
    place("A-1", "A", "bubbler", 40, 70),
    place("A-9", "A", "hammer", 10, 70),
    place("B-1", "B", "thrower", 36, 40),
    place("B-2", "B", "post", 44, 40),
  ]);

  const ctx = context(state);
  const bubbler = unitIn(state, "A-1");
  const berserker = unitIn(state, "B-1");
  berserker.rampage = {
    startTick: 0,
    growEndTick: 0,
    shrinkStartTick: 100,
    endTick: 110,
    nextGrabTick: 0,
  };
  launchUnit(
    ctx,
    unitIn(state, "B-2"),
    plan(unitIn(state, "A-9"), {
      cause: "crit",
      destination: { x: 45, y: 40 },
      riseUnits: 3,
      hard: false,
    }),
  );

  const action = {
    kind: "big-bubble" as const,
    center: { x: 40, y: 40 },
    startTick: 0,
    releaseTick: 0,
  };

  bubbler.action = action;
  advanceBigBubble(ctx, bubbler, action);

  assert.deepEqual(eventsOf(ctx.events, "bubble")[0]?.memberUnitIds, ["B-1", "B-2"]);
  assert.equal(berserker.motion.kind, "float");
  assert.equal(unitIn(state, "B-2").motion.kind, "float");
});

test("a Big Bubble that wants airborne enemies waits for one still flying when it forms", () => {
  const state = fieldBattle([
    place("A-1", "A", "bubbler", 40, 70),
    place("A-2", "A", "thrower", 10, 70),
    place("B-1", "B", "post", 40, 40),
  ]);

  const ctx = context(state);
  const bubbler = unitIn(state, "A-1");
  const thrower = unitIn(state, "A-2");
  const post = unitIn(state, "B-1");
  const definition: BigBubbleDefinition = { ...bigBubbleOf(bubbler), wants: ["airborne"] };
  const releaseTick = state.tick + definition.castTicks;
  assert.equal(planBigBubble(ctx, bubbler, definition, true), null);

  const hop = launchUnit(ctx, post, plan(thrower, { cause: "crit", riseUnits: 1, hard: false }));
  assert.ok(hop.endTick <= releaseTick, "the hop lands before the bubble forms");
  assert.equal(planBigBubble(ctx, bubbler, definition, true), null);

  post.motion = { kind: "ground" };
  post.elevation = 40;
  popBubble(ctx, createBubble(ctx, bubbleSpec(bubbler, [post])));
  const drop = unitIn(state, "B-1").motion;
  assert.ok(drop.kind === "flight" && drop.endTick > releaseTick, "the fall outlasts the cast");
  assert.equal(planBigBubble(ctx, bubbler, definition, true), null);

  const toss = launchUnit(
    ctx,
    post,
    plan(thrower, { destination: { x: 40, y: 34 }, riseUnits: 20 }),
  );

  assert.ok(toss.endTick > releaseTick, "the throw is still in the air when the bubble forms");
  assert.equal(planBigBubble(ctx, bubbler, definition, true)?.wanted, true);
});

test("a unit killed inside a bubble leaves it, and the last one out pops it", () => {
  const state = fieldBattle([
    place("A-1", "A", "bubbler", 40, 70),
    place("B-1", "B", "post", 36, 40),
    place("B-2", "B", "post", 44, 40),
  ]);

  const ctx = context(state);
  const bubbler = unitIn(state, "A-1");
  const first = unitIn(state, "B-1");
  const second = unitIn(state, "B-2");
  createBubble(ctx, bubbleSpec(bubbler, [first, second]));

  dealDamage(ctx, bubbler, first, first.hp, "attack", false);
  assert.deepEqual(state.bubbles[0]?.memberUnitIds, ["B-2"]);
  assert.equal(eventsOf(ctx.events, "pop").length, 0);

  dealDamage(ctx, bubbler, second, second.hp, "attack", false);
  assert.equal(state.bubbles.length, 0);
  assert.equal(eventsOf(ctx.events, "pop").length, 1);
});

test("a primed unit that dies detonates its fuse where it fell", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 40, 70),
    place("B-1", "B", "post", 40, 40),
    place("B-2", "B", "post", 46, 40),
  ]);

  const ctx = context(state);
  prime(state, "A-1", "B-1");
  const carrier = unitIn(state, "B-1");
  dealDamage(ctx, unitIn(state, "A-1"), carrier, carrier.hp, "attack", false);

  const explosion = eventsOf(ctx.events, "explode")[0];
  assert.equal(explosion?.unitId, "B-1");
  assert.equal(explosion?.hotPotato, false);
  assert.ok(
    eventsOf(ctx.events, "damage").some(
      (event) => event.targetUnitId === "B-2" && event.cause === "blast",
    ),
  );
});

test("a bubble popped by another bubble's landing blast pops only once", () => {
  const state = fieldBattle([
    place("A-1", "A", "fuser", 70, 70),
    place("A-2", "A", "bubbler", 10, 70),
    place("B-1", "B", "post", 20, 40),
    place("B-2", "B", "post", 50, 40),
  ]);

  const ctx = context(state);
  const bubbler = unitIn(state, "A-2");
  prime(state, "A-1", "B-1");
  const carrier = createBubble(ctx, bubbleSpec(bubbler, [unitIn(state, "B-1")]));

  const target = createBubble(ctx, {
    ...bubbleSpec(bubbler, [unitIn(state, "B-2")]),
    durationTicks: 1,
  });

  launchBubble(ctx, carrier, plan(unitIn(state, "A-1"), { destination: { x: 46, y: 40 } }));

  const flight = carrier.flight;
  assert.ok(flight !== null);
  state.tick = flight.endTick;
  resolveBubbles(ctx);

  assert.equal(eventsOf(ctx.events, "explode")[0]?.hotPotato, true);
  assert.equal(
    eventsOf(ctx.events, "pop").filter((event) => event.bubbleId === target.bubbleId).length,
    1,
  );
  assert.deepEqual(state.bubbles, []);
});

test("a Yank on a floating target drags the whole bubble and links the chain", () => {
  const state = fieldBattle([
    place("A-1", "A", "hooker", 40, 70),
    place("A-2", "A", "bubbler", 40, 62),
    place("B-1", "B", "post", 33, 30),
    place("B-2", "B", "post", 40, 30),
    place("B-3", "B", "post", 47, 30),
  ]);

  const events = stepUntil(state, "bubble-launch", 80);
  const links = eventsOf(events, "combo-link");

  assert.equal(links.length, 1);
  assert.equal(links[0]?.setupUnitId, "A-2");
  assert.equal(links[0]?.payoffUnitId, "A-1");
  assert.equal(links[0]?.state, "floating");
  assert.deepEqual(
    eventsOf(events, "yank").map((event) => event.targetUnitId),
    ["B-1"],
  );

  const landed = stepUntil(state, "land", 80);
  const expected = Math.round(YANK_DAMAGE * 1.1 * JUGGLE_DAMAGE_MULTIPLIER);

  assert.deepEqual(
    eventsOf(landed, "damage")
      .filter((event) => event.cause === "yank")
      .map((event) => [event.targetUnitId, event.amount]),
    [
      ["B-1", expected],
      ["B-2", expected],
      ["B-3", expected],
    ],
  );
  assert.equal(eventsOf(landed, "stun").length, 3);
});
