import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createStore, shallowEqualArrays } from "../src/state/store.js";

test("a store notifies subscribers when the value changes and stays quiet when it does not", () => {
  const store = createStore(1);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.set(1);
  assert.equal(notifications, 0);

  store.set(2);
  assert.equal(notifications, 1);
  assert.equal(store.get(), 2);
});

test("update derives the next value from the current one", () => {
  const store = createStore(10);
  store.update((current) => current + 5);
  assert.equal(store.get(), 15);
});

test("a custom equality decides whether a set is a change", () => {
  const store = createStore<readonly number[]>([1, 2], shallowEqualArrays);
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.set([1, 2]);
  assert.equal(notifications, 0);

  store.set([1, 2, 3]);
  assert.equal(notifications, 1);
});

test("unsubscribing stops further notifications", () => {
  const store = createStore("a");
  let notifications = 0;

  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.set("b");
  unsubscribe();
  store.set("c");
  assert.equal(notifications, 1);
});

test("a listener that unsubscribes mid-notification does not starve its neighbours", () => {
  const store = createStore(0);
  const seen: string[] = [];

  const stopFirst = store.subscribe(() => {
    seen.push("first");
    stopFirst();
  });

  store.subscribe(() => {
    seen.push("second");
  });

  store.set(1);
  store.set(2);
  assert.deepEqual(seen, ["first", "second", "second"]);
});

test("shallowEqualArrays compares by length and element identity", () => {
  const shared = { id: 1 };
  assert.equal(shallowEqualArrays([shared], [shared]), true);
  assert.equal(shallowEqualArrays([shared], [{ id: 1 }]), false);
  assert.equal(shallowEqualArrays([1, 2], [1]), false);
  assert.equal(shallowEqualArrays([], []), true);
});
