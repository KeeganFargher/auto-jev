import { Vector3 } from "three";

export interface Sweep {
  readonly points: readonly Vector3[];
  readonly ups: readonly Vector3[];
  readonly widths: readonly number[];
  readonly thicknesses: readonly number[];
  readonly closed: boolean;
}

export interface SweepStyle {
  readonly sides: number;
  readonly squareness: number;
  readonly tileLength: number;
}

export interface VertexArrays {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
}

interface Profile {
  readonly across: Float32Array;
  readonly lift: Float32Array;
  readonly normalAcross: Float32Array;
  readonly normalLift: Float32Array;
}

const MIN_HALF = 1e-4;

function ringCount(sweep: Sweep): number {
  return sweep.closed ? sweep.points.length + 1 : sweep.points.length;
}

export function sweepVertexCount(sweep: Sweep, style: SweepStyle): number {
  return ringCount(sweep) * (style.sides + 1);
}

export function sweepIndexCount(sweep: Sweep, style: SweepStyle): number {
  return (ringCount(sweep) - 1) * style.sides * 6;
}

function signedPower(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function profileOf(style: SweepStyle): Profile {
  const count = style.sides + 1;
  const across = new Float32Array(count);
  const lift = new Float32Array(count);
  const normalAcross = new Float32Array(count);
  const normalLift = new Float32Array(count);
  const exponent = 2 / style.squareness;
  const normalExponent = (2 * (style.squareness - 1)) / style.squareness;

  for (let side = 0; side < count; side += 1) {
    const angle = (side / style.sides) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    across[side] = signedPower(cos, exponent);
    lift[side] = signedPower(sin, exponent);
    normalAcross[side] = signedPower(cos, normalExponent);
    normalLift[side] = signedPower(sin, normalExponent);
  }

  return { across, lift, normalAcross, normalLift };
}

function pathLength(sweep: Sweep): number {
  const { points } = sweep;
  let length = 0;

  for (let index = 1; index < points.length; index += 1) {
    length += points[index]!.distanceTo(points[index - 1]!);
  }

  if (sweep.closed && points.length > 1) {
    length += points[0]!.distanceTo(points[points.length - 1]!);
  }

  return length;
}

export function writeSweep(
  sweep: Sweep,
  style: SweepStyle,
  target: VertexArrays,
  vertexOffset: number,
  writeUvs: boolean,
): void {
  const { points, ups, widths, thicknesses, closed } = sweep;
  const count = points.length;
  const rings = ringCount(sweep);
  const stride = style.sides + 1;
  const profile = profileOf(style);
  const total = pathLength(sweep);
  const repeats = closed ? Math.max(1, Math.round(total / style.tileLength)) : total / style.tileLength;
  const tile = total / Math.max(repeats, MIN_HALF);
  const tangent = new Vector3();
  const side = new Vector3();
  const lastSide = new Vector3(1, 0, 0);
  const up = new Vector3();
  const offset = new Vector3();
  const normal = new Vector3();
  let travelled = 0;

  for (let ring = 0; ring < rings; ring += 1) {
    const index = ring % count;
    const point = points[index]!;
    const previous = closed ? points[(index - 1 + count) % count]! : points[Math.max(index - 1, 0)]!;
    const next = closed ? points[(index + 1) % count]! : points[Math.min(index + 1, count - 1)]!;

    if (ring > 0) {
      travelled += point.distanceTo(points[(ring - 1) % count]!);
    }

    tangent.subVectors(next, previous).normalize();
    side.crossVectors(tangent, ups[index]!);

    if (side.lengthSq() < 1e-10) {
      side.copy(lastSide);
    } else {
      side.normalize();
      lastSide.copy(side);
    }

    up.crossVectors(side, tangent).normalize();
    const halfWidth = Math.max((widths[index] ?? 0) / 2, MIN_HALF);
    const halfThickness = Math.max((thicknesses[index] ?? 0) / 2, MIN_HALF);
    const u = travelled / tile;

    for (let around = 0; around < stride; around += 1) {
      const vertex = vertexOffset + ring * stride + around;
      offset
        .copy(side)
        .multiplyScalar(halfWidth * profile.across[around]!)
        .addScaledVector(up, halfThickness * profile.lift[around]!);
      normal
        .copy(side)
        .multiplyScalar(profile.normalAcross[around]! / halfWidth)
        .addScaledVector(up, profile.normalLift[around]! / halfThickness)
        .normalize();
      target.positions[vertex * 3] = point.x + offset.x;
      target.positions[vertex * 3 + 1] = point.y + offset.y;
      target.positions[vertex * 3 + 2] = point.z + offset.z;
      target.normals[vertex * 3] = normal.x;
      target.normals[vertex * 3 + 1] = normal.y;
      target.normals[vertex * 3 + 2] = normal.z;
      target.tangents[vertex * 4] = tangent.x;
      target.tangents[vertex * 4 + 1] = tangent.y;
      target.tangents[vertex * 4 + 2] = tangent.z;
      target.tangents[vertex * 4 + 3] = 1;

      if (writeUvs) {
        target.uvs[vertex * 2] = u;
        target.uvs[vertex * 2 + 1] = around / style.sides;
      }
    }
  }
}

export function writeSweepIndices(
  sweep: Sweep,
  style: SweepStyle,
  indices: Uint32Array,
  indexOffset: number,
  vertexOffset: number,
): void {
  const rings = ringCount(sweep);
  const stride = style.sides + 1;
  let cursor = indexOffset;

  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let around = 0; around < style.sides; around += 1) {
      const a = vertexOffset + ring * stride + around;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices[cursor] = a;
      indices[cursor + 1] = c;
      indices[cursor + 2] = b;
      indices[cursor + 3] = b;
      indices[cursor + 4] = c;
      indices[cursor + 5] = d;
      cursor += 6;
    }
  }
}

export function transportedUps(points: readonly Vector3[], firstUp: Vector3): Vector3[] {
  const ups: Vector3[] = [];
  const tangent = new Vector3();
  const previousTangent = new Vector3();
  const axis = new Vector3();
  const up = firstUp.clone();

  for (let index = 0; index < points.length; index += 1) {
    const next = points[Math.min(index + 1, points.length - 1)]!;
    const previous = points[Math.max(index - 1, 0)]!;
    tangent.subVectors(next, previous).normalize();

    if (index > 0) {
      axis.crossVectors(previousTangent, tangent);
      const sine = axis.length();

      if (sine > 1e-6) {
        axis.divideScalar(sine);
        up.applyAxisAngle(axis, Math.atan2(sine, previousTangent.dot(tangent)));
      }
    }

    up.addScaledVector(tangent, -up.dot(tangent)).normalize();
    ups.push(up.clone());
    previousTangent.copy(tangent);
  }

  return ups;
}
