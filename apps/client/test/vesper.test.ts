import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Box3, Mesh, MeshStandardMaterial, Scene, ShaderMaterial, Vector3 } from "three";
import { clawRake, duskStreak, shadeStrike, shadowStrike } from "../src/game/views/dusk-visuals.js";
import { createParticleSystem } from "../src/game/views/particles.js";
import type { SpellVisual } from "../src/game/views/spell-visuals.js";
import { createVesperFigure } from "../src/game/views/vesper-figure.js";
import { createVesper } from "../src/models/vesper/vesper.js";

const FRAME = 1 / 60;

const TRIANGLE_BUDGET = 50_000;

function playOut(visual: SpellVisual): number {
  let frames = 0;

  while (!visual.finished()) {
    visual.update(FRAME);
    frames += 1;
    assert.ok(frames < 600, "the visual should finish within 10 s");
  }

  visual.dispose();
  assert.equal(visual.root.parent, null);

  return frames;
}

function run(update: (deltaSeconds: number) => void, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    update(FRAME);
  }
}

test("Vesper's claw rake and dusk streak play out and clean up", () => {
  const particles = createParticleSystem(new Scene());

  assert.ok(playOut(clawRake(particles, new Vector3(4, 6, -3), 1)) > 5);
  assert.ok(playOut(clawRake(particles, new Vector3(), 0.45)) > 5);
  assert.ok(playOut(duskStreak(particles, new Vector3(-20, 4, 0), new Vector3(15, 4, 12))) > 5);
});

test("Vesper's ghost lunges in short of her target, casts no shadow and fades out", () => {
  const particles = createParticleSystem(new Scene());
  const target = new Vector3(10, 4, 0);
  const strike = shadowStrike(particles, new Vector3(-20, 4, 0), target, 1);
  run((deltaSeconds) => strike.update(deltaSeconds), 0.15);
  const [ghost] = strike.root.children;
  let fills = 0;

  assert.ok(ghost !== undefined);
  assert.ok(ghost.position.x > target.x - 8 && ghost.position.x < target.x, `ghost at ${ghost.position.x}`);
  assert.ok(Math.abs(ghost.position.z) < 0.01);
  ghost.traverse((node) => {
    if (node instanceof Mesh && node.visible && node.material instanceof MeshStandardMaterial) {
      assert.ok(node.material.transparent && node.material.opacity > 0.5);
      assert.equal(node.castShadow, false);
      fills += 1;
    }
  });

  assert.ok(fills > 2);
  assert.ok(playOut(strike) > 5);
  assert.ok(playOut(shadeStrike(particles, new Vector3(), target, 0.45)) > 5);
});

test("Vesper builds within the triangle budget and stands on the ground", () => {
  const vesper = createVesper();
  vesper.update(FRAME);
  const bounds = new Box3();
  vesper.root.updateMatrixWorld(true);
  vesper.root.traverse((node) => {
    if (node instanceof Mesh && !(node.material instanceof ShaderMaterial)) {
      bounds.expandByObject(node, true);
    }
  });

  assert.ok(vesper.triangles > 0 && vesper.triangles <= TRIANGLE_BUDGET, `${vesper.triangles} triangles`);
  assert.ok(bounds.min.y > -0.2 && bounds.min.y < 0.4, `feet at ${bounds.min.y}`);
  assert.ok(bounds.max.z > 2, "her head leads along +z");
  assert.ok(vesper.mouth(new Vector3()).z > 2);

  vesper.dispose();
});

test("the Vesper figure never hides herself while alive, so the dusk vanish owns her visibility", () => {
  const figure = createVesperFigure({ height: 5.6, rooted: false });
  figure.setMoving(true);
  run((deltaSeconds) => figure.update(deltaSeconds), 1);

  for (const action of ["attack", "cast", "hit"] as const) {
    figure.trigger(action);
    run((deltaSeconds) => {
      figure.update(deltaSeconds);
      assert.equal(figure.root.visible, true);
    }, 0.8);
  }

  figure.root.visible = false;
  run((deltaSeconds) => figure.update(deltaSeconds), 0.5);
  assert.equal(figure.root.visible, false, "a vanished Vesper stays hidden until the battle view brings her back");
  figure.root.visible = true;

  figure.setDead(true);
  run((deltaSeconds) => figure.update(deltaSeconds), 4);
  assert.equal(figure.root.visible, false, "she sinks out of sight after dying");

  figure.setDead(false);
  figure.update(FRAME);
  assert.equal(figure.root.visible, true);
  figure.dispose();
});

test("Vesper's spells leave from her mouth wherever she stands, and her flames cast no shadow", () => {
  const figure = createVesperFigure({ height: 5.6, rooted: false });
  figure.root.position.set(40, 0, -30);
  figure.root.rotation.y = Math.PI / 2;
  figure.update(FRAME);
  const origin = figure.castOrigin(new Vector3());

  assert.ok(Math.hypot(origin.x - 40, origin.z + 30) < 8, `cast origin ${origin.toArray()}`);
  assert.ok(origin.x > 40, "she faces along her root's rotation");
  assert.ok(origin.y > 2 && origin.y < figure.height, `mouth height ${origin.y}`);

  figure.setCastsShadow(true);
  let casters = 0;
  figure.root.traverse((node) => {
    if (node instanceof Mesh && node.castShadow) {
      assert.ok(!(node.material instanceof ShaderMaterial), "billboards drop their offsets in the depth pass");
      casters += 1;
    }
  });

  assert.ok(casters > 3);
  figure.dispose();
});
