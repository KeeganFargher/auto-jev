import { PCFShadowMap, type DirectionalLight, type ShadowMapType } from "three";
import type { ShadowQuality } from "../../graphics/settings.js";

export interface ShadowMapState {
  enabled: boolean;
  type: ShadowMapType;
}

const SOFT_SHADOW_RADIUS = 4;

export function applyShadowQuality(shadowMap: ShadowMapState, light: DirectionalLight, quality: ShadowQuality): void {
  shadowMap.enabled = true;
  shadowMap.type = PCFShadowMap;
  light.castShadow = quality === "soft";
  light.shadow.radius = SOFT_SHADOW_RADIUS;
}
