import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gameCatalogue } from "@jev-game/content";
import { heroModel } from "../src/game/models/catalogue.js";
import { heroLook } from "../src/game/views/battle-visuals.js";
import { heroGlyph } from "../src/ui/icons/glyph-maps.js";

test("every hero in the catalogue has a model, a look and a glyph", () => {
  for (const heroId of Object.keys(gameCatalogue.heroes)) {
    assert.ok(heroModel(heroId), `${heroId} has no model`);
    assert.ok(heroLook(heroId), `${heroId} has no look`);
    assert.ok(heroGlyph(heroId).length > 0, `${heroId} has no glyph`);
  }
});
