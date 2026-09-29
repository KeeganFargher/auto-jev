import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { trainingDummy } from "@jev-game/content";
import { HERO_MODELS } from "../src/game/models/catalogue.js";
import { createHeroFigure, gestureTiming } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const LEADS = [0.03, 0.1, 0.25, 0.4, 0.8, 1.2, 3];

before(installHeroModels);

test("every gesture strikes exactly when the sim lands it", () => {
  for (const [heroId, model] of HERO_MODELS) {
    for (const [gesture, cue] of Object.entries(model.gestures)) {
      for (const lead of LEADS) {
        const timing = gestureTiming(cue, lead);
        const strikesAt = timing.delay + (cue.strike - timing.from) / timing.speed;
        const label = `${heroId} ${gesture} with ${lead}s of lead`;

        assert.ok(Math.abs(strikesAt - lead) < 1e-9, `${label} strikes at ${strikesAt}s`);
        assert.ok(timing.delay > -1e-9, `${label} waits ${timing.delay}s`);
        assert.ok(timing.speed > 0, `${label} plays at ${timing.speed}x`);
        assert.ok(
          timing.from >= cue.from && timing.from <= cue.strike,
          `${label} starts at ${timing.from}s`,
        );
      }
    }
  }
});

test("a gesture heard after its strike starts on the strike frame", () => {
  for (const [heroId, model] of HERO_MODELS) {
    const cue = model.gestures.attack;
    assert.ok(cue !== undefined, `${heroId} has no attack`);

    assert.deepEqual(gestureTiming(cue, -0.2), {
      clip: cue.clip,
      from: cue.strike,
      speed: 1,
      delay: 0,
    });
  }
});

test("a hero without a signature cannot gesture one", () => {
  const figure = createHeroFigure(trainingDummy.id);

  assert.throws(() => figure.perform("signature", 0.5), /has no signature gesture/);
  figure.dispose();
});
