import { strict as assert } from "node:assert";
import { test } from "node:test";
import { centreOutColumns, defaultFormation, heroRole } from "../src/index.js";

test("columns fill from the centre outwards", () => {
  assert.deepEqual(centreOutColumns(8), [3, 4, 2, 5, 1, 6, 0, 7]);
  assert.deepEqual(centreOutColumns(5), [2, 3, 1, 4, 0]);
  assert.deepEqual(centreOutColumns(1), [0]);
});

test("each role takes its own row: front, middle or back", () => {
  assert.equal(heroRole("paladin"), "frontline");
  assert.equal(heroRole("harpooner"), "midline");
  assert.equal(heroRole("bubble-cleric"), "backline");

  assert.deepEqual(
    defaultFormation(["paladin", "berserker", "harpooner", "firebrand", "bubble-cleric"]),
    [
      { column: 3, row: 0 },
      { column: 4, row: 0 },
      { column: 3, row: 1 },
      { column: 3, row: 3 },
      { column: 4, row: 3 },
    ],
  );
});

test("a crowded role spills into the next best row", () => {
  const harpooners = Array.from({ length: 9 }, () => "harpooner");

  assert.deepEqual(
    defaultFormation(harpooners).map((cell) => cell.row),
    [1, 1, 1, 1, 1, 1, 1, 1, 2],
  );
});

test("a team too big for its half is refused", () => {
  const dummies = Array.from({ length: 33 }, () => "training-dummy");

  assert.throws(() => defaultFormation(dummies), /No free cell left for hero "training-dummy"/);
  assert.throws(() => heroRole("ghost"), /ghost/);
});
