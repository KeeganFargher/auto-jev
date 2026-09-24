import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createFrameSampler } from "../src/game/views/frame-sampler.js";

test("the sampler averages the last frames and remembers the worst one", () => {
  const sampler = createFrameSampler(3, 0);

  for (const now of [10, 20, 60, 70]) {
    sampler.record(now);
  }

  assert.equal(sampler.averageMs(), 20);
  assert.equal(sampler.worstMs(), 40);
});

test("a sampler with no frames yet reads zero rather than dividing by nothing", () => {
  const sampler = createFrameSampler(3, 0);

  assert.equal(sampler.averageMs(), 0);
  assert.equal(sampler.worstMs(), 0);
});
