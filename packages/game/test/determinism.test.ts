import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  TICK_SECONDS,
  createBattle,
  getBattleSnapshot,
  recordBattle,
  runBattle,
  stepBattle,
  type BattleSetup,
} from "../src/index.js";
import { CATALOGUE, fieldSetup, place, stepTicks } from "./fixtures.js";

function melee(seed: number): BattleSetup {
  return fieldSetup(seed, [
    place("A-1", "A", "brawler", 30, 20),
    place("A-2", "A", "brawler", 40, 20),
    place("A-3", "A", "fuser", 50, 12),
    place("A-4", "A", "hooker", 60, 12),
    place("B-1", "B", "brawler", 30, 60),
    place("B-2", "B", "brawler", 40, 60),
    place("B-3", "B", "bubbler", 50, 68),
    place("B-4", "B", "hammer", 60, 68),
  ]);
}

test("the same setup always plays out the same way", () => {
  const first = runBattle(melee(11), CATALOGUE);
  const second = runBattle(melee(11), CATALOGUE);

  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.ok(first.events.some((event) => event.kind === "death"));
});

test("events come in order and the battle ends with its result", () => {
  const outcome = runBattle(melee(5), CATALOGUE);
  const last = outcome.events.at(-1);

  outcome.events.forEach((event, index) => {
    assert.equal(event.sequence, index);

    const previous = outcome.events[index - 1];

    if (previous !== undefined) {
      assert.ok(event.tick >= previous.tick, `event ${index} goes back in time`);
    }
  });

  assert.equal(last?.kind, "battle-ended");
  assert.deepEqual(last?.kind === "battle-ended" ? last.result : null, outcome.result);
  assert.ok(outcome.timeline.totalSeconds >= outcome.result.endedAtTick * TICK_SECONDS);
});

test("the seed decides who resolves first", () => {
  const orders = new Set<string>();

  for (let seed = 1; seed <= 8; seed += 1) {
    orders.add(createBattle(melee(seed), CATALOGUE).resolutionOrder.join());
  }

  assert.ok(orders.size > 1);
});

test("a recording holds a frame per tick and matches a plain run", () => {
  const recording = recordBattle(melee(3), CATALOGUE);
  const outcome = runBattle(melee(3), CATALOGUE);

  assert.equal(recording.frames.length, recording.result.endedAtTick + 1);
  recording.frames.forEach((frame, index) => {
    assert.equal(frame.tick, index);
    assert.equal(frame.snapshot.tick, index);
  });
  assert.deepEqual(recording.events, outcome.events);
  assert.deepEqual(recording.result, outcome.result);
  assert.deepEqual(recording.timeline, outcome.timeline);
});

test("snapshots are copies that stepping and editing leave alone", () => {
  const state = createBattle(melee(4), CATALOGUE);
  stepTicks(state, 90);
  const snapshot = getBattleSnapshot(state);
  const frozen = structuredClone(snapshot);

  stepTicks(state, 90);
  assert.deepEqual(snapshot, frozen);

  const edited = getBattleSnapshot(state);
  const unit = edited.units[0];
  const chain = edited.chains[0];
  assert.ok(unit !== undefined && chain !== undefined);
  unit.position.x = -100;
  unit.motion = { kind: "ground" };
  chain.pairs.push("edited");

  assert.notEqual(state.units[0]?.position.x, -100);
  assert.ok(!state.chains[0]?.pairs.includes("edited"));
});

test("a battle nobody can win times out as a draw", () => {
  const outcome = runBattle(
    fieldSetup(1, [place("A-1", "A", "post", 20, 20), place("B-1", "B", "post", 60, 60)]),
    CATALOGUE,
  );

  assert.equal(outcome.result.kind, "draw");
  assert.equal(outcome.result.kind === "draw" ? outcome.result.reason : null, "timeout");
  assert.equal(outcome.result.endedAtTick, 900);
});

test("a finished battle cannot be stepped", () => {
  const state = createBattle(
    {
      ...fieldSetup(1, [place("A-1", "A", "post", 20, 20), place("B-1", "B", "post", 60, 60)]),
      tickLimit: 3,
    },
    CATALOGUE,
  );

  stepTicks(state, 3);
  assert.notEqual(state.result, null);
  assert.throws(() => stepBattle(state), /already ended/);
});

test("broken setups are rejected before the battle starts", () => {
  const units = [place("A-1", "A", "post", 20, 20), place("B-1", "B", "post", 60, 60)];
  const setup = fieldSetup(1, units);

  assert.throws(
    () => createBattle(fieldSetup(1, [...units, place("A-1", "A", "post", 30, 30)]), CATALOGUE),
    /Duplicate unit id/,
  );
  assert.throws(
    () => createBattle(fieldSetup(1, [...units, place("A-2", "A", "post", 81, 30)]), CATALOGUE),
    /outside the arena/,
  );
  assert.throws(
    () => createBattle(fieldSetup(1, [place("A-1", "A", "post", 20, 20)]), CATALOGUE),
    /two teams/,
  );
  assert.throws(() => createBattle({ ...setup, seed: 1.5 }, CATALOGUE), /not an integer/);
  assert.throws(() => createBattle({ ...setup, tickLimit: 0 }, CATALOGUE), /tick limit/);
  assert.throws(
    () => createBattle(fieldSetup(1, [...units, place("A-2", "A", "ghost", 30, 30)]), CATALOGUE),
    /Unknown hero "ghost"/,
  );
  assert.throws(
    () => createBattle({ ...setup, arenaId: "moon" }, CATALOGUE),
    /Unknown arena "moon"/,
  );
});
