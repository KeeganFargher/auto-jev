import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { paladin } from "@jev-game/content";
import { Color, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { HIT_SECONDS } from "../src/game/views/figure-base.js";
import { createHeroFigure } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const FROST_BLUE = new Color("#5fc8ff");

before(installHeroModels);

function skins(root: Object3D): MeshStandardMaterial[] {
  const found: MeshStandardMaterial[] = [];

  root.traverse((node) => {
    if (
      node instanceof Mesh &&
      node.material instanceof MeshStandardMaterial &&
      node.material.map !== null
    ) {
      found.push(node.material);
    }
  });

  return found;
}

function glowsAs(materials: readonly MeshStandardMaterial[], expected: Color, label: string): void {
  for (const material of materials) {
    const { r, g, b } = material.emissive;

    assert.ok(
      Math.abs(r - expected.r) < 1e-6 &&
        Math.abs(g - expected.g) < 1e-6 &&
        Math.abs(b - expected.b) < 1e-6,
      `${label}: the skin glows ${[r, g, b]} instead of ${expected.toArray()}`,
    );
  }
}

test("a frozen figure glows icy blue, a hit washes it out white, and thawing puts the glow out", () => {
  const figure = createHeroFigure(paladin.id);
  figure.update(0);
  const materials = skins(figure.root);
  assert.ok(materials.length > 0, "the paladin has no skin to glow");

  figure.setFrost(0.5);
  figure.update(0.01);
  glowsAs(materials, FROST_BLUE.clone().multiplyScalar(0.5), "frozen");

  figure.flinch();
  figure.update(HIT_SECONDS / 2);
  glowsAs(materials, new Color(0.55, 0.55, 0.55), "hit while frozen");

  figure.update(HIT_SECONDS);
  glowsAs(materials, FROST_BLUE.clone().multiplyScalar(0.5), "frozen again after the hit");

  figure.setFrost(0);
  figure.update(0.01);
  glowsAs(materials, new Color(0, 0, 0), "thawed");
  figure.dispose();
});

test("a figure refuses less frost than none or more than full", () => {
  const figure = createHeroFigure(paladin.id);

  for (const amount of [-0.1, 1.5, Number.NaN]) {
    assert.throws(() => figure.setFrost(amount), /between 0 and 1/);
  }

  figure.dispose();
});
