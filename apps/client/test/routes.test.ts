import { strict as assert } from "node:assert";
import { test } from "node:test";
import { environmentHash, joinHash, parseRoute } from "../src/app/routes.js";

test("an empty or unknown hash lands on the battle lab", () => {
  assert.deepEqual(parseRoute(""), { kind: "lab" });
  assert.deepEqual(parseRoute("#lab"), { kind: "lab" });
  assert.deepEqual(parseRoute("#nowhere"), { kind: "lab" });
});

test("the match hash opens the menu, and a join hash carries its room", () => {
  assert.deepEqual(parseRoute("#match"), { kind: "match", joinRoomId: null });
  assert.deepEqual(parseRoute("#join/room-7"), { kind: "match", joinRoomId: "room-7" });
});

test("a join link without a room is a loud error", () => {
  assert.throws(() => parseRoute("#join/"), /missing a room id/);
});

test("the environment hash optionally names a theme", () => {
  assert.deepEqual(parseRoute("#env"), { kind: "environment", themeId: null });
  assert.deepEqual(parseRoute("#env/"), { kind: "environment", themeId: null });
  assert.deepEqual(parseRoute("#env/forest"), { kind: "environment", themeId: "forest" });
});

test("built hashes parse back to the same route", () => {
  assert.deepEqual(parseRoute(joinHash("abc")), { kind: "match", joinRoomId: "abc" });
  assert.deepEqual(parseRoute(environmentHash("dusk")), { kind: "environment", themeId: "dusk" });
});
