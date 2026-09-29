import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createAnnouncer } from "../src/features/match/state/announcer.js";
import { ME, RIVAL, THIRD, battleBetween, roundOf, viewOf } from "./match-fixtures.js";

function recorder() {
  const played: string[] = [];

  return {
    played,
    audio: {
      play(id: string): number {
        played.push(id);

        return 0;
      },
    },
  };
}

test("a round is announced once, as a win or a loss, and draws stay silent", () => {
  const { played, audio } = recorder();
  const announcer = createAnnouncer(audio);

  announcer.roundResult(0, battleBetween("b1", ME, RIVAL, ME), ME);
  announcer.roundResult(0, battleBetween("b1", ME, RIVAL, ME), ME);
  announcer.roundResult(1, battleBetween("b2", ME, RIVAL, RIVAL), ME);
  announcer.roundResult(2, battleBetween("b3", ME, RIVAL, null), ME);

  assert.deepEqual(played, ["round-won", "round-lost"]);
});

test("the finish is announced once as elimination or a run win", () => {
  const round = roundOf(3, [battleBetween("b1", ME, RIVAL, ME)]);

  const won = recorder();
  const winning = createAnnouncer(won.audio);
  const victory = viewOf("finished", { currentRound: round, winnerPlayerIds: [ME] });
  winning.finish(victory);
  winning.finish(victory);
  assert.deepEqual(won.played, ["run-won"]);

  const out = recorder();
  createAnnouncer(out.audio).finish(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [RIVAL], eliminated: true }),
  );
  assert.deepEqual(out.played, ["eliminated"]);

  const bystander = recorder();
  createAnnouncer(bystander.audio).finish(
    viewOf("finished", { currentRound: round, winnerPlayerIds: [THIRD] }),
  );
  assert.deepEqual(bystander.played, []);
});

test("resetting lets the same round and the finish be announced again", () => {
  const { played, audio } = recorder();
  const announcer = createAnnouncer(audio);
  const battle = battleBetween("b1", ME, RIVAL, ME);

  announcer.roundResult(0, battle, ME);
  announcer.reset();
  announcer.roundResult(0, battle, ME);

  assert.deepEqual(played, ["round-won", "round-won"]);
});
