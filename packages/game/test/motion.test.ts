import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  GRAVITY_UNITS_PER_SECOND_SQUARED,
  SKID_MAX_UNITS,
  arcHeight,
  flightTicks,
  launchPeak,
  pathPoint,
  planFlightPath,
  skidTravel,
} from "../src/index.js";
import { near } from "./fixtures.js";

function apex(startHeight: number, peak: number): number {
  let highest = 0;

  for (let step = 0; step <= 10000; step += 1) {
    highest = Math.max(highest, arcHeight(startHeight, peak, step / 10000));
  }

  return highest;
}

test("a launch from the floor peaks at exactly its rise", () => {
  near(launchPeak(0, 15), 15);
  assert.ok(Math.abs(apex(0, launchPeak(0, 15)) - 15) < 1e-6);
});

test("a launch from a height rises its full rise above that height", () => {
  for (const [startHeight, rise] of [
    [15, 15],
    [12, 9],
    [30, 3],
  ] as const) {
    const top = apex(startHeight, launchPeak(startHeight, rise));
    assert.ok(
      Math.abs(top - (startHeight + rise)) < 1e-4,
      `apex ${top} for ${startHeight}+${rise}`,
    );
  }
});

test("an arc starts at its start height and ends on the floor", () => {
  assert.equal(arcHeight(12, 20, 0), 12);
  assert.equal(arcHeight(12, 20, 1), 0);
});

test("flight time follows gravity, with a two-tick floor", () => {
  assert.equal(GRAVITY_UNITS_PER_SECOND_SQUARED, 120);
  assert.equal(flightTicks(15), 30);
  assert.equal(flightTicks(60), 60);
  assert.equal(flightTicks(0), 2);
});

test("a flight inside the arena flies straight", () => {
  const path = planFlightPath({ x: 10, y: 10 }, { x: 40, y: 50 }, 80, 80);

  assert.equal(path.bounce, null);
  assert.equal(path.length, 50);
  assert.deepEqual(pathPoint(path, 0.5), { x: 25, y: 30 });
});

test("a flight past a wall bounces off it once and keeps its length", () => {
  const path = planFlightPath({ x: 10, y: 40 }, { x: -10, y: 40 }, 80, 80);

  assert.deepEqual(path.bounce, { x: 0, y: 40 });
  assert.deepEqual(path.to, { x: 10, y: 40 });
  assert.equal(path.length, 20);
  assert.deepEqual(pathPoint(path, 0.25), { x: 5, y: 40 });
  assert.deepEqual(pathPoint(path, 0.5), { x: 0, y: 40 });
  assert.deepEqual(pathPoint(path, 0.75), { x: 5, y: 40 });
});

test("a flight past a corner reflects on both axes", () => {
  const path = planFlightPath({ x: 70, y: 70 }, { x: 90, y: 85 }, 80, 80);

  assert.notEqual(path.bounce, null);
  assert.deepEqual(path.to, { x: 70, y: 75 });
});

test("a flight that would bounce beyond the far wall stops at it", () => {
  const path = planFlightPath({ x: 10, y: 40 }, { x: -100, y: 40 }, 80, 80);

  assert.deepEqual(path.to, { x: 80, y: 40 });
});

test("skids cover a share of the landing speed, capped", () => {
  assert.equal(skidTravel(10), 3);
  assert.equal(skidTravel(100), SKID_MAX_UNITS);
  assert.equal(skidTravel(0), 0);
});
