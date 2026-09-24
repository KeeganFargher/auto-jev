import { PCFShadowMap, type LightShadow, type ShadowMapType } from "three";

export type ShadowQuality = "soft" | "simple";

export interface ShadowMapState {
  enabled: boolean;
  type: ShadowMapType;
}

const SOFT_SHADOW_RADIUS = 4;

export function applyShadowQuality(shadowMap: ShadowMapState, shadow: LightShadow, quality: ShadowQuality): void {
  shadowMap.enabled = quality === "soft";
  shadowMap.type = PCFShadowMap;
  shadow.radius = SOFT_SHADOW_RADIUS;
}
