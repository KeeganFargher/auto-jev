import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BasicShadowMap, DirectionalLight, PCFShadowMap } from "three";
import { applyShadowQuality, type ShadowMapState } from "../src/game/views/shadow-quality.js";

test("soft shadows use the PCF filter three r186 still ships, with a blur wider than one texel", () => {
  const shadowMap: ShadowMapState = { enabled: false, type: BasicShadowMap };
  const light = new DirectionalLight();

  applyShadowQuality(shadowMap, light, "soft");

  assert.equal(shadowMap.enabled, true);
  assert.equal(shadowMap.type, PCFShadowMap);
  assert.equal(light.castShadow, true);
  assert.ok(light.shadow.radius > 1, `radius ${light.shadow.radius} blurs only one texel`);
});

test("simple shadows stop the sun casting, which leaves grounding to contact shadows", () => {
  const shadowMap: ShadowMapState = { enabled: true, type: PCFShadowMap };
  const light = new DirectionalLight();
  light.castShadow = true;

  applyShadowQuality(shadowMap, light, "simple");

  assert.equal(light.castShadow, false);
});

test("switching back to soft shadows makes the sun cast again", () => {
  const shadowMap: ShadowMapState = { enabled: true, type: PCFShadowMap };
  const light = new DirectionalLight();

  applyShadowQuality(shadowMap, light, "simple");
  applyShadowQuality(shadowMap, light, "soft");

  assert.equal(light.castShadow, true);
});
