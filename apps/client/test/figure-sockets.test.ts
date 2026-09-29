import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { firebrand } from "@jev-game/content";
import { Vector3 } from "three";
import { HERO_MODELS } from "../src/game/models/catalogue.js";
import { createHeroFigure } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const RESTING_HAND_LOWEST = 0.1;

const RESTING_HAND_HIGHEST = 0.5;

before(installHeroModels);

test("every hero's spells leave from its casting hand wherever it stands", () => {
  for (const heroId of HERO_MODELS.keys()) {
    const figure = createHeroFigure(heroId);
    figure.update(0);
    const home = figure.castOrigin(new Vector3());
    figure.root.position.set(12, 0, -7);
    const moved = figure.castOrigin(new Vector3());

    assert.ok(
      home.y > figure.height * RESTING_HAND_LOWEST && home.y < figure.height * RESTING_HAND_HIGHEST,
      `${heroId} casts from ${home.toArray()}, not from a resting hand`,
    );
    assert.ok(moved.sub(home).distanceTo(new Vector3(12, 0, -7)) < 1e-6);
    figure.dispose();
  }
});

test("the casting hand follows the signature gesture", () => {
  const figure = createHeroFigure(firebrand.id);
  figure.update(0);
  const resting = figure.castOrigin(new Vector3());
  figure.perform("signature", 0.5);
  figure.update(0.4);
  const raised = figure.castOrigin(new Vector3());

  assert.ok(
    raised.distanceTo(resting) > 0.1,
    `hand stayed at ${resting.toArray()} through the gesture`,
  );
  figure.dispose();
});
