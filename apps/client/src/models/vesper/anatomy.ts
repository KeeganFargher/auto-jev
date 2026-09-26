import { Vector3 } from "three";
import { ellipsoid, taper, type BoneSegment, type Part } from "./sdf.js";
import type { FieldBounds } from "./surface-nets.js";

const TORSO = 0;

const TAIL_GROUP = 1;

const FRONT_LEFT = 2;

const FRONT_RIGHT = 3;

const HIND_LEFT = 4;

const HIND_RIGHT = 5;

export const GROUPS = 6;

export interface LegJoints {
  readonly group: number;
  readonly side: number;
  readonly hind: boolean;
  readonly top: Vector3;
  readonly bend: Vector3;
  readonly ankle: Vector3;
  readonly paw: Vector3;
  readonly toe: Vector3;
}

export const SPINE: readonly Vector3[] = [
  new Vector3(0, 2.3, -1.55),
  new Vector3(0, 2.25, -0.7),
  new Vector3(0, 2.2, 0.2),
  new Vector3(0, 2.3, 1.0),
  new Vector3(0, 2.5, 1.5),
  new Vector3(0, 2.72, 1.88),
  new Vector3(0, 2.92, 2.15),
  new Vector3(0, 2.92, 2.8),
];

export const HEAD_JOINT = 6;

export const TAIL: readonly Vector3[] = [
  new Vector3(0, 2.45, -2.02),
  new Vector3(0, 2.3, -2.4),
  new Vector3(0, 2.07, -2.72),
  new Vector3(0, 1.78, -2.96),
  new Vector3(0, 1.46, -3.13),
  new Vector3(0, 1.14, -3.26),
  new Vector3(0, 0.86, -3.43),
  new Vector3(0, 0.68, -3.68),
  new Vector3(0, 0.64, -4.0),
];

function frontLeg(side: number): LegJoints {
  return {
    group: side > 0 ? FRONT_LEFT : FRONT_RIGHT,
    side,
    hind: false,
    top: new Vector3(side * 0.47, 1.9, 1.32),
    bend: new Vector3(side * 0.44, 1.18, 0.98),
    ankle: new Vector3(side * 0.42, 0.44, 1.26),
    paw: new Vector3(side * 0.42, 0.15, 1.46),
    toe: new Vector3(side * 0.42, 0.1, 1.72),
  };
}

function hindLeg(side: number): LegJoints {
  return {
    group: side > 0 ? HIND_LEFT : HIND_RIGHT,
    side,
    hind: true,
    top: new Vector3(side * 0.43, 2.15, -1.5),
    bend: new Vector3(side * 0.47, 1.34, -1.02),
    ankle: new Vector3(side * 0.45, 0.78, -1.84),
    paw: new Vector3(side * 0.45, 0.14, -1.62),
    toe: new Vector3(side * 0.45, 0.1, -1.38),
  };
}

export const LEGS: readonly LegJoints[] = [frontLeg(1), frontLeg(-1), hindLeg(1), hindLeg(-1)];

export const BODY_BOUNDS: FieldBounds = { min: new Vector3(-1.1, -0.05, -4.3), max: new Vector3(1.1, 3.4, 2.7) };

export const HEAD_BOUNDS: FieldBounds = { min: new Vector3(-0.95, -0.6, -0.75), max: new Vector3(0.95, 1.2, 1.2) };

function v(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}

function torsoParts(): Part[] {
  const torso = TORSO;

  const parts: Part[] = [
    ellipsoid(v(0, 2.1, 0.4), v(0.72, 0.8, 1.12), { group: torso, blend: 0 }),
    ellipsoid(v(0, 1.78, 1.15), v(0.54, 0.56, 0.52), { group: torso, blend: 0.3 }),
    ellipsoid(v(0, 2.7, 0.85), v(0.36, 0.22, 0.5), { group: torso, blend: 0.25 }),
    ellipsoid(v(0, 2.24, -0.75), v(0.54, 0.56, 0.85), { group: torso, blend: 0.45 }),
    ellipsoid(v(0, 2.34, -1.55), v(0.6, 0.56, 0.62), { group: torso, blend: 0.4 }),
    taper(v(0, 2.36, 1.2), v(0, 2.84, 2.02), 0.58, 0.42, { group: torso, blend: 0.35 }),
    ellipsoid(v(0, 2.2, 1.68), v(0.4, 0.36, 0.42), { group: torso, blend: 0.3 }),
    ellipsoid(v(0, 2.86, 1.5), v(0.32, 0.26, 0.45), { group: torso, blend: 0.3 }),
  ];

  for (const side of [1, -1]) {
    parts.push(taper(v(side * 0.3, 2.74, 0.78), v(side * 0.48, 1.9, 1.28), 0.22, 0.32, { group: torso, blend: 0.25 }));
  }

  return parts;
}

