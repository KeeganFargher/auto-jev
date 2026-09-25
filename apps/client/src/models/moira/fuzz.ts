import { BufferAttribute, BufferGeometry, Color, Vector3 } from "three";
import { createRng, nextFloat } from "@jev-game/game";
import {
  sweepIndexCount,
  sweepVertexCount,
  transportedUps,
  writeSweep,
  writeSweepIndices,
  type Sweep,
  type SweepStyle,
} from "./ribbon.js";
import type { Strand } from "./winding.js";

const FIBRE_POINTS = 9;

const FIBRE_STYLE: SweepStyle = { sides: 3, squareness: 2, tileLength: 1.2 };

const LIGHTEN = 0.35;

export function createFuzz(strands: readonly Strand[], count: number, seed: number, thickness: number): BufferGeometry {
  const rng = createRng(seed);
  const hosts: Strand[] = [];

  for (const strand of strands) {
    if (strand.kind === "thread") {
      hosts.push(strand);
    }
  }

  function random(): number {
    return nextFloat(rng);
  }

  const fibres: { sweep: Sweep; tint: Color }[] = [];
  const heading = new Vector3();
  const bend = new Vector3();
  const across = new Vector3();
  const white = new Color("#ffd6ea");

  for (let fibre = 0; fibre < count && hosts.length > 0; fibre += 1) {
    const host = hosts[Math.floor(random() * hosts.length)]!;
    const points = host.sweep.points;
    const index = Math.floor(random() * points.length);
    const base = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const up = host.sweep.ups[index]!.clone().normalize();
    const along = next.clone().sub(base).normalize();
    const side = new Vector3().crossVectors(along, up).normalize();

    const start = base
      .clone()
      .addScaledVector(up, thickness * 0.42)
      .addScaledVector(side, (random() - 0.5) * thickness * 2.2);

    heading
      .copy(up)
      .multiplyScalar(0.55 + random() * 0.5)
      .addScaledVector(along, (random() - 0.5) * 1.6)
      .addScaledVector(side, (random() - 0.5) * 1.2)
      .normalize();
    bend
      .copy(side)
      .multiplyScalar(random() < 0.5 ? -1 : 1)
      .addScaledVector(heading, -side.dot(heading))
      .normalize();
    across.crossVectors(heading, bend).normalize();
    const length = 0.08 + random() ** 2 * 0.32;
    const curl = 4 + random() * 16;
    const twist = (random() - 0.5) * 20;
    const radius = 0.006 + random() * 0.008;
    const fibrePoints: Vector3[] = [start.clone()];
    const cursor = start.clone();
    const ds = length / (FIBRE_POINTS - 1);

    for (let step = 1; step < FIBRE_POINTS; step += 1) {
      cursor.addScaledVector(heading, ds);
      fibrePoints.push(cursor.clone());
      heading.addScaledVector(bend, curl * ds).normalize();
      bend
        .addScaledVector(heading, -bend.dot(heading))
        .addScaledVector(across, twist * ds)
        .normalize();
      across.crossVectors(heading, bend).normalize();
    }

    const widths = fibrePoints.map((_, step) => radius * 2 * (1 - (step / (FIBRE_POINTS - 1)) * 0.75));
    const tint = host.tint.clone().lerp(white, LIGHTEN + random() * 0.25);
    fibres.push({
      tint,
      sweep: {
        points: fibrePoints,
        ups: transportedUps(fibrePoints, up),
        widths,
        thicknesses: widths,
        closed: false,
      },
    });
  }

  let vertexTotal = 0;
  let indexTotal = 0;

  for (const { sweep } of fibres) {
    vertexTotal += sweepVertexCount(sweep, FIBRE_STYLE);
    indexTotal += sweepIndexCount(sweep, FIBRE_STYLE);
  }

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const tangents = new Float32Array(vertexTotal * 4);
  const uvs = new Float32Array(vertexTotal * 2);
  const colors = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const { sweep, tint } of fibres) {
    writeSweep(sweep, FIBRE_STYLE, { positions, normals, tangents, uvs }, vertexOffset, true);
    writeSweepIndices(sweep, FIBRE_STYLE, indices, indexOffset, vertexOffset);
    const vertices = sweepVertexCount(sweep, FIBRE_STYLE);

    for (let vertex = vertexOffset; vertex < vertexOffset + vertices; vertex += 1) {
      colors[vertex * 3] = tint.r;
      colors[vertex * 3 + 1] = tint.g;
      colors[vertex * 3 + 2] = tint.b;
    }

    vertexOffset += vertices;
    indexOffset += sweepIndexCount(sweep, FIBRE_STYLE);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  return geometry;
}
