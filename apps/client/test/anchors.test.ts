import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createAnchors } from "../src/game/views/anchors.js";

test("a follower is told about every later placement of its key", () => {
  const anchors = createAnchors<number>();
  const seen: number[] = [];

  anchors.follow("a", (payload) => seen.push(payload));
  anchors.place("a", 1);
  anchors.place("b", 9);
  anchors.place("a", 2);

  assert.deepEqual(seen, [1, 2]);
});

test("a late follower is replayed the latest placement immediately", () => {
  const anchors = createAnchors<number>();
  anchors.place("a", 1);
  anchors.place("a", 2);
  const seen: number[] = [];

  anchors.follow("a", (payload) => seen.push(payload));

  assert.deepEqual(seen, [2]);
});

test("a stopped follower hears nothing more", () => {
  const anchors = createAnchors<number>();
  const seen: number[] = [];
  const stop = anchors.follow("a", (payload) => seen.push(payload));

  anchors.place("a", 1);
  stop();
  anchors.place("a", 2);

  assert.deepEqual(seen, [1]);
});

test("releasing or clearing forgets placements so later followers are not replayed", () => {
  const anchors = createAnchors<number>();
  anchors.place("a", 1);
  anchors.place("b", 2);
  anchors.release("a");
  const seen: number[] = [];

  anchors.follow("a", (payload) => seen.push(payload));
  anchors.follow("b", (payload) => seen.push(payload));
  assert.deepEqual(seen, [2]);

  anchors.clear();
  anchors.follow("b", (payload) => seen.push(payload));
  assert.deepEqual(seen, [2]);
});

test("two followers of one key are both told, and stopping one keeps the other", () => {
  const anchors = createAnchors<number>();
  const first: number[] = [];
  const second: number[] = [];
  const stopFirst = anchors.follow("a", (payload) => first.push(payload));
  anchors.follow("a", (payload) => second.push(payload));

  anchors.place("a", 1);
  stopFirst();
  anchors.place("a", 2);

  assert.deepEqual(first, [1]);
  assert.deepEqual(second, [1, 2]);
});
