import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { StageStats } from "../src/game/views/board-stage.js";
import {
  LEAK_ROUNDS,
  leakGrowth,
  runLeakTest,
  summarizeLeakTest,
  type LeakTestHost,
} from "../src/features/environment-lab/leak-test.js";

interface FakeRun {
  host: LeakTestHost<string>;
  shown: string[];
  reports: string[];
  statsReads: () => number;
}

function stageStats(geometries: number, textures: number): StageStats {
  return { drawCalls: 0, triangles: 0, geometries, textures, shaders: 0 };
}

function fakeRun(readings: readonly StageStats[], isActive: (shown: number) => boolean): FakeRun {
  const shown: string[] = [];
  const reports: string[] = [];
  let reads = 0;

  const host: LeakTestHost<string> = {
    onFrame(listener) {
      let active = true;

      function tick(): void {
        if (!active) {
          return;
        }

        listener(0.016);
        setImmediate(tick);
      }

      setImmediate(tick);

      return () => {
        active = false;
      };
    },

    stats() {
      const reading = readings[reads];

      if (reading === undefined) {
        throw new Error(`The test only expected ${readings.length} stats reads`);
      }

      reads += 1;

      return reading;
    },

    show(theme) {
      shown.push(theme);
    },

    isActive() {
      return isActive(shown.length);
    },

    report(text) {
      reports.push(text);
    },
  };

  return { host, shown, reports, statsReads: () => reads };
}

test("growth adds up geometries and textures and goes negative when memory is freed", () => {
  assert.equal(leakGrowth({ geometries: 10, textures: 4 }, { geometries: 12, textures: 5 }), 3);
  assert.equal(leakGrowth({ geometries: 10, textures: 4 }, { geometries: 10, textures: 4 }), 0);
  assert.equal(leakGrowth({ geometries: 10, textures: 4 }, { geometries: 8, textures: 4 }), -2);
});

test("the summary reports the switch count, both counters and a verdict", () => {
  assert.equal(
    summarizeLeakTest(16, { geometries: 40, textures: 12 }, { geometries: 40, textures: 12 }),
    "16 switches · geometries 40 → 40 · textures 12 → 12 · no leak",
  );

  assert.equal(
    summarizeLeakTest(16, { geometries: 40, textures: 12 }, { geometries: 44, textures: 12 }),
    "16 switches · geometries 40 → 44 · textures 12 → 12 · leaking",
  );
});

test("the test tours every theme, returns home each time and reads memory once before and once after", async () => {
  const run = fakeRun([stageStats(40, 12), stageStats(40, 12)], () => true);

  await runLeakTest(run.host, ["cove", "ruins"], "ruins");

  const tour = ["cove", "ruins", "ruins"];
  assert.deepEqual(run.shown, [...tour, ...Array.from({ length: LEAK_ROUNDS }, () => tour).flat()]);
  assert.equal(run.statsReads(), 2);

  assert.deepEqual(run.reports, [
    "Switching themes…",
    `${LEAK_ROUNDS * 2} switches · geometries 40 → 40 · textures 12 → 12 · no leak`,
  ]);
});

test("the test flags growth between the reading after warm-up and the final reading", async () => {
  const run = fakeRun([stageStats(40, 12), stageStats(46, 12)], () => true);

  await runLeakTest(run.host, ["cove"], "cove");

  assert.equal(
    run.reports.at(-1),
    `${LEAK_ROUNDS} switches · geometries 40 → 46 · textures 12 → 12 · leaking`,
  );
});

test("the test stops quietly without a verdict once the screen goes away", async () => {
  const run = fakeRun([], (shown) => shown < 1);

  await runLeakTest(run.host, ["cove", "ruins"], "ruins");

  assert.deepEqual(run.shown, ["cove"]);
  assert.equal(run.statsReads(), 0);
  assert.deepEqual(run.reports, ["Switching themes…"]);
});

test("the test also stops when the screen goes away while the final theme settles", async () => {
  const run = fakeRun([], (shown) => shown < 2);

  await runLeakTest(run.host, ["cove"], "cove");

  assert.deepEqual(run.shown, ["cove", "cove"]);
  assert.equal(run.statsReads(), 0);
  assert.deepEqual(run.reports, ["Switching themes…"]);
});

test("a test with no themes fails loudly instead of reporting a meaningless pass", async () => {
  const run = fakeRun([], () => true);

  await assert.rejects(() => runLeakTest(run.host, [], "cove"), /at least one theme/);
});
