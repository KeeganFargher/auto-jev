import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { TintRule } from "../src/game/models/catalogue.js";
import { tintPixels } from "../src/game/models/tint.js";

const ROBE_TO_RED: TintRule = { hues: [228, 262], hue: 8, saturation: 1.9, lightness: 0.02 };

const RED_TO_GREEN: TintRule = { hues: [340, 20], hue: 120, saturation: 1, lightness: 0 };

function tinted(rgba: readonly number[], rules: readonly TintRule[]): number[] {
  const pixels = new Uint8ClampedArray(rgba);
  tintPixels(pixels, rules);

  return [...pixels];
}

test("a robe-blue texel turns red and keeps its alpha", () => {
  const [red, green, blue, alpha] = tinted([60, 70, 160, 77], [ROBE_TO_RED]);

  assert.ok(red > green && red > blue, `robe became ${red},${green},${blue}`);
  assert.equal(alpha, 77);
});

test("greys and colours outside the tinted hues are left alone", () => {
  const untouched = [128, 128, 128, 255, 130, 128, 126, 255, 40, 160, 40, 255];

  assert.deepEqual(tinted(untouched, [ROBE_TO_RED]), untouched);
});

test("a hue range may wrap past 360 degrees", () => {
  const [red, green, blue] = tinted([200, 30, 30, 255], [RED_TO_GREEN]);

  assert.ok(green > red && green > blue, `red became ${red},${green},${blue}`);
});

test("tinting refuses anything but whole RGBA texels", () => {
  assert.throws(() => tintPixels(new Uint8ClampedArray(3), [ROBE_TO_RED]), /RGBA/);
});
