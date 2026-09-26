import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Group, Vector3 } from "three";
import {
  infectionVisual,
  pandemicSurgeVisual,
  plagueBloomVisual,
  thornVisual,
} from "../src/game/views/blight-visuals.js";
import type { ParticleStyle, ParticleSystem } from "../src/game/views/particles.js";

const FRAME = 1 / 60;

const TICK = 1 / 30;

interface Counter {
  readonly particles: ParticleSystem;
  readonly pulses: () => number;
}

function counting(): Counter {
  let pulses = 0;

  return {
    particles: {
      emit(style: ParticleStyle, _origin: Vector3, _direction: Vector3, count: number) {
        if (style.cone === 0.2) {
          pulses += count;
        }
      },
      clear() {},
      update() {},
      alive: () => 0,
      dispose() {},
    },
    pulses: () => pulses,
  };
}

test("Plague Bloom breathes once per zone period, wilts after it ends and leaves nothing behind", () => {
  const { particles, pulses } = counting();
  const scene = new Group();
  const bloom = plagueBloomVisual(particles, new Vector3(10, 0, 5), 15, 3, 15);
  scene.add(bloom.root);

  for (let tick = 0; tick < 90; tick += 1) {
    bloom.sync(tick);
    bloom.update(TICK);
  }

  assert.equal(pulses() / 18, 6);
  assert.equal(bloom.finished(), false);
  bloom.end();

  for (let frame = 0; frame < 120 && !bloom.finished(); frame += 1) {
    bloom.update(FRAME);
  }

  assert.equal(bloom.finished(), true);
  bloom.dispose();
  assert.equal(bloom.root.parent, null);
});

test("Pandemic's surge and each infection finish on their own and clean up", () => {
  const { particles } = counting();
  const scene = new Group();

  const visuals = [
    pandemicSurgeVisual(particles, new Vector3(), 120, new Vector3(1, 6, 1)),
    infectionVisual(particles, new Vector3(20, 0, 30), new Vector3(20, 5, 30)),
  ];

  for (const visual of visuals) {
    scene.add(visual.root);

    for (let frame = 0; frame < 180 && !visual.finished(); frame += 1) {
      visual.update(FRAME);
    }

    assert.equal(visual.finished(), true);
    visual.dispose();
    assert.equal(visual.root.parent, null);
  }
});

test("Thornshot flies from launch to target", () => {
  const { particles } = counting();
  const from = new Vector3(0, 6, 0);
  const to = new Vector3(0, 5, 30);

  for (const visual of [thornVisual(particles, from)]) {
    const scene = new Group();
    scene.add(...visual.objects);
    visual.place(from, to, 0);
    assert.ok(visual.objects[0].position.distanceTo(from) < 0.01);
    visual.place(from, to, 1);
    assert.ok(visual.objects[0].position.distanceTo(to) < 0.01);
    visual.dispose();
    assert.ok(visual.objects.every((object) => object.parent === null));
  }
});
