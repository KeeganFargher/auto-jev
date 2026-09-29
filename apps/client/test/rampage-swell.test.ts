import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { RampageState } from "@jev-game/game";
import { GROW_STEPS, growStepsTaken, rampageSwell } from "../src/game/views/rampage-swell.js";

const RAMPAGE: RampageState = {
  startTick: 100,
  growEndTick: 115,
  shrinkStartTick: 265,
  endTick: 280,
  nextGrabTick: 115,
};

const FULL_SIZE = 3;

function stepTick(index: number): number {
  const step = GROW_STEPS[index];
  assert.ok(step !== undefined, `there is no grow step ${index}`);

  return RAMPAGE.startTick + step.at * (RAMPAGE.growEndTick - RAMPAGE.startTick);
}

function swelled(from: number, to: number): number {
  return rampageSwell(RAMPAGE, FULL_SIZE, to) - rampageSwell(RAMPAGE, FULL_SIZE, from);
}

function near(actual: number, expected: number, label: string, tolerance: number): void {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${label}: ${actual} is not within ${tolerance} of ${expected}`,
  );
}

test("the grow steps heave bigger and bigger and the last lands as the rampage is fully grown", () => {
  const last = GROW_STEPS[GROW_STEPS.length - 1];

  assert.equal(GROW_STEPS.length, 5);
  assert.deepEqual(last, { at: 1, growth: 1 });

  for (let index = 1; index < GROW_STEPS.length; index += 1) {
    const earlier = GROW_STEPS[index - 1];
    const step = GROW_STEPS[index];
    assert.ok(earlier !== undefined && step !== undefined);
    assert.ok(step.at > earlier.at && step.growth > earlier.growth, `step ${index} shrinks`);
  }
});

test("a rampage takes each grow step on its tick", () => {
  assert.equal(growStepsTaken(RAMPAGE, RAMPAGE.startTick), 0);

  for (let index = 0; index < GROW_STEPS.length; index += 1) {
    assert.equal(growStepsTaken(RAMPAGE, stepTick(index) - 0.01), index);
    assert.equal(growStepsTaken(RAMPAGE, stepTick(index)), index + 1);
  }

  assert.equal(growStepsTaken(RAMPAGE, RAMPAGE.growEndTick), GROW_STEPS.length);
  assert.equal(growStepsTaken(RAMPAGE, RAMPAGE.endTick), GROW_STEPS.length);
});

test("the body stands still until the first heave, then only ever swells while it grows", () => {
  near(rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.startTick), 1, "on the roar", 1e-12);
  near(rampageSwell(RAMPAGE, FULL_SIZE, stepTick(0) - 0.01), 1, "before the first heave", 1e-12);
  let last = 1;

  for (let tick = RAMPAGE.startTick; tick <= RAMPAGE.shrinkStartTick; tick += 0.1) {
    const size = rampageSwell(RAMPAGE, FULL_SIZE, tick);
    assert.ok(size >= last - 1e-12, `the body shrank from ${last} to ${size} at tick ${tick}`);
    assert.ok(size <= FULL_SIZE, `the body grew past full size to ${size} at tick ${tick}`);
    last = size;
  }
});

test("each heave swells the body in a burst that settles before the next", () => {
  for (let index = 1; index < GROW_STEPS.length; index += 1) {
    const heave = stepTick(index);
    const settling = swelled(heave - 0.5, heave);
    const bursting = swelled(heave, heave + 0.5);

    assert.ok(
      bursting > settling * 3,
      `heave ${index} swells ${bursting} against ${settling} just before it`,
    );
  }
});

test("the body reaches full size just after it is fully grown and holds it until the shrink", () => {
  near(
    rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.growEndTick + 10),
    FULL_SIZE,
    "a third of a second in",
    0.01,
  );
  near(rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.shrinkStartTick), FULL_SIZE, "at the shrink", 1e-9);
});

test("the shrink pops the body back down to its own size well before the rampage ends", () => {
  const popped = rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.shrinkStartTick + 6);

  assert.ok(popped < 1.1, `the body is still ${popped} times its size a fifth of a second in`);
  near(rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.endTick), 1, "at the end", 0.001);
});

test("a rampage refuses to swell to nothing, before it starts, or out of order", () => {
  assert.throws(() => rampageSwell(RAMPAGE, 1, RAMPAGE.growEndTick), /swell past size 1/);
  assert.throws(() => rampageSwell(RAMPAGE, Number.NaN, RAMPAGE.growEndTick), /swell past size 1/);
  assert.throws(() => rampageSwell(RAMPAGE, FULL_SIZE, RAMPAGE.startTick - 1), /no size at tick/);
  assert.throws(() => growStepsTaken(RAMPAGE, Number.NaN), /no size at tick/);

  assert.throws(
    () => growStepsTaken({ ...RAMPAGE, growEndTick: RAMPAGE.startTick }, RAMPAGE.startTick),
    /grow before it shrinks/,
  );

  assert.throws(
    () =>
      growStepsTaken({ ...RAMPAGE, shrinkStartTick: RAMPAGE.growEndTick - 1 }, RAMPAGE.startTick),
    /grow before it shrinks/,
  );
});
