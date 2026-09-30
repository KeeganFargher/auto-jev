import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { BoardCell, HeroDefinitionId } from "@jev-game/game";
import { DRAFTABLE_HERO_IDS, defaultFormation } from "@jev-game/content";
import {
  DEFAULT_RUN_RULES,
  createRun,
  getPlayerView,
  isSeatReady,
  pumpRun,
  type RunCommand,
  type RunState,
} from "../src/index.js";
import { accepted, draftingRun, refusal, revisionOf, seats } from "./helpers.js";

const TEAM = ["paladin", "firebrand", "bubble-cleric"];

function selectHeroes(heroIds: readonly HeroDefinitionId[]): RunCommand {
  return { kind: "select-heroes", playerId: "p1", heroIds, expectedRevision: 0 };
}

function commitDraft(
  playerId: string,
  heroIds: readonly HeroDefinitionId[],
  expectedRevision: number,
): RunCommand {
  return { kind: "commit-draft", playerId, heroIds, expectedRevision };
}

function placeHeroes(formation: readonly BoardCell[], expectedRevision: number): RunCommand {
  return { kind: "place-heroes", playerId: "p1", formation, expectedRevision };
}

function bothDrafted(): RunState {
  let state = draftingRun(["human", "human"]);

  for (const playerId of ["p1", "p2"]) {
    state = accepted(state, commitDraft(playerId, TEAM, 0));
  }

  return pumpRun(state);
}

test("a run needs two distinct seats and a draft the pool can fill", () => {
  assert.throws(() => createRun("solo", 1, seats(["human"])), /at least 2 seats/);
  assert.throws(
    () =>
      createRun("twins", 1, [
        { playerId: "p1", displayName: "A", controllerKind: "human" },
        { playerId: "p1", displayName: "B", controllerKind: "human" },
      ]),
    /player id twice/,
  );
  assert.throws(
    () =>
      createRun("greedy", 1, seats(["human", "human"]), { ...DEFAULT_RUN_RULES, draftPicks: 8 }),
    /draft of 8 heroes/,
  );
  assert.throws(
    () => createRun("empty", 1, seats(["human", "human"]), { ...DEFAULT_RUN_RULES, draftPicks: 0 }),
    /draft of 0 heroes/,
  );
});

test("the draft offers every draftable hero to every seat", () => {
  const state = draftingRun(["human", "human"]);

  assert.equal(state.phase, "draft");
  assert.deepEqual(state.draftPool, DRAFTABLE_HERO_IDS);
  assert.deepEqual(getPlayerView(state, "p2").draftPool, DRAFTABLE_HERO_IDS);
});

test("a draft selection is checked but does not lock the seat in", () => {
  const state = draftingRun(["human", "human"]);

  assert.equal(refusal(state, selectHeroes(["paladin", "paladin"])), "duplicate-hero");
  assert.equal(refusal(state, selectHeroes(["training-dummy"])), "unknown-hero");
  assert.equal(
    refusal(state, selectHeroes(["paladin", "berserker", "firebrand", "harpooner"])),
    "invalid-pick-count",
  );

  const selected = accepted(state, selectHeroes(["harpooner"]));

  assert.deepEqual(getPlayerView(selected, "p1").draftSelection, ["harpooner"]);
  assert.equal(revisionOf(selected, "p1"), 0);
  assert.equal(isSeatReady(selected, "p1"), false);
});

test("committing the draft takes exactly three distinct heroes and a default formation", () => {
  const state = draftingRun(["human", "human"]);

  assert.equal(
    refusal(state, commitDraft("p1", ["paladin", "firebrand"], 0)),
    "invalid-pick-count",
  );
  assert.equal(
    refusal(state, commitDraft("p1", ["paladin", "firebrand", "paladin"], 0)),
    "duplicate-hero",
  );
  assert.equal(
    refusal(state, commitDraft("p1", ["paladin", "firebrand", "ghost"], 0)),
    "unknown-hero",
  );

  const committed = accepted(state, commitDraft("p1", TEAM, 0));
  const view = getPlayerView(committed, "p1");

  assert.deepEqual(view.you.heroIds, TEAM);
  assert.deepEqual(view.you.formation, defaultFormation(TEAM));
  assert.equal(view.you.ready, true);
  assert.equal(refusal(committed, commitDraft("p1", TEAM, 1)), "already-decided");
});

test("two seats may draft the same heroes", () => {
  const preparing = bothDrafted();

  assert.equal(preparing.phase, "preparing");
  assert.deepEqual(preparing.players["p1"]?.heroIds, TEAM);
  assert.deepEqual(preparing.players["p2"]?.heroIds, TEAM);
});

test("commands are refused for the wrong phase, player or revision", () => {
  const state = draftingRun(["human", "human"]);

  assert.equal(
    refusal(state, { kind: "confirm-ready", playerId: "p1", expectedRevision: 0 }),
    "wrong-phase",
  );
  assert.equal(refusal(state, commitDraft("ghost", TEAM, 0)), "unknown-player");
  assert.equal(refusal(state, commitDraft("p1", TEAM, 3)), "stale-revision");
});

test("heroes can be placed on any free cell of their own half before confirming", () => {
  const state = bothDrafted();

  const stacked = [
    { column: 0, row: 0 },
    { column: 0, row: 0 },
    { column: 1, row: 0 },
  ];

  const offBoard = [
    { column: 0, row: 0 },
    { column: 1, row: 0 },
    { column: 0, row: 4 },
  ];

  const spread = [
    { column: 0, row: 3 },
    { column: 7, row: 3 },
    { column: 3, row: 0 },
  ];

  assert.equal(refusal(state, placeHeroes(stacked, 1)), "invalid-formation");
  assert.equal(refusal(state, placeHeroes(offBoard, 1)), "invalid-formation");
  assert.equal(refusal(state, placeHeroes(spread.slice(0, 2), 1)), "invalid-formation");

  const placed = accepted(state, placeHeroes(spread, 1));

  assert.deepEqual(placed.players["p1"]?.formation, spread);
  assert.equal(isSeatReady(placed, "p1"), false);

  const confirmed = accepted(placed, {
    kind: "confirm-ready",
    playerId: "p1",
    expectedRevision: 1,
  });

  assert.equal(isSeatReady(confirmed, "p1"), true);
  assert.equal(refusal(confirmed, placeHeroes(spread, 2)), "already-decided");
});
