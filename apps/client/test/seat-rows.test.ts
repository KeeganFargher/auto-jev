import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  battleStatus,
  opponentOf,
  outcomeFor,
  outcomeTag,
  pairingOf,
  seatColor,
  secondsUntil,
} from "../src/features/match/model/match-model.js";
import { placementHeader } from "../src/features/match/model/battle-header.js";
import { planningRows, watchRows } from "../src/features/match/model/seat-rows.js";
import {
  FOURTH,
  ME,
  RIVAL,
  THIRD,
  battleBetween,
  lobbyOf,
  resolvedRound,
  seatOf,
  viewOf,
} from "./match-fixtures.js";

test("planning rows tag the local player, the opponent, and who is out, away or thinking", () => {
  const players = [
    seatOf(ME),
    seatOf(RIVAL),
    seatOf(THIRD, { eliminated: true }),
    seatOf(FOURTH),
    seatOf("p5"),
    seatOf("p6"),
  ];

  const lobby = lobbyOf(ME, [
    {},
    {},
    {},
    { connected: false },
    { controller: "bot", thinking: true },
    { controller: "bot" },
  ]);

  const rows = planningRows(viewOf("draft", { players }), lobby, RIVAL);

  assert.deepEqual(
    rows.map((row) => row.tag),
    ["You", "VS", "Out", "Away", "Thinking", null],
  );
  assert.equal(rows[1]?.isOpponent, true);
  assert.equal(rows[0]?.isYou, true);
  assert.equal(
    rows.every((row) => !row.watchable && !row.isFocused),
    true,
  );
});

test("a bot that is disconnected is not reported as away", () => {
  const lobby = lobbyOf(ME, [{}, { controller: "bot", connected: false }]);
  const rows = planningRows(viewOf("draft", { players: [seatOf(ME), seatOf(RIVAL)] }), lobby, null);

  assert.equal(rows[1]?.tag, null);
});

test("planning rows work without a lobby", () => {
  const rows = planningRows(viewOf("draft"), null, null);

  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.tag, "You");
});

test("watch rows show live fights, finished fights, byes and sit-outs", () => {
  const players = [
    seatOf(ME, { runHealth: 10 }),
    seatOf(RIVAL, { runHealth: 12 }),
    seatOf(THIRD),
    seatOf(FOURTH, { eliminated: true }),
  ];

  const battles = [battleBetween("b1", ME, RIVAL, ME)];
  const round = resolvedRound(0, battles, players, THIRD);

  const health = new Map([
    [ME, 13],
    [RIVAL, 13],
  ]);

  const live = watchRows({
    resolved: round,
    meId: ME,
    focusedBattleId: "b1",
    healthBeforeRound: health,
    hasEnded: () => false,
  });

  assert.equal(live[0]?.tag, "Live");
  assert.equal(live[0]?.tone, "live");
  assert.equal(live[0]?.health, 13);
  assert.equal(live[0]?.isFocused, true);
  assert.equal(live[0]?.watchable, true);
  assert.equal(live[2]?.tag, "Bye");
  assert.equal(live[3]?.tag, "Out");

  const ended = watchRows({
    resolved: round,
    meId: ME,
    focusedBattleId: "b1",
    healthBeforeRound: health,
    hasEnded: () => true,
  });

  assert.equal(ended[0]?.tag, "Won");
  assert.equal(ended[0]?.tone, "won");
  assert.equal(ended[0]?.health, 10);
  assert.equal(ended[1]?.tag, "Lost");
  assert.equal(ended[1]?.tone, "lost");
});

test("pairings and opponents are found from either side, and strangers are a loud error", () => {
  const battle = battleBetween("b1", ME, RIVAL, ME);

  assert.equal(opponentOf(battle, ME), RIVAL);
  assert.equal(opponentOf(battle, RIVAL), ME);
  assert.throws(() => opponentOf(battle, THIRD), /is not in b1/);
  assert.equal(pairingOf([battle], RIVAL), battle);
  assert.equal(pairingOf([battle], THIRD), null);
});

test("outcomes read from the player's side", () => {
  const win = battleBetween("b1", ME, RIVAL, ME).result;
  const draw = battleBetween("b1", ME, RIVAL, null).result;

  assert.equal(outcomeFor(win, ME), "won");
  assert.equal(outcomeFor(win, RIVAL), "lost");
  assert.equal(outcomeFor(draw, ME), "neutral");
  assert.equal(outcomeTag(win, ME), "Won");
  assert.equal(outcomeTag(win, RIVAL), "Lost");
  assert.equal(outcomeTag(draw, ME), "Draw");
});

test("battle status reads fighting until it ends, then the outcome", () => {
  const view = viewOf("preparing");
  const won = battleBetween("b1", ME, RIVAL, ME);
  const drawn = battleBetween("b1", ME, RIVAL, null);

  assert.equal(battleStatus(view.players, won, false), "Fighting");
  assert.equal(battleStatus(view.players, won, true), "Name p1 won");
  assert.equal(battleStatus(view.players, drawn, true), "Time's up · draw");
});

test("seat colours follow seat order and unknown players are a loud error", () => {
  const view = viewOf("lobby");

  assert.equal(seatColor(view.players, ME), "var(--color-seat-1)");
  assert.equal(seatColor(view.players, FOURTH), "var(--color-seat-4)");
  assert.throws(() => seatColor(view.players, "ghost"), /no seat for player "ghost"/);
});

test("the placement header shows the matchup and changes its hint once ready", () => {
  const waiting = placementHeader(viewOf("preparing"), RIVAL);
  assert.equal(waiting.friendly.name, "Name p1");
  assert.equal(waiting.enemy.name, "Name p2");
  assert.equal(waiting.status, "Drag heroes to place them");

  const ready = placementHeader(viewOf("preparing", { ready: true }), RIVAL);
  assert.equal(ready.status, "Ready · waiting for the others");
});

test("the seconds until a deadline never drop below one", () => {
  assert.equal(secondsUntil(10_500, 10_000), 1);
  assert.equal(secondsUntil(13_200, 10_000), 4);
  assert.equal(secondsUntil(9_000, 10_000), 1);
});
