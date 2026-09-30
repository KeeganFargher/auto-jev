import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runBattle } from "@jev-game/game";
import {
  LAB_PRESETS,
  MAX_LAB_TEAM_SIZE,
  boardArena,
  createCustomLabSetup,
  gameCatalogue,
  labPreset,
} from "../src/index.js";

test("a custom lab fight puts team A in the south half and team B in the north", () => {
  const setup = createCustomLabSetup(3, ["paladin", "firebrand"], ["berserker"]);

  assert.deepEqual(
    setup.units.map((unit) => [unit.unitId, unit.teamId, unit.heroId]),
    [
      ["A-1", "A", "paladin"],
      ["A-2", "A", "firebrand"],
      ["B-1", "B", "berserker"],
    ],
  );
  assert.equal(setup.seed, 3);
  assert.equal(setup.arenaId, boardArena.id);

  for (const unit of setup.units) {
    const south = unit.spawn.y > boardArena.height / 2;
    assert.equal(south, unit.teamId === "A", `${unit.unitId} spawned on the wrong half`);
  }
});

test("a custom lab fight needs one to five heroes a side", () => {
  const full = Array.from({ length: MAX_LAB_TEAM_SIZE }, () => "training-dummy");

  createCustomLabSetup(1, full, full);
  assert.throws(() => createCustomLabSetup(1, [], ["paladin"]), /1 to 5 heroes on each side/);
  assert.throws(
    () => createCustomLabSetup(1, ["paladin"], [...full, "paladin"]),
    /1 to 5 heroes on each side/,
  );
});

test("lab presets have unique ids and are found by id", () => {
  const ids = LAB_PRESETS.map((preset) => preset.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(labPreset("reel-in").name, "Reel in");
  assert.throws(() => labPreset("nope"), /Unknown lab preset "nope"/);
});

test("every lab preset plays out to a result", () => {
  for (const preset of LAB_PRESETS) {
    const outcome = runBattle(createCustomLabSetup(1, preset.teamA, preset.teamB), gameCatalogue);

    assert.ok(outcome.result.endedAtTick > 0, `${preset.id} ended at once`);
  }
});

test("gather, freeze, smash lands the whole chain on nearly every seed", () => {
  const preset = labPreset("gather-freeze-smash");
  const seeds = Array.from({ length: 30 }, (_, index) => index + 1);
  let shattered = 0;
  let linked = 0;

  for (const seed of seeds) {
    const outcome = runBattle(createCustomLabSetup(seed, preset.teamA, preset.teamB), gameCatalogue);
    shattered += outcome.events.some((event) => event.kind === "shatter") ? 1 : 0;
    linked += outcome.events.some(
      (event) =>
        event.kind === "combo-link" &&
        event.state === "downed" &&
        event.setupUnitId === "A-1" &&
        event.payoffUnitId === "A-2",
    )
      ? 1
      : 0;
  }

  assert.ok(shattered >= 27, `the hammer shattered a freeze on only ${shattered} of 30 seeds`);
  assert.ok(linked >= 27, `Mags set up Burr on only ${linked} of 30 seeds`);
});
