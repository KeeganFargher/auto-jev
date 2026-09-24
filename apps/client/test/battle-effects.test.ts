import { strict as assert } from "node:assert";
import { test } from "node:test";
import { firebolt, flameWard, meteor } from "@jev-game/content";
import { Line, Mesh, Scene, Vector3, type BufferGeometry, type Material } from "three";
import { createBattleEffects } from "../src/game/views/battle-effects.js";
import { createCycloneEffect } from "../src/game/views/cyclone-effect.js";
import { warmEffectMaterials } from "../src/game/views/effect-materials.js";
import { createParticleSystem } from "../src/game/views/particles.js";
import { castVisual, impactVisual, landingVisual, zoneVisual } from "../src/game/views/spell-visuals.js";

interface Drawn {
  materials: Material[];
  geometries: BufferGeometry[];
}

function drawn(scene: Scene): Drawn {
  const materials = new Set<Material>();
  const geometries = new Set<BufferGeometry>();

  scene.traverse((node) => {
    if (node instanceof Mesh || node instanceof Line) {
      if (node.geometry.isInstancedBufferGeometry !== true) {
        materials.add(node.material);
        geometries.add(node.geometry);
      }
    }
  });

  return { materials: [...materials], geometries: [...geometries] };
}

function uuids(items: readonly { uuid: string }[]): string[] {
  return items.map((item) => item.uuid).sort();
}

function playRound(effects: ReturnType<typeof createBattleEffects>, landed: string[]): void {
  effects.comboBurst(new Vector3(0, 0, 0), new Vector3(0, 5, 0), "brittle");
  effects.impactFlash(new Vector3(10, 0, 0), 8, "#ff8a4c");
  effects.projectile("strike", new Vector3(0, 5, 0), () => new Vector3(30, 5, 0), () => landed.push("bolt"));
  effects.projectile(firebolt.id, new Vector3(0, 5, 0), () => new Vector3(-30, 5, 0), () => landed.push("fireball"));
  effects.arc(new Vector3(0, 5, 0), new Vector3(0, 5, 30), "strike", () => landed.push("arc"));
}

test("finished hits hand their materials back so the next hits reuse them without disposing", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const landed: string[] = [];

  playRound(effects, landed);
  const first = drawn(scene);
  const disposed: string[] = [];

  for (const item of [...first.materials, ...first.geometries]) {
    item.addEventListener("dispose", () => disposed.push(item.uuid));
  }

  effects.step(2);
  assert.deepEqual(landed.sort(), ["arc", "bolt", "fireball"]);
  assert.deepEqual(drawn(scene).materials, []);
  assert.deepEqual(disposed, []);

  playRound(effects, landed);
  const second = drawn(scene);
  assert.deepEqual(uuids(second.materials), uuids(first.materials));
  effects.dispose();
  particles.dispose();
});

test("ground rings of the same proportions share one geometry", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);

  effects.impactFlash(new Vector3(0, 0, 0), 8, "#ff8a4c");
  effects.impactFlash(new Vector3(20, 0, 0), 14, "#9fe0d0");
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

function programSignatures(scene: Scene): Set<string> {
  const signatures = new Set<string>();

  scene.traverse((node) => {
    if ((node instanceof Mesh || node instanceof Line) && node.geometry.isInstancedBufferGeometry !== true) {
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
        ].join("|"),
      );
    }
  });

  return signatures;
}

test("every effect draws with a material and geometry combination the warm-up already compiled", () => {
  const warmScene = new Scene();
  const finish = warmEffectMaterials(warmScene);
  const warmed = programSignatures(warmScene);
  finish();

  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  playRound(effects, []);
  const marker = effects.marker(new Vector3(), 0.86, 10, "#ff8a4c", 0.55);

  const visuals = [
    impactVisual(particles, meteor.id, new Vector3(), 15, 0, 10),
    landingVisual(particles, meteor.id, new Vector3(), 15),
    zoneVisual(particles, meteor.id, new Vector3(), 15, 3),
    castVisual(particles, flameWard.id, new Vector3(), 12),
  ];

  for (const visual of visuals) {
    assert.ok(visual !== null);
    scene.add(visual.root);
    visual.update(0.2);
  }

  const cyclone = createCycloneEffect();
  scene.add(cyclone.root);
  cyclone.setActive(true);
  cyclone.update(0.2);

  const missing = [...programSignatures(scene)].filter((signature) => !warmed.has(signature));
  assert.deepEqual(missing, []);

  for (const visual of visuals) {
    visual?.dispose();
  }

  cyclone.dispose();
  marker.remove();
  effects.dispose();
  particles.dispose();
});
