import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Box3, Vector3 } from "three";
import { createNettleFigure } from "../src/game/views/nettle-figure.js";
import { createNettle } from "../src/models/nettle/nettle.js";

const FRAME = 1 / 60;

const TRIANGLE_BUDGET = 50_000;

const TRAITS = { height: 6, rooted: false };

function run(update: (deltaSeconds: number) => void, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    update(FRAME);
  }
}

test("Nettle builds within the triangle budget and stands on her roots", () => {
  const nettle = createNettle();
  nettle.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(nettle.root, true);

  assert.ok(nettle.triangles > 0 && nettle.triangles <= TRIANGLE_BUDGET, `${nettle.triangles} triangles`);
  assert.ok(bounds.min.y > -0.1 && bounds.min.y < 0.05, `roots reach ${bounds.min.y}`);
  assert.ok(Math.abs(bounds.max.y - nettle.height) < 0.3, `crown tops out at ${bounds.max.y}`);

  nettle.dispose();
});

test("Nettle casts from her tea, which rises when she lifts the cup", () => {
  const figure = createNettleFigure(TRAITS);
  figure.update(FRAME);
  const resting = figure.castOrigin(new Vector3());
  figure.trigger("cast");
  run((deltaSeconds) => figure.update(deltaSeconds), 0.3);
  const raised = figure.castOrigin(new Vector3());

  assert.ok(resting.y > 1 && resting.y < figure.height, `tea at ${resting.y}`);
  assert.ok(raised.y > resting.y + 0.3, `tea rose from ${resting.y} to ${raised.y}`);

  figure.dispose();
});

test("Nettle stays up while alive, falls like a felled tree when she dies, then sinks", () => {
  const figure = createNettleFigure(TRAITS);
  figure.setMoving(true);

  for (const action of ["attack", "cast", "hit"] as const) {
    figure.trigger(action);
    run((deltaSeconds) => {
      figure.update(deltaSeconds);
      assert.equal(figure.root.visible, true);
    }, 0.8);
  }

  figure.setMoving(false);
  figure.setDead(true);
  run((deltaSeconds) => figure.update(deltaSeconds), 1.2);
  figure.root.updateMatrixWorld(true);
  const lying = new Box3().setFromObject(figure.root, true);

  assert.ok(lying.max.y < figure.height * 0.6, `still ${lying.max.y} tall after falling`);

  run((deltaSeconds) => figure.update(deltaSeconds), 3);
  assert.equal(figure.root.visible, false, "she sinks out of sight");

  figure.setDead(false);
  figure.update(FRAME);
  assert.equal(figure.root.visible, true);
  figure.dispose();
});
