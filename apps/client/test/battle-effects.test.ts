import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BoxGeometry,
  Group,
  Line,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { createBattleEffects, type BattleEffects } from "../src/game/views/battle-effects.js";
import {
  BUBBLE_KINDS,
  SHOT_LOOKS,
  createBubbleVisual,
  createChainVisual,
  createShotVisual,
} from "../src/game/views/battle-visuals.js";
import { releaseEffectMaterial, warmEffectMaterials } from "../src/game/views/effect-materials.js";
import { createGiantHammer } from "../src/game/views/giant-hammer.js";
import { createParticleSystem, type ParticleSystem } from "../src/game/views/particles.js";

interface BuiltVisual {
  kind: string;
  root: Object3D;
  step(): void;
  dispose(): void;
}

interface Drawn {
  materials: Material[];
  geometries: BufferGeometry[];
}

function drawn(scene: Scene): Drawn {
  const materials = new Set<Material>();
  const geometries = new Set<BufferGeometry>();

  scene.traverse((node) => {
    if (
      (node instanceof Mesh || node instanceof Line) &&
      node.geometry.isInstancedBufferGeometry !== true
    ) {
      materials.add(node.material);
      geometries.add(node.geometry);
    }
  });

  return { materials: [...materials], geometries: [...geometries] };
}

function lineGeometries(scene: Scene): BufferGeometry[] {
  const geometries = new Set<BufferGeometry>();

  scene.traverse((node) => {
    if (node instanceof Line) {
      geometries.add(node.geometry);
    }
  });

  return [...geometries];
}

function uuids(items: readonly { uuid: string }[]): string[] {
  return items.map((item) => item.uuid).sort();
}

function watchDisposal(items: readonly (Material | BufferGeometry)[]): () => string[] {
  const disposed: string[] = [];

  for (const item of items) {
    item.addEventListener("dispose", () => disposed.push(item.uuid));
  }

  return () => [...disposed].sort();
}

function playRound(effects: BattleEffects): void {
  effects.explosion(new Vector3(-10, 0, 0), 12);
  effects.pop(new Vector3(0, 6, 10), 5, "#9fe8ff");
  effects.dust(new Vector3(0, 0, -10), 10);
  effects.embers(new Vector3(0, 4, 0), 6);
  effects.fuseSparks(new Vector3(2, 4, 0));
  effects.stunStar(new Vector3(-2, 8, 0));
  effects.healMotes(new Vector3(0, 4, 4));
  effects.deathDust(new Vector3(4, 0, 4));
  effects.rage(new Vector3(10, 0, 0), 12, 3);
  effects.smoke(new Vector3(10, 0, 0), 12, 6);
  effects.shockwave(new Vector3(-6, 0, 6), "#ffe0a0", 20, 0.45);
  effects.ringBurst(new Vector3(-6, 0, 6), "#c9b9a0", 40, 64);
  effects.burst(new Vector3(-6, 1, 6), "#8a7f96", "solid", 30, 20, 1.1);
  effects.burst(new Vector3(-6, 2, 6), "#ffd86b", "glow", 40, 30, 0.5);
  effects.debris(new Vector3(-6, 0, 6), 14);
}

function chunks(scene: Scene): Mesh[] {
  const found: Mesh[] = [];

  scene.traverse((node) => {
    if (node instanceof Mesh && node.geometry instanceof BoxGeometry) {
      found.push(node);
    }
  });

  return found;
}

function craters(scene: Scene): Mesh[] {
  const found: Mesh[] = [];

  scene.traverse((node) => {
    if (node instanceof Mesh && node.geometry instanceof PlaneGeometry) {
      found.push(node);
    }
  });

  return found;
}

function groundRings(scene: Scene): Mesh[] {
  const found: Mesh[] = [];

  scene.traverse((node) => {
    if (node instanceof Mesh && node.geometry instanceof RingGeometry) {
      found.push(node);
    }
  });

  return found;
}

function everyVisual(particles: ParticleSystem): BuiltVisual[] {
  const from = new Vector3(-20, 8, -20);
  const to = new Vector3(4, 0, -6);

  const shots = SHOT_LOOKS.map((look): BuiltVisual => {
    const shot = createShotVisual(particles, look, from);

    return {
      kind: `shot:${look}`,
      root: shot.root,
      step: () => shot.place(from, to, 0.5),
      dispose: () => shot.dispose(),
    };
  });

  const bubbles = BUBBLE_KINDS.map((kind): BuiltVisual => {
    const bubble = createBubbleVisual(kind);

    return {
      kind: `bubble:${kind}`,
      root: bubble.root,
      step: () => bubble.place(to, 6, 0.2),
      dispose: () => bubble.dispose(),
    };
  });

  const chain = createChainVisual("#8d8d96");
  const hand = new Group();
  const hammer = createGiantHammer();
  hand.add(hammer.root);

  return [
    ...shots,
    ...bubbles,
    {
      kind: "chain",
      root: chain.root,
      step: () => chain.stretch(from, to, 2),
      dispose: () => chain.dispose(),
    },
    {
      kind: "hammer",
      root: hand,
      step: () => hammer.pose(0.9, new Vector3(0, 0, 1)),
      dispose: () => hammer.dispose(),
    },
  ];
}

