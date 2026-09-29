import { strict as assert } from "node:assert";
import { mock, test } from "node:test";
import { createCountdown } from "../src/features/match/state/countdown.js";

test("a countdown reports each second, ticks below the start, and expires at zero", () => {
  mock.timers.enable({ apis: ["setInterval"] });

  try {
    const changes: (number | null)[] = [];
    const ticks: number[] = [];
    let expired = 0;

    createCountdown(3, {
      onChange: (remaining) => changes.push(remaining),
      onTick: (remaining) => ticks.push(remaining),
      onExpire: () => {
        expired += 1;
      },
    });

    assert.deepEqual(changes, [3]);

    mock.timers.tick(1000);
    mock.timers.tick(1000);
    assert.deepEqual(changes, [3, 2, 1]);
    assert.deepEqual(ticks, [2, 1]);
    assert.equal(expired, 0);

    mock.timers.tick(1000);
    assert.deepEqual(changes, [3, 2, 1, null]);
    assert.equal(expired, 1);
  } finally {
    mock.timers.reset();
  }
});

test("disposing stops the countdown and clears the display", () => {
  mock.timers.enable({ apis: ["setInterval"] });

  try {
    const changes: (number | null)[] = [];
    let expired = 0;

    const countdown = createCountdown(5, {
      onChange: (remaining) => changes.push(remaining),
      onExpire: () => {
        expired += 1;
      },
    });

    mock.timers.tick(1000);
    countdown.dispose();
    mock.timers.tick(10_000);

    assert.deepEqual(changes, [5, 4, null]);
    assert.equal(expired, 0);
  } finally {
    mock.timers.reset();
  }
});

test("a countdown needs a positive whole number of seconds", () => {
  const handlers = { onChange: () => {} };

  assert.throws(() => createCountdown(0, handlers), /whole number of seconds/);
  assert.throws(() => createCountdown(1.5, handlers), /whole number of seconds/);
  assert.throws(() => createCountdown(-2, handlers), /whole number of seconds/);
});
