import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  TICK_SECONDS,
  buildPresentationTimeline,
  presentationSecondsAtTick,
  tickAtPresentationSeconds,
  type Beat,
  type BattleEvent,
} from "../src/index.js";
import { near } from "./fixtures.js";

function beat(tick: number, sequence: number, value: Beat): BattleEvent {
  return { kind: "beat", beat: value, tick, sequence };
}

function getUp(tick: number, sequence: number): BattleEvent {
  return { kind: "get-up", unitId: "A-1", tick, sequence };
}

test("without beats every tick lasts one tick of real time", () => {
  const timeline = buildPresentationTimeline([getUp(3, 0)], 60);

  near(timeline.totalSeconds, 60 * TICK_SECONDS);
  near(presentationSecondsAtTick(timeline, 30), 30 * TICK_SECONDS);
});

test("a freeze holds its tick before the next one starts", () => {
  const timeline = buildPresentationTimeline([beat(10, 0, { kind: "freeze", seconds: 0.1 })], 20);

  near(presentationSecondsAtTick(timeline, 10), 10 * TICK_SECONDS);
  near(presentationSecondsAtTick(timeline, 11), 11 * TICK_SECONDS + 0.1);
  near(timeline.totalSeconds, 20 * TICK_SECONDS + 0.1);
});

test("freezes on the same tick take the longest, not the sum", () => {
  const timeline = buildPresentationTimeline(
    [
      beat(10, 0, { kind: "freeze", seconds: 0.04 }),
      beat(10, 1, { kind: "freeze", seconds: 0.1 }),
      beat(10, 2, { kind: "freeze", seconds: 0.06 }),
    ],
    20,
  );

  near(timeline.totalSeconds, 20 * TICK_SECONDS + 0.1);
});

test("a slow stretches the ticks after it", () => {
  const timeline = buildPresentationTimeline(
    [beat(10, 0, { kind: "slow", rate: 0.25, ticks: 4 })],
    20,
  );

  near(presentationSecondsAtTick(timeline, 10), 10 * TICK_SECONDS);
  near(presentationSecondsAtTick(timeline, 14), 10 * TICK_SECONDS + 16 * TICK_SECONDS);
  near(presentationSecondsAtTick(timeline, 15), 10 * TICK_SECONDS + 17 * TICK_SECONDS);
});

test("a slow that starts inside another is dropped", () => {
  const alone = buildPresentationTimeline([beat(10, 0, { kind: "slow", rate: 0.5, ticks: 4 })], 30);

  const overlapping = buildPresentationTimeline(
    [
      beat(10, 0, { kind: "slow", rate: 0.5, ticks: 4 }),
      beat(12, 1, { kind: "slow", rate: 0.25, ticks: 10 }),
    ],
    30,
  );

  near(overlapping.totalSeconds, alone.totalSeconds);
});

test("a slow that starts after another ends plays in full", () => {
  const timeline = buildPresentationTimeline(
    [
      beat(10, 0, { kind: "slow", rate: 0.5, ticks: 4 }),
      beat(14, 1, { kind: "slow", rate: 0.5, ticks: 4 }),
    ],
    30,
  );

  near(timeline.totalSeconds, 30 * TICK_SECONDS + 8 * TICK_SECONDS);
});

test("presentation seconds map back to the tick they show", () => {
  const timeline = buildPresentationTimeline(
    [
      beat(10, 0, { kind: "freeze", seconds: 0.1 }),
      beat(20, 1, { kind: "slow", rate: 0.5, ticks: 4 }),
    ],
    40,
  );

  for (let tick = 0; tick <= 40; tick += 1) {
    near(tickAtPresentationSeconds(timeline, presentationSecondsAtTick(timeline, tick)), tick);
  }

  const frozenAt = presentationSecondsAtTick(timeline, 10) + 0.05;
  assert.equal(tickAtPresentationSeconds(timeline, frozenAt), 10);

  const halfway = presentationSecondsAtTick(timeline, 21) + TICK_SECONDS;
  near(tickAtPresentationSeconds(timeline, halfway), 21.5);
  assert.equal(tickAtPresentationSeconds(timeline, timeline.totalSeconds + 5), 40);
});

test("the timeline rejects events out of order or past the end", () => {
  assert.throws(() => buildPresentationTimeline([getUp(5, 0), getUp(4, 1)], 10), /out of order/);
  assert.throws(() => buildPresentationTimeline([getUp(11, 0)], 10), /past tick/);
  assert.throws(
    () => buildPresentationTimeline([beat(3, 0, { kind: "freeze", seconds: 0 })], 10),
    /no length/,
  );
  assert.throws(
    () => buildPresentationTimeline([beat(3, 0, { kind: "slow", rate: 1.5, ticks: 2 })], 10),
    /malformed/,
  );
  assert.throws(() => tickAtPresentationSeconds(buildPresentationTimeline([], 10), -1), /Invalid/);
});
