import { Color, MeshPhysicalMaterial } from "three";

const FUR = new Color("#1d1727");

const SHEEN = new Color("#9c7fd8");

const RIM = new Color("#6d3fd0");

const NOISE = `
varying vec3 vFurPoint;
uniform vec3 furRim;
float furHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
vec3 furHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float furValue(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(furHash(i), furHash(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(furHash(i + vec3(0.0, 1.0, 0.0)), furHash(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(furHash(i + vec3(0.0, 0.0, 1.0)), furHash(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(furHash(i + vec3(0.0, 1.0, 1.0)), furHash(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float furCells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = 8.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = g + furHash3(i + g) - f;
        best = min(best, dot(r, r));
      }
    }
  }
  return sqrt(best);
}
vec3 furBump(vec3 surface, vec3 surfaceNormal, float height) {
  vec3 sigmaX = dFdx(surface);
  vec3 sigmaY = dFdy(surface);
  vec3 r1 = cross(sigmaY, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, sigmaX);
  float det = dot(sigmaX, r1) * (gl_FrontFacing ? 1.0 : -1.0);
  vec2 slope = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (slope.x * r1 + slope.y * r2);
  return normalize(abs(det) * surfaceNormal - grad);
}
`;

const ROSETTES = `
float furSpot = furCells(vFurPoint * 2.6);
float furRing = smoothstep(0.2, 0.3, furSpot) * (1.0 - smoothstep(0.34, 0.46, furSpot));
diffuseColor.rgb *= 1.0 + 0.5 * furRing;
`;

const STROKES = `
float furDetail = clamp(1.0 - length(fwidth(vFurPoint)) * 24.0, 0.0, 1.0);
float furStroke = furValue(vFurPoint * vec3(38.0, 38.0, 9.0)) * 0.65 + furValue(vFurPoint * vec3(84.0, 84.0, 21.0)) * 0.35;
normal = furBump(-vViewPosition, normal, furStroke * 0.014 * furDetail);
`;

const GLOW = `
float furFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
totalEmissiveRadiance += furRim * pow(1.0 - furFacing, 3.0);
`;

export function createFurMaterial(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: FUR,
    roughness: 0.74,
    sheen: 0.12,
    sheenColor: SHEEN,
    sheenRoughness: 0.55,
    vertexColors: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms["furRim"] = { value: RIM.clone().multiplyScalar(0.35) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFurPoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFurPoint = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${ROSETTES}`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${STROKES}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GLOW}`);
  };

  material.customProgramCacheKey = () => "vesper-fur";

  return material;
}
