import { BufferAttribute, BufferGeometry, Color, Sphere, Vector3 } from "three";
import {
  sweepIndexCount,
  sweepVertexCount,
  writeSweep,
  writeSweepIndices,
  type Sweep,
  type SweepStyle,
} from "./ribbon.js";
import type { SphereField } from "./sphere-field.js";

export interface TendrilRoot {
  readonly direction: Vector3;
  readonly length: number;
  readonly phase: number;
  readonly curl: number;
  readonly turn: number;
}

export interface TendrilDesign {
  readonly roots: readonly TendrilRoot[];
  readonly ballRadius: number;
  readonly rootWidth: number;
  readonly tipWidth: number;
  readonly rootThickness: number;
  readonly tipThickness: number;
  readonly tint: Color;
}

export interface TendrilDetail {
  readonly points: number;
  readonly sides: number;
}

export interface Tendrils {
  readonly geometry: BufferGeometry;
  readonly triangles: number;
  update(time: number, stir: number, clench: number): void;
}

interface Strand {
  readonly root: TendrilRoot;
  readonly anchor: Vector3;
  readonly heading: Vector3;
  readonly bend: Vector3;
  readonly sweep: Sweep;
  readonly points: Vector3[];
  readonly ups: Vector3[];
  readonly offset: number;
}

const DOWN = new Vector3(0, -1, 0);

const TILE = 1.2;

const SINK = 0.14;

const ROOT_SHADE = 0.4;

const SHADE_REACH = 0.4;

const CLENCH_CURL = 1.6;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);

  return t * t * (3 - 2 * t);
}

export function createTendrils(design: TendrilDesign, detail: TendrilDetail, field: SphereField): Tendrils {
  const style: SweepStyle = { sides: detail.sides, squareness: 2.3, tileLength: TILE };
  const strands: Strand[] = [];
  let vertexTotal = 0;
  let indexTotal = 0;

  for (const root of design.roots) {
    const direction = root.direction.clone().normalize();
    const anchor = direction.clone().multiplyScalar(field.heightAt(direction) - SINK);
    const heading = direction.clone().multiplyScalar(0.9).add(DOWN).normalize();
    const outward = new Vector3(direction.x, 0, direction.z);

    if (outward.lengthSq() < 1e-6) {
      outward.set(1, 0, 0);
    }

    outward.normalize().applyAxisAngle(DOWN, root.turn);
    const bend = outward.addScaledVector(heading, -outward.dot(heading)).normalize();
    const points = Array.from({ length: detail.points }, () => new Vector3());
    const ups = Array.from({ length: detail.points }, () => new Vector3(0, 1, 0));
    const widths: number[] = [];
    const thicknesses: number[] = [];

    for (let index = 0; index < detail.points; index += 1) {
      const along = index / (detail.points - 1);
      const taper = along ** 2.6;
      widths.push(design.rootWidth + (design.tipWidth - design.rootWidth) * taper);
      thicknesses.push(design.rootThickness + (design.tipThickness - design.rootThickness) * taper);
    }

    const sweep: Sweep = { points, ups, widths, thicknesses, closed: false };
    strands.push({ root, anchor, heading, bend, sweep, points, ups, offset: vertexTotal });
    vertexTotal += sweepVertexCount(sweep, style);
    indexTotal += sweepIndexCount(sweep, style);
  }

  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const tangents = new Float32Array(vertexTotal * 4);
  const uvs = new Float32Array(vertexTotal * 2);
  const colors = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  const target = { positions, normals, tangents, uvs };
  const tangent = new Vector3();
  const normal = new Vector3();
  const binormal = new Vector3();
  const swayAxis = new Vector3();
  const step = new Vector3();

  function trace(strand: Strand, time: number, stir: number, clench: number): void {
    const { root, points, ups } = strand;
    const count = points.length;
    const ds = root.length / (count - 1);
    const sway = (0.16 + stir * 0.25) * Math.sin(time * 0.9 + root.phase);
    const lean = (0.1 + stir * 0.2) * Math.sin(time * 1.27 + root.phase * 1.7);
    tangent.copy(strand.heading).applyAxisAngle(DOWN, sway);
    normal.copy(strand.bend).applyAxisAngle(DOWN, sway);
    swayAxis.crossVectors(tangent, normal).normalize();
    tangent.applyAxisAngle(swayAxis, lean);
    normal.applyAxisAngle(swayAxis, lean);
    binormal.crossVectors(tangent, normal).normalize();
    const gentle = 0.22 + 0.14 * Math.sin(time * 0.8 + root.phase);
    const tight = root.curl * (1 + 0.12 * Math.sin(time * 1.1 + root.phase * 2.3) - stir * 0.35 + clench * CLENCH_CURL);
    const torsion = 0.9 * Math.sin(root.phase * 3.1);
    points[0]!.copy(strand.anchor);

    for (let index = 0; index < count; index += 1) {
      const along = index / (count - 1);
      const curvature = gentle + tight * smoothstep(0.25, 1, along) ** 1.25;

      if (index > 0) {
        points[index]!.copy(points[index - 1]!).addScaledVector(tangent, ds);
      }

      ups[index]!.copy(normal);
      step.copy(normal).multiplyScalar(curvature * ds);
      tangent.add(step).normalize();
      normal
        .addScaledVector(tangent, -normal.dot(tangent))
        .addScaledVector(binormal, torsion * ds)
        .normalize();
      binormal.crossVectors(tangent, normal).normalize();
    }
  }

  let indexOffset = 0;

  for (const strand of strands) {
    trace(strand, 0, 0, 0);
    writeSweep(strand.sweep, style, target, strand.offset, true);
    writeSweepIndices(strand.sweep, style, indices, indexOffset, strand.offset);
    indexOffset += sweepIndexCount(strand.sweep, style);
    const vertices = sweepVertexCount(strand.sweep, style);
    const stride = style.sides + 1;

    for (let vertex = 0; vertex < vertices; vertex += 1) {
      const along = Math.floor(vertex / stride) / (strand.points.length - 1);
      const shade = ROOT_SHADE + (1 - ROOT_SHADE) * smoothstep(0, SHADE_REACH, along);
      const index = strand.offset + vertex;
      colors[index * 3] = design.tint.r * shade;
      colors[index * 3 + 1] = design.tint.g * shade;
      colors[index * 3 + 2] = design.tint.b * shade;
    }
  }

  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3);
  const normalAttribute = new BufferAttribute(normals, 3);
  const tangentAttribute = new BufferAttribute(tangents, 4);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("normal", normalAttribute);
  geometry.setAttribute("tangent", tangentAttribute);
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  let reach = 0;

  for (const root of design.roots) {
    reach = Math.max(reach, root.length);
  }

  geometry.boundingSphere = new Sphere(new Vector3(0, -design.ballRadius, 0), design.ballRadius + reach);

  return {
    geometry,
    triangles: indexTotal / 3,

    update(time, stir, clench) {
      for (const strand of strands) {
        trace(strand, time, stir, clench);
        writeSweep(strand.sweep, style, target, strand.offset, false);
      }

      positionAttribute.needsUpdate = true;
      normalAttribute.needsUpdate = true;
      tangentAttribute.needsUpdate = true;
    },
  };
}
