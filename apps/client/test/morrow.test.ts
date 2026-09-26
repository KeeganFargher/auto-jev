import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Box3, Vector3 } from "three";
import { createMorrowFigure } from "../src/game/views/morrow-figure.js";
import { createMorrow } from "../src/models/morrow/morrow.js";

const FRAME = 1 / 60;

const TRIANGLE_BUDGET = 50_000;

const TRAITS = { height: 8.4, rooted: false };

function run(update: (deltaSeconds: number) => void, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    update(FRAME);
  }
}

test("Morrow builds within the triangle budget and stands on her feet", () => {
  const morrow = createMorrow();
  morrow.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(morrow.root, true);

  assert.ok(morrow.triangles > 0 && morrow.triangles <= TRIANGLE_BUDGET, `${morrow.triangles} triangles`);
  assert.ok(bounds.min.y > -0.1 && bounds.min.y < 0.05, `feet reach ${bounds.min.y}`);
  assert.ok(Math.abs(bounds.max.y - morrow.height) < 0.4, `shrine tops out at ${bounds.max.y}`);

  morrow.dispose();
});

test("Morrow butts with her beak and throws her mallet once she has cast", () => {
  const figure = createMorrowFigure(TRAITS);
  figure.update(FRAME);
  const beak = figure.castOrigin(new Vector3());
  figure.trigger("cast");
  run((deltaSeconds) => figure.update(deltaSeconds), 0.3);
  const mallet = figure.castOrigin(new Vector3());
  figure.trigger("attack");
  run((deltaSeconds) => figure.update(deltaSeconds), 0.3);
  const butt = figure.castOrigin(new Vector3());

  assert.ok(beak.y > 1 && beak.y < figure.height, `beak at ${beak.y}`);
  assert.ok(mallet.distanceTo(beak) > 1, "a cast leaves from the mallet on her deck");
  assert.ok(butt.distanceTo(mallet) > 1, "her next headbutt leaves from the beak again");

  figure.dispose();
});

test("Morrow stays up while alive, pulls into her shell when she dies, then sinks", () => {
  const figure = createMorrowFigure(TRAITS);
  figure.setMoving(true);

  for (const action of ["attack", "cast", "hit"] as const) {
    figure.trigger(action);
    run((deltaSeconds) => {
      figure.update(deltaSeconds);
      assert.equal(figure.root.visible, true);
    }, 0.8);
  }

  figure.setMoving(false);
  figure.update(FRAME);
  const standing = figure.castOrigin(new Vector3());
  figure.setDead(true);
  run((deltaSeconds) => figure.update(deltaSeconds), 1.2);
  const withdrawn = figure.castOrigin(new Vector3());

  assert.ok(withdrawn.y < standing.y - 0.5, `head still at ${withdrawn.y} after withdrawing`);

  run((deltaSeconds) => figure.update(deltaSeconds), 3);
  assert.equal(figure.root.visible, false, "she sinks out of sight");

  figure.setDead(false);
  figure.update(FRAME);
  assert.equal(figure.root.visible, true);
  figure.dispose();
});

test("Avatar swells her glow and sets her spinning sun alight", () => {
  const figure = createMorrowFigure(TRAITS);
  const plain = createMorrowFigure(TRAITS);
  figure.setForm?.("avatar");
  run((deltaSeconds) => {
    figure.update(deltaSeconds);
    plain.update(deltaSeconds);
  }, 1.5);
  const bright = figure.root.getObjectByName("morrow-sun");
  const dim = plain.root.getObjectByName("morrow-sun");

  assert.ok(bright !== undefined && dim !== undefined);
  assert.ok(Math.abs(bright.rotation.z) > Math.abs(dim.rotation.z) * 1.5, "the Avatar's sun turns faster");

  figure.dispose();
  plain.dispose();
});
