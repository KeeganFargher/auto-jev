import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BasicShadowMap, DirectionalLight, PCFShadowMap } from "three";
import { applyShadowQuality, type ShadowMapState } from "../src/game/views/shadow-quality.js";

test("soft shadows use the PCF filter three r186 still ships, with a blur wider than one texel", () => {
  const shadowMap: ShadowMapState = { enabled: false, type: BasicShadowMap };
  const light = new DirectionalLight();

  applyShadowQuality(shadowMap, light.shadow, "soft");

  assert.equal(shadowMap.enabled, true);
  assert.equal(shadowMap.type, PCFShadowMap);
  assert.ok(light.shadow.radius > 1, `radius ${light.shadow.radius} blurs only one texel`);
});

test("simple shadows switch the shadow map off and leave grounding to contact shadows", () => {
  const shadowMap: ShadowMapState = { enabled: true, type: PCFShadowMap };
  const light = new DirectionalLight();

  applyShadowQuality(shadowMap, light.shadow, "simple");

  assert.equal(shadowMap.enabled, false);
});
