import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCustomLabSetup, gameCatalogue, LAB_PRESETS } from "@jev-game/content";
import { createBattle, getBattleSnapshot, type DeathEvent } from "@jev-game/game";
import { FEED_LIMIT, appendFeed } from "../src/features/battle-lab/lab-hud.js";
import { parseSeed, presetFor, teamsOfPreset } from "../src/features/battle-lab/lab-fights.js";
import {
  describePace,
  describeResult,
  formatLabStatus,
  labPlayRate,
} from "../src/features/battle-lab/lab-status.js";
import { createLabSession, recordLabFight } from "../src/session/lab-session.js";

function death(sequence: number): DeathEvent {
  return { kind: "death", tick: sequence, sequence, unitId: `B-${sequence}`, killerUnitId: "A-1" };
}

test("the feed lists the newest event first and numbers entries from the given id", () => {
  const feed = appendFeed([], [death(1), death(2)], 10);

  assert.deepEqual(
    feed.map((entry) => entry.id),
    [11, 10],
  );
  assert.equal(feed[0]?.text, "B-2 died to A-1");
});

test("older entries stay behind fresh ones and the feed is capped", () => {
  const first = appendFeed([], [death(1)], 0);
  const second = appendFeed(first, [death(2)], 1);

  assert.deepEqual(
    second.map((entry) => entry.id),
    [1, 0],
  );

  const burst = Array.from({ length: FEED_LIMIT + 5 }, (_, index) => death(index));
  assert.equal(appendFeed(second, burst, 2).length, FEED_LIMIT);
});

test("seeds must be whole numbers", () => {
  assert.equal(parseSeed("42"), 42);
  assert.equal(parseSeed(" 7 "), 7);
  assert.equal(parseSeed("-3"), -3);
  assert.throws(() => parseSeed(""), /seed must be an integer/);
  assert.throws(() => parseSeed("   "), /seed must be an integer/);
  assert.throws(() => parseSeed("1.5"), /seed must be an integer/);
  assert.throws(() => parseSeed("abc"), /seed must be an integer/);
});

test("a preset is recognised by its exact teams and custom teams match none", () => {
  const preset = LAB_PRESETS[0];

  if (preset === undefined) {
    throw new Error("The content package has no lab presets");
  }

  assert.equal(presetFor(teamsOfPreset(preset.id)), preset);
  assert.equal(presetFor({ a: [], b: [] }), null);
});

test("the lab status line reports the fight, the tick and the pace", () => {
  const state = createBattle(
    createCustomLabSetup(9, ["paladin"], ["training-dummy"]),
    gameCatalogue,
  );

  const snapshot = getBattleSnapshot(state);

  assert.equal(
    formatLabStatus("duel", 9, snapshot, 1),
    `duel · seed 9 · tick 0/${snapshot.tickLimit} · fighting`,
  );
  assert.ok(formatLabStatus("duel", 9, snapshot, 0.5).endsWith(" · slow-mo 0.5×"));
  assert.ok(formatLabStatus("duel", 9, snapshot, 0).endsWith(" · hit-stop"));
});

test("results and pace read as short phrases", () => {
  assert.equal(describeResult(null), "fighting");
  assert.equal(
    describeResult({ kind: "win", winningTeamId: "A", endedAtTick: 4, damageDealt: {} }),
    "team A wins",
  );
  assert.equal(
    describeResult({ kind: "draw", reason: "timeout", endedAtTick: 4, damageDealt: {} }),
    "draw · timeout",
  );
  assert.equal(describePace(1), "");
  assert.equal(describePace(2), "");
});

test("the lab play rate is zero when paused, the speed when running and one once finished", () => {
  const fight = { seed: 3, teams: teamsOfPreset("comet") };
  const session = createLabSession(fight, recordLabFight(fight));

  assert.equal(labPlayRate(session.getView()), 0);

  session.setSpeed(2);
  session.play();
  assert.equal(labPlayRate(session.getView()), 2);

  session.pause();
  assert.equal(labPlayRate(session.getView()), 0);
});

test("lab session controls keep their identity until something changes", () => {
  const fight = { seed: 3, teams: teamsOfPreset("comet") };
  const session = createLabSession(fight, recordLabFight(fight));
  const before = session.controls();
  assert.equal(session.controls(), before);

  let notifications = 0;
  session.subscribe(() => {
    notifications += 1;
  });

  session.play();
  const running = session.controls();
  assert.notEqual(running, before);
  assert.equal(running.isRunning, true);
  assert.equal(session.controls(), running);
  assert.equal(notifications, 1);

  assert.throws(() => session.setSpeed(0), /Invalid lab speed/);
});
