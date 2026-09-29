import { strict as assert } from "node:assert";
import { test } from "node:test";
import { READY_WAIT_TICKS, SHATTER_DAMAGE_MULTIPLIER, isFrozen, isStunned } from "../src/index.js";
import { distance } from "../src/math/vector.js";
import { setupMarks } from "../src/battle/state.js";
import {
  FREEZE_TICKS,
  FROST_DAMAGE,
  HAMMER_DAMAGE,
  PULL_DAMAGE,
  PULL_TICKS,
  drain,
  eventsOf,
  fieldBattle,
  place,
  stepTicks,
  stepUntil,
  unitIn,
} from "./fixtures.js";

function spreadEnemies() {
  return [
    place("B-1", "B", "post", 40, 26),
    place("B-2", "B", "post", 56, 34),
    place("B-3", "B", "post", 24, 34),
  ];
}

test("Collection Day drags spread enemies into a pile and puts them on the floor", () => {
  const state = fieldBattle([place("A-1", "A", "puller", 40, 55), ...spreadEnemies()]);

  const events = stepUntil(state, "pull", 20);
  const pulls = eventsOf(events, "pull");
  assert.equal(pulls.length, 3);
  stepTicks(state, PULL_TICKS + 1);

  const first = unitIn(state, "B-1");
  const second = unitIn(state, "B-2");
  const third = unitIn(state, "B-3");

  for (const [one, other] of [
    [first, second],
    [second, third],
    [first, third],
  ] as const) {
    assert.ok(distance(one.position, other.position) <= 12, "the pile is not gathered");
  }

  for (const unit of [first, second, third]) {
    assert.equal(unit.hp, unit.maxHp - PULL_DAMAGE);
    assert.deepEqual(
      setupMarks(state, unit).map((mark) => [mark.state, mark.makerUnitId]),
      [["downed", "A-1"]],
    );
  }
});

test("Collection Day leaves airborne and floating enemies where they are", () => {
  const state = fieldBattle([place("A-1", "A", "puller", 40, 55), ...spreadEnemies()]);
  const flying = unitIn(state, "B-2");
  flying.elevation = 10;
  flying.motion = {
    kind: "flight",
    path: { from: { ...flying.position }, bounce: null, to: { ...flying.position }, length: 0 },
    startTick: 0,
    endTick: 100,
    startHeight: 10,
    peak: 10,
    landing: {
      hard: true,
      cause: "throw",
      launcherUnitId: "B-1",
      launcherTeamId: "B",
      bowlingHop: 0,
      bowlingDamage: 0,
      landingDamage: 0,
      stunTicks: 0,
    },
  };

  const events = stepUntil(state, "pull", READY_WAIT_TICKS + 20);

  assert.deepEqual(
    eventsOf(events, "pull").map((pull) => pull.unitId),
    ["B-1", "B-3"],
  );
});

test("Blizzard freezes everyone in the area, who cannot act until it thaws", () => {
  const state = fieldBattle([
    place("A-1", "A", "froster", 40, 50),
    place("B-1", "B", "brawler", 40, 40),
    place("B-2", "B", "post", 44, 40),
    place("B-3", "B", "post", 70, 20),
  ]);

  const events = stepUntil(state, "freeze", READY_WAIT_TICKS + 20);
  const frozen = eventsOf(events, "freeze");
  assert.deepEqual(
    frozen.map((freeze) => freeze.unitId),
    ["B-1", "B-2"],
  );

  const brawler = unitIn(state, "B-1");
  assert.ok(isFrozen(brawler, state.tick));
  assert.ok(isStunned(brawler, state.tick));
  assert.equal(brawler.hp, brawler.maxHp - FROST_DAMAGE);
  assert.equal(unitIn(state, "B-3").frozen, null);

  const start = { ...brawler.position };
  const later = stepTicks(state, FREEZE_TICKS - 5);
  assert.deepEqual(brawler.position, start);
  assert.equal(brawler.hp, brawler.maxHp - FROST_DAMAGE);
  assert.equal(eventsOf(later, "attack").filter((attack) => attack.sourceUnitId === "B-1").length, 0);

  const thaw = stepUntil(state, "thaw", 10);
  assert.deepEqual(
    eventsOf(thaw, "thaw").map((event) => event.unitId),
    ["B-1", "B-2"],
  );
  assert.equal(brawler.frozen, null);
});

test("a hammer shatters frozen enemies for extra damage and frees them", () => {
  const state = fieldBattle([
    place("A-1", "A", "shatterer", 40, 52),
    place("B-1", "B", "post", 40, 42),
    place("B-2", "B", "post", 46, 42),
  ]);

  const frozenTarget = unitIn(state, "B-1");
  const other = unitIn(state, "B-2");
  frozenTarget.frozen = { makerUnitId: "A-1", untilTick: 500 };

  const events = stepUntil(state, "shatter", 90);

  assert.deepEqual(
    eventsOf(events, "shatter").map((event) => event.unitId),
    ["B-1"],
  );
  assert.equal(frozenTarget.frozen, null);
  assert.equal(
    frozenTarget.maxHp - frozenTarget.hp,
    HAMMER_DAMAGE * SHATTER_DAMAGE_MULTIPLIER,
  );
  assert.equal(other.maxHp - other.hp, HAMMER_DAMAGE);
});

test("Mags gathers, Burr freezes the pile, and the hammer shatters all three", () => {
  const state = fieldBattle([
    place("A-1", "A", "puller", 34, 58),
    place("A-2", "A", "froster", 46, 58),
    place("A-3", "A", "shatterer", 40, 50),
    ...spreadEnemies(),
  ]);

  const events = stepTicks(state, 90);

  assert.equal(eventsOf(events, "pull").length, 3);
  assert.equal(eventsOf(events, "freeze").length, 3);
  assert.equal(eventsOf(events, "shatter").length, 3);
  assert.equal(
    eventsOf(events, "signature").every((cast) => cast.wanted),
    true,
  );
  assert.deepEqual(
    eventsOf(events, "signature").map((cast) => cast.unitId),
    ["A-1", "A-2", "A-3"],
  );

  const links = eventsOf(events, "combo-link").map((link) => [
    link.setupUnitId,
    link.payoffUnitId,
    link.state,
  ]);
  assert.deepEqual(links.slice(0, 2), [
    ["A-1", "A-2", "downed"],
    ["A-2", "A-3", "frozen"],
  ]);
  assert.ok(eventsOf(events, "combo-link").length >= 2);
  assert.equal(state.chains.find((chain) => chain.teamId === "A")?.count, 2);
});

test("a shattered pile takes more than the same hammer on an unfrozen pile", () => {
  const hammerOnPile = (frozen: boolean): number => {
    const state = fieldBattle([
      place("A-1", "A", "shatterer", 40, 52),
      place("B-1", "B", "post", 40, 42),
    ]);
    drain(state, "A-1");

    if (frozen) {
      unitIn(state, "B-1").frozen = { makerUnitId: "A-1", untilTick: 500 };
    }

    unitIn(state, "A-1").mana = 100;
    unitIn(state, "A-1").readySinceTick = state.tick;
    stepTicks(state, 80);
    const target = unitIn(state, "B-1");

    return target.maxHp - target.hp;
  };

  assert.equal(hammerOnPile(true), hammerOnPile(false) * SHATTER_DAMAGE_MULTIPLIER);
});
