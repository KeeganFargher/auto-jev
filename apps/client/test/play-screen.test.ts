import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { DraftState } from "../src/features/match/model/match-state.js";
import { describePlay, describeRoster } from "../src/features/match/model/play-screen.js";
import { ME, RIVAL, THIRD, FOURTH, battleBetween, roundOf, viewOf } from "./match-fixtures.js";

const NO_DRAFT: DraftState = { epoch: 1, selection: [], submittedEpoch: -1 };

function draftWith(selection: string[], submittedEpoch: number = -1): DraftState {
  return { epoch: 1, selection, submittedEpoch };
}

test("an unlocked draft asks for picks and enables Confirm only with a full team", () => {
  const view = viewOf("draft");
  const partial = describePlay(view, draftWith(["paladin"]));

  assert.equal(partial.board, "draft");
  assert.equal(partial.countdownEpoch, view.phaseEpoch);
  assert.deepEqual(partial.banner, {
    tone: "blue",
    title: "Draft your team",
    sub: "Pick 3 heroes · 1/3 chosen",
  });
  assert.deepEqual(partial.action, { kind: "confirm", label: "Confirm", disabled: true });

  const full = describePlay(view, draftWith(["paladin", "firebrand", "training-dummy"]));
  assert.equal(full.action?.disabled, false);
});

test("a locked draft shows the waiting banner and no action", () => {
  const bySubmission = describePlay(viewOf("draft", { phaseEpoch: 1 }), draftWith([], 1));
  assert.equal(bySubmission.banner?.title, "Team locked in");
  assert.equal(bySubmission.action, null);

  const byServer = describePlay(viewOf("draft", { ready: true }), NO_DRAFT);
  assert.equal(byServer.banner?.title, "Team locked in");
  assert.equal(byServer.action, null);
});

test("the placement board names the opponent and offers Ready until the player is ready", () => {
  const round = roundOf(2, [
    battleBetween("b1", ME, RIVAL, null),
    battleBetween("b2", THIRD, FOURTH, null),
  ]);

  const waiting = describePlay(viewOf("preparing", { currentRound: round }), NO_DRAFT);

  assert.equal(waiting.board, "placement");
  assert.equal(waiting.opponentId, RIVAL);
  assert.equal(waiting.roundText, "Round 3");
  assert.deepEqual(waiting.action, { kind: "ready", label: "Ready", disabled: false });

  const ready = describePlay(viewOf("preparing", { currentRound: round, ready: true }), NO_DRAFT);
  assert.equal(ready.action, null);
});

test("the opponent is found whichever side of the pairing the player is on", () => {
  const round = roundOf(0, [
    battleBetween("b1", RIVAL, ME, null),
    battleBetween("b2", THIRD, FOURTH, null),
  ]);

  assert.equal(
    describePlay(viewOf("preparing", { currentRound: round }), NO_DRAFT).opponentId,
    RIVAL,
  );
});

test("a bye during preparing has no board and no countdown", () => {
  const round = roundOf(0, [battleBetween("b1", RIVAL, THIRD, null)], ME);
  const screen = describePlay(viewOf("preparing", { currentRound: round }), NO_DRAFT);

  assert.equal(screen.board, null);
  assert.equal(screen.countdownEpoch, null);
  assert.equal(screen.banner?.title, "Bye");
});

test("a round result reads as victory, defeat or a draw from the player's side", () => {
  const won = roundOf(0, [
    battleBetween("b1", ME, RIVAL, ME),
    battleBetween("b2", THIRD, FOURTH, THIRD),
  ]);

  const lost = roundOf(0, [
    battleBetween("b1", ME, RIVAL, RIVAL),
    battleBetween("b2", THIRD, FOURTH, THIRD),
  ]);

  const drawn = roundOf(0, [
    battleBetween("b1", ME, RIVAL, null),
    battleBetween("b2", THIRD, FOURTH, THIRD),
  ]);

  const victory = describePlay(viewOf("round-result", { currentRound: won }), NO_DRAFT);
  assert.deepEqual(victory.banner, { tone: "gold", title: "Victory", sub: "vs Name p2" });
  assert.equal(victory.sound?.kind, "round-result");

  const defeat = describePlay(viewOf("round-result", { currentRound: lost }), NO_DRAFT);
  assert.deepEqual(defeat.banner, { tone: "crimson", title: "Defeat", sub: "vs Name p2" });

  const draw = describePlay(viewOf("round-result", { currentRound: drawn }), NO_DRAFT);
  assert.deepEqual(draw.banner, { tone: "slate", title: "Draw", sub: "vs Name p2 · time ran out" });
});

