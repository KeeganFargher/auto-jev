import { BufferAttribute, BufferGeometry, Color, Vector3 } from "three";
import { createRng, nextFloat } from "@jev-game/game";
import { bakeOcclusion } from "./occlusion.js";
import {
  sweepIndexCount,
  sweepVertexCount,
  writeSweep,
  writeSweepIndices,
  type Sweep,
  type SweepStyle,
} from "./ribbon.js";
import { createSphereField, type SphereField } from "./sphere-field.js";

export type StrandKind = "thread" | "glow" | "team";

export interface Strand {
  readonly kind: StrandKind;
  readonly sweep: Sweep;
  readonly tint: Color;
}

export interface Socket {
  readonly axis: Vector3;
  readonly center: Vector3;
  readonly radius: number;
  readonly clearance: number;
}

export interface WindingDetail {
  readonly bands: number;
  readonly fewestWraps: number;
  readonly mostWraps: number;
  readonly step: number;
  readonly fieldResolution: number;
}

export interface BallDesign {
  readonly seed: number;
  readonly coreRadius: number;
  readonly width: number;
  readonly thickness: number;
  readonly socket: Socket;
  readonly loops: readonly Vector3[];
  readonly browTilt: number;
}

export interface WoundBall {
  readonly field: SphereField;
  readonly strands: readonly Strand[];
}

interface Wobble {
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
}

interface Circle {
  readonly axis: Vector3;
  readonly start: Vector3;
  readonly quarter: Vector3;
  readonly polar: number;
  readonly wobbles: readonly Wobble[];
}

interface Lift {
  readonly height: number;
  readonly spread: number;
}

interface Draped {
  readonly radii: Float32Array;
  readonly ups: Vector3[];
  readonly sides: Vector3[];
}

interface Traced {
  readonly directions: Vector3[];
  readonly angles: Float32Array;
}

const FOOTPRINT = 9;

const TENSION = 5;

const MAX_LIFT = 0.3;

const COMPRESSION = 0.45;

const BANK = 0.75;

const MAX_SLOPE = 0.8;

const SMOOTHING_PASSES = 3;

const UP_SMOOTHING_PASSES = 2;

const PLACEMENT_ATTEMPTS = 80;

const MIN_SAMPLES = 32;

const THREAD_TINTS = ["#c0136a", "#a80f60", "#d0237a", "#9a1260", "#b81a6c"] as const;

const GLOW_WIDTH = 0.15;

const GLOW_THICKNESS = 0.13;

const TEAM_WIDTH_FRACTION = 0.72;

const LOOP_HEIGHT = 0.62;

const LOOP_SPREAD = 0.5;

