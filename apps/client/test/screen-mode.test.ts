import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { MatchState } from "../src/features/match/model/match-state.js";
import { advanceLive } from "../src/features/match/model/match-state.js";
import { musicScreenOf, screenModeOf } from "../src/features/match/model/screen-mode.js";
import {
  ME,
  RIVAL,
  THIRD,
  FOURTH,
  battleBetween,
  liveOf,
  resolvedRound,
  roundOf,
  seatOf,
  snapshotOf,
  viewOf,
} from "./match-fixtures.js";

function stateOf(live: MatchState["live"]): MatchState {
  return { connecting: false, notice: null, defect: null, live };
}

const PLAYERS = [seatOf(ME), seatOf(RIVAL), seatOf(THIRD), seatOf(FOURTH)];

test("no session means the menu, and a session without a view means the lobby", () => {
  assert.equal(screenModeOf(stateOf(null)), "menu");
  assert.equal(screenModeOf(stateOf(liveOf(null))), "lobby");
});

test("each phase maps onto the board or the stage it shows", () => {
  const round = roundOf(0, [
    battleBetween("b1", ME, RIVAL, ME),
    battleBetween("b2", THIRD, FOURTH, THIRD),
  ]);

  assert.equal(screenModeOf(stateOf(liveOf(viewOf("draft")))), "draft");
  assert.equal(
    screenModeOf(stateOf(liveOf(viewOf("preparing", { currentRound: round })))),
    "placement",
  );
  assert.equal(
    screenModeOf(stateOf(liveOf(viewOf("round-result", { currentRound: round })))),
    "stage",
  );
  assert.equal(screenModeOf(stateOf(liveOf(viewOf("lobby")))), "stage");
});

test("a round being watched takes over every other mode", () => {
  const battles = [battleBetween("b1", ME, RIVAL, ME), battleBetween("b2", THIRD, FOURTH, THIRD)];
  const latest = resolvedRound(0, battles, PLAYERS);
  const live = liveOf(viewOf("draft"));

  const watching = advanceLive(
    live,
    snapshotOf(viewOf("round-result", { currentRound: roundOf(0, battles) }), {
      latestRound: latest,
    }),
  );

  assert.equal(screenModeOf(stateOf(watching)), "watch");
  assert.equal(musicScreenOf(stateOf(watching)), "battle");
  assert.equal(musicScreenOf(stateOf(live)), "planning");
  assert.equal(musicScreenOf(stateOf(null)), "menu");
});
