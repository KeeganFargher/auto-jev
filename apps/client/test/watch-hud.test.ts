import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCustomLabSetup, gameCatalogue } from "@jev-game/content";
import { createBattle, getBattleSnapshot, type BattleEvent } from "@jev-game/game";
import { PUBLISH_EVERY_MS, createMeterFeed } from "../src/features/match/damage/meter-feed.js";
import { BLANK_PLATE, createWatchHud, samePlate } from "../src/features/match/state/watch-hud.js";

function opening() {
  const setup = createCustomLabSetup(1, ["paladin"], ["training-dummy"]);

  return getBattleSnapshot(createBattle(setup, gameCatalogue));
}

function hit(amount: number): BattleEvent {
  return {
    kind: "damage",
    tick: 1,
    sequence: 1,
    sourceUnitId: "A-1",
    targetUnitId: "B-1",
    amount,
    crit: false,
    cause: "attack",
    hpAfter: 10,
  };
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withWindow<T>(run: () => Promise<T>): Promise<T> {
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });

  return run().finally(() => {
    Reflect.deleteProperty(globalThis, "window");
  });
}

test("starting the meter publishes the opening state with the replayed history", () => {
  const feed = createMeterFeed();
  feed.start(opening(), "A", [hit(6)]);

  const snapshot = feed.snapshot.get();
  assert.equal(snapshot?.entries.length, 1);
  assert.equal(snapshot?.entries[0]?.totals.dealt, 6);
});

test("pushing events before the meter starts is a loud error", () => {
  assert.throws(() => createMeterFeed().push([hit(1)]), /before it started/);
});

test("events that change nothing never publish", () => {
  const feed = createMeterFeed();
  feed.start(opening(), "A", []);
  const published = feed.snapshot.get();

  feed.push([hit(0)]);
  assert.equal(feed.snapshot.get(), published);
});

test("rapid events publish on a trailing timer rather than on every push", async () => {
  await withWindow(async () => {
    const feed = createMeterFeed();
    feed.start(opening(), "A", []);
    const opened = feed.snapshot.get();

    feed.push([hit(3)]);
    feed.push([hit(4)]);
    assert.equal(feed.snapshot.get(), opened);

    await pause(PUBLISH_EVERY_MS + 80);
    assert.equal(feed.snapshot.get()?.entries[0]?.totals.dealt, 7);
    feed.dispose();
  });
});

test("clearing the meter drops the snapshot and cancels a pending publish", async () => {
  await withWindow(async () => {
    const feed = createMeterFeed();
    feed.start(opening(), "A", []);
    feed.push([hit(3)]);
    feed.clear();
    assert.equal(feed.snapshot.get(), null);

    await pause(PUBLISH_EVERY_MS + 80);
    assert.equal(feed.snapshot.get(), null);
  });
});

test("watch commands only work while a round is bound", () => {
  const hud = createWatchHud();
  const calls: string[] = [];

  assert.throws(() => hud.skip(), /No round is being watched/);
  assert.throws(() => hud.focus("p2"), /No round is being watched/);

  const unbind = hud.bind({
    skip: () => calls.push("skip"),
    focus: (playerId) => calls.push(`focus:${playerId}`),
  });

  hud.skip();
  hud.focus("p2");
  assert.deepEqual(calls, ["skip", "focus:p2"]);

  unbind();
  assert.throws(() => hud.skip(), /No round is being watched/);
});

test("binding a second round while one is bound is a loud error", () => {
  const hud = createWatchHud();
  const commands = { skip: () => {}, focus: () => {} };
  hud.bind(commands);

  assert.throws(() => hud.bind(commands), /already being watched/);
});

test("resetting the hud blanks every store", () => {
  const hud = createWatchHud();
  hud.plate.set({ roundText: "Round 2", phaseText: "Battle", timer: "5", urgent: true });
  hud.canSkip.set(true);
  hud.boardOwner.set("p2");
  hud.reset();

  assert.equal(hud.plate.get(), BLANK_PLATE);
  assert.equal(hud.canSkip.get(), false);
  assert.equal(hud.boardOwner.get(), null);
  assert.deepEqual(hud.rows.get(), []);
});

test("plates compare by content so identical frames do not re-render", () => {
  const plate = { roundText: "Round 1", phaseText: "Battle", timer: "3", urgent: false };

  assert.equal(samePlate(plate, { ...plate }), true);
  assert.equal(samePlate(plate, { ...plate, timer: "2" }), false);
  assert.equal(samePlate(plate, { ...plate, urgent: true }), false);
});
