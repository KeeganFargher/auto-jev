import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ROUND_END_PAUSE_SECONDS } from "@jev-game/run";
import {
  CATCH_UP_SECONDS,
  NEXT_PHASE_PAUSE_SECONDS,
  advanceBy,
  roundEndPauseSeconds,
} from "../src/features/match/model/watch-pacing.js";
import { snapshotOf, viewOf } from "./match-fixtures.js";

test("the round-result pause counts down to the server deadline", () => {
  const snapshot = snapshotOf(viewOf("round-result"), { deadline: 14_000 });

  assert.equal(roundEndPauseSeconds(snapshot, 10_000), 4);
});

test("a round-result without a deadline is a loud error", () => {
  assert.throws(
    () => roundEndPauseSeconds(snapshotOf(viewOf("round-result")), 10_000),
    /arrived without a deadline/,
  );
});

test("the finish holds for the run-end pause and other phases wait a beat", () => {
  assert.equal(roundEndPauseSeconds(snapshotOf(viewOf("finished")), 0), ROUND_END_PAUSE_SECONDS);

  for (const phase of ["lobby", "draft", "preparing"] as const) {
    assert.equal(roundEndPauseSeconds(snapshotOf(viewOf(phase)), 0), NEXT_PHASE_PAUSE_SECONDS);
  }
});

test("pacing needs a view", () => {
  assert.throws(() => roundEndPauseSeconds(snapshotOf(null), 0), /has not sent a view/);
});

test("playback runs in real time until it falls behind, then catches up at the backlog", () => {
  assert.equal(advanceBy(0.4, 0.016), 0.016);
  assert.equal(advanceBy(CATCH_UP_SECONDS, 0.016), 0.016);
  assert.equal(advanceBy(CATCH_UP_SECONDS + 2, 0.016), CATCH_UP_SECONDS + 2);
});
