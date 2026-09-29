import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LAB_PRESETS } from "../src/index.js";
import { GOLDEN_DIGESTS } from "./golden-digests.js";
import { GOLDEN_SEEDS, presetDigest } from "./golden.js";

test("every lab preset has a golden digest for every golden seed", () => {
  const recorded = GOLDEN_DIGESTS.map((entry) => `${entry.presetId}#${entry.seed}`);

  const expected = LAB_PRESETS.flatMap((preset) =>
    GOLDEN_SEEDS.map((seed) => `${preset.id}#${seed}`),
  );

  assert.deepEqual(recorded, expected);
});

for (const entry of GOLDEN_DIGESTS) {
  test(`${entry.presetId} seed ${entry.seed} replays its golden events`, () => {
    assert.equal(presetDigest(entry.presetId, entry.seed), entry.digest);
  });
}
