import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  advanceLive,
  closeWatch,
  draftLapsedUnlocked,
  draftLocked,
  lockedPicks,
  submitDraft,
  toggleDraftPick,
} from "../src/features/match/model/match-state.js";
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

const SEATS = [seatOf(ME), seatOf(RIVAL), seatOf(THIRD), seatOf(FOURTH)];

function firstRound() {
  return resolvedRound(
    0,
    [battleBetween("b1", ME, RIVAL, ME), battleBetween("b2", THIRD, FOURTH, THIRD)],
    SEATS,
  );
}

test("opening a match in the draft copies the server's selection into local state", () => {
  const live = liveOf(viewOf("draft", { phaseEpoch: 4, draftSelection: ["paladin"] }));

  assert.equal(live.draft.epoch, 4);
  assert.deepEqual(live.draft.selection, ["paladin"]);
  assert.equal(live.watch, null);
  assert.equal(live.watchedThrough, -1);
});

test("a new phase epoch resets the draft, and the same epoch keeps local picks", () => {
  const live = liveOf(viewOf("draft", { phaseEpoch: 1 }));
  const picked = toggleDraftPick(live, "paladin").live;

  const sameEpoch = advanceLive(picked, snapshotOf(viewOf("draft", { phaseEpoch: 1 })));
  assert.deepEqual(sameEpoch.draft.selection, ["paladin"]);

  const nextEpoch = advanceLive(
    picked,
    snapshotOf(viewOf("draft", { phaseEpoch: 2, draftSelection: ["firebrand"] })),
  );

  assert.equal(nextEpoch.draft.epoch, 2);
  assert.deepEqual(nextEpoch.draft.selection, ["firebrand"]);
});

test("a freshly resolved round opens the watch and marks it watched", () => {
  const live = liveOf(viewOf("draft"));
  const round = firstRound();

  const next = advanceLive(
    live,
    snapshotOf(viewOf("round-result", { currentRound: roundOf(0, round.battles) }), {
      latestRound: round,
    }),
  );

  assert.equal(next.watch, round);
  assert.equal(next.watchedThrough, 0);
});

test("while a round is being watched a newer snapshot never replaces the watch", () => {
  const live = liveOf(viewOf("draft"));
  const round = firstRound();

  const watching = advanceLive(live, snapshotOf(viewOf("round-result"), { latestRound: round }));
  const later = resolvedRound(1, [battleBetween("b3", ME, THIRD, ME)], SEATS);

  const next = advanceLive(watching, snapshotOf(viewOf("preparing"), { latestRound: later }));

  assert.equal(next.watch, round);
  assert.equal(next.watchedThrough, 0);
  assert.equal(next.snapshot.latestRound, later);
});

test("closing the watch clears it, and a round that arrived meanwhile opens next", () => {
  const live = liveOf(viewOf("draft"));
  const round = firstRound();
  const watching = advanceLive(live, snapshotOf(viewOf("round-result"), { latestRound: round }));

  assert.equal(closeWatch(watching).watch, null);

  const later = resolvedRound(1, [battleBetween("b3", ME, THIRD, ME)], SEATS);
  const backlog = advanceLive(watching, snapshotOf(viewOf("preparing"), { latestRound: later }));

  assert.equal(closeWatch(backlog).watch, later);
  assert.equal(closeWatch(backlog).watchedThrough, 1);
});

test("health before the round is recorded at the preparing phase only", () => {
  const preparing = viewOf("preparing", {
    players: [seatOf(ME, { runHealth: 11 }), seatOf(RIVAL, { runHealth: 9 })],
  });

  const live = liveOf(preparing);
  assert.equal(live.healthBeforeRound.get(ME), 11);
  assert.equal(live.healthBeforeRound.get(RIVAL), 9);

  const afterLoss = viewOf("round-result", {
    players: [seatOf(ME, { runHealth: 8 }), seatOf(RIVAL, { runHealth: 9 })],
  });

  const next = advanceLive(live, snapshotOf(afterLoss));
  assert.equal(next.healthBeforeRound.get(ME), 11);
});

test("a draft pick is added, removed and capped at the number of picks", () => {
  const live = liveOf(viewOf("draft"));

  const first = toggleDraftPick(live, "paladin");
  assert.equal(first.sound, "draft-pick");
  assert.deepEqual(first.live.draft.selection, ["paladin"]);

  const second = toggleDraftPick(toggleDraftPick(first.live, "firebrand").live, "training-dummy");
  assert.deepEqual(second.live.draft.selection, ["paladin", "firebrand", "training-dummy"]);

  const overflow = toggleDraftPick(second.live, "sharpshooter");
  assert.equal(overflow.live, second.live);
  assert.equal(overflow.sound, null);

  const removed = toggleDraftPick(second.live, "firebrand");
  assert.equal(removed.sound, "draft-unpick");
  assert.deepEqual(removed.live.draft.selection, ["paladin", "training-dummy"]);
});

test("a locked draft ignores further picks", () => {
  const live = liveOf(viewOf("draft", { ready: true }));
  const toggled = toggleDraftPick(live, "paladin");

  assert.equal(toggled.live, live);
  assert.equal(toggled.sound, null);
});

test("picking outside the draft phase is a loud error", () => {
  assert.throws(
    () => toggleDraftPick(liveOf(viewOf("preparing")), "paladin"),
    /during the preparing phase/,
  );
});

test("submitting the draft locks it for the current epoch only", () => {
  const live = liveOf(viewOf("draft", { phaseEpoch: 3 }));
  const submitted = submitDraft(live);
  const view = viewOf("draft", { phaseEpoch: 3 });

  assert.equal(submitted.draft.submittedEpoch, 3);
  assert.equal(draftLocked(view, submitted.draft), true);
  assert.equal(draftLocked(viewOf("draft", { phaseEpoch: 4 }), submitted.draft), false);
});

test("locked picks fall back to the local selection until the server confirms heroes", () => {
  const live = liveOf(viewOf("draft", { draftSelection: ["paladin"] }));
  assert.deepEqual(lockedPicks(viewOf("draft"), live.draft), ["paladin"]);
  assert.deepEqual(lockedPicks(viewOf("preparing", { heroIds: ["firebrand"] }), live.draft), [
    "firebrand",
  ]);
});

test("a full unsubmitted draft that the server moved past counts as lapsed", () => {
  const full = ["paladin", "firebrand", "training-dummy"];
  const live = liveOf(viewOf("draft", { draftSelection: full }));
  const moved = snapshotOf(viewOf("preparing"));

  assert.equal(draftLapsedUnlocked(live, moved), true);
  assert.equal(draftLapsedUnlocked(submitDraft(live), moved), false);
  assert.equal(draftLapsedUnlocked(live, snapshotOf(viewOf("draft"))), false);
});

test("a partial draft or a non-draft phase never counts as lapsed", () => {
  const partial = liveOf(viewOf("draft", { draftSelection: ["paladin"] }));
  assert.equal(draftLapsedUnlocked(partial, snapshotOf(viewOf("preparing"))), false);

  const planning = liveOf(viewOf("preparing"));
  assert.equal(draftLapsedUnlocked(planning, snapshotOf(viewOf("round-result"))), false);
  assert.equal(draftLapsedUnlocked(liveOf(null), snapshotOf(viewOf("draft"))), false);
});