function programSignatures(scene: Scene): Set<string> {
  const signatures = new Set<string>();

  scene.traverse((node) => {
    if (
      (node instanceof Mesh || node instanceof Line) &&
      node.geometry.isInstancedBufferGeometry !== true
    ) {
      const material: Material = node.material;
      const colors = node.geometry.getAttribute("color");

      signatures.add(
        [
          node.type,
          material.type,
          material.side,
          material.vertexColors,
          colors?.itemSize === 4,
          node.geometry.getAttribute("normal") !== undefined,
          "flatShading" in material ? material.flatShading : false,
          "map" in material && material.map !== null,
          !material.transparent &&
            material.blending === NormalBlending &&
            !material.alphaToCoverage,
        ].join("|"),
      );
    }
  });

  return signatures;
}

test("finished effects hand their materials back so the next ones reuse them without disposing", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  playRound(effects);
  const first = drawn(scene);
  assert.ok(first.materials.length > 0);
  const disposed = watchDisposal([...first.materials, ...first.geometries]);

  effects.step(5);
  const left = craters(scene);
  assert.ok(left.length > 0, "the explosion left no crater behind");
  assert.deepEqual(uuids(drawn(scene).materials), uuids(left.flatMap((crater) => crater.material)));
  effects.clear();
  assert.deepEqual(drawn(scene).materials, []);
  assert.deepEqual(disposed(), []);

  playRound(effects);
  assert.deepEqual(uuids(drawn(scene).materials), uuids(first.materials));
  effects.dispose();
  particles.dispose();
});

test("an explosion scorches, cracks and rubbles the ground only as far as its blast reaches it", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  effects.explosion(new Vector3(0, 0, 0), 12);
  const [grounded] = craters(scene);
  assert.ok(grounded !== undefined, "a blast on the ground left no crater");
  assert.ok(chunks(scene).length > 0, "a blast on the ground threw no rubble");
  assert.ok(groundRings(scene).length > 0, "a blast on the ground sent no shockwave");
  effects.clear();

  effects.explosion(new Vector3(0, 8, 0), 12);
  const [raised] = craters(scene);
  assert.ok(raised !== undefined, "a blast that still reaches the ground left no crater");
  assert.ok(raised.scale.x < grounded.scale.x, "a higher blast scorched as much ground");
  effects.clear();

  effects.explosion(new Vector3(0, 13, 0), 12);
  assert.deepEqual(craters(scene), []);
  assert.deepEqual(chunks(scene), []);
  assert.deepEqual(groundRings(scene), []);
  assert.throws(() => effects.explosion(new Vector3(), 0), /positive radius/);
  effects.dispose();
  particles.dispose();
});

test("rage and smoke each puff a particle off the body, and rage needs a body of some size", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  for (let puff = 0; puff < 50; puff += 1) {
    effects.rage(new Vector3(0, 2, 0), 12, 3);
    effects.smoke(new Vector3(0, 2, 0), 12, 6);
  }

  assert.equal(particles.alive(), 100);
  assert.deepEqual(drawn(scene).materials, []);

  for (const size of [0, -1, Number.NaN]) {
    assert.throws(() => effects.rage(new Vector3(), 12, size), /positive size/);
  }

  effects.dispose();
  particles.dispose();
});

test("ground rings of the same proportions share one geometry", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  effects.shockwave(new Vector3(0, 0, 0), "#ff8a4c", 8, 0.4);
  effects.shockwave(new Vector3(20, 0, 0), "#9fe0d0", 14, 0.4);
  const small = effects.marker(new Vector3(0, 0, 20), 0.86, 6, "#ff8a4c", 0.55);
  const large = effects.marker(new Vector3(0, 0, -20), 0.86, 16, "#ff8a4c", 0.55);

  assert.equal(drawn(scene).geometries.length, 2);
  small.remove();
  large.remove();
  effects.dispose();
  particles.dispose();
});