function tailParts(): Part[] {
  const parts: Part[] = [];

  for (let index = 0; index < TAIL.length - 1; index += 1) {
    const from = TAIL[index] ?? v(0, 0, 0);
    const to = TAIL[index + 1] ?? v(0, 0, 0);
    const radius = (at: number): number => 0.23 - 0.12 * (at / (TAIL.length - 1));
    parts.push(
      taper(from, to, radius(index), radius(index + 1), { group: TAIL_GROUP, blend: index === 0 ? 0.22 : 0.12 }),
    );
  }

  return parts;
}

function toes(center: Vector3, scale: number, group: number): Part[] {
  return [
    [-0.15, 0.16],
    [-0.055, 0.24],
    [0.055, 0.24],
    [0.15, 0.16],
  ].map(([dx = 0, dz = 0]) =>
    ellipsoid(
      v(center.x + dx * scale, 0.1 * scale, center.z + dz * scale),
      v(0.08 * scale, 0.085 * scale, 0.095 * scale),
      { group, blend: 0.045 },
    ),
  );
}

function frontLegParts(leg: LegJoints): Part[] {
  const { group, side } = leg;

  return [
    taper(leg.top, leg.bend, 0.34, 0.25, { group, blend: 0.25 }),
    ellipsoid(v(side * 0.46, 1.56, 1.0), v(0.27, 0.34, 0.28), { group, blend: 0.15 }),
    ellipsoid(v(side * 0.44, 1.2, 0.87), v(0.17, 0.17, 0.16), { group, blend: 0.1 }),
    taper(leg.bend, leg.ankle, 0.25, 0.16, { group, blend: 0.12 }),
    ellipsoid(v(side * 0.46, 0.95, 1.1), v(0.22, 0.3, 0.22), { group, blend: 0.12 }),
    taper(leg.ankle, v(side * 0.42, 0.18, 1.42), 0.16, 0.17, { group, blend: 0.08 }),
    ellipsoid(v(side * 0.42, 0.15, 1.5), v(0.24, 0.13, 0.27), { group, blend: 0.1 }),
    ...toes(v(side * 0.42, 0, 1.5), 1.12, group),
  ];
}

function hindLegParts(leg: LegJoints): Part[] {
  const { group, side } = leg;

  return [
    taper(leg.top, leg.bend, 0.37, 0.24, { group, blend: 0.3 }),
    ellipsoid(v(side * 0.39, 2.0, -1.45), v(0.34, 0.6, 0.56), { group, blend: 0.25 }),
    ellipsoid(v(side * 0.48, 1.36, -0.95), v(0.17, 0.16, 0.15), { group, blend: 0.1 }),
    taper(leg.bend, leg.ankle, 0.24, 0.13, { group, blend: 0.12 }),
    ellipsoid(v(side * 0.45, 1.16, -1.38), v(0.2, 0.28, 0.25), { group, blend: 0.12 }),
    ellipsoid(v(side * 0.45, 0.8, -1.92), v(0.1, 0.12, 0.1), { group, blend: 0.06 }),
    taper(leg.ankle, v(side * 0.45, 0.17, -1.64), 0.13, 0.15, { group, blend: 0.08 }),
    ellipsoid(v(side * 0.45, 0.14, -1.58), v(0.22, 0.13, 0.25), { group, blend: 0.1 }),
    ...toes(v(side * 0.45, 0, -1.58), 1.02, group),
  ];
}

