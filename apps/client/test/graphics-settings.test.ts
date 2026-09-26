import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEFAULT_GRAPHICS, parseGraphicsSettings, renderPixelRatio } from "../src/graphics/settings.js";

function stored(values: Readonly<Record<string, string>>): (key: string) => string | null {
  return (key) => values[key] ?? null;
}

test("a fresh browser gets sharp resolution, soft shadows, glow on, no monitor and the fight camera on", () => {
  assert.deepEqual(parseGraphicsSettings(stored({})), DEFAULT_GRAPHICS);
  assert.deepEqual(DEFAULT_GRAPHICS, { resolution: "sharp", shadows: "soft", glow: true, monitor: false, fightCamera: true });
});

test("saved choices come back as they were saved", () => {
  const settings = parseGraphicsSettings(
    stored({
      "jev-game.graphics.resolution": "fast",
      "jev-game.graphics.shadows": "simple",
      "jev-game.graphics.glow": "0",
      "jev-game.graphics.monitor": "1",
      "jev-game.graphics.fightCamera": "0",
    }),
  );

  assert.deepEqual(settings, { resolution: "fast", shadows: "simple", glow: false, monitor: true, fightCamera: false });
});

test("values another version or a hand edit left behind fall back to the defaults", () => {
  const settings = parseGraphicsSettings(
    stored({
      "jev-game.graphics.resolution": "ultra",
      "jev-game.graphics.shadows": "raytraced",
      "jev-game.graphics.glow": "yes",
      "jev-game.graphics.monitor": "",
      "jev-game.graphics.fightCamera": "maybe",
    }),
  );

  assert.deepEqual(settings, DEFAULT_GRAPHICS);
});

test("resolution scales the device pixel ratio, which is capped at 2", () => {
  assert.equal(renderPixelRatio("sharp", 1), 1);
  assert.equal(renderPixelRatio("sharp", 3), 2);
  assert.equal(renderPixelRatio("balanced", 2), 1.5);
  assert.equal(renderPixelRatio("fast", 2), 1);
  assert.equal(renderPixelRatio("fast", 1), 0.5);
});