test("sitting a round out shows a bye and plays no result sound", () => {
  const round = roundOf(0, [battleBetween("b1", RIVAL, THIRD, RIVAL)], ME);
  const screen = describePlay(viewOf("round-result", { currentRound: round }), NO_DRAFT);

  assert.equal(screen.banner?.title, "Bye");
  assert.equal(screen.sound, null);
});

test("a round result without a battle for the player is a loud error", () => {
  const round = roundOf(0, [battleBetween("b1", RIVAL, THIRD, RIVAL)]);

  assert.throws(
    () => describePlay(viewOf("round-result", { currentRound: round }), NO_DRAFT),
    /has no battle for p1/,
  );
});

test("the finished screen distinguishes winning, sharing, losing and elimination", () => {
  const round = roundOf(4, [battleBetween("b1", ME, RIVAL, RIVAL)]);

  const solo = describePlay(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [ME] }),
    NO_DRAFT,
  );

  assert.deepEqual(solo.banner, { tone: "gold", title: "Victory!", sub: "You won the run" });
  assert.equal(solo.sound?.kind, "finish");
  assert.equal(solo.action?.kind, "menu");

  const shared = describePlay(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [ME, THIRD] }),
    NO_DRAFT,
  );

  assert.equal(shared.banner?.sub, "You share the win");

  const beaten = describePlay(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [RIVAL] }),
    NO_DRAFT,
  );

  assert.deepEqual(beaten.banner, { tone: "slate", title: "Match over", sub: "Winner: Name p2" });

  const out = describePlay(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [RIVAL, THIRD], eliminated: true }),
    NO_DRAFT,
  );

  assert.deepEqual(out.banner, {
    tone: "crimson",
    title: "Eliminated",
    sub: "Round 5 · lost to Name p2",
  });
  assert.equal(out.subtitle, "Winners: Name p2, Name p3");
});

test("a finished view without winners is a loud error", () => {
  const round = roundOf(0, [battleBetween("b1", ME, RIVAL, ME)]);

  assert.throws(
    () => describePlay(viewOf("finished", { currentRound: round }), NO_DRAFT),
    /arrived without winners/,
  );
});

test("an eliminated player who is not at the finish is spectating", () => {
  const round = roundOf(1, [battleBetween("b1", RIVAL, THIRD, RIVAL)]);

  const screen = describePlay(
    viewOf("round-result", { currentRound: round, eliminated: true }),
    NO_DRAFT,
  );

  assert.equal(screen.phaseText, "Spectating");
  assert.deepEqual(screen.action, { kind: "leave", label: "Leave", disabled: false });
  assert.equal(screen.board, null);
});

test("the lobby phase shows only its labels", () => {
  const screen = describePlay(viewOf("lobby"), NO_DRAFT);

  assert.equal(screen.roundText, "Lobby");
  assert.equal(screen.banner, null);
  assert.equal(screen.action, null);
});

test("a preparing or result phase without a round is a loud error", () => {
  assert.throws(() => describePlay(viewOf("preparing"), NO_DRAFT), /arrived without a round/);
});

test("the roster follows the live selection while drafting and the locked heroes after", () => {
  const drafting = describeRoster(viewOf("draft"), draftWith(["paladin", "firebrand"]));
  assert.deepEqual(drafting, { heroIds: ["paladin", "firebrand"], slots: 3, visible: true });

  const locked = describeRoster(viewOf("draft", { ready: true, heroIds: ["paladin"] }), NO_DRAFT);
  assert.deepEqual(locked.heroIds, ["paladin"]);

  const planning = describeRoster(
    viewOf("preparing", { heroIds: ["paladin", "firebrand"] }),
    NO_DRAFT,
  );

  assert.equal(planning.visible, true);

  const empty = describeRoster(viewOf("preparing"), NO_DRAFT);
  assert.equal(empty.visible, false);
});