const SOCKET_BAND_WRAPS = 2;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function windBall(design: BallDesign, detail: WindingDetail): WoundBall {
  const rng = createRng(design.seed);
  const field = createSphereField(detail.fieldResolution, design.coreRadius);
  const strands: Strand[] = [];
  const spacing = (design.width * 0.88) / (design.coreRadius + design.thickness * 2);
  const glowBands = new Set([Math.floor(detail.bands * 0.6), detail.bands - 1]);
  const teamBand = Math.floor(detail.bands * 0.65);

  function random(): number {
    return nextFloat(rng);
  }

  function randomUnit(): Vector3 {
    const height = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const spread = Math.sqrt(1 - height * height);

    return new Vector3(spread * Math.cos(angle), height, spread * Math.sin(angle));
  }

  function perpendicularTo(axis: Vector3): Vector3 {
    const helper = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const first = new Vector3().crossVectors(axis, helper).normalize();
    const second = new Vector3().crossVectors(axis, first);
    const angle = random() * Math.PI * 2;

    return first.multiplyScalar(Math.cos(angle)).addScaledVector(second, Math.sin(angle)).normalize();
  }

  function tint(): Color {
    const base = new Color(THREAD_TINTS[Math.floor(random() * THREAD_TINTS.length)] ?? THREAD_TINTS[0]);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);

    return base.setHSL(
      hsl.h + (random() - 0.5) * 0.025,
      clamp(hsl.s * (0.9 + random() * 0.2), 0, 1),
      clamp(hsl.l * (0.9 + random() * 0.22), 0, 1),
    );
  }

  function wobbles(scale: number): Wobble[] {
    return [
      {
        amplitude: (0.02 + random() * 0.045) * scale,
        frequency: 2 + Math.floor(random() * 2),
        phase: random() * Math.PI * 2,
      },
      { amplitude: random() * 0.022 * scale, frequency: 3 + Math.floor(random() * 3), phase: random() * Math.PI * 2 },
    ];
  }

  function wobbleReach(list: readonly Wobble[]): number {
    let reach = 0;

    for (const wobble of list) {
      reach += wobble.amplitude;
    }

    return reach;
  }

  function clearOfSocket(axis: Vector3, polar: number, margin: number): boolean {
    const gap = Math.acos(clamp(axis.dot(design.socket.axis), -1, 1));

    return Math.abs(gap - polar) > design.socket.clearance + margin;
  }

  function circle(axis: Vector3, polar: number, list: readonly Wobble[], start: Vector3): Circle {
    return { axis, start, quarter: new Vector3().crossVectors(axis, start), polar, wobbles: list };
  }

  function trace(ring: Circle): Traced {
    const circumference = Math.PI * 2 * (design.coreRadius + design.thickness) * Math.sin(ring.polar);
    const count = Math.max(MIN_SAMPLES, Math.ceil(circumference / detail.step));
    const directions: Vector3[] = [];
    const angles = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      let polar = ring.polar;

      for (const wobble of ring.wobbles) {
        polar += wobble.amplitude * Math.sin(wobble.frequency * angle + wobble.phase);
      }

      angles[index] = angle;
      directions.push(
        new Vector3()
          .copy(ring.start)
          .multiplyScalar(Math.cos(angle) * Math.sin(polar))
          .addScaledVector(ring.quarter, Math.sin(angle) * Math.sin(polar))
          .addScaledVector(ring.axis, Math.cos(polar)),
      );
    }

    return { directions, angles };
  }

  function lay(
    ring: Circle,
    kind: StrandKind,
    width: number,
    thickness: number,
    lift: Lift | null,
    color: Color,
  ): void {
    const { directions, angles } = trace(ring);
    const draped = drape(field, directions, width, thickness, detail.step, design.coreRadius + thickness / 2);
    const lifted = new Float32Array(directions.length);

    if (lift !== null) {
      for (let index = 0; index < directions.length; index += 1) {
        const angle = angles[index] ?? 0;
        const offset = Math.atan2(Math.sin(angle), Math.cos(angle)) / lift.spread;
        lifted[index] = Math.abs(offset) < 1 ? lift.height * 0.5 * (1 + Math.cos(Math.PI * offset)) : 0;
      }
    }

    const points = directions.map((direction, index) =>
      direction.clone().multiplyScalar((draped.radii[index] ?? 0) + (lifted[index] ?? 0)),
    );

    stamp(field, points, draped.sides, width, thickness, lifted);

    strands.push({
      kind,
      tint: color,
      sweep: {
        points,
        ups: draped.ups,
        widths: Array.from({ length: points.length }, () => width),
        thicknesses: Array.from({ length: points.length }, () => thickness),
        closed: true,
      },
    });
  }

  function randomClearCircle(scale: number): Circle | null {
    const list = wobbles(scale);
    const margin = wobbleReach(list);

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      const axis = randomUnit();
      const polar = Math.PI / 2 + (random() - 0.5) * 0.4;

      if (clearOfSocket(axis, polar, margin)) {
        return circle(axis, polar, list, perpendicularTo(axis));
      }
    }

    return null;
  }

  function band(): void {
    const wraps = detail.fewestWraps + Math.floor(random() * (detail.mostWraps - detail.fewestWraps + 1));
    const list = wobbles(1);
    const margin = wobbleReach(list);

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      const axis = randomUnit();
      const center = Math.PI / 2 + (random() - 0.5) * 0.55;
      const polars: number[] = [];

      for (let wrap = 0; wrap < wraps; wrap += 1) {
        polars.push(center + (wrap - (wraps - 1) / 2) * spacing);
      }

      if (polars.every((polar) => clearOfSocket(axis, polar, margin))) {
        const start = perpendicularTo(axis);

        for (const polar of polars) {
          lay(circle(axis, polar, list, start), "thread", design.width, design.thickness, null, tint());
        }

        return;
      }
    }
  }

  carveSocket(field, design.socket);

  for (let index = 0; index < detail.bands; index += 1) {
    band();

    if (glowBands.has(index)) {
      const ring = randomClearCircle(0.6);

      if (ring !== null) {
        lay(ring, "glow", GLOW_WIDTH, GLOW_THICKNESS, null, new Color("#ffffff"));
      }
    }

    if (index === teamBand) {
      const ring = randomClearCircle(0.8);

      if (ring !== null) {
        lay(ring, "team", design.width * TEAM_WIDTH_FRACTION, design.thickness, null, new Color("#ffffff"));
      }
    }
  }

  const upright = new Vector3(0, 1, 0).applyAxisAngle(design.socket.axis, design.browTilt);
  const eyeGap = Math.acos(clamp(upright.dot(design.socket.axis), -1, 1));
  const socketWobbles: Wobble[] = [{ amplitude: 0.012, frequency: 2, phase: random() * Math.PI * 2 }];
  const socketStart = perpendicularTo(upright);

  for (const direction of [-1, 1]) {
    for (let wrap = 0; wrap < SOCKET_BAND_WRAPS; wrap += 1) {
      const polar = eyeGap + direction * (design.socket.clearance + spacing * (wrap + 0.55));
      lay(circle(upright, polar, socketWobbles, socketStart), "thread", design.width, design.thickness, null, tint());
    }
  }

  for (const peak of design.loops) {
    const top = peak.clone().normalize();

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      const axis = perpendicularTo(top);

      if (clearOfSocket(axis, Math.PI / 2, design.width / design.coreRadius)) {
        lay(
          circle(axis, Math.PI / 2, wobbles(0.4), top),
          "thread",
          design.width,
          design.thickness,
          { height: LOOP_HEIGHT, spread: LOOP_SPREAD },
          tint(),
        );
        break;
      }
    }
  }

  return { field, strands };
}

