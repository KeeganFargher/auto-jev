import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MANA_PER_DAMAGE_TAKEN,
  MAX_MANA_PER_HIT_TAKEN,
  RAMPAGE_FREEZE,
  READY_WAIT_TICKS,
} from "../src/index.js";
import { createBubble } from "../src/battle/bubbles.js";
import { dealDamage, gainMana } from "../src/battle/damage.js";
import { startRampage } from "../src/battle/signatures/rampage.js";
import {
  context,
  eventsOf,
  fieldBattle,
  near,
  place,
  stepTicks,
  stepUntil,
  unitIn,
} from "./fixtures.js";

test("a caster with nothing it wants waits, then casts anyway", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 52),
    place("B-1", "B", "post", 40, 40),
  ]);

  const events = stepUntil(state, "signature", READY_WAIT_TICKS + 5);
  const cast = eventsOf(events, "signature")[0];

  assert.equal(cast?.tick, READY_WAIT_TICKS);
  assert.equal(cast?.wanted, false);
  assert.equal(unitIn(state, "A-1").mana, 0);
});

test("mana fills from hits, and the wait starts the tick it fills", () => {
  const state = fieldBattle([
    place("A-1", "A", "hammer", 40, 52),
    place("B-1", "B", "post", 40, 40),
  ]);

  const ctx = context(state);
  const hammer = unitIn(state, "A-1");
  const post = unitIn(state, "B-1");
  hammer.mana = 0;
  hammer.readySinceTick = -1;

  dealDamage(ctx, post, hammer, 1000, "attack", false);
  assert.equal(hammer.mana, MAX_MANA_PER_HIT_TAKEN);
  dealDamage(ctx, post, hammer, 50, "attack", false);
  near(hammer.mana, MAX_MANA_PER_HIT_TAKEN + 50 * MANA_PER_DAMAGE_TAKEN);

  hammer.mana = 95;
  state.tick = 7;
  gainMana(state, hammer, 4);
  assert.equal(hammer.readySinceTick, -1);
  gainMana(state, hammer, 10);
  assert.equal(hammer.mana, hammer.maxMana);
  assert.equal(hammer.readySinceTick, 7);
  state.tick = 9;
  gainMana(state, hammer, 10);
  assert.equal(hammer.readySinceTick, 7);
});

test("rampaging and signature-less units gain no mana", () => {
  const state = fieldBattle([
    place("A-1", "A", "thrower", 40, 52),
    place("B-1", "B", "post", 40, 40),
  ]);

  const thrower = unitIn(state, "A-1");
  const post = unitIn(state, "B-1");
  thrower.mana = 0;
  thrower.rampage = {
    startTick: 0,
    growEndTick: 10,
    shrinkStartTick: 100,
    endTick: 110,
    nextGrabTick: 10,
  };

  gainMana(state, thrower, 50);
  gainMana(state, post, 50);

  assert.equal(thrower.mana, 0);
  assert.equal(post.mana, 0);
});

test("a rampage freezes the moment it reaches full size", () => {
  const state = fieldBattle([
    place("A-1", "A", "thrower", 40, 44),
    place("B-1", "B", "post", 40, 40),
  ]);

  const thrower = unitIn(state, "A-1");
  const signature = thrower.signature;
  assert.ok(signature !== null && signature.kind === "rampage");
  startRampage(context(state), thrower, signature);
  const events = stepTicks(state, signature.growTicks + 2);
  const [big] = eventsOf(events, "rampage");
  assert.equal(big?.phase, "big");
  assert.equal(big.tick, signature.growTicks);

  const freezes = eventsOf(events, "beat").flatMap((event) =>
    event.beat === RAMPAGE_FREEZE ? [event.tick] : [],
  );

  assert.deepEqual(freezes, [big.tick]);
  assert.equal(thrower.size, signature.size);
});

test("a hurt ally is floated in a safety bubble once and healed while inside", () => {
  const state = fieldBattle([
    place("A-1", "A", "medic", 20, 60),
    place("A-2", "A", "post", 40, 60),
    place("B-1", "B", "post", 40, 10),
  ]);

  const medic = unitIn(state, "A-1");
  const ally = unitIn(state, "A-2");
  medic.hp = 1000;
  ally.hp = 2000;

  const events = stepTicks(state, 70);

  assert.deepEqual(
    eventsOf(events, "bubble").map((event) => [
      event.tick,
      event.bubbleKind,
      event.ownerUnitId,
      event.memberUnitIds,
    ]),
    [[1, "safety", "A-1", ["A-2"]]],
  );
  assert.deepEqual(
    eventsOf(events, "heal")
      .filter((event) => event.cause === "safety-bubble")
      .map((event) => [event.tick, event.targetUnitId]),
    [
      [16, "A-2"],
      [31, "A-2"],
      [46, "A-2"],
      [61, "A-2"],
    ],
  );
  assert.equal(ally.hp, 3500);
  assert.equal(eventsOf(events, "pop")[0]?.tick, 61);

  ally.hp = 1000;
  assert.equal(eventsOf(stepTicks(state, 5), "bubble").length, 0);
});

test("an ally floating in an enemy bubble is caught by its safety bubble when that pops", () => {
  const state = fieldBattle([
    place("A-1", "A", "medic", 20, 60),
    place("A-2", "A", "post", 40, 60),
    place("B-1", "B", "post", 40, 10),
  ]);

  const ally = unitIn(state, "A-2");
  createBubble(context(state), {
    kind: "big",
    owner: unitIn(state, "B-1"),
    center: { ...ally.position },
    radiusUnits: 5,
    members: [ally],
    floatHeightUnits: 15,
    riseTicks: 10,
    durationTicks: 20,
    healPerPulse: 0,
  });
  ally.hp = 1000;

  const events = stepUntil(state, "bubble", 40);

  assert.equal(eventsOf(events, "pop")[0]?.tick, 20);
  assert.equal(eventsOf(events, "bubble")[0]?.tick, 20);
  assert.equal(eventsOf(events, "bubble")[0]?.bubbleKind, "safety");
});
