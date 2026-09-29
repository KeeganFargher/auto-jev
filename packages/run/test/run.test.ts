import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runBattle } from "@jev-game/game";
import { battleDigest, gameCatalogue } from "@jev-game/content";
import {
  DEFAULT_RUN_RULES,
  ROUND_END_PAUSE_SECONDS,
  TELEPORT_SECONDS,
  advanceIfReady,
  createRun,
  forfeitSeat,
  getPlayerView,
  isSeatReady,
  lossCost,
  pumpRun,
  roundHoldSeconds,
  runBotCommands,
  runFallbackCommands,
  survivorCount,
  type RoundState,
  type RunState,
} from "../src/index.js";
import { accepted, botRun, playOut, seats } from "./helpers.js";

function roundsOf(state: RunState): RoundState[] {
  const rounds: RoundState[] = [];
  let current = pumpRun(state);

  for (let step = 0; step < 400 && current.phase !== "finished"; step += 1) {
    current = advanceIfReady(runBotCommands(current));

    if (current.phase === "round-result" || current.phase === "finished") {
      assert.ok(current.currentRound !== null);
      rounds.push(current.currentRound);
    }
  }

  assert.equal(current.phase, "finished");

  return rounds;
}

test("eight bots play a whole run to a finish without anyone at the table", () => {
  const finished = playOut(botRun(7, 8));
  const winners = finished.winnerPlayerIds;

  assert.ok(winners !== null && winners.length > 0);
  assert.ok(finished.currentRound !== null);
  assert.ok(finished.currentRound.round < DEFAULT_RUN_RULES.roundCap);

  for (const playerId of winners) {
    assert.equal(finished.players[playerId]?.eliminated, false);
  }

  for (const seat of Object.values(finished.players)) {
    assert.equal(seat.heroIds.length, DEFAULT_RUN_RULES.draftPicks);
    assert.equal(new Set(seat.heroIds).size, seat.heroIds.length);
    assert.ok(seat.runHealth >= 0);
  }
});

test("the same seed plays the same run and another seed plays a different one", () => {
  const first = JSON.stringify(playOut(botRun(21, 8)));

  assert.equal(JSON.stringify(playOut(botRun(21, 8))), first);
  assert.notEqual(JSON.stringify(playOut(botRun(22, 8))), first);
});

test("every battle carries a digest the client can check by replaying the setup", () => {
  const rounds = roundsOf(botRun(3, 4));

  assert.ok(rounds.length > 0);

  for (const round of rounds) {
    assert.equal(round.battles.length, round.pairings.length);

    for (const battle of round.battles) {
      const replay = runBattle(battle.setup, gameCatalogue);

      assert.match(battle.digest, /^[0-9a-f]{64}$/);
      assert.equal(battleDigest(replay.events), battle.digest);
      assert.deepEqual(replay.result, battle.result);
      assert.equal(replay.timeline.totalSeconds, battle.presentationSeconds);
    }
  }
});

test("a loss costs one plus the winner's survivors, up to the cap", () => {
  assert.equal(lossCost(DEFAULT_RUN_RULES, 1), 2);
  assert.equal(lossCost(DEFAULT_RUN_RULES, 2), 3);
  assert.equal(lossCost(DEFAULT_RUN_RULES, 3), 3);

  let state = pumpRun(botRun(5, 2));

  while (state.phase !== "round-result" && state.phase !== "finished") {
    state = advanceIfReady(runBotCommands(state));
  }

  const round = state.currentRound;
  assert.ok(round !== null);

  for (const battle of round.battles) {
    const result = battle.result;

    if (result.kind !== "win") {
      assert.equal(battle.winnerSurvivors, null);
      continue;
    }

    const loserId =
      result.winningTeamId === battle.teamAPlayerId ? battle.teamBPlayerId : battle.teamAPlayerId;

    const replay = runBattle(battle.setup, gameCatalogue);
    const survivors = survivorCount(battle.setup, replay.events, result.winningTeamId);

    assert.equal(battle.winnerSurvivors, survivors);
    assert.equal(
      state.players[loserId]?.runHealth,
      DEFAULT_RUN_RULES.startingHealth - lossCost(DEFAULT_RUN_RULES, survivors),
    );
  }
});

test("the round-result hold covers the teleport, the longest playback and the pause", () => {
  const [round] = roundsOf(botRun(9, 4));
  assert.ok(round !== undefined);

  const longest = Math.max(...round.battles.map((battle) => battle.presentationSeconds));

  assert.ok(longest > 0);
  assert.equal(roundHoldSeconds(round), TELEPORT_SECONDS + longest + ROUND_END_PAUSE_SECONDS);
});

test("losers drop out when their health runs out", () => {
  const finished = playOut(botRun(13, 4, { ...DEFAULT_RUN_RULES, startingHealth: 1 }));
  const eliminated = Object.values(finished.players).filter((seat) => seat.eliminated);

  assert.ok(eliminated.length > 0);

  for (const seat of eliminated) {
    assert.equal(seat.runHealth, 0);
  }
});

test("the run waits for a human and the deadline fallback decides for them", () => {
  const state = pumpRun(
    runBotCommands(advanceIfReady(createRun("waits", 4, seats(["human", "random-bot"])))),
  );

  assert.equal(state.phase, "draft");
  assert.equal(isSeatReady(state, "p1"), false);
  assert.equal(isSeatReady(state, "p2"), true);

  const selected = accepted(state, {
    kind: "select-heroes",
    playerId: "p1",
    heroIds: ["harpooner"],
    expectedRevision: 0,
  });

  const drafted = pumpRun(runFallbackCommands(selected, ["p1"]));
  const heroIds = drafted.players["p1"]?.heroIds ?? [];

  assert.equal(drafted.phase, "preparing");
  assert.equal(heroIds[0], "harpooner");
  assert.equal(heroIds.length, DEFAULT_RUN_RULES.draftPicks);

  const waiting = pumpRun(runBotCommands(drafted));

  assert.equal(waiting.phase, "preparing");

  const fought = pumpRun(runFallbackCommands(waiting, ["p1"]));

  assert.notEqual(fought.phaseEpoch, waiting.phaseEpoch);
  assert.ok(fought.currentRound !== null && fought.currentRound.round >= 1);
});

test("a human who leaves is played by the fallback and knocked out after the round", () => {
  const drafting = advanceIfReady(
    createRun("leaver", 8, seats(["human", "random-bot", "random-bot"])),
  );

  const left = forfeitSeat(drafting, "p1");

  assert.equal(forfeitSeat(left, "p1"), left);

  let state = pumpRun(runBotCommands(left));

  assert.equal(state.players["p1"]?.heroIds.length, DEFAULT_RUN_RULES.draftPicks);

  while (state.phase === "preparing") {
    state = advanceIfReady(runBotCommands(state));
  }

  assert.equal(state.players["p1"]?.eliminated, true);
  assert.equal(state.players["p1"]?.runHealth, 0);
  assert.equal(getPlayerView(state, "p1").you.eliminated, true);
});

test("unknown players are a programming error, not a quiet no-op", () => {
  const state = botRun(1, 2);

  assert.throws(() => getPlayerView(state, "ghost"), /no player "ghost"/);
  assert.throws(() => forfeitSeat(state, "ghost"), /no player "ghost"/);
  assert.throws(() => isSeatReady(state, "ghost"), /no player "ghost"/);
});
