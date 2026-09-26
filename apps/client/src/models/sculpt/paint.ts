import { Color, Float32BufferAttribute, Vector3, type BufferGeometry } from "three";
import { bakeOcclusion, type Part } from "../vesper/sdf.js";
import type { DistanceField, FieldBounds } from "../vesper/surface-nets.js";
import { fbm, valueNoise } from "./noise.js";

export interface Paint {
  readonly base: Color;
  readonly wash: Color;
  readonly highlight: Color;
  readonly patch?: Color;
}

const REGION_SOFTNESS = 0.045;

const REGION_REACH = 0.3;

const CURVE_STEP = 0.025;

const CONVEX_FROM = 4;

const CONVEX_RANGE = 14;

const CONCAVE_RANGE = 10;

const EDGE_STRENGTH = 0.55;

const CREVICE_STRENGTH = 0.55;

const ZENITH_FLOOR = 0.7;

const ZENITH_GAIN = 0.22;

const MOTTLE = 0.2;

const PATCH_SCALE = 2.4;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(from: number, to: number, value: number): number {
  const t = clamp01((value - from) / (to - from));

  return t * t * (3 - 2 * t);
}

function boxDistance(part: Part, x: number, y: number, z: number): number {
  const dx = Math.max(part.min.x - x, 0, x - part.max.x);
  const dy = Math.max(part.min.y - y, 0, y - part.max.y);
  const dz = Math.max(part.min.z - z, 0, z - part.max.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function roughen(part: Part, amplitude: number, frequency: Vector3, seed: number, octaves = 2): Part {
  return {
    group: part.group,
    blend: part.blend,
    carve: part.carve,
    min: part.min.clone().subScalar(amplitude),
    max: part.max.clone().addScalar(amplitude),

    distance(x, y, z) {
      const grain = fbm(x * frequency.x, y * frequency.y, z * frequency.z, seed, octaves) - 0.5;

      return part.distance(x, y, z) + amplitude * 2 * grain;
    },
  };
}

export function partBounds(parts: readonly Part[], margin: number): FieldBounds {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const part of parts) {
    if (!part.carve) {
      min.min(part.min);
      max.max(part.max);
    }
  }

  return { min: min.subScalar(margin), max: max.addScalar(margin) };
}

function add(target: Color, source: Color, weight: number): void {
  target.r += source.r * weight;
  target.g += source.g * weight;
  target.b += source.b * weight;
}

export function paintSurface(
  geometry: BufferGeometry,
  parts: readonly Part[],
  field: DistanceField,
  paints: readonly Paint[],
  seed: number,
  occluder: DistanceField = field,
): void {
  const positions = geometry.getAttribute("position").array;
  const normals = geometry.getAttribute("normal").array;
  const light = bakeOcclusion(occluder, positions, normals);
  const unions = parts.filter((part) => !part.carve);
  const distances = new Float32Array(unions.length);
  const weights = new Float32Array(paints.length);
  const colors = new Float32Array(positions.length);
  const base = new Color();
  const wash = new Color();
  const highlight = new Color();
  const patch = new Color();
  const color = new Color();
  const h = CURVE_STEP;

  for (let vertex = 0; vertex < light.length; vertex += 1) {
    const x = positions[vertex * 3] ?? 0;
    const y = positions[vertex * 3 + 1] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    const ny = normals[vertex * 3 + 1] ?? 0;
    let nearest = Infinity;

    for (const [index, part] of unions.entries()) {
      const distance = boxDistance(part, x, y, z) < REGION_REACH ? part.distance(x, y, z) : Infinity;
      distances[index] = distance;
      nearest = Math.min(nearest, distance);
    }

    weights.fill(0);

    for (const [index, part] of unions.entries()) {
      const distance = distances[index] ?? Infinity;

      if (distance < nearest + REGION_REACH) {
        weights[part.group] = (weights[part.group] ?? 0) + Math.exp(-(distance - nearest) / REGION_SOFTNESS);
      }
    }

    let total = 0;

    for (const weight of weights) {
      total += weight;
    }

    base.setRGB(0, 0, 0);
    wash.setRGB(0, 0, 0);
    highlight.setRGB(0, 0, 0);
    patch.setRGB(0, 0, 0);
    let patchWeight = 0;

    for (const [group, paint] of paints.entries()) {
      const weight = total > 0 ? (weights[group] ?? 0) / total : group === 0 ? 1 : 0;
      add(base, paint.base, weight);
      add(wash, paint.wash, weight);
      add(highlight, paint.highlight, weight);

      if (paint.patch !== undefined) {
        add(patch, paint.patch, weight);
        patchWeight += weight;
      }
    }

    const d0 = field(x, y, z);

    const laplacian =
      (field(x + h, y, z) +
        field(x - h, y, z) +
        field(x, y + h, z) +
        field(x, y - h, z) +
        field(x, y, z + h) +
        field(x, y, z - h) -
        6 * d0) /
      (h * h);

    const convex = clamp01((laplacian - CONVEX_FROM) / CONVEX_RANGE);
    const concave = clamp01(-laplacian / CONCAVE_RANGE);
    color.copy(base);

    if (patchWeight > 0) {
      const moss =
        smoothstep(0.5, 0.64, fbm(x * PATCH_SCALE, y * PATCH_SCALE, z * PATCH_SCALE, seed + 7)) *
        smoothstep(0.05, 0.5, ny);

      color.lerp(patch.multiplyScalar(1 / patchWeight), moss * patchWeight);
    }

    color.lerp(wash, 1 - (light[vertex] ?? 1));
    color.lerp(wash, concave * CREVICE_STRENGTH);
    color.lerp(highlight, convex * EDGE_STRENGTH);
    color.multiplyScalar(ZENITH_FLOOR + ZENITH_GAIN * Math.max(0, ny));
    color.multiplyScalar(1 - MOTTLE / 2 + MOTTLE * valueNoise(x * 6, y * 6, z * 6, seed));
    colors[vertex * 3] = color.r;
    colors[vertex * 3 + 1] = color.g;
    colors[vertex * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}
