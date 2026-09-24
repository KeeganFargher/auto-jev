import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Vector3 } from "three";
import { CHEST_FRACTION } from "../src/game/views/figure-base.js";
import { createPlaceholderFigure } from "../src/game/views/hero-figures.js";

test("a placeholder's spells leave from its chest wherever it stands", () => {
  const figure = createPlaceholderFigure("pyromancer");
  figure.root.position.set(12, 0, -7);

  const origin = figure.castOrigin(new Vector3());

  assert.ok(origin.distanceTo(new Vector3(12, figure.height * CHEST_FRACTION, -7)) < 1e-6, `cast origin ${origin.toArray()}`);
  figure.dispose();
});
