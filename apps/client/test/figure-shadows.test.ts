import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Mesh, type Material, type Object3D } from "three";
import { createPlaceholderFigure } from "../src/game/views/hero-figures.js";

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];

  root.traverse((node) => {
    if (node instanceof Mesh) {
      found.push(node);
    }
  });

  return found;
}

function seeThrough(mesh: Mesh): boolean {
  const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return materials.some((material) => material.transparent);
}

function casterIds(root: Object3D): number[] {
  return meshes(root).flatMap((mesh) => (mesh.castShadow ? [mesh.id] : []));
}

function seeThroughCasterIds(root: Object3D): number[] {
  return meshes(root).flatMap((mesh) => (mesh.castShadow && seeThrough(mesh) ? [mesh.id] : []));
}

test("a figure stands on a contact shadow that never casts a shadow of its own", () => {
  const figure = createPlaceholderFigure("bulwark");

  assert.ok(meshes(figure.root).some(seeThrough), "the figure has no see-through contact shadow");
  assert.ok(casterIds(figure.root).length > 0);
  assert.deepEqual(seeThroughCasterIds(figure.root), []);
  figure.dispose();
});

test("turning a figure's shadow off and on again restores only its solid parts", () => {
  const figure = createPlaceholderFigure("bulwark");
  const solid = casterIds(figure.root);

  figure.setCastsShadow(false);
  assert.deepEqual(casterIds(figure.root), []);

  figure.setCastsShadow(true);
  assert.deepEqual(casterIds(figure.root), solid);
  assert.deepEqual(seeThroughCasterIds(figure.root), []);
  figure.dispose();
});
