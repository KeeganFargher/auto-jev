import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { berserker } from "@jev-game/content";
import { Color, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { HIT_SECONDS } from "../src/game/views/figure-base.js";
import { createHeroFigure } from "../src/game/views/hero-figures.js";
import { installHeroModels } from "./hero-models.js";

const RAGE_RED = new Color("#ff2a10");

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

test("a raging figure glows red, a hit washes the red out white, and calming down puts the glow out", () => {
  const figure = createHeroFigure(berserker.id);
  figure.update(0);
  const materials = skins(figure.root);
  assert.ok(materials.length > 0, "the berserker has no skin to glow");

  figure.setRage(0.16);
  figure.update(0.01);
  glowsAs(materials, RAGE_RED.clone().multiplyScalar(0.16), "raging");

  figure.flinch();
  figure.update(HIT_SECONDS / 2);
  glowsAs(materials, new Color(0.55, 0.55, 0.55), "hit while raging");

  figure.update(HIT_SECONDS);
  glowsAs(materials, RAGE_RED.clone().multiplyScalar(0.16), "raging again after the hit");

  figure.setRage(0);
  figure.update(0.01);
  glowsAs(materials, new Color(0, 0, 0), "calmed down");
  figure.dispose();
});

test("a figure refuses less rage than none or more than full", () => {
  const figure = createHeroFigure(berserker.id);

  for (const amount of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => figure.setRage(amount), /between 0 and 1/);
  }

  figure.dispose();
});
