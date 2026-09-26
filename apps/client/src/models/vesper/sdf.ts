import { Vector3 } from "three";
import type { DistanceField, FieldBounds } from "./surface-nets.js";

export interface PartStyle {
  readonly group: number;
  readonly blend: number;
  readonly carve?: boolean;
}

export interface Part {
  readonly group: number;
  readonly blend: number;
  readonly carve: boolean;
  readonly min: Vector3;
  readonly max: Vector3;
  distance(x: number, y: number, z: number): number;
}

export interface BoneSegment {
  readonly group: number;
  readonly from: Vector3;
  readonly to: Vector3;
}

export interface SkinData {
  readonly indices: Uint16Array;
  readonly weights: Float32Array;
}

const FAR = 1e9;

const GROUP_SOFTNESS = 0.07;

const BONE_SOFTNESS = 0.1;

const INFLUENCES = 4;

const SKIN_REACH = 0.5;

const OCCLUSION_STEPS = [0.04, 0.1, 0.18, 0.28, 0.4] as const;

const OCCLUSION_STRENGTH = 1.6;

const OCCLUSION_FLOOR = 0.22;

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) {
    return Math.min(a, b);
  }

  const h = Math.max(k - Math.abs(a - b), 0) / k;

  return Math.min(a, b) - (h * h * k) / 4;
}

function ellipsoidDistance(x: number, y: number, z: number, radii: Vector3): number {
  const ax = x / radii.x;
  const ay = y / radii.y;
  const az = z / radii.z;
  const bx = ax / radii.x;
  const by = ay / radii.y;
  const bz = az / radii.z;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);

  return k1 === 0 ? -Math.min(radii.x, radii.y, radii.z) : (k0 * (k0 - 1)) / k1;
}

export function ellipsoid(center: Vector3, radii: Vector3, style: PartStyle): Part {
  return {
    group: style.group,
    blend: style.blend,
    carve: style.carve === true,
    min: center.clone().sub(radii),
    max: center.clone().add(radii),
    distance: (x, y, z) => ellipsoidDistance(x - center.x, y - center.y, z - center.z, radii),
  };
}

export function taper(
  from: Vector3,
  to: Vector3,
  fromRadius: number,
  toRadius: number,
  style: PartStyle,
  flatten: Vector3 | null = null,
): Part {
  const axis = to.clone().sub(from);
  const lengthSq = Math.max(axis.lengthSq(), 1e-9);
  const reach = Math.max(fromRadius, toRadius);
  const flat = flatten === null ? null : flatten.clone().normalize();
  const squash = flatten === null ? 0 : flatten.length() - 1;

  return {
    group: style.group,
    blend: style.blend,
    carve: style.carve === true,
    min: from.clone().min(to).subScalar(reach),
    max: from.clone().max(to).addScalar(reach),

    distance(x, y, z) {
      const px = x - from.x;
      const py = y - from.y;
      const pz = z - from.z;
      const t = Math.min(1, Math.max(0, (px * axis.x + py * axis.y + pz * axis.z) / lengthSq));
      let qx = px - axis.x * t;
      let qy = py - axis.y * t;
      let qz = pz - axis.z * t;

      if (flat !== null) {
        const along = (qx * flat.x + qy * flat.y + qz * flat.z) * squash;
        qx += flat.x * along;
        qy += flat.y * along;
        qz += flat.z * along;
      }

      return Math.sqrt(qx * qx + qy * qy + qz * qz) - (fromRadius + (toRadius - fromRadius) * t);
    },
  };
}

function boxDistance(part: Part, x: number, y: number, z: number): number {
  const dx = Math.max(part.min.x - x, 0, x - part.max.x);
  const dy = Math.max(part.min.y - y, 0, y - part.max.y);
  const dz = Math.max(part.min.z - z, 0, z - part.max.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function evaluate(unions: readonly Part[], carves: readonly Part[], x: number, y: number, z: number): number {
  let d = FAR;

  for (const part of unions) {
    if (boxDistance(part, x, y, z) - d < part.blend) {
      d = smin(d, part.distance(x, y, z), part.blend);
    }
  }

  for (const part of carves) {
    if (boxDistance(part, x, y, z) + d < part.blend) {
      d = -smin(-d, part.distance(x, y, z), part.blend);
    }
  }

  return d;
}

export function fieldOf(parts: readonly Part[]): DistanceField {
  const unions = parts.filter((part) => !part.carve);
  const carves = parts.filter((part) => part.carve);

  return (x, y, z) => evaluate(unions, carves, x, y, z);
}

export function localField(parts: readonly Part[], bounds: FieldBounds, cell: number, reach: number): DistanceField {
  const { min, max } = bounds;
  const nx = Math.max(1, Math.ceil((max.x - min.x) / cell));
  const ny = Math.max(1, Math.ceil((max.y - min.y) / cell));
  const nz = Math.max(1, Math.ceil((max.z - min.z) / cell));
  const unions: Part[][] = Array.from({ length: nx * ny * nz }, () => []);
  const carves: Part[][] = Array.from({ length: nx * ny * nz }, () => []);

  const clampCell = (value: number, lower: number, count: number): number =>
    Math.min(count - 1, Math.max(0, Math.floor((value - lower) / cell)));

  for (const part of parts) {
    const pad = part.blend + reach;
    const i0 = clampCell(part.min.x - pad, min.x, nx);
    const i1 = clampCell(part.max.x + pad, min.x, nx);
    const j0 = clampCell(part.min.y - pad, min.y, ny);
    const j1 = clampCell(part.max.y + pad, min.y, ny);
    const k0 = clampCell(part.min.z - pad, min.z, nz);
    const k1 = clampCell(part.max.z + pad, min.z, nz);

    for (let k = k0; k <= k1; k += 1) {
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          (part.carve ? carves : unions)[i + nx * (j + ny * k)]?.push(part);
        }
      }
    }
  }

  return (x, y, z) => {
    const index = clampCell(x, min.x, nx) + nx * (clampCell(y, min.y, ny) + ny * clampCell(z, min.z, nz));
    const local = unions[index] ?? [];

    return local.length === 0 ? reach : evaluate(local, carves[index] ?? [], x, y, z);
  };
}