function carveSocket(field: SphereField, socket: Socket): void {
  const centerDistance = socket.center.length();
  const reach = Math.cos(socket.clearance * 2.2);

  field.raiseEverywhere((direction) => {
    if (direction.dot(socket.axis) < reach) {
      return 0;
    }

    const along = direction.dot(socket.center);
    const discriminant = along * along - centerDistance * centerDistance + socket.radius * socket.radius;

    return discriminant < 0 ? 0 : along + Math.sqrt(discriminant);
  });
}

function drape(
  field: SphereField,
  directions: readonly Vector3[],
  width: number,
  thickness: number,
  step: number,
  floor: number,
): Draped {
  const count = directions.length;
  const required = new Float32Array(count);
  const slopes = new Float32Array(count);
  const sides: Vector3[] = [];
  const tangent = new Vector3();
  const probe = new Vector3();

  for (let index = 0; index < count; index += 1) {
    const direction = directions[index]!;
    tangent.subVectors(directions[(index + 1) % count]!, directions[(index - 1 + count) % count]!);
    const side = new Vector3().crossVectors(direction, tangent).normalize();
    sides.push(side);
    const base = field.heightAt(direction);
    let need = floor;

    for (let sample = 0; sample < FOOTPRINT; sample += 1) {
      const across = (sample / (FOOTPRINT - 1) - 0.5) * width;
      probe
        .copy(direction)
        .addScaledVector(side, across / base)
        .normalize();
      const profile = Math.sqrt(Math.max(0, 1 - ((2 * across) / width) ** 2));
      need = Math.max(need, field.heightAt(probe) - COMPRESSION * thickness + (thickness / 2) * profile);
    }

    required[index] = need;
    probe
      .copy(direction)
      .addScaledVector(side, (-0.45 * width) / base)
      .normalize();
    const left = field.heightAt(probe);
    probe
      .copy(direction)
      .addScaledVector(side, (0.45 * width) / base)
      .normalize();
    const right = field.heightAt(probe);
    slopes[index] = clamp((right - left) / (0.9 * width), -MAX_SLOPE, MAX_SLOPE);
  }

  const reach = Math.ceil(Math.sqrt(MAX_LIFT / TENSION) / step);
  let radii = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    let best = 0;

    for (let offset = -reach; offset <= reach; offset += 1) {
      const neighbour = required[(index + offset + count * 4) % count] ?? 0;
      best = Math.max(best, neighbour - TENSION * (offset * step) ** 2);
    }

    radii[index] = best;
  }

  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) {
    const next = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const blurred =
        0.25 * (radii[(index - 1 + count) % count] ?? 0) +
        0.5 * (radii[index] ?? 0) +
        0.25 * (radii[(index + 1) % count] ?? 0);

      next[index] = Math.max(blurred, required[index] ?? 0);
    }

    radii = next;
  }

  let ups = directions.map((direction, index) =>
    direction
      .clone()
      .addScaledVector(sides[index]!, -(slopes[index] ?? 0) * BANK)
      .normalize(),
  );

  for (let pass = 0; pass < UP_SMOOTHING_PASSES; pass += 1) {
    ups = ups.map((up, index) =>
      up
        .clone()
        .multiplyScalar(2)
        .add(ups[(index - 1 + count) % count]!)
        .add(ups[(index + 1) % count]!)
        .normalize(),
    );
  }

  return { radii, ups, sides };
}

