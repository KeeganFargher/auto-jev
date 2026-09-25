import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Mesh, type Material, type Object3D } from "three";
import { createPlaceholderFigure } from "../src/game/views/hero-figures.js";

const HEROES = [
  "bulwark",
  "frostweaver",
  "duskblade",
  "pyromancer",
  "oathkeeper",
  "ravager",
  "hexbinder",
  "blightmother",
  "bonecaller",
  "clockwright",
  "thrall",
  "bone-golem",
  "turret",
];

interface SolidPart {
  mesh: Mesh;
  material: Material;
}

function solidParts(root: Object3D): SolidPart[] {
  const found: SolidPart[] = [];

  root.traverse((node) => {
    if (node instanceof Mesh && !Array.isArray(node.material) && !node.material.transparent) {
      found.push({ mesh: node, material: node.material });
    }
  });

  return found;
}

function repeatedMaterials(root: Object3D): string[] {
  const seen = new Map<Object3D, Set<Material>>();
  const repeated: string[] = [];

  for (const { mesh, material } of solidParts(root)) {
    const parent = mesh.parent;
    assert.ok(parent !== null);
    const used = seen.get(parent) ?? new Set<Material>();
    seen.set(parent, used);

    if (used.has(material)) {
      repeated.push(material.uuid);
    }

    used.add(material);
  }

  return repeated;
}

test("every placeholder hero draws each of its materials once per moving part", () => {
  for (const heroId of HEROES) {
    const figure = createPlaceholderFigure(heroId);

    assert.deepEqual(repeatedMaterials(figure.root), [], `${heroId} draws a material more than once`);
    figure.dispose();
  }
});

test("a merged hero still casts a shadow from every solid part", () => {
  for (const heroId of HEROES) {
    const figure = createPlaceholderFigure(heroId);
    const solid = solidParts(figure.root);

    assert.ok(solid.length > 0, `${heroId} has no solid parts`);
    assert.ok(
      solid.every((part) => part.mesh.castShadow),
      `${heroId} has a solid part without a shadow`,
    );
    figure.dispose();
  }
});