function segmentDistance(segment: BoneSegment, x: number, y: number, z: number): number {
  const ax = segment.to.x - segment.from.x;
  const ay = segment.to.y - segment.from.y;
  const az = segment.to.z - segment.from.z;
  const px = x - segment.from.x;
  const py = y - segment.from.y;
  const pz = z - segment.from.z;
  const t = Math.min(1, Math.max(0, (px * ax + py * ay + pz * az) / Math.max(ax * ax + ay * ay + az * az, 1e-9)));

  const qx = px - ax * t;
  const qy = py - ay * t;
  const qz = pz - az * t;

  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

export function skinWeights(
  parts: readonly Part[],
  bones: readonly BoneSegment[],
  groups: number,
  positions: ArrayLike<number>,
): SkinData {
  const count = positions.length / 3;
  const indices = new Uint16Array(count * INFLUENCES);
  const weights = new Float32Array(count * INFLUENCES);
  const unions = parts.filter((part) => !part.carve);
  const membership = new Float64Array(groups);
  const distances = new Float64Array(unions.length);
  const boneDistances = new Float64Array(bones.length);
  const nearest = new Float64Array(groups);
  const totals = new Float64Array(groups);
  const influence = new Float64Array(bones.length);

  for (let vertex = 0; vertex < count; vertex += 1) {
    const x = positions[vertex * 3] ?? 0;
    const y = positions[vertex * 3 + 1] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    let closest = FAR;

    for (const [index, part] of unions.entries()) {
      const d = boxDistance(part, x, y, z) > SKIN_REACH ? FAR : part.distance(x, y, z);
      distances[index] = d;
      closest = Math.min(closest, d);
    }

    membership.fill(0);

    for (const [index, part] of unions.entries()) {
      membership[part.group] =
        (membership[part.group] ?? 0) + Math.exp(-((distances[index] ?? FAR) - closest) / GROUP_SOFTNESS);
    }

    nearest.fill(FAR);

    for (const [index, bone] of bones.entries()) {
      const d = segmentDistance(bone, x, y, z);
      boneDistances[index] = d;
      nearest[bone.group] = Math.min(nearest[bone.group] ?? FAR, d);
    }

    totals.fill(0);

    for (const [index, bone] of bones.entries()) {
      const share = Math.exp(-((boneDistances[index] ?? FAR) - (nearest[bone.group] ?? 0)) / BONE_SOFTNESS);
      influence[index] = share;
      totals[bone.group] = (totals[bone.group] ?? 0) + share;
    }

    let groupTotal = 0;

    for (const value of membership) {
      groupTotal += value;
    }

    for (const [index, bone] of bones.entries()) {
      influence[index] =
        (((membership[bone.group] ?? 0) / Math.max(groupTotal, 1e-12)) * (influence[index] ?? 0)) /
        Math.max(totals[bone.group] ?? 0, 1e-12);
    }

    let sum = 0;

    for (let slot = 0; slot < INFLUENCES; slot += 1) {
      let best = -1;
      let bestWeight = 0;

      for (let index = 0; index < bones.length; index += 1) {
        const weight = influence[index] ?? 0;

        if (weight > bestWeight) {
          best = index;
          bestWeight = weight;
        }
      }

      if (best < 0) {
        break;
      }

      indices[vertex * INFLUENCES + slot] = best;
      weights[vertex * INFLUENCES + slot] = bestWeight;
      sum += bestWeight;
      influence[best] = 0;
    }

    for (let slot = 0; slot < INFLUENCES; slot += 1) {
      weights[vertex * INFLUENCES + slot] = (weights[vertex * INFLUENCES + slot] ?? 0) / Math.max(sum, 1e-12);
    }
  }

  return { indices, weights };
}

export function bakeOcclusion(
  field: DistanceField,
  positions: ArrayLike<number>,
  normals: ArrayLike<number>,
): Float32Array {
  const count = positions.length / 3;
  const light = new Float32Array(count);

  for (let vertex = 0; vertex < count; vertex += 1) {
    const x = positions[vertex * 3] ?? 0;
    const y = positions[vertex * 3 + 1] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    const nx = normals[vertex * 3] ?? 0;
    const ny = normals[vertex * 3 + 1] ?? 0;
    const nz = normals[vertex * 3 + 2] ?? 0;
    let occlusion = 0;

    for (const [index, reach] of OCCLUSION_STEPS.entries()) {
      const d = field(x + nx * reach, y + ny * reach, z + nz * reach);
      occlusion += Math.max(0, reach - d) / (index + 1);
    }

    light[vertex] = Math.max(OCCLUSION_FLOOR, 1 - OCCLUSION_STRENGTH * occlusion);
  }

  return light;
}