function stamp(
  field: SphereField,
  points: readonly Vector3[],
  sides: readonly Vector3[],
  width: number,
  thickness: number,
  lifted: Float32Array,
): void {
  const count = points.length;
  const point = new Vector3();
  const side = new Vector3();
  const direction = new Vector3();
  const probe = new Vector3();

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;

    if ((lifted[index] ?? 0) > thickness || (lifted[next] ?? 0) > thickness) {
      continue;
    }

    const from = points[index]!;
    const to = points[next]!;
    const radius = from.length();
    const halfTexel = radius / field.resolution;
    const steps = Math.max(1, Math.ceil(from.distanceTo(to) / halfTexel));
    const acrossSamples = Math.max(3, Math.ceil(width / halfTexel) + 1);

    for (let step = 0; step < steps; step += 1) {
      const fraction = step / steps;
      point.lerpVectors(from, to, fraction);
      side.lerpVectors(sides[index]!, sides[next]!, fraction).normalize();
      const pointRadius = point.length();
      direction.copy(point).divideScalar(pointRadius);

      for (let sample = 0; sample < acrossSamples; sample += 1) {
        const across = (sample / (acrossSamples - 1) - 0.5) * width;
        probe
          .copy(direction)
          .addScaledVector(side, across / pointRadius)
          .normalize();
        const profile = Math.sqrt(Math.max(0, 1 - ((2 * across) / width) ** 2));
        field.raise(probe, pointRadius + (thickness / 2) * profile);
      }
    }
  }
}

export function strandGeometry(
  strands: readonly Strand[],
  kind: StrandKind,
  style: SweepStyle,
  field: SphereField,
  rays: number,
  massBlend: number,
): BufferGeometry {
  const chosen: Strand[] = [];
  let vertexTotal = 0;
  let indexTotal = 0;

  for (const strand of strands) {
    if (strand.kind === kind) {
      chosen.push(strand);
      vertexTotal += sweepVertexCount(strand.sweep, style);
      indexTotal += sweepIndexCount(strand.sweep, style);
    }
  }

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const tangents = new Float32Array(vertexTotal * 4);
  const uvs = new Float32Array(vertexTotal * 2);
  const colors = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  const target = { positions, normals, tangents, uvs };
  const ranges: { strand: Strand; start: number; end: number }[] = [];
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const strand of chosen) {
    writeSweep(strand.sweep, style, target, vertexOffset, true);
    writeSweepIndices(strand.sweep, style, indices, indexOffset, vertexOffset);
    const vertices = sweepVertexCount(strand.sweep, style);
    ranges.push({ strand, start: vertexOffset, end: vertexOffset + vertices });
    vertexOffset += vertices;
    indexOffset += sweepIndexCount(strand.sweep, style);
  }

  const light = rays > 0 ? bakeOcclusion(field, positions, normals, rays) : new Float32Array(vertexTotal).fill(1);

  if (massBlend > 0) {
    const normal = new Vector3();
    const radial = new Vector3();
    const tangent = new Vector3();

    for (let vertex = 0; vertex < vertexTotal; vertex += 1) {
      normal.fromArray(normals, vertex * 3);
      radial.fromArray(positions, vertex * 3).normalize();

      if (normal.dot(radial) > -0.2) {
        normal
          .multiplyScalar(1 - massBlend)
          .addScaledVector(radial, massBlend)
          .normalize();
        normal.toArray(normals, vertex * 3);
        tangent.fromArray(tangents, vertex * 4);
        tangent.addScaledVector(normal, -normal.dot(tangent)).normalize();
        tangent.toArray(tangents, vertex * 4);
      }
    }
  }

  for (const range of ranges) {
    for (let vertex = range.start; vertex < range.end; vertex += 1) {
      const shade = light[vertex] ?? 1;
      colors[vertex * 3] = range.strand.tint.r * shade;
      colors[vertex * 3 + 1] = range.strand.tint.g * shade;
      colors[vertex * 3 + 2] = range.strand.tint.b * shade;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("tangent", new BufferAttribute(tangents, 4));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}
