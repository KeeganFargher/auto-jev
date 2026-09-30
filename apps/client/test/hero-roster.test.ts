import { strict as assert } from "node:assert";
import { test } from "node:test";
import { burr, gameCatalogue, paladin } from "@jev-game/content";
import { heroModel } from "../src/game/models/catalogue.js";
import { tintPixels } from "../src/game/models/tint.js";
import { heroLook } from "../src/game/views/battle-visuals.js";
import { heroGlyph } from "../src/ui/icons/glyph-maps.js";

test("every hero in the catalogue has a model, a look and a glyph", () => {
  for (const heroId of Object.keys(gameCatalogue.heroes)) {
    assert.ok(heroModel(heroId), `${heroId} has no model`);
    assert.ok(heroLook(heroId), `${heroId} has no look`);
    assert.ok(heroGlyph(heroId).length > 0, `${heroId} has no glyph`);
  }
});

test("Burr's knight body is tinted icy blue while the Paladin's stays red", () => {
  const knightRed = [200, 30, 30, 255];

  const burrPixels = new Uint8ClampedArray(knightRed);
  tintPixels(burrPixels, heroModel(burr.id).tint);
  const [red, green, blue] = burrPixels;
  assert.ok(blue > red && blue > green, `Burr's red became ${red},${green},${blue}`);

  const paladinPixels = new Uint8ClampedArray(knightRed);
  tintPixels(paladinPixels, heroModel(paladin.id).tint);
  assert.deepEqual([...paladinPixels], knightRed);
});
