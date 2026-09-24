import { strict as assert } from "node:assert";
import { test } from "node:test";
import { firebolt, flameWard, meteor } from "@jev-game/content";
import { Mesh, Scene, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import { createParticleSystem } from "../src/game/views/particles.js";
import { castVisual, landingVisual, projectileVisual, zoneVisual } from "../src/game/views/spell-visuals.js";

function meshesOf(roots: readonly Object3D[]): Mesh[] {
  const found: Mesh[] = [];

  for (const root of roots) {
    root.traverse((node) => {
      if (node instanceof Mesh) {
        found.push(node);
      }
    });
  }

  return found;
}

function materialsOf(roots: readonly Object3D[]): Material[] {
  return [...new Set(meshesOf(roots).flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])))];
}

function geometriesOf(roots: readonly Object3D[]): BufferGeometry[] {
  return [...new Set(meshesOf(roots).map((mesh) => mesh.geometry))];
}

function uuids(items: readonly { uuid: string }[]): string[] {
  return items.map((item) => item.uuid).sort();
}

function disposals(items: readonly (Material | BufferGeometry)[]): () => number {
  let count = 0;

  for (const item of items) {
    item.addEventListener("dispose", () => {
      count += 1;
    });
  }

  return () => count;
}

test("a finished meteor blast hands its materials to the next blast instead of disposing them", () => {
  const particles = createParticleSystem(new Scene());
  const first = landingVisual(particles, meteor.id, new Vector3(), 15);
  assert.ok(first !== null);
  const materials = materialsOf([first.root]);
  const disposed = disposals(materials);

  first.update(5);
  assert.ok(first.finished());
  first.dispose();
  assert.equal(disposed(), 0);

  const second = landingVisual(particles, meteor.id, new Vector3(10, 0, 10), 15);
  assert.ok(second !== null);
  assert.deepEqual(uuids(materialsOf([second.root])), uuids(materials));
  second.dispose();
  particles.dispose();
});

test("burning ground and a flame ward keep their materials for the next cast", () => {
  const particles = createParticleSystem(new Scene());
  const ground = zoneVisual(particles, meteor.id, new Vector3(), 15, 1);
  const ward = castVisual(particles, flameWard.id, new Vector3(), 12);
  assert.ok(ground !== null && ward !== null);
  const materials = materialsOf([ground.root, ward.root]);
  const disposed = disposals(materials);

  ground.end();
  ground.update(5);
  ward.update(5);
  ground.dispose();
  ward.dispose();
  assert.equal(disposed(), 0);
  particles.dispose();
});

test("a fireball reuses the materials and meshes' geometry of the fireball before it", () => {
  const particles = createParticleSystem(new Scene());
  const first = projectileVisual(particles, firebolt.id, new Vector3());
  assert.ok(first !== null);
  const materials = materialsOf(first.objects);
  const geometries = geometriesOf(first.objects);
  const disposed = disposals([...materials, ...geometries]);

  first.place(new Vector3(), new Vector3(20, 0, 0), 1);
  first.dispose();
  assert.equal(disposed(), 0);

  const second = projectileVisual(particles, firebolt.id, new Vector3());
  assert.ok(second !== null);
  assert.deepEqual(uuids(materialsOf(second.objects)), uuids(materials));
  assert.deepEqual(uuids(geometriesOf(second.objects)), uuids(geometries));
  second.dispose();
  particles.dispose();
});
