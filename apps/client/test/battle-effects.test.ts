import { strict as assert } from "node:assert";
import { test } from "node:test";
import { firebolt, gameCatalogue } from "@jev-game/content";
import { BLESSED_BURST, PLAGUE_BURST } from "@jev-game/game";
import { Line, Mesh, NormalBlending, Scene, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import { createBattleEffects } from "../src/game/views/battle-effects.js";
import { infectionVisual } from "../src/game/views/blight-visuals.js";
import { createCycloneEffect } from "../src/game/views/cyclone-effect.js";
import { clawRake, duskStreak } from "../src/game/views/dusk-visuals.js";
import { releaseEffectMaterial, warmEffectMaterials } from "../src/game/views/effect-materials.js";
import { deathKnell } from "../src/game/views/fate-visuals.js";
import { sanctuaryVisual } from "../src/game/views/shrine-visuals.js";
import { createParticleSystem, type ParticleSystem } from "../src/game/views/particles.js";
import {
  castVisual,
  emitterVisual,
  formVisual,
  hitVisual,
  impactVisual,
  landingVisual,
  mendVisual,
  passiveVisual,
  projectileVisual,
  risenVisual,
  spawnVisual,
  zoneVisual,
  type EmitterMotion,
  type SpellVisual,
  type TickedVisual,
} from "../src/game/views/spell-visuals.js";

interface BuiltEffect {
  kind: string;
  roots: readonly Object3D[];
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

function catalogueKeys(): string[] {
  const quoted = [...JSON.stringify(gameCatalogue).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1] ?? "");

  return [...new Set([PLAGUE_BURST, BLESSED_BURST, ...quoted])].sort();
}

function everyEffect(particles: ParticleSystem): BuiltEffect[] {
  const built: BuiltEffect[] = [];
  const center = new Vector3(4, 0, -6);
  const origin = new Vector3(-20, 8, -20);
  const motion: EmitterMotion = { position: new Vector3(), velocity: new Vector3(1, 0, 0), tick: 0 };

  function once(kind: string, visual: SpellVisual | null): void {
    if (visual !== null) {
      built.push({ kind, roots: [visual.root], step: () => visual.update(0.2), dispose: () => visual.dispose() });
    }
  }

  function lasting(kind: string, visual: TickedVisual | null): void {
    if (visual !== null) {
      built.push({
        kind,
        roots: [visual.root],
        step() {
          visual.sync(3);
          visual.update(0.2);
        },
        dispose: () => visual.dispose(),
      });
    }
  }

  for (const key of catalogueKeys()) {
    lasting("impact", impactVisual(particles, key, center, 15, 0, 10));
    once("landing", landingVisual(particles, key, center, 15));
    lasting("zone", zoneVisual(particles, key, center, 15, 3, 15));
    lasting("emitter", emitterVisual(particles, key, motion, 3));
    once("cast", castVisual(particles, key, center, 15, origin));
    once("form", formVisual(particles, key, center, 12));
    once("spawn", spawnVisual(particles, key, center, 8));
    once("passive", passiveVisual(particles, key, center, 12));
    once("hit", hitVisual(particles, key, center, origin));
    once("mend", mendVisual(particles, key, center, origin));
    const projectile = projectileVisual(particles, key, origin);

    if (projectile !== null) {
      built.push({ kind: "projectile", roots: projectile.objects, step: () => projectile.place(origin, center, 0.5), dispose: () => projectile.dispose() });
    }
  }

  once("risen", risenVisual(particles, center, 10));
  once("knell", deathKnell(particles, center, 12));
  once("claw", clawRake(particles, center, 1));
  once("streak", duskStreak(particles, origin, center));
  once("infection", infectionVisual(particles, center, origin));
  lasting("sanctuary", sanctuaryVisual(particles, center, 8));

  return built;
}

function playRound(effects: ReturnType<typeof createBattleEffects>, landed: string[]): void {
  effects.comboBurst(new Vector3(0, 0, 0), new Vector3(0, 5, 0), "brittle");
  effects.impactFlash(new Vector3(10, 0, 0), 8, "#ff8a4c");
  effects.projectile("strike", new Vector3(0, 5, 0), () => new Vector3(30, 5, 0), () => landed.push("bolt"));
  effects.projectile(firebolt.id, new Vector3(0, 5, 0), () => new Vector3(-30, 5, 0), () => landed.push("fireball"));
  effects.arc(new Vector3(0, 5, 0), new Vector3(0, 5, 30), "strike", () => landed.push("arc"));
  effects.delay(0.3, () => landed.push("delay"));
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
  assert.deepEqual(landed.sort(), ["arc", "bolt", "delay", "fireball"]);
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
          !material.transparent && material.blending === NormalBlending && !material.alphaToCoverage,
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
  const visuals = everyEffect(particles);

  for (const visual of visuals) {
    scene.add(...visual.roots);
    visual.step();
  }

  const cyclone = createCycloneEffect();
  scene.add(cyclone.root);
  cyclone.setActive(true);
  cyclone.update(0.2);

  const missing = [...programSignatures(scene)].filter((signature) => !warmed.has(signature));
  assert.deepEqual(missing, []);

  for (const visual of visuals) {
    visual.dispose();
  }

  cyclone.dispose();
  marker.remove();
  effects.dispose();
  particles.dispose();
});