export function bodyParts(): Part[] {
  const parts = [...torsoParts(), ...tailParts()];

  for (const leg of LEGS) {
    parts.push(...(leg.hind ? hindLegParts(leg) : frontLegParts(leg)));
  }

  return parts;
}

export function bodyBones(): BoneSegment[] {
  const bones: BoneSegment[] = [];

  for (let index = 0; index < SPINE.length - 1; index += 1) {
    bones.push({ group: TORSO, from: SPINE[index] ?? v(0, 0, 0), to: SPINE[index + 1] ?? v(0, 0, 0) });
  }

  for (let index = 0; index < TAIL.length - 1; index += 1) {
    bones.push({ group: TAIL_GROUP, from: TAIL[index] ?? v(0, 0, 0), to: TAIL[index + 1] ?? v(0, 0, 0) });
  }

  for (const leg of LEGS) {
    bones.push(
      { group: leg.group, from: leg.top, to: leg.bend },
      { group: leg.group, from: leg.bend, to: leg.ankle },
      { group: leg.group, from: leg.ankle, to: leg.paw },
      { group: leg.group, from: leg.paw, to: leg.toe },
    );
  }

  return bones;
}

export const SPINE_BONES = SPINE.length - 1;

export const TAIL_BONES = TAIL.length - 1;

export const LEG_BONES = 4;

export function headParts(): Part[] {
  const head = 0;

  const parts: Part[] = [
    ellipsoid(v(0, 0.19, 0.0), v(0.56, 0.4, 0.6), { group: head, blend: 0 }),
    taper(v(0, 0.02, -0.12), v(0, -0.3, -0.55), 0.4, 0.44, { group: head, blend: 0.2 }),
    ellipsoid(v(0, 0.34, 0.45), v(0.4, 0.22, 0.4), { group: head, blend: 0.2 }),
    ellipsoid(v(0, -0.03, 0.8), v(0.29, 0.22, 0.33), { group: head, blend: 0.18 }),
    taper(v(0, 0.34, 0.5), v(0, 0.18, 1.04), 0.15, 0.12, { group: head, blend: 0.16 }),
    ellipsoid(v(0, 0.14, 1.07), v(0.13, 0.08, 0.07), { group: head, blend: 0.05 }),
    ellipsoid(v(0, -0.24, 0.76), v(0.22, 0.12, 0.26), { group: head, blend: 0.12 }),
  ];

  for (const side of [1, -1]) {
    parts.push(
      taper(v(side * 0.08, 0.33, 0.7), v(side * 0.45, 0.39, 0.5), 0.14, 0.13, { group: head, blend: 0.1 }),
      ellipsoid(v(side * 0.42, 0.02, 0.3), v(0.32, 0.3, 0.36), { group: head, blend: 0.2 }),
      taper(v(side * 0.5, -0.02, 0.16), v(side * 0.7, -0.22, -0.02), 0.14, 0.06, { group: head, blend: 0.14 }),
      ellipsoid(v(side * 0.15, -0.06, 0.98), v(0.17, 0.15, 0.15), { group: head, blend: 0.08 }),
      ellipsoid(v(side * 0.26, -0.18, 0.42), v(0.2, 0.15, 0.27), { group: head, blend: 0.15 }),
      taper(
        v(side * 0.34, 0.55, -0.05),
        v(side * 0.46, 0.9, -0.12),
        0.19,
        0.06,
        { group: head, blend: 0.1 },
        v(0, 0.2, 2.2),
      ),
      ellipsoid(v(side * 0.37, 0.68, 0.04), v(0.1, 0.16, 0.06), { group: head, blend: 0.04, carve: true }),
      ellipsoid(v(side * 0.25, 0.21, 0.68), v(0.14, 0.08, 0.1), { group: head, blend: 0.05, carve: true }),
      taper(v(0, -0.1, 1.06), v(side * 0.24, -0.18, 0.8), 0.022, 0.018, { group: head, blend: 0.03, carve: true }),
    );
  }

  parts.push(taper(v(0, 0.08, 1.1), v(0, -0.07, 1.06), 0.016, 0.016, { group: head, blend: 0.02, carve: true }));

  return parts;
}
