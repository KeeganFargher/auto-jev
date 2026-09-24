import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Color, InterleavedBufferAttribute, Mesh, Scene, ShaderMaterial, Vector3 } from "three";
import { claimSlots, coneDirection, createParticleSystem, createTrail, type ParticleStyle } from "../src/game/views/particles.js";

const EMBER: ParticleStyle = {
  blend: "glow",
  from: new Color("#ffe7a3"),
  to: new Color("#ff4d1a"),
  brightness: 1,
  opacity: 1,
  size: [0.8, 0.2],
  life: [0.4, 0.8],
  speed: [6, 12],
  cone: Math.PI / 3,
  spread: 0.5,
  gravity: -4,
  drag: 2,
  stretch: 0,
  softness: 1,
};

test("a burst that runs past the end of a layer wraps round to its start", () => {
  assert.deepEqual(claimSlots(4090, 10, 4096), {
    ranges: [
      { start: 4090, count: 6 },
      { start: 0, count: 4 },
    ],
    next: 4,
  });
});

test("a burst that ends exactly at the end of a layer claims one range", () => {
  assert.deepEqual(claimSlots(4086, 10, 4096), { ranges: [{ start: 4086, count: 10 }], next: 0 });
});

test("a burst bigger than its layer is refused rather than overwriting itself", () => {
  assert.throws(() => claimSlots(0, 4097, 4096), /does not fit/);
});

test("sprayed directions are unit length and stay inside the cone", () => {
  const axis = new Vector3(1, 2, -0.5).normalize();
  const sprayed = new Vector3();

  for (let index = 0; index < 500; index += 1) {
    coneDirection(axis, 0.4, Math.random(), Math.random(), sprayed);
    assert.ok(Math.abs(sprayed.length() - 1) < 1e-9);
    assert.ok(sprayed.angleTo(axis) <= 0.4 + 1e-9, `angle ${sprayed.angleTo(axis)} leaves the cone`);
  }
});

test("particles live out their life and then expire", () => {
  const particles = createParticleSystem(new Scene());
  particles.emit(EMBER, new Vector3(), new Vector3(0, 1, 0), 30);
  particles.update(0.1);
  assert.equal(particles.alive(), 30);

  particles.update(0.8);
  assert.equal(particles.alive(), 0);
  particles.dispose();
});

test("clearing hides every live particle but not ones emitted afterwards", () => {
  const particles = createParticleSystem(new Scene());
  particles.emit(EMBER, new Vector3(), new Vector3(0, 1, 0), 30);
  particles.update(0.1);
  particles.clear();
  assert.equal(particles.alive(), 0);

  particles.emit(EMBER, new Vector3(), new Vector3(0, 1, 0), 5);
  particles.update(0.1);
  assert.equal(particles.alive(), 5);
  particles.dispose();
});

test("a style without drag is refused, since the motion divides by it", () => {
  const particles = createParticleSystem(new Scene());
  assert.throws(() => particles.emit({ ...EMBER, drag: 0 }, new Vector3(), new Vector3(0, 1, 0), 1), /drag/);
  particles.dispose();
});

test("a trail leaves the same particles over a distance however many frames it takes", () => {
  const smooth = createParticleSystem(new Scene());
  const choppy = createParticleSystem(new Scene());
  const smoothTrail = createTrail(smooth, EMBER, 1, new Vector3());
  const choppyTrail = createTrail(choppy, EMBER, 1, new Vector3());

  for (let step = 1; step <= 40; step += 1) {
    smoothTrail.follow(new Vector3(step * 0.25, 0, 0));
  }

  choppyTrail.follow(new Vector3(4, 0, 0));
  choppyTrail.follow(new Vector3(10, 0, 0));
  smooth.update(0.01);
  choppy.update(0.01);
  assert.equal(smooth.alive(), 10);
  assert.equal(choppy.alive(), 10);
  smooth.dispose();
  choppy.dispose();
});

function glowLayer(scene: Scene): Mesh {
  const layer = scene.children.find((child) => child instanceof Mesh && child.renderOrder === 2);

  if (!(layer instanceof Mesh)) {
    throw new Error("the glow layer is not in the scene");
  }

  return layer;
}

function attribute(mesh: Mesh, name: string): InterleavedBufferAttribute {
  const found = mesh.geometry.getAttribute(name);

  if (!(found instanceof InterleavedBufferAttribute)) {
    throw new Error(`particle attribute ${name} is missing`);
  }

  return found;
}

function shownSlots(scene: Scene, slots: number): number[] {
  const layer = glowLayer(scene);

  if (!(layer.material instanceof ShaderMaterial)) {
    throw new Error("the glow layer has no shader");
  }

  const time: number = layer.material.uniforms.uTime!.value;
  const clearEpoch: number = layer.material.uniforms.uEpoch!.value;
  const origin = attribute(layer, "aOrigin");
  const velocity = attribute(layer, "aVelocity");
  const epochs = attribute(layer, "aEpoch");
  const shown: number[] = [];

  for (let slot = 0; slot < slots; slot += 1) {
    const age = time - origin.getW(slot);

    if (epochs.getX(slot) >= clearEpoch && age >= 0 && age < velocity.getW(slot)) {
      shown.push(slot);
    }
  }

  return shown;
}

test("a clear hides particles emitted earlier in the same frame, but not ones emitted after it", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  particles.update(0.5);
  particles.emit(EMBER, new Vector3(), new Vector3(0, 1, 0), 3);
  particles.clear();
  particles.emit(EMBER, new Vector3(), new Vector3(0, 1, 0), 2);

  assert.deepEqual(shownSlots(scene, 8), [3, 4]);
  particles.dispose();
});

test("trail particles land a spacing apart along the path, carrying the remainder between frames", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const trail = createTrail(particles, { ...EMBER, spread: 0 }, 1, new Vector3());
  trail.follow(new Vector3(0.6, 0, 0));
  trail.follow(new Vector3(4, 0, 0));

  const origin = attribute(glowLayer(scene), "aOrigin");
  const placed = [0, 1, 2, 3].map((slot) => Math.round(origin.getX(slot) * 1000) / 1000);

  assert.deepEqual(placed, [1, 2, 3, 4]);
  particles.dispose();
});