test("a removed ground marker leaves the scene and returns its material", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const marker = effects.marker(new Vector3(), 0.15, 12, "#8fd14f", 0.28);
  const [material] = drawn(scene).materials;
  assert.ok(material !== undefined);

  marker.setOpacity(0.5);
  assert.equal(material.opacity, 0.5);
  marker.remove();
  assert.deepEqual(drawn(scene).materials, []);

  const reused = effects.marker(new Vector3(), 0.15, 12, "#8fd14f", 0.28);
  assert.deepEqual(drawn(scene).materials, [material]);
  reused.remove();
  effects.dispose();
  particles.dispose();
});

test("a ground marker follows the spot it is placed at and stays on the ground", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const marker = effects.marker(new Vector3(), 0.15, 12, "#8fd14f", 0.28);

  const [ring] = scene.children.filter(
    (node) => node instanceof Mesh && node.geometry.isInstancedBufferGeometry !== true,
  );

  assert.ok(ring !== undefined);
  const lift = ring.position.y;

  marker.place(new Vector3(7, 3, -4));
  assert.deepEqual([ring.position.x, ring.position.y, ring.position.z], [7, lift, -4]);
  marker.remove();
  effects.dispose();
  particles.dispose();
});

test("clearing retires every running effect exactly once", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  playRound(effects);
  effects.clear();
  assert.deepEqual(drawn(scene).materials, []);

  effects.step(2);
  assert.deepEqual(drawn(scene).materials, []);
  effects.dispose();
  particles.dispose();
});

test("every effect and visual draws with a material and geometry combination the warm-up already compiled", () => {
  const warmScene = new Scene();
  const finish = warmEffectMaterials(warmScene);
  const warmed = programSignatures(warmScene);
  finish();

  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  playRound(effects);
  effects.crater(new Vector3(-6, 0, 6), 12);
  const marker = effects.marker(new Vector3(), 0.86, 10, "#ff8a4c", 0.55);
  const visuals = everyVisual(particles);

  for (const visual of visuals) {
    scene.add(visual.root);
    visual.step();
  }

  const missing = [...programSignatures(scene)].filter((signature) => !warmed.has(signature));
  assert.deepEqual(missing, []);

  for (const visual of visuals) {
    visual.dispose();
  }

  marker.remove();
  effects.dispose();
  particles.dispose();
});

test("every visual hands its materials back to the pool and disposes only its own chain geometry", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const visuals = everyVisual(particles);

  assert.deepEqual(visuals.map((visual) => visual.kind).sort(), [
    "bubble:big",
    "bubble:safety",
    "chain",
    "hammer",
    "shot:firecracker",
    "shot:fuse-bomb",
    "shot:hook",
    "shot:knife",
    "shot:soap",
  ]);

  for (const visual of visuals) {
    scene.add(visual.root);
    visual.step();
  }

  const { materials, geometries } = drawn(scene);
  const chains = lineGeometries(scene);
  assert.equal(chains.length, 2);
  const disposedMaterials = watchDisposal(materials);
  const disposedGeometries = watchDisposal(geometries);

  for (const visual of visuals) {
    visual.dispose();
  }

  assert.deepEqual(drawn(scene).materials, []);
  assert.deepEqual(disposedMaterials(), []);
  assert.deepEqual(disposedGeometries(), uuids(chains));

  for (const material of materials) {
    assert.throws(() => releaseEffectMaterial(material), /not taken/);
  }

  particles.dispose();
});

test("a crater stays on the ground after the blow, and only the most recent few are kept", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  for (let index = 0; index < 12; index += 1) {
    effects.crater(new Vector3(index * 10, 0, 0), 8);
  }

  effects.step(10);

  const craters = scene.children.filter(
    (node) => node instanceof Mesh && node.geometry.isInstancedBufferGeometry !== true,
  );

  assert.equal(craters.length, 8);
  assert.equal(drawn(scene).materials.length, 8);

  effects.clear();
  assert.deepEqual(drawn(scene).materials, []);
  effects.dispose();
  particles.dispose();
});

test("thrown rubble falls, comes to rest on the ground and then crumbles away", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  effects.debris(new Vector3(0, 0, 0), 14);
  const thrown = chunks(scene);
  assert.equal(thrown.length, 14);
  const highest = Math.max(...thrown.map((chunk) => chunk.position.y));

  effects.step(0.25);
  assert.ok(
    Math.max(...thrown.map((chunk) => chunk.position.y)) > highest,
    "the rubble never flew up",
  );

  for (let frame = 0; frame < 120; frame += 1) {
    effects.step(1 / 60);

    for (const chunk of thrown) {
      assert.ok(chunk.position.y > 0, `a chunk sank to ${chunk.position.y}`);
    }
  }

  assert.ok(
    thrown.every((chunk) => chunk.position.y < 4),
    "the rubble never came down",
  );
  effects.step(4);
  assert.deepEqual(chunks(scene), []);
  effects.dispose();
  particles.dispose();
});
