import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCustomLabSetup, gameCatalogue } from "@jev-game/content";
import { createBattle, getBattleSnapshot, type BattleSnapshot } from "@jev-game/game";
import { readUnit, sameReadout, unitIn } from "../src/ui/hero/unit-readout.js";

function openingSnapshot(): BattleSnapshot {
  const setup = createCustomLabSetup(1, ["paladin"], ["training-dummy"]);

  return getBattleSnapshot(createBattle(setup, gameCatalogue));
}

test("a readout labels the unit friendly or enemy by team", () => {
  const snapshot = openingSnapshot();
  const friendly = readUnit(snapshot, unitIn(snapshot, "A-1"), "A");
  const enemy = readUnit(snapshot, unitIn(snapshot, "B-1"), "A");

  assert.equal(friendly.team, "friendly");
  assert.equal(friendly.heroId, "paladin");
  assert.equal(friendly.alive, true);
  assert.equal(friendly.hp, friendly.maxHp);
  assert.deepEqual(friendly.statuses, []);
  assert.equal(enemy.team, "enemy");
});

test("looking up a unit that is not in the snapshot is an error", () => {
  assert.throws(() => unitIn(openingSnapshot(), "Z-9"), /has no unit Z-9/);
});

test("readouts compare equal only when every visible field matches", () => {
  const snapshot = openingSnapshot();
  const readout = readUnit(snapshot, unitIn(snapshot, "A-1"), "A");
  const same = readUnit(snapshot, unitIn(snapshot, "A-1"), "A");

  assert.equal(sameReadout(readout, same), true);
  assert.equal(sameReadout(readout, { ...readout, hp: readout.hp - 1 }), false);
  assert.equal(sameReadout(readout, { ...readout, damageDealt: readout.damageDealt + 1 }), false);
  assert.equal(
    sameReadout(readout, { ...readout, statuses: [{ status: "burning", seconds: "1.0s" }] }),
    false,
  );
});

test("a missing readout only equals another missing readout", () => {
  const snapshot = openingSnapshot();
  const readout = readUnit(snapshot, unitIn(snapshot, "A-1"), "A");

  assert.equal(sameReadout(null, null), true);
  assert.equal(sameReadout(null, readout), false);
  assert.equal(sameReadout(readout, null), false);
});
