import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { StageStats } from "../src/game/views/board-stage.js";
import { createStore } from "../src/state/store.js";
import {
  EMPTY_STATS_READING,
  formatCount,
  formatStatsReading,
} from "../src/features/environment-lab/stats-format.js";
import { createStatsMonitor } from "../src/features/environment-lab/stats-monitor.js";

const STAGE_STATS: StageStats = {
  drawCalls: 12,
  triangles: 34_000,
  geometries: 5,
  textures: 2,
  shaders: 4,
};

test("counts stay exact below ten thousand and round to thousands above it", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(9_999), "9999");
  assert.equal(formatCount(10_000), "10k");
  assert.equal(formatCount(12_499), "12k");
  assert.equal(formatCount(12_500), "13k");
});

test("a reading with no frames yet shows a dash instead of dividing by zero", () => {
  const display = formatStatsReading(EMPTY_STATS_READING);

  assert.equal(display.fps, "–");
  assert.equal(display.frame, "0.0 ms");
  assert.equal(display.worst, "0 ms");
});

test("a live reading formats frame rate, frame time and counters", () => {
  const display = formatStatsReading({
    averageMs: 16.66,
    worstMs: 33.4,
    drawCalls: 240,
    triangles: 152_000,
    geometries: 31,
    textures: 9,
    shaders: 14,
  });

  assert.deepEqual(display, {
    fps: "60",
    frame: "16.7 ms",
    worst: "33 ms",
    drawCalls: "240",
    triangles: "152k",
    geometries: "31",
    textures: "9",
    shaders: "14",
  });
});

test("the monitor samples frames while hidden but only publishes while visible", () => {
  const readings = createStore(EMPTY_STATS_READING);
  let published = 0;
  readings.subscribe(() => {
    published += 1;
  });

  const monitor = createStatsMonitor(readings, () => STAGE_STATS, 0);

  for (let now = 10; now <= 100; now += 10) {
    monitor.frame(now, false);
  }

  assert.equal(published, 0);

  monitor.frame(110, true);

  assert.equal(published, 1);
  assert.deepEqual(readings.get(), {
    averageMs: 10,
    worstMs: 10,
    drawCalls: 12,
    triangles: 34_000,
    geometries: 5,
    textures: 2,
    shaders: 4,
  });
});

test("the monitor refreshes a visible reading every quarter second", () => {
  const readings = createStore(EMPTY_STATS_READING);
  let published = 0;
  readings.subscribe(() => {
    published += 1;
  });

  const monitor = createStatsMonitor(readings, () => STAGE_STATS, 0);

  monitor.frame(10, true);
  assert.equal(published, 1);

  for (let now = 20; now < 260; now += 10) {
    monitor.frame(now, true);
  }

  assert.equal(published, 1);

  monitor.frame(260, true);
  assert.equal(published, 2);
});

test("publishing on demand skips the refresh wait and restarts it", () => {
  const readings = createStore(EMPTY_STATS_READING);
  let published = 0;
  readings.subscribe(() => {
    published += 1;
  });

  const monitor = createStatsMonitor(readings, () => STAGE_STATS, 0);

  monitor.frame(10, true);
  monitor.publish(30);

  assert.equal(published, 2);

  monitor.frame(40, true);
  assert.equal(published, 2);

  monitor.frame(280, true);
  assert.equal(published, 3);
});

test("a hidden monitor never publishes on its own however long it runs", () => {
  const readings = createStore(EMPTY_STATS_READING);
  let published = 0;
  readings.subscribe(() => {
    published += 1;
  });

  const monitor = createStatsMonitor(readings, () => STAGE_STATS, 0);

  for (let now = 100; now <= 1000; now += 100) {
    monitor.frame(now, false);
  }

  assert.equal(published, 0);
});