test("a delayed bolt hides until it leaves, then flies from where its caster stands by then", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const caster = new Vector3(0, 5, 0);
  let landed = false;

  const seconds = effects.projectile(
    "strike",
    new Vector3(0, 5, 0),
    () => new Vector3(30, 5, 0),
    () => {
      landed = true;
    },
    0.4,
    () => caster,
  );

  const [bolt] = scene.children.filter((node) => node instanceof Mesh && node.geometry.isInstancedBufferGeometry !== true);
  assert.ok(bolt !== undefined);
  assert.ok(seconds > 0.4);
  assert.equal(bolt.visible, false);

  caster.set(10, 5, 0);
  effects.step(0.45);
  assert.equal(bolt.visible, true);
  assert.ok(bolt.position.x > 10, "the bolt starts from the caster's new spot");
  effects.step(seconds);
  assert.ok(landed);
  effects.dispose();
  particles.dispose();
});

test("clearing drops every running effect without landing it", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const landed: string[] = [];

  playRound(effects, landed);
  effects.clear();
  effects.step(2);
  assert.deepEqual(landed, []);
  assert.deepEqual(drawn(scene).materials, []);
  effects.dispose();
  particles.dispose();
});

test("a moving zone's ground marker follows it", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const effects = createBattleEffects(scene, particles);
  const marker = effects.marker(new Vector3(), 0.15, 12, "#8fd14f", 0.28);
  const [ring] = scene.children.filter((node) => node instanceof Mesh && node.geometry.isInstancedBufferGeometry !== true);
  assert.ok(ring !== undefined);

  marker.place(new Vector3(7, 3, -4));
  assert.deepEqual([ring.position.x, ring.position.z], [7, -4]);
  marker.remove();
  effects.dispose();
  particles.dispose();
});

test("every spell visual hands its materials back to the pool and disposes none", () => {
  const scene = new Scene();
  const particles = createParticleSystem(scene);
  const visuals = everyEffect(particles);

  assert.deepEqual(
    [...new Set(visuals.map((visual) => visual.kind))].sort(),
    ["cast", "claw", "emitter", "form", "hit", "impact", "infection", "knell", "landing", "mend", "passive", "projectile", "risen", "sanctuary", "spawn", "streak", "zone"],
  );

  for (const visual of visuals) {
    scene.add(...visual.roots);
    visual.step();
  }

  const { materials } = drawn(scene);
  const disposed: string[] = [];

  for (const material of materials) {
    material.addEventListener("dispose", () => disposed.push(material.type));
  }

  for (const visual of visuals) {
    visual.dispose();
  }

  assert.deepEqual(drawn(scene).materials, []);
  assert.deepEqual(disposed, []);

  for (const material of materials) {
    assert.throws(() => releaseEffectMaterial(material), /not taken/);
  }

  particles.dispose();
});
